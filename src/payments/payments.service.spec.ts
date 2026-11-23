import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { PaymentsService } from './payments.service';
import { RefundsService } from './refunds.service';
import { Payment } from './schemas/payment.schema';
import { Refund } from './schemas/refund.schema';
import { PolicyAcceptance } from './schemas/policy-acceptance.schema';
import { FlightBookingsService } from '../flight-bookings/flight-bookings.service';
import { BookingService } from '../bookings/booking.service';
import { BOOKING_STATUS } from '../common/booking-status';
import { UserRole } from '../users/users-role.enum';

describe('PaymentsService & RefundsService', () => {
  let service: PaymentsService;
  let refundsService: RefundsService;
  let mockPaymentModel: any;
  let mockRefundModel: any;
  let mockAcceptModel: any;
  let mockFlightBookingsService: any;
  let mockBookingService: any;
  let mockBookingModelInstance: any;
  let mockConnection: any;

  const userId = new Types.ObjectId().toString();
  const otherUserId = new Types.ObjectId().toString();
  const bookingId = new Types.ObjectId();

  const user = { id: userId, email: 'test@example.com', role: UserRole.REGISTERED_USER };
  const otherUser = { id: otherUserId, email: 'other@example.com', role: UserRole.REGISTERED_USER };
  const guestUser = { id: userId, email: 'guest@example.com', role: UserRole.GUEST };

  let mockFlightBooking: any;

  const makeChain = (value: any) => ({
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    populate: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  });

  beforeEach(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_unit_secret';

    mockFlightBooking = {
      _id: bookingId,
      userId: new Types.ObjectId(userId),
      status: BOOKING_STATUS.PENDING_PAYMENT,
      priceBreakdown: { totalPrice: 450, currency: 'USD' },
      policySnapshot: { freeCancellationHours: 24, refundPercentage: 80, acceptedAt: new Date() },
      holdExpiresAt: new Date(Date.now() + 600_000),
    };

    mockPaymentModel = {
      findById: jest.fn().mockReturnValue(makeChain(null)),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((doc: any) => Promise.resolve({ ...doc, _id: new Types.ObjectId() })),
      findOneAndUpdate: jest.fn().mockResolvedValue(null),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };

    mockRefundModel = {
      create: jest.fn().mockImplementation((doc: any) =>
        Promise.resolve({ ...doc, _id: new Types.ObjectId(), save: jest.fn().mockResolvedValue(true) }),
      ),
      findById: jest.fn().mockReturnValue(makeChain(null)),
      findOne: jest.fn().mockResolvedValue(null),
    };

    mockAcceptModel = {
      exists: jest.fn().mockResolvedValue(true),
      findOneAndUpdate: jest.fn().mockResolvedValue({}),
    };

    mockFlightBookingsService = {
      confirmBookingAfterPayment: jest.fn().mockResolvedValue({ status: 'CONFIRMED' }),
      cancelBooking: jest.fn().mockResolvedValue({
        booking: { _id: bookingId, status: 'CANCELLED' },
        refundAmount: 360,
        policyApplied: { freeCancellationHours: 24, refundPercentage: 80 },
      }),
      releaseExpiredHolds: jest.fn().mockResolvedValue(0),
    };

    mockBookingService = {
      cancelBooking: jest.fn().mockResolvedValue({ _id: bookingId, status: 'cancelled' }),
    };

    mockBookingModelInstance = {
      findById: jest.fn().mockImplementation((id: any) => {
        if (id.toString() === bookingId.toString()) return Promise.resolve(mockFlightBooking);
        return Promise.resolve(null);
      }),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };

    mockConnection = {
      models: {
        FlightBooking: mockBookingModelInstance,
        Booking: mockBookingModelInstance,
      },
      model: jest.fn().mockReturnValue(mockBookingModelInstance),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        RefundsService,
        { provide: getModelToken(Payment.name), useValue: mockPaymentModel },
        { provide: getModelToken(Refund.name), useValue: mockRefundModel },
        { provide: getModelToken(PolicyAcceptance.name), useValue: mockAcceptModel },
        { provide: getConnectionToken(), useValue: mockConnection },
        { provide: FlightBookingsService, useValue: mockFlightBookingsService },
        { provide: BookingService, useValue: mockBookingService },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
    refundsService = module.get<RefundsService>(RefundsService);

    const mockStripe = {
      paymentIntents: {
        create: jest.fn().mockResolvedValue({ id: 'pi_test_123', client_secret: 'sec_test_123' }),
        retrieve: jest.fn().mockResolvedValue({ id: 'pi_test_123', status: 'requires_payment_method', client_secret: 'sec_test_123' }),
        cancel: jest.fn().mockResolvedValue({ id: 'pi_test_123', status: 'canceled' }),
      },
      refunds: {
        create: jest.fn().mockResolvedValue({ id: 're_test_123', status: 'succeeded' }),
      },
      webhooks: {
        constructEvent: jest.fn(),
      },
    };
    (service as any).stripe = mockStripe;
    (refundsService as any).stripe = mockStripe;
  });

  it('loadOwnedBooking blocks non-owners with ForbiddenException', async () => {
    await expect(service.loadOwnedBooking('flight', bookingId.toString(), otherUser)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('getPolicies returns policySnapshot for flight bookings', async () => {
    const res = await service.getPolicies('flight', bookingId.toString(), user);
    expect(res.freeCancellationHours).toBe(24);
    expect(res.refundPercentage).toBe(80);
  });

  it('create generates Stripe payment intent reading priceBreakdown fields', async () => {
    const res = await service.create({ bookingType: 'flight' as any, bookingId: bookingId.toString() }, user);
    expect((service as any).stripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 45000,
        currency: 'usd',
      }),
    );
    expect(res.clientSecret).toBe('sec_test_123');
  });

  it('create rejects GUEST role and zero/missing payable amount', async () => {
    await expect(
      service.create({ bookingType: 'flight', bookingId: bookingId.toString() }, guestUser),
    ).rejects.toThrow(ForbiddenException);

    mockFlightBooking.priceBreakdown.totalPrice = 0;
    await expect(
      service.create({ bookingType: 'flight', bookingId: bookingId.toString() }, user),
    ).rejects.toThrow(BadRequestException);
  });

  it('create replaces canceled pending PaymentIntent and filters by bookingType', async () => {
    const staleId = new Types.ObjectId();
    mockPaymentModel.findOne.mockResolvedValueOnce({
      _id: staleId,
      bookingType: 'flight',
      bookingId,
      amount: 450,
      currency: 'USD',
      status: 'pending',
      stripePaymentIntentId: 'pi_canceled_old',
    });
    (service as any).stripe.paymentIntents.retrieve.mockResolvedValueOnce({
      id: 'pi_canceled_old',
      status: 'canceled',
      client_secret: 'sec_dead',
    });

    const res = await service.create({ bookingType: 'flight', bookingId: bookingId.toString() }, user);
    expect(mockPaymentModel.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ bookingType: 'flight', bookingId }),
    );
    expect(mockPaymentModel.updateOne).toHaveBeenCalledWith(
      { _id: staleId, status: 'pending' },
      expect.objectContaining({ status: 'failed' }),
    );
    expect(res.clientSecret).toBe('sec_test_123');
  });

  it('create rejects with ConflictException when existing pending PI is already processing', async () => {
    mockPaymentModel.findOne.mockResolvedValueOnce({
      _id: new Types.ObjectId(),
      bookingType: 'flight',
      bookingId,
      status: 'processing',
      stripePaymentIntentId: 'pi_proc',
    });

    await expect(
      service.create({ bookingType: 'flight', bookingId: bookingId.toString() }, user),
    ).rejects.toThrow(ConflictException);
  });

  it('retry rejects CANCELLED bookings and terminal refunded payments', async () => {
    const paymentId = new Types.ObjectId();
    mockFlightBooking.status = BOOKING_STATUS.CANCELLED;
    mockPaymentModel.findById.mockResolvedValueOnce({
      _id: paymentId,
      userId: new Types.ObjectId(userId),
      bookingType: 'flight',
      bookingId,
      amount: 450,
      currency: 'USD',
      status: 'failed',
      stripePaymentIntentId: 'pi_old',
      attempts: 1,
      save: jest.fn(),
    });

    await expect(service.retry(paymentId.toString(), user)).rejects.toThrow(BadRequestException);
    expect((service as any).stripe.paymentIntents.create).not.toHaveBeenCalled();

    mockFlightBooking.status = BOOKING_STATUS.PENDING_PAYMENT;
    mockPaymentModel.findById.mockResolvedValueOnce({
      _id: paymentId,
      userId: new Types.ObjectId(userId),
      bookingType: 'flight',
      bookingId,
      status: 'refunded',
    });
    await expect(service.retry(paymentId.toString(), user)).rejects.toThrow(BadRequestException);
  });

  it('onSucceeded calls FlightBookingsService.confirmBookingAfterPayment and marks succeeded', async () => {
    const paymentId = new Types.ObjectId();
    mockPaymentModel.findOneAndUpdate.mockResolvedValueOnce({
      _id: paymentId,
      bookingType: 'flight',
      bookingId,
      stripePaymentIntentId: 'pi_test_123',
    });

    await (service as any).onSucceeded('pi_test_123');
    expect(mockFlightBookingsService.confirmBookingAfterPayment).toHaveBeenCalledWith(bookingId.toString());
    expect(mockPaymentModel.updateOne).toHaveBeenCalledWith(
      { _id: paymentId },
      expect.objectContaining({ status: 'succeeded' }),
    );
  });

  it('onSucceeded rollback sets terminal status=refunded so duplicate webhook is idempotent', async () => {
    const paymentDoc: any = {
      _id: new Types.ObjectId(),
      userId: new Types.ObjectId(userId),
      bookingType: 'flight',
      bookingId,
      amount: 450,
      currency: 'USD',
      status: 'pending',
      stripePaymentIntentId: 'pi_rb_1',
    };
    mockPaymentModel.findOneAndUpdate.mockImplementation(async (filter: any, update: any) => {
      const allowed = filter.status?.$in ?? [];
      if (paymentDoc.stripePaymentIntentId === filter.stripePaymentIntentId && allowed.includes(paymentDoc.status)) {
        Object.assign(paymentDoc, update);
        return { ...paymentDoc };
      }
      return null;
    });
    mockPaymentModel.updateOne.mockImplementation(async (_f: any, update: any) => {
      Object.assign(paymentDoc, update);
      return { modifiedCount: 1 };
    });
    mockFlightBookingsService.confirmBookingAfterPayment.mockRejectedValue(new Error('Hold expired'));

    await (service as any).onSucceeded('pi_rb_1');
    expect(paymentDoc.status).toBe('refunded');
    expect(mockRefundModel.create).toHaveBeenCalledTimes(1);

    // Second duplicate webhook is completely ignored
    await (service as any).onSucceeded('pi_rb_1');
    expect(mockFlightBookingsService.confirmBookingAfterPayment).toHaveBeenCalledTimes(1);
    expect(mockRefundModel.create).toHaveBeenCalledTimes(1);
  });

  it('onFailed keeps FlightBooking in PENDING_PAYMENT (does not write invalid PAYMENT_FAILED)', async () => {
    mockPaymentModel.findOneAndUpdate.mockResolvedValueOnce({
      _id: new Types.ObjectId(),
      bookingType: 'flight',
      bookingId,
      status: 'failed',
    });

    await (service as any).onFailed('pi_fail_flight', 'card_declined');
    expect(mockBookingModelInstance.updateOne).not.toHaveBeenCalled();
  });

  it('handleWebhook rejects missing STRIPE_WEBHOOK_SECRET and handles payment_intent.canceled', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    await expect(service.handleWebhook(Buffer.from('{}'), 'sig')).rejects.toThrow(ServiceUnavailableException);

    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_valid';
    (service as any).stripe.webhooks.constructEvent.mockReturnValueOnce({
      type: 'payment_intent.canceled',
      data: { object: { id: 'pi_cancel_99' } },
    });
    await service.handleWebhook(Buffer.from('{}'), 'sig');
    expect(mockPaymentModel.findOneAndUpdate).toHaveBeenCalledWith(
      { stripePaymentIntentId: 'pi_cancel_99', status: 'pending' },
      { status: 'failed', failureReason: 'Payment canceled' },
      { new: true },
    );
  });

  it('RefundsService.processCancellation skips Refund creation for unpaid flight holds', async () => {
    mockPaymentModel.findOne.mockResolvedValueOnce(null);
    mockFlightBookingsService.cancelBooking.mockResolvedValueOnce({
      booking: { _id: bookingId, status: 'CANCELLED' },
      refundAmount: 0,
      policyApplied: { freeCancellationHours: 24, refundPercentage: 80 },
    });

    const res: any = await refundsService.processCancellation('flight', bookingId.toString(), user);
    expect(res.cancelled).toBe(true);
    expect(res.refund).toBeNull();
    expect(mockRefundModel.create).not.toHaveBeenCalled();
  });

  it('RefundsService.processCancellation records 100% refundPercent for airline-cancelled full refund', async () => {
    const paymentId = new Types.ObjectId();
    mockPaymentModel.findOne.mockResolvedValueOnce({
      _id: paymentId,
      amount: 500,
      currency: 'USD',
      stripePaymentIntentId: 'pi_air_1',
    });
    mockFlightBookingsService.cancelBooking.mockResolvedValueOnce({
      booking: { _id: bookingId, status: 'CANCELLED' },
      refundAmount: 500,
      policyApplied: { freeCancellationHours: 24, refundPercentage: 80 },
    });

    const res: any = await refundsService.processCancellation('flight', bookingId.toString(), user);
    expect(res.amount).toBe(500);
    expect(res.refundPercent).toBe(100);
  });

  it('RefundsService.processCancellation delegates hotel cancellation to BookingService to restore room inventory', async () => {
    mockFlightBooking.status = 'confirmed';
    mockFlightBooking.checkInDate = new Date(Date.now() + 72 * 3600_000);
    mockFlightBooking.cancellationPolicy = [{ hoursBefore: 24, refundPercent: 100 }];
    mockPaymentModel.findOne.mockResolvedValueOnce({
      _id: new Types.ObjectId(),
      amount: 300,
      currency: 'USD',
      stripePaymentIntentId: 'pi_htl_1',
    });

    await refundsService.processCancellation('hotel', bookingId.toString(), user);
    expect(mockBookingService.cancelBooking).toHaveBeenCalledWith(bookingId.toString(), user.id);
  });
});
