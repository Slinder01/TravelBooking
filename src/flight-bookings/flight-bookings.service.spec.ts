import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { FlightBookingsService } from './flight-bookings.service';
import {
  FlightBooking,
  FlightBookingStatus,
} from './schemas/flight-booking.schema';
import {
  CabinClass,
  Flight,
  FlightStatus,
} from '../flights/schemas/flight.schema';
import { AirlinesService } from '../airlines/airlines.service';
import { UserRole } from '../users/users-role.enum';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';

describe('FlightBookingsService', () => {
  let service: FlightBookingsService;
  let mockBookingModel: any;
  let mockFlightModel: any;
  let mockAirlinesService: any;

  const userId = new Types.ObjectId().toString();
  const otherUserId = new Types.ObjectId().toString();
  const airlineId = new Types.ObjectId().toString();
  const otherAirlineId = new Types.ObjectId().toString();
  const outboundFlightId = new Types.ObjectId().toString();
  const returnFlightId = new Types.ObjectId().toString();

  const regularUser: AuthenticatedUser = {
    id: userId,
    email: 'traveler@example.com',
    role: UserRole.REGISTERED_USER,
  };

  const otherUser: AuthenticatedUser = {
    id: otherUserId,
    email: 'other@example.com',
    role: UserRole.REGISTERED_USER,
  };

  const guestUser: AuthenticatedUser = {
    id: new Types.ObjectId().toString(),
    email: 'guest@example.com',
    role: UserRole.GUEST,
  };

  const adminUser: AuthenticatedUser = {
    id: new Types.ObjectId().toString(),
    email: 'admin@travel.com',
    role: UserRole.ADMINISTRATOR,
  };

  const moderatorUser: AuthenticatedUser = {
    id: new Types.ObjectId().toString(),
    email: 'mod@egyptair.com',
    role: UserRole.AIRLINE_MODERATOR,
    airlineId,
  };

  const mockAirline = {
    _id: new Types.ObjectId(airlineId),
    name: 'EgyptAir',
    iataCode: 'MS',
    baggagePolicy: {
      cabinBagAllowanceKg: 8,
      checkedBagAllowanceKg: 23,
      excessBagFeePerKg: 20,
    },
    cancellationPolicy: {
      freeCancellationHours: 24,
      refundPercentage: 80,
    },
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
    mockBookingModel = jest.fn().mockImplementation((doc) => ({
      ...doc,
      _id: new Types.ObjectId(),
      save: jest.fn().mockResolvedValue({
        ...doc,
        _id: new Types.ObjectId(),
      }),
    }));
    mockBookingModel.find = jest.fn().mockReturnValue(makeChain([]));
    mockBookingModel.findById = jest.fn().mockReturnValue(makeChain(null));
    mockBookingModel.findOneAndUpdate = jest
      .fn()
      .mockReturnValue(makeChain(null));
    mockBookingModel.countDocuments = jest.fn().mockReturnValue(makeChain(0));

    mockFlightModel = {
      findById: jest.fn().mockReturnValue(makeChain(null)),
      findOneAndUpdate: jest.fn().mockReturnValue(makeChain(null)),
    };

    mockAirlinesService = {
      findById: jest.fn().mockResolvedValue(mockAirline),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FlightBookingsService,
        {
          provide: getModelToken(FlightBooking.name),
          useValue: mockBookingModel,
        },
        { provide: getModelToken(Flight.name), useValue: mockFlightModel },
        { provide: AirlinesService, useValue: mockAirlinesService },
      ],
    }).compile();

    service = module.get<FlightBookingsService>(FlightBookingsService);
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('createHold reserves seats atomically and snapshots pricing and policies (FLT-22)', async () => {
    const depTime = new Date(Date.now() + 72 * 3600 * 1000);
    const arrTime = new Date(depTime.getTime() + 3 * 3600 * 1000);

    const reservedFlight = {
      _id: new Types.ObjectId(outboundFlightId),
      airlineId: new Types.ObjectId(airlineId),
      flightNumber: 'MS777',
      departureTimeUtc: depTime,
      arrivalTimeUtc: arrTime,
      status: FlightStatus.SCHEDULED,
      cabins: [
        {
          cabinClass: CabinClass.ECONOMY,
          seatCount: 100,
          price: 250,
          bookedSeats: 0,
          heldSeats: 2,
        },
      ],
    };

    mockFlightModel.findOneAndUpdate.mockReturnValueOnce(
      makeChain(reservedFlight),
    );

    const result = await service.createHold(
      {
        flightId: outboundFlightId,
        cabinClass: CabinClass.ECONOMY,
        passengerCount: 2,
      },
      regularUser,
    );

    expect(mockFlightModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(FlightBookingStatus.HELD);
    expect(result.priceBreakdown.baseTotal).toBe(500);
    expect(result.policySnapshot.refundPercentage).toBe(80);
    expect(result.holdExpiresAt).toBeInstanceOf(Date);
  });

  it('createHold blocks GUEST role with 403 Forbidden', async () => {
    await expect(
      service.createHold(
        {
          flightId: outboundFlightId,
          cabinClass: CabinClass.ECONOMY,
          passengerCount: 1,
        },
        guestUser,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('createHold throws ConflictException when atomic capacity check fails', async () => {
    mockFlightModel.findOneAndUpdate.mockReturnValueOnce(makeChain(null));
    mockFlightModel.findById.mockReturnValueOnce(
      makeChain({
        _id: new Types.ObjectId(outboundFlightId),
        flightNumber: 'MS777',
        status: FlightStatus.SCHEDULED,
        departureTimeUtc: new Date(Date.now() + 48 * 3600 * 1000),
        cabins: [
          {
            cabinClass: CabinClass.ECONOMY,
            seatCount: 10,
            bookedSeats: 9,
            heldSeats: 0,
          },
        ],
      }),
    );

    await expect(
      service.createHold(
        {
          flightId: outboundFlightId,
          cabinClass: CabinClass.ECONOMY,
          passengerCount: 2,
        },
        regularUser,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('createHold compensates outbound heldSeats if return leg fails chronology', async () => {
    const outDep = new Date(Date.now() + 72 * 3600 * 1000);
    const outArr = new Date(outDep.getTime() + 4 * 3600 * 1000);
    const badRetDep = new Date(outArr.getTime() - 60 * 60 * 1000);

    mockFlightModel.findOneAndUpdate
      .mockReturnValueOnce(
        makeChain({
          _id: new Types.ObjectId(outboundFlightId),
          airlineId: new Types.ObjectId(airlineId),
          departureTimeUtc: outDep,
          arrivalTimeUtc: outArr,
          cabins: [{ cabinClass: CabinClass.ECONOMY, price: 200 }],
        }),
      )
      .mockReturnValueOnce(
        makeChain({
          _id: new Types.ObjectId(returnFlightId),
          airlineId: new Types.ObjectId(airlineId),
          departureTimeUtc: badRetDep,
          arrivalTimeUtc: new Date(badRetDep.getTime() + 3 * 3600 * 1000),
          cabins: [{ cabinClass: CabinClass.ECONOMY, price: 200 }],
        }),
      )
      .mockReturnValue(makeChain({}));

    await expect(
      service.createHold(
        {
          flightId: outboundFlightId,
          returnFlightId,
          cabinClass: CabinClass.ECONOMY,
          passengerCount: 2,
        },
        regularUser,
      ),
    ).rejects.toThrow(BadRequestException);

    // Reserve outbound + reserve return + release outbound + release return
    expect(mockFlightModel.findOneAndUpdate).toHaveBeenCalledTimes(4);
  });

  it('releaseExpiredHolds atomically expires stale holds and skips already-claimed ones', async () => {
    const staleId1 = new Types.ObjectId();
    const staleId2 = new Types.ObjectId();

    mockBookingModel.find.mockReturnValueOnce(
      makeChain([{ _id: staleId1 }, { _id: staleId2 }]),
    );
    mockBookingModel.findOneAndUpdate
      .mockReturnValueOnce(
        makeChain({
          _id: staleId1,
          flightId: new Types.ObjectId(outboundFlightId),
          cabinClass: CabinClass.ECONOMY,
          passengerCount: 3,
          status: FlightBookingStatus.EXPIRED,
        }),
      )
      .mockReturnValueOnce(makeChain(null));
    mockFlightModel.findOneAndUpdate.mockReturnValue(makeChain({}));

    const released = await service.releaseExpiredHolds();

    expect(released).toBe(1);
    expect(mockFlightModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('createBooking attaches passengers, calculates extra baggage fee, and stamps policy acceptance (FLT-19, FLT-21)', async () => {
    const holdDoc: any = {
      _id: new Types.ObjectId(),
      userId: new Types.ObjectId(userId),
      flightId: new Types.ObjectId(outboundFlightId),
      cabinClass: CabinClass.ECONOMY,
      passengerCount: 2,
      passengers: [],
      extraBaggageKg: 0,
      priceBreakdown: {
        baseFarePerPassenger: 250,
        passengerCount: 2,
        baseTotal: 500,
        extraBaggageKg: 0,
        extraBaggageFee: 0,
        totalPrice: 500,
        currency: 'USD',
      },
      policySnapshot: {
        cabinBagAllowanceKg: 8,
        checkedBagAllowanceKg: 23,
        excessBagFeePerKg: 20,
        freeCancellationHours: 24,
        refundPercentage: 80,
      },
      status: FlightBookingStatus.HELD,
      holdExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      save: jest.fn().mockImplementation(function (this: any) {
        return Promise.resolve(this);
      }),
    };

    mockBookingModel.findById.mockReturnValueOnce(makeChain(holdDoc));

    const updated = await service.createBooking(
      {
        holdId: holdDoc._id.toString(),
        passengers: [
          {
            firstName: 'Mariam',
            lastName: 'Hassan',
            passportNumber: 'A123456',
            dateOfBirth: '1999-05-14',
          },
          {
            firstName: 'Omar',
            lastName: 'Hassan',
            passportNumber: 'A654321',
            dateOfBirth: '2001-02-20',
          },
        ],
        extraBaggageKg: 5,
        acceptPolicies: true,
      },
      regularUser,
    );

    expect(updated.status).toBe(FlightBookingStatus.PENDING_PAYMENT);
    expect(updated.priceBreakdown.extraBaggageFee).toBe(100);
    expect(updated.priceBreakdown.totalPrice).toBe(600);
    expect(updated.bookingReference).toMatch(/^FB-/);
    expect(updated.policySnapshot.acceptedAt).toBeInstanceOf(Date);
  });

  it('createBooking blocks another user from claiming a hold (IDOR prevention)', async () => {
    mockBookingModel.findById.mockReturnValueOnce(
      makeChain({
        _id: new Types.ObjectId(),
        userId: new Types.ObjectId(userId),
        status: FlightBookingStatus.HELD,
      }),
    );

    await expect(
      service.createBooking(
        {
          holdId: new Types.ObjectId().toString(),
          passengers: [
            {
              firstName: 'Eve',
              lastName: 'Mallory',
              passportNumber: 'X999999',
              dateOfBirth: '1998-01-01',
            },
          ],
        },
        otherUser,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('confirmBookingAfterPayment moves heldSeats to bookedSeats and issues eTicketCode', async () => {
    const bookingId = new Types.ObjectId();
    const pendingBooking: any = {
      _id: bookingId,
      userId: new Types.ObjectId(userId),
      flightId: new Types.ObjectId(outboundFlightId),
      cabinClass: CabinClass.ECONOMY,
      passengerCount: 1,
      passengers: [{ firstName: 'Mariam' }],
      status: FlightBookingStatus.PENDING_PAYMENT,
      holdExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      bookingReference: 'FB-ABCD1234',
      save: jest.fn().mockImplementation(function (this: any) {
        return Promise.resolve(this);
      }),
    };

    mockBookingModel.findById.mockReturnValueOnce(makeChain(pendingBooking));
    mockFlightModel.findOneAndUpdate.mockReturnValueOnce(makeChain({}));

    const confirmed = await service.confirmBookingAfterPayment(
      bookingId.toString(),
    );

    expect(confirmed.status).toBe(FlightBookingStatus.CONFIRMED);
    expect(confirmed.eTicketCode).toMatch(/^ETK-/);
    expect(confirmed.holdExpiresAt).toBeUndefined();
  });

  it('getETicket rejects non-confirmed bookings and returns payload when confirmed (FLT-23)', async () => {
    const bookingId = new Types.ObjectId().toString();
    mockBookingModel.findById.mockReturnValueOnce(
      makeChain({
        _id: new Types.ObjectId(bookingId),
        userId: new Types.ObjectId(userId),
        status: FlightBookingStatus.PENDING_PAYMENT,
      }),
    );

    await expect(service.getETicket(bookingId, regularUser)).rejects.toThrow(
      BadRequestException,
    );

    mockBookingModel.findById.mockReturnValueOnce(
      makeChain({
        _id: new Types.ObjectId(bookingId),
        userId: new Types.ObjectId(userId),
        status: FlightBookingStatus.CONFIRMED,
        eTicketCode: 'ETK-12345678',
        bookingReference: 'FB-12345678',
        updatedAt: new Date(),
        cabinClass: CabinClass.ECONOMY,
        passengerCount: 1,
        passengers: [{ firstName: 'Mariam' }],
        flightId: { flightNumber: 'MS777' },
        policySnapshot: {
          cabinBagAllowanceKg: 8,
          checkedBagAllowanceKg: 23,
        },
        extraBaggageKg: 0,
        priceBreakdown: { totalPrice: 250 },
      }),
    );

    const ticket = await service.getETicket(bookingId, regularUser);
    expect(ticket.eTicketCode).toBe('ETK-12345678');
  });

  it('cancelBooking applies 80% refund outside freeCancellationHours and 0% inside window (FLT-26)', async () => {
    const bookingId = new Types.ObjectId();

    // Outside 24h window -> 80% of 500 = 400
    mockBookingModel.findById.mockReturnValueOnce(
      makeChain({
        _id: bookingId,
        userId: new Types.ObjectId(userId),
        flightId: new Types.ObjectId(outboundFlightId),
        cabinClass: CabinClass.ECONOMY,
        passengerCount: 2,
        status: FlightBookingStatus.CONFIRMED,
        priceBreakdown: { totalPrice: 500 },
        policySnapshot: {
          freeCancellationHours: 24,
          refundPercentage: 80,
        },
      }),
    );
    mockFlightModel.findById.mockReturnValueOnce(
      makeChain({
        departureTimeUtc: new Date(Date.now() + 72 * 3600 * 1000),
      }),
    );
    mockBookingModel.findOneAndUpdate.mockReturnValueOnce(
      makeChain({
        _id: bookingId,
        flightId: new Types.ObjectId(outboundFlightId),
        cabinClass: CabinClass.ECONOMY,
        passengerCount: 2,
        status: FlightBookingStatus.CANCELLED,
        refundAmount: 400,
      }),
    );
    mockFlightModel.findOneAndUpdate.mockReturnValueOnce(makeChain({}));

    const earlyCancel = await service.cancelBooking(
      bookingId.toString(),
      { reason: 'Change of plans' },
      regularUser,
    );
    expect(earlyCancel.refundAmount).toBe(400);

    // Inside 24h window (only 6h left) -> 0 refund
    mockBookingModel.findById.mockReturnValueOnce(
      makeChain({
        _id: bookingId,
        userId: new Types.ObjectId(userId),
        flightId: new Types.ObjectId(outboundFlightId),
        cabinClass: CabinClass.ECONOMY,
        passengerCount: 2,
        status: FlightBookingStatus.CONFIRMED,
        priceBreakdown: { totalPrice: 500 },
        policySnapshot: {
          freeCancellationHours: 24,
          refundPercentage: 80,
        },
      }),
    );
    mockFlightModel.findById.mockReturnValueOnce(
      makeChain({
        departureTimeUtc: new Date(Date.now() + 6 * 3600 * 1000),
      }),
    );
    mockBookingModel.findOneAndUpdate.mockReturnValueOnce(
      makeChain({
        _id: bookingId,
        flightId: new Types.ObjectId(outboundFlightId),
        cabinClass: CabinClass.ECONOMY,
        passengerCount: 2,
        status: FlightBookingStatus.CANCELLED,
        refundAmount: 0,
      }),
    );
    mockFlightModel.findOneAndUpdate.mockReturnValueOnce(makeChain({}));

    const lateCancel = await service.cancelBooking(
      bookingId.toString(),
      {},
      regularUser,
    );
    expect(lateCancel.refundAmount).toBe(0);
  });

  it('exportFlightPassengers blocks cross-airline moderator and escapes CSV cells (FLT-29)', async () => {
    // Different airline moderator blocked
    mockFlightModel.findById.mockReturnValueOnce(
      makeChain({
        _id: new Types.ObjectId(outboundFlightId),
        airlineId: new Types.ObjectId(otherAirlineId),
      }),
    );

    await expect(
      service.exportFlightPassengers(outboundFlightId, 'csv', moderatorUser),
    ).rejects.toThrow(ForbiddenException);

    // Assigned moderator exports CSV safely
    mockFlightModel.findById.mockReturnValueOnce(
      makeChain({
        _id: new Types.ObjectId(outboundFlightId),
        airlineId: new Types.ObjectId(airlineId),
        flightNumber: 'MS777',
        departureAirportIata: 'CAI',
        arrivalAirportIata: 'DXB',
        departureDateLocal: '2026-12-01',
      }),
    );
    mockBookingModel.find.mockReturnValueOnce(
      makeChain([
        {
          bookingReference: 'FB-111',
          eTicketCode: 'ETK-222',
          cabinClass: CabinClass.ECONOMY,
          extraBaggageKg: 5,
          passengers: [
            {
              firstName: '=CMD()',
              lastName: 'Hassan',
              passportNumber: 'A123',
              dateOfBirth: '1999-05-14',
              nationality: 'EG',
            },
          ],
        },
      ]),
    );

    const exported: any = await service.exportFlightPassengers(
      outboundFlightId,
      'csv',
      moderatorUser,
    );
    expect(exported.filename).toBe('MS777-2026-12-01-passengers.csv');
    expect(exported.data).toContain("'=CMD()");
  });

  it('supports ACC-12 upcoming confirmed booking check and ACC-17 admin pagination', async () => {
    expect(await service.hasUpcomingConfirmedBooking('bad-id')).toBe(false);

    mockBookingModel.find.mockReturnValueOnce(
      makeChain([
        {
          flightId: {
            departureTimeUtc: new Date(Date.now() + 24 * 3600 * 1000),
          },
        },
      ]),
    );
    expect(await service.hasUpcomingConfirmedBooking(userId)).toBe(true);

    mockBookingModel.find.mockReturnValueOnce(
      makeChain([{ _id: 'b1' }]),
    );
    mockBookingModel.countDocuments.mockReturnValueOnce(makeChain(1));

    const adminList = await service.listAllBookings({
      page: 1,
      limit: 10,
      status: 'confirmed',
    });
    expect(adminList.total).toBe(1);
    expect(adminList.items).toHaveLength(1);
  });

  it('findOneById allows administrator access and throws NotFoundException when missing', async () => {
    const missingId = new Types.ObjectId().toString();
    mockBookingModel.findById.mockReturnValueOnce(makeChain(null));

    await expect(service.findOneById(missingId, adminUser)).rejects.toThrow(
      NotFoundException,
    );
  });
});
