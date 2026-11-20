import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import Stripe from 'stripe';
import { Payment } from './schemas/payment.schema';
import { Refund } from './schemas/refund.schema';
import { PaymentsService } from './payments.service';
import { AuthUser } from '../common/auth-user';
import { BOOKING_STATUS } from '../common/booking-status';
import { UserRole } from '../users/users-role.enum';

export interface PolicyTier { hoursBefore: number; refundPercent: number }

export function calculateRefundPercent(policy: PolicyTier[] | undefined, eventDate: Date, now = new Date()): number {
  if (!policy?.length) return 0;
  const hoursLeft = (eventDate.getTime() - now.getTime()) / 36e5;
  // tiers: cancel at least X hours before the event => Y% refund. Pick the strictest tier satisfied.
  const tier = [...policy].sort((a, b) => b.hoursBefore - a.hoursBefore).find(t => hoursLeft >= t.hoursBefore);
  return tier ? tier.refundPercent : 0;
}

@Injectable()
export class RefundsService {
  private stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
  constructor(
    @InjectModel(Refund.name) private refundModel: Model<Refund>,
    @InjectModel(Payment.name) private paymentModel: Model<Payment>,
    private payments: PaymentsService,
  ) {}

  /** Teammates call this from POST /flight-bookings/:id/cancel and POST /hotel-bookings/:id/cancel */
  async processCancellation(type: 'flight' | 'hotel', bookingId: string, user: AuthUser) {
    const b = await this.payments.loadOwnedBooking(type, bookingId, user);
    if (b.status !== BOOKING_STATUS.CONFIRMED) throw new BadRequestException(`Cannot cancel a ${b.status} booking`);
    if (new Date(b.eventDate) <= new Date()) throw new BadRequestException('Event already started or passed');

    const payment = await this.paymentModel.findOne({ bookingId: b._id, status: 'succeeded' });
    if (!payment) throw new BadRequestException('No successful payment found');

    const percent = calculateRefundPercent(b.cancellationPolicy, new Date(b.eventDate));
    const amount = Math.round(payment.amount * percent) / 100;

    const refund = await this.refundModel.create({
      paymentId: payment._id, bookingId: b._id, bookingType: type, userId: b.userId,
      amount, currency: payment.currency, refundPercent: percent,
      status: amount > 0 ? 'pending' : 'not_applicable', policyApplied: b.cancellationPolicy,
    });

    if (amount > 0) {
      try {
        const zero = ['JPY', 'KRW', 'VND', 'CLP'].includes(payment.currency);
        const r = await this.stripe.refunds.create({
          payment_intent: payment.stripePaymentIntentId,
          amount: zero ? Math.round(amount) : Math.round(amount * 100),
        });
        refund.stripeRefundId = r.id;
        refund.status = r.status === 'failed' ? 'failed' : 'succeeded';
      } catch (e) {
        refund.status = 'failed';
      }
      await refund.save();
    }

    await this.payments.bookingModel(type).updateOne({ _id: b._id }, { status: BOOKING_STATUS.CANCELLED });
    // TODO: release inventory (teammate) + notification
    return refund;
  }

  async get(id: string, user: AuthUser) {
    const r = await this.refundModel.findById(id);
    if (!r) throw new NotFoundException('Refund not found');
    if (String(r.userId) !== user.id && user.role !== UserRole.ADMINISTRATOR) throw new ForbiddenException();
    return r;
  }
}
