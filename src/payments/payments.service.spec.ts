import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { PaymentsService } from './payments.service';
import { Payment } from './schemas/payment.schema';
import { PolicyAcceptance } from './schemas/policy-acceptance.schema';
import { FlightBookingsService } from '../flight-bookings/flight-bookings.service';
import { BOOKING_STATUS } from '../common/booking-status';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let mockPaymentModel: any;
  let mockAcceptModel: any;
  let mockFlightBookingsService: any;
  let mockConnection: any;

  const userId = new Types.ObjectId().toString();
  const otherUserId = new Types.ObjectId().toString();
  const bookingId = new Types.ObjectId();

  const user = { id: userId, email: 'test@example.com', role: 'registered_user' };
  const otherUser = { id: otherUserId, email: 'other@example.com', role: 'registered_user' };

  const mockFlightBooking = {
    _id: bookingId,
    userId: new Types.ObjectId(userId),
    status: BOOKING_STATUS.PENDING_PAYMENT,
    priceBreakdown: { totalPrice: 450, currency: 'USD' },
    policySnapshot: { freeCancellationHours: 24, refundPercentage: 80, acceptedAt: new Date() },
    holdExpiresAt: new Date(Date.now() + 600_000),
  };

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
    mockPaymentModel = {
      findById: jest.fn().mockReturnValue(makeChain(null)),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((doc: any) => Promise.resolve({ ...doc, _id: new Types.ObjectId() })),
      findOneAndUpdate: jest.fn().mockResolvedValue(null),
    };

    mockAcceptModel = {
      exists: jest.fn().mockResolvedValue(true),
      findOneAndUpdate: jest.fn().mockResolvedValue({}),
    };

    mockFlightBookingsService = {
      confirmBookingAfterPayment: jest.fn().mockResolvedValue({ status: 'CONFIRMED' }),
      cancelBooking: jest.fn().mockResolvedValue({ refundAmount: 360, policyApplied: { refundPercentage: 80 } }),
    };

    const mockBookingModelInstance = {
      findById: jest.fn().mockImplementation((id: any) => {
        if (id.toString() === bookingId.toString()) return Promise.resolve(mockFlightBooking);
        return Promise.resolve(null);
      }),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };

    mockConnection = {
      model: jest.fn().mockReturnValue(mockBookingModelInstance),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: getModelToken(Payment.name), useValue: mockPaymentModel },
        { provide: getModelToken(PolicyAcceptance.name), useValue: mockAcceptModel },
        { provide: getConnectionToken(), useValue: mockConnection },
        { provide: FlightBookingsService, useValue: mockFlightBookingsService },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);

    // Mock stripe instance methods
    (service as any).stripe = {
      paymentIntents: {
        create: jest.fn().mockResolvedValue({ id: 'pi_test_123', client_secret: 'sec_test_123' }),
        retrieve: jest.fn().mockResolvedValue({ status: 'succeeded' }),
      },
      refunds: {
        create: jest.fn().mockResolvedValue({ id: 're_test_123', status: 'succeeded' }),
      },
      webhooks: {
        constructEvent: jest.fn(),
      },
    };
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

  it('onSucceeded calls FlightBookingsService.confirmBookingAfterPayment for flight bookings', async () => {
    mockPaymentModel.findOneAndUpdate.mockResolvedValueOnce({
      _id: new Types.ObjectId(),
      bookingType: 'flight',
      bookingId,
      stripePaymentIntentId: 'pi_test_123',
    });

    await (service as any).onSucceeded('pi_test_123');
    expect(mockFlightBookingsService.confirmBookingAfterPayment).toHaveBeenCalledWith(bookingId.toString());
  });
});
