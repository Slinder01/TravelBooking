import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Model, Types, type Connection } from 'mongoose';
import Stripe from 'stripe';
import { randomInt } from 'crypto';
import { Payment } from './schemas/payment.schema';
import { Refund } from './schemas/refund.schema';
import { PolicyAcceptance } from './schemas/policy-acceptance.schema';
import { CreatePaymentDto } from './dto/create-payment.dto';
import type { AuthUser } from '../common/auth-user';
import { BOOKING_STATUS } from '../common/booking-status';
import { UserRole } from '../users/users-role.enum';
import { FlightBookingsService } from '../flight-bookings/flight-bookings.service';

const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP']);
const toMinor = (amt: number, cur: string) =>
  ZERO_DECIMAL.has(cur.toUpperCase()) ? Math.round(amt) : Math.round(amt * 100);

@Injectable()
export class PaymentsService {
  private stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy');

  constructor(
    @InjectModel(Payment.name) private paymentModel: Model<Payment>,
    @InjectModel(Refund.name) private refundModel: Model<Refund>,
    @InjectModel(PolicyAcceptance.name) private acceptModel: Model<PolicyAcceptance>,
    @InjectConnection() private conn: Connection,
    private readonly flightBookingsService: FlightBookingsService,
  ) {}

  private assertNotGuest(user: AuthUser) {
    if (user.role === UserRole.GUEST) {
      throw new ForbiddenException('A registered account is required for payments');
    }
  }

  bookingModel(type: 'flight' | 'hotel'): Model<any> {
    if (type === 'flight') {
      return (this.conn.models?.FlightBooking || this.conn.model('FlightBooking')) as unknown as Model<any>;
    }
    return (this.conn.models?.Booking || this.conn.models?.HotelBooking || this.conn.model('Booking')) as unknown as Model<any>;
  }

  async loadOwnedBooking(type: 'flight' | 'hotel', id: string, user: AuthUser) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Booking not found');
    const booking = await this.bookingModel(type).findById(id);
    if (!booking) throw new NotFoundException('Booking not found');
    if (String(booking.userId) !== user.id) throw new ForbiddenException('Not your booking');
    return booking;
  }

  // ---------- PAY-02: policies ----------
  async getPolicies(type: 'flight' | 'hotel', id: string, user: AuthUser) {
    const b = await this.loadOwnedBooking(type, id, user);
    if (type === 'flight') {
      return {
        policySnapshot: b.policySnapshot,
        freeCancellationHours: b.policySnapshot?.freeCancellationHours,
        refundPercentage: b.policySnapshot?.refundPercentage,
      };
    }
    return { cancellationPolicy: b.cancellationPolicy, policySummary: b.policySummary };
  }

  async acceptPolicies(type: 'flight' | 'hotel', id: string, user: AuthUser) {
    this.assertNotGuest(user);
    const b = await this.loadOwnedBooking(type, id, user);
    const policySnapshot =
      type === 'flight'
        ? b.policySnapshot
        : { cancellationPolicy: b.cancellationPolicy, policySummary: b.policySummary };
    return this.acceptModel.findOneAndUpdate(
      { bookingType: type, bookingId: b._id, userId: new Types.ObjectId(user.id) },
      { $setOnInsert: { policySnapshot } },
      { upsert: true, new: true },
    );
  }

  // ---------- PAY-01: create payment ----------
  async create(dto: CreatePaymentDto, user: AuthUser) {
    this.assertNotGuest(user);
    const b = await this.loadOwnedBooking(dto.bookingType, dto.bookingId, user);
    if (b.status !== BOOKING_STATUS.PENDING_PAYMENT && b.status !== 'pending') {
      throw new BadRequestException(`Booking is ${b.status}, cannot pay`);
    }
    if (b.holdExpiresAt && b.holdExpiresAt < new Date()) throw new BadRequestException('Inventory hold expired');

    const accepted = await this.acceptModel.exists({
      bookingType: dto.bookingType, bookingId: b._id, userId: new Types.ObjectId(user.id),
    });
    if (!accepted && !b.policySnapshot?.acceptedAt) {
      throw new BadRequestException('You must accept the policies before paying');
    }

    const rawAmount = Number(b.priceBreakdown?.totalPrice ?? b.totalPrice ?? b.amount ?? 0);
    if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
      throw new BadRequestException('Booking has no valid payable amount');
    }
    const rawCurrency = b.priceBreakdown?.currency ?? b.currency ?? 'USD';
    const currency = String(rawCurrency).toUpperCase();

    const existing = await this.paymentModel.findOne({
      bookingType: dto.bookingType,
      bookingId: b._id,
      status: { $in: ['pending', 'processing'] },
    });
    if (existing) {
      if (existing.status === 'processing') {
        throw new ConflictException('Payment is currently being processed');
      }
      const pi = await this.stripe.paymentIntents.retrieve(existing.stripePaymentIntentId);
      if (pi.status === 'succeeded') {
        await this.onSucceeded(pi.id);
        throw new ConflictException('Booking has already been paid');
      }
      const isStale =
        pi.status === 'canceled' ||
        existing.amount !== rawAmount ||
        existing.currency !== currency;
      if (!isStale) {
        return { payment: existing, clientSecret: pi.client_secret };
      }
      await this.paymentModel.updateOne(
        { _id: existing._id, status: 'pending' },
        {
          status: 'failed',
          failureReason:
            pi.status === 'canceled'
              ? 'Payment intent canceled'
              : 'Superseded by updated booking total',
        },
      );
    }

    const intent = await this.stripe.paymentIntents.create({
      amount: toMinor(rawAmount, currency),
      currency: currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      metadata: { bookingId: String(b._id), bookingType: dto.bookingType, userId: user.id },
    });
    try {
      const payment = await this.paymentModel.create({
        userId: b.userId, bookingType: dto.bookingType, bookingId: b._id,
        amount: rawAmount, currency, stripePaymentIntentId: intent.id,
      });
      return { payment, clientSecret: intent.client_secret };
    } catch (err: any) {
      if (err?.code === 11000) {
        try {
          await this.stripe.paymentIntents.cancel?.(intent.id);
        } catch {
          /* ignore */
        }
        throw new ConflictException('A payment is already in progress for this booking');
      }
      throw err;
    }
  }

  async retry(paymentId: string, user: AuthUser) {
    this.assertNotGuest(user);
    if (!Types.ObjectId.isValid(paymentId)) throw new NotFoundException('Payment not found');
    const p = await this.paymentModel.findById(paymentId);
    if (!p) throw new NotFoundException('Payment not found');
    if (String(p.userId) !== user.id) throw new ForbiddenException();
    if (p.status !== 'failed') throw new BadRequestException('Only failed payments can be retried');

    if (p.bookingType === 'flight' && typeof this.flightBookingsService.releaseExpiredHolds === 'function') {
      await this.flightBookingsService.releaseExpiredHolds();
    }

    const b = await this.loadOwnedBooking(p.bookingType, String(p.bookingId), user);
    const retryableStatuses: string[] = [
      BOOKING_STATUS.PENDING_PAYMENT,
      BOOKING_STATUS.PAYMENT_FAILED,
      'pending',
    ];
    if (!retryableStatuses.includes(String(b.status))) {
      throw new BadRequestException(`Booking is ${b.status}, cannot retry payment`);
    }
    if (b.holdExpiresAt && b.holdExpiresAt < new Date()) throw new BadRequestException('Hold expired, create a new booking');

    // Re-open hotel bookings if previously marked PAYMENT_FAILED
    if (b.status === BOOKING_STATUS.PAYMENT_FAILED) {
      await this.bookingModel(p.bookingType).updateOne(
        { _id: b._id, status: BOOKING_STATUS.PAYMENT_FAILED },
        { status: BOOKING_STATUS.PENDING_PAYMENT },
      );
    }

    const intent = await this.stripe.paymentIntents.create({
      amount: toMinor(p.amount, p.currency), currency: p.currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      metadata: { bookingId: String(p.bookingId), bookingType: p.bookingType, userId: user.id },
    });
    p.stripePaymentIntentId = intent.id; p.status = 'pending'; p.attempts += 1; p.failureReason = undefined;
    await p.save();
    return { payment: p, clientSecret: intent.client_secret };
  }

  // ---------- inspect (verifies with Stripe if still pending) ----------
  async get(paymentId: string, user: AuthUser) {
    if (!Types.ObjectId.isValid(paymentId)) throw new NotFoundException('Payment not found');
    let p = await this.paymentModel.findById(paymentId);
    if (!p) throw new NotFoundException('Payment not found');
    if (String(p.userId) !== user.id && user.role !== UserRole.ADMINISTRATOR) throw new ForbiddenException();
    if (p.status === 'pending') {
      try {
        const pi = await this.stripe.paymentIntents.retrieve(p.stripePaymentIntentId);
        if (pi.status === 'succeeded') await this.onSucceeded(pi.id);
        else if (pi.status === 'canceled') await this.onFailed(pi.id, 'Payment canceled');
        p = await this.paymentModel.findById(paymentId);
      } catch {
        /* Stripe retrieve failed, return local state */
      }
    }
    return p;
  }

  // ---------- webhook ----------
  async handleWebhook(rawBody: Buffer, signature: string) {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new ServiceUnavailableException('Stripe webhook secret is not configured');
    }
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch {
      throw new BadRequestException('Invalid webhook signature');
    }
    if (event.type === 'payment_intent.succeeded') {
      await this.onSucceeded((event.data.object as Stripe.PaymentIntent).id);
    } else if (event.type === 'payment_intent.payment_failed') {
      const pi = event.data.object as Stripe.PaymentIntent;
      await this.onFailed(pi.id, pi.last_payment_error?.message ?? 'Payment failed');
    } else if (event.type === 'payment_intent.canceled') {
      const pi = event.data.object as Stripe.PaymentIntent;
      await this.onFailed(pi.id, 'Payment canceled');
    }
    return { received: true };
  }

  private async onSucceeded(intentId: string) {
    // Atomically lock payment in 'processing'; terminal states ('succeeded', 'refunded') and active 'processing' are skipped
    const p = await this.paymentModel.findOneAndUpdate(
      { stripePaymentIntentId: intentId, status: { $in: ['pending', 'failed'] } },
      { status: 'processing' },
      { new: true },
    );
    if (!p) return;

    if (p.bookingType === 'flight') {
      try {
        await this.flightBookingsService.confirmBookingAfterPayment(String(p.bookingId));
        await this.paymentModel.updateOne(
          { _id: p._id },
          { status: 'succeeded', paidAt: new Date(), $unset: { failureReason: 1 } },
        );
      } catch (err: any) {
        let refundId: string | undefined;
        try {
          const rf = await this.stripe.refunds.create({ payment_intent: intentId });
          refundId = rf.id;
        } catch {
          /* ignore */
        }
        await this.paymentModel.updateOne(
          { _id: p._id },
          { status: 'refunded', failureReason: `Seat confirmation failed: ${err?.message || 'inventory error'}` },
        );
        await this.refundModel.create({
          paymentId: p._id,
          bookingId: p.bookingId,
          bookingType: p.bookingType,
          userId: p.userId,
          amount: p.amount,
          currency: p.currency,
          refundPercent: 100,
          status: refundId ? 'succeeded' : 'pending',
          stripeRefundId: refundId,
          policyApplied: { reason: 'Automatic rollback due to seat confirmation failure' },
        });
        return;
      }
    } else {
      const reference = `BK-${new Date().getFullYear()}-${String(randomInt(0, 1_000_000)).padStart(6, '0')}`;
      const res = await this.bookingModel(p.bookingType).updateOne(
        { _id: p.bookingId, status: { $in: [BOOKING_STATUS.PENDING_PAYMENT, 'pending'] } },
        { status: BOOKING_STATUS.CONFIRMED, bookingReference: reference },
      );
      if (res.modifiedCount === 0) {
        let refundId: string | undefined;
        try {
          const rf = await this.stripe.refunds.create({ payment_intent: intentId });
          refundId = rf.id;
        } catch {
          /* ignore */
        }
        await this.paymentModel.updateOne(
          { _id: p._id },
          { status: 'refunded', failureReason: 'Booking confirmation failed; auto-refund initiated' },
        );
        await this.refundModel.create({
          paymentId: p._id,
          bookingId: p.bookingId,
          bookingType: p.bookingType,
          userId: p.userId,
          amount: p.amount,
          currency: p.currency,
          refundPercent: 100,
          status: refundId ? 'succeeded' : 'pending',
          stripeRefundId: refundId,
          policyApplied: { reason: 'Automatic rollback: booking could not be confirmed' },
        });
      } else {
        await this.paymentModel.updateOne(
          { _id: p._id },
          { status: 'succeeded', paidAt: new Date(), $unset: { failureReason: 1 } },
        );
      }
    }
  }

  private async onFailed(intentId: string, reason: string) {
    const p = await this.paymentModel.findOneAndUpdate(
      { stripePaymentIntentId: intentId, status: 'pending' },
      { status: 'failed', failureReason: reason },
      { new: true },
    );
    if (!p) return;
    // Keep FlightBooking in PENDING_PAYMENT so FlightBookingsService.releaseExpiredHolds()
    // can automatically reclaim heldSeats when holdExpiresAt passes while still allowing retry().
    if (p.bookingType !== 'flight') {
      await this.bookingModel(p.bookingType).updateOne(
        { _id: p.bookingId, status: { $in: [BOOKING_STATUS.PENDING_PAYMENT, 'pending'] } },
        { status: BOOKING_STATUS.PAYMENT_FAILED },
      );
    }
  }
}
