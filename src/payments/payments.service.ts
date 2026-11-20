import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Model, Types, type Connection } from 'mongoose';
import Stripe from 'stripe';
import { randomInt } from 'crypto';
import { Payment } from './schemas/payment.schema';
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
    @InjectModel(PolicyAcceptance.name) private acceptModel: Model<PolicyAcceptance>,
    @InjectConnection() private conn: Connection,
    private readonly flightBookingsService: FlightBookingsService,
  ) {}

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

    const existing = await this.paymentModel.findOne({ bookingId: b._id, status: 'pending' });
    if (existing) {
      const pi = await this.stripe.paymentIntents.retrieve(existing.stripePaymentIntentId);
      return { payment: existing, clientSecret: pi.client_secret };
    }

    const rawAmount = b.priceBreakdown?.totalPrice ?? b.totalPrice ?? b.amount ?? 0;
    const rawCurrency = b.priceBreakdown?.currency ?? b.currency ?? 'USD';
    const currency = String(rawCurrency).toUpperCase();

    const intent = await this.stripe.paymentIntents.create({
      amount: toMinor(rawAmount, currency),
      currency: currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      metadata: { bookingId: String(b._id), bookingType: dto.bookingType, userId: user.id },
    });
    const payment = await this.paymentModel.create({
      userId: b.userId, bookingType: dto.bookingType, bookingId: b._id,
      amount: rawAmount, currency, stripePaymentIntentId: intent.id,
    });
    return { payment, clientSecret: intent.client_secret };
  }

  async retry(paymentId: string, user: AuthUser) {
    const p = await this.paymentModel.findById(paymentId);
    if (!p) throw new NotFoundException('Payment not found');
    if (String(p.userId) !== user.id) throw new ForbiddenException();
    if (p.status !== 'failed') throw new BadRequestException('Only failed payments can be retried');
    const b = await this.loadOwnedBooking(p.bookingType, String(p.bookingId), user);
    if (b.holdExpiresAt && b.holdExpiresAt < new Date()) throw new BadRequestException('Hold expired, create a new booking');
    // Teammate's booking must still be payable. If you set PaymentFailed on failure, re-open it here:
    await this.bookingModel(p.bookingType).updateOne({ _id: b._id, status: BOOKING_STATUS.PAYMENT_FAILED }, { status: BOOKING_STATUS.PENDING_PAYMENT });
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
    let p = await this.paymentModel.findById(paymentId);
    if (!p) throw new NotFoundException('Payment not found');
    if (String(p.userId) !== user.id && user.role !== UserRole.ADMINISTRATOR) throw new ForbiddenException();
    if (p.status === 'pending') {
      const pi = await this.stripe.paymentIntents.retrieve(p.stripePaymentIntentId);
      if (pi.status === 'succeeded') await this.onSucceeded(pi.id);
      else if (pi.status === 'canceled') await this.onFailed(pi.id, 'Payment canceled');
      p = await this.paymentModel.findById(paymentId);
    }
    return p;
  }

  // ---------- webhook ----------
  async handleWebhook(rawBody: Buffer, signature: string) {
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET || 'whsec_dummy',
      );
    } catch {
      throw new BadRequestException('Invalid webhook signature');
    }
    if (event.type === 'payment_intent.succeeded') {
      await this.onSucceeded((event.data.object as Stripe.PaymentIntent).id);
    } else if (event.type === 'payment_intent.payment_failed') {
      const pi = event.data.object as Stripe.PaymentIntent;
      await this.onFailed(pi.id, pi.last_payment_error?.message ?? 'Payment failed');
    }
    return { received: true };
  }

  private async onSucceeded(intentId: string) {
    const p = await this.paymentModel.findOneAndUpdate(
      { stripePaymentIntentId: intentId, status: { $ne: 'succeeded' } },   // idempotent
      { status: 'succeeded', paidAt: new Date() },
      { new: true },
    );
    if (!p) return;

    if (p.bookingType === 'flight') {
      try {
        await this.flightBookingsService.confirmBookingAfterPayment(String(p.bookingId));
      } catch (err) {
        try {
          await this.stripe.refunds.create({ payment_intent: intentId });
        } catch {
          /* ignore */
        }
        throw err;
      }
    } else {
      const reference = `BK-${new Date().getFullYear()}-${String(randomInt(0, 1_000_000)).padStart(6, '0')}`;
      const res = await this.bookingModel(p.bookingType).updateOne(
        { _id: p.bookingId, status: { $in: [BOOKING_STATUS.PENDING_PAYMENT, 'pending'] } },
        { status: BOOKING_STATUS.CONFIRMED, bookingReference: reference },
      );
      if (res.modifiedCount === 0) {
        await this.stripe.refunds.create({ payment_intent: intentId });
      }
    }
  }

  private async onFailed(intentId: string, reason: string) {
    const p = await this.paymentModel.findOneAndUpdate(
      { stripePaymentIntentId: intentId, status: 'pending' },
      { status: 'failed', failureReason: reason }, { new: true },
    );
    if (!p) return;
    await this.bookingModel(p.bookingType).updateOne(
      { _id: p.bookingId, status: BOOKING_STATUS.PENDING_PAYMENT }, { status: BOOKING_STATUS.PAYMENT_FAILED });
    // TODO: release inventory (call teammate's release method) + notification
  }
}
