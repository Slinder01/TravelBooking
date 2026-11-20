import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'node:crypto';
import { Model, Types, isValidObjectId } from 'mongoose';
import {
  FlightBooking,
  FlightBookingDocument,
  FlightBookingStatus,
} from './schemas/flight-booking.schema';
import {
  CabinClass,
  Flight,
  FlightDocument,
  FlightStatus,
} from '../flights/schemas/flight.schema';
import { AirlinesService } from '../airlines/airlines.service';
import { CreateHoldDto } from './dtos/create-hold.dto';
import { CreateFlightBookingDto } from './dtos/create-flight-booking.dto';
import { CancelFlightBookingDto } from './dtos/cancel-flight-booking.dto';
import { UserRole } from '../users/users-role.enum';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';

export const HOLD_DURATION_MINUTES = 15;
const HOLD_SWEEP_INTERVAL_MS = 60_000;

@Injectable()
export class FlightBookingsService implements OnModuleInit, OnModuleDestroy {
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectModel(FlightBooking.name)
    private readonly flightBookingModel: Model<FlightBookingDocument>,
    @InjectModel(Flight.name)
    private readonly flightModel: Model<FlightDocument>,
    private readonly airlinesService: AirlinesService,
  ) {}

  onModuleInit() {
    this.sweepTimer = setInterval(() => {
      void this.releaseExpiredHolds();
    }, HOLD_SWEEP_INTERVAL_MS);
    this.sweepTimer.unref();
  }

  onModuleDestroy() {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  /**
   * Atomically reserves temporary seats on one or two (round-trip) flights (FLT-22).
   */
  async createHold(
    dto: CreateHoldDto,
    currentUser: AuthenticatedUser,
  ): Promise<FlightBookingDocument> {
    if (currentUser.role === UserRole.GUEST) {
      throw new ForbiddenException(
        'A registered account is required to reserve flight seats',
      );
    }

    if (dto.returnFlightId && dto.returnFlightId === dto.flightId) {
      throw new BadRequestException(
        'Outbound and return flights must be different',
      );
    }

    await this.releaseExpiredHolds();

    const outboundFlight = await this.reserveSeatsAtomically(
      dto.flightId,
      dto.cabinClass,
      dto.passengerCount,
    );

    const returnCabinClass = dto.returnFlightId
      ? (dto.returnCabinClass ?? dto.cabinClass)
      : undefined;

    let returnFlight: FlightDocument | null = null;
    if (dto.returnFlightId && returnCabinClass) {
      try {
        returnFlight = await this.reserveSeatsAtomically(
          dto.returnFlightId,
          returnCabinClass,
          dto.passengerCount,
        );

        if (
          returnFlight.departureAirportIata !==
            outboundFlight.arrivalAirportIata ||
          returnFlight.arrivalAirportIata !== outboundFlight.departureAirportIata
        ) {
          throw new BadRequestException(
            'Return flight origin and destination must match the outbound route in reverse',
          );
        }

        if (
          returnFlight.departureTimeUtc.getTime() <=
          outboundFlight.arrivalTimeUtc.getTime()
        ) {
          throw new BadRequestException(
            'Return flight must depart after the outbound flight arrives',
          );
        }
      } catch (error) {
        await this.releaseSeatsAtomically(
          dto.flightId,
          dto.cabinClass,
          dto.passengerCount,
          'heldSeats',
        );
        if (returnFlight) {
          await this.releaseSeatsAtomically(
            dto.returnFlightId,
            returnCabinClass,
            dto.passengerCount,
            'heldSeats',
          );
        }
        throw error;
      }
    }

    try {
      const outboundCabin = outboundFlight.cabins.find(
        (c) => c.cabinClass === dto.cabinClass,
      )!;
      const returnCabin = returnFlight
        ? returnFlight.cabins.find((c) => c.cabinClass === returnCabinClass)!
        : null;

      const airline = await this.airlinesService.findById(
        outboundFlight.airlineId.toString(),
      );
      if (airline.isActive === false) {
        throw new BadRequestException(
          'Airline is currently inactive and cannot accept bookings',
        );
      }

      if (
        returnFlight &&
        returnFlight.airlineId.toString() !== outboundFlight.airlineId.toString()
      ) {
        const returnAirline = await this.airlinesService.findById(
          returnFlight.airlineId.toString(),
        );
        if (returnAirline.isActive === false) {
          throw new BadRequestException(
            'Return flight airline is currently inactive and cannot accept bookings',
          );
        }
      }

      const baseFarePerPassenger =
        Math.round(
          (outboundCabin.price + (returnCabin ? returnCabin.price : 0)) * 100,
        ) / 100;
      const baseTotal =
        Math.round(baseFarePerPassenger * dto.passengerCount * 100) / 100;

      const rawHoldExpiryMs = Date.now() + HOLD_DURATION_MINUTES * 60 * 1000;
      const holdExpiresAt = new Date(
        Math.min(rawHoldExpiryMs, outboundFlight.departureTimeUtc.getTime()),
      );

      const booking = new this.flightBookingModel({
        userId: new Types.ObjectId(currentUser.id),
        flightId: outboundFlight._id,
        ...(returnFlight ? { returnFlightId: returnFlight._id } : {}),
        cabinClass: dto.cabinClass,
        ...(returnCabinClass ? { returnCabinClass } : {}),
        passengerCount: dto.passengerCount,
        passengers: [],
        extraBaggageKg: 0,
        priceBreakdown: {
          baseFarePerPassenger,
          passengerCount: dto.passengerCount,
          baseTotal,
          extraBaggageKg: 0,
          extraBaggageFee: 0,
          totalPrice: baseTotal,
          currency: 'USD',
        },
        policySnapshot: {
          cabinBagAllowanceKg: airline.baggagePolicy.cabinBagAllowanceKg,
          checkedBagAllowanceKg: airline.baggagePolicy.checkedBagAllowanceKg,
          excessBagFeePerKg: airline.baggagePolicy.excessBagFeePerKg,
          freeCancellationHours:
            airline.cancellationPolicy.freeCancellationHours,
          refundPercentage: airline.cancellationPolicy.refundPercentage,
        },
        status: FlightBookingStatus.HELD,
        holdExpiresAt,
      });

      return await booking.save();
    } catch (error) {
      await this.releaseSeatsAtomically(
        dto.flightId,
        dto.cabinClass,
        dto.passengerCount,
        'heldSeats',
      );
      if (returnFlight && dto.returnFlightId && returnCabinClass) {
        await this.releaseSeatsAtomically(
          dto.returnFlightId,
          returnCabinClass,
          dto.passengerCount,
          'heldSeats',
        );
      }
      throw error;
    }
  }

  /**
   * Attaches passenger & baggage details to an active hold and prepares for payment (FLT-19, FLT-21).
   */
  async createBooking(
    dto: CreateFlightBookingDto,
    currentUser: AuthenticatedUser,
  ): Promise<FlightBookingDocument> {
    if (currentUser.role === UserRole.GUEST) {
      throw new ForbiddenException(
        'A registered account is required to book flights',
      );
    }

    await this.releaseExpiredHolds();

    const hold = await this.flightBookingModel.findById(dto.holdId).exec();
    if (!hold) {
      throw new NotFoundException(`Seat hold '${dto.holdId}' not found`);
    }

    this.assertBookingOwnership(hold, currentUser);

    if (hold.status === FlightBookingStatus.EXPIRED) {
      throw new BadRequestException(
        'Seat hold has expired; please create a new seat hold',
      );
    }

    if (hold.status !== FlightBookingStatus.HELD) {
      throw new BadRequestException(
        `Cannot submit booking details for a booking in '${hold.status}' status`,
      );
    }

    if (hold.holdExpiresAt && hold.holdExpiresAt.getTime() <= Date.now()) {
      await this.releaseExpiredHolds();
      throw new BadRequestException(
        'Seat hold has expired; please create a new seat hold',
      );
    }

    if (dto.passengers.length !== hold.passengerCount) {
      throw new BadRequestException(
        `Expected ${hold.passengerCount} passenger(s) to match the held seats, but received ${dto.passengers.length}`,
      );
    }

    const normalizedPassports = dto.passengers.map((p) =>
      p.passportNumber.trim().toUpperCase(),
    );
    if (new Set(normalizedPassports).size !== normalizedPassports.length) {
      throw new BadRequestException(
        'Duplicate passport numbers are not allowed in the same booking',
      );
    }

    const todayIso = new Date().toISOString().slice(0, 10);
    for (const passenger of dto.passengers) {
      if (passenger.dateOfBirth > todayIso) {
        throw new BadRequestException(
          `Passenger dateOfBirth '${passenger.dateOfBirth}' cannot be in the future`,
        );
      }
    }

    const extraBaggageKg = dto.extraBaggageKg ?? 0;
    const extraBaggageFee =
      Math.round(
        extraBaggageKg * hold.policySnapshot.excessBagFeePerKg * 100,
      ) / 100;
    const totalPrice =
      Math.round((hold.priceBreakdown.baseTotal + extraBaggageFee) * 100) / 100;

    const now = new Date();
    const updated = await this.flightBookingModel
      .findOneAndUpdate(
        {
          _id: hold._id,
          status: FlightBookingStatus.HELD,
          $or: [
            { holdExpiresAt: { $exists: false } },
            { holdExpiresAt: null },
            { holdExpiresAt: { $gt: now } },
          ],
        },
        {
          $set: {
            passengers: dto.passengers.map((p) => ({
              firstName: p.firstName.trim(),
              lastName: p.lastName.trim(),
              passportNumber: p.passportNumber.trim().toUpperCase(),
              dateOfBirth: p.dateOfBirth,
              ...(p.nationality ? { nationality: p.nationality.trim() } : {}),
            })),
            extraBaggageKg,
            priceBreakdown: {
              baseFarePerPassenger: hold.priceBreakdown.baseFarePerPassenger,
              passengerCount: hold.priceBreakdown.passengerCount,
              baseTotal: hold.priceBreakdown.baseTotal,
              extraBaggageKg,
              extraBaggageFee,
              totalPrice,
              currency: hold.priceBreakdown.currency ?? 'USD',
            },
            ...(dto.acceptPolicies
              ? {
                  policySnapshot: {
                    cabinBagAllowanceKg: hold.policySnapshot.cabinBagAllowanceKg,
                    checkedBagAllowanceKg:
                      hold.policySnapshot.checkedBagAllowanceKg,
                    excessBagFeePerKg: hold.policySnapshot.excessBagFeePerKg,
                    freeCancellationHours:
                      hold.policySnapshot.freeCancellationHours,
                    refundPercentage: hold.policySnapshot.refundPercentage,
                    acceptedAt: now,
                  },
                }
              : {}),
            bookingReference: hold.bookingReference ?? this.generateCode('FB'),
            status: FlightBookingStatus.PENDING_PAYMENT,
          },
        },
        { new: true },
      )
      .exec();

    if (!updated) {
      const latest = await this.flightBookingModel.findById(dto.holdId).exec();
      if (
        !latest ||
        latest.status === FlightBookingStatus.EXPIRED ||
        (latest.holdExpiresAt && latest.holdExpiresAt.getTime() <= Date.now())
      ) {
        throw new BadRequestException(
          'Seat hold has expired; please create a new seat hold',
        );
      }
      throw new ConflictException(
        `Seat hold is no longer in '${FlightBookingStatus.HELD}' status`,
      );
    }

    return updated;
  }

  /**
   * Transitions a held/pending booking to CONFIRMED after backend payment verification (PAY-01).
   */
  async confirmBookingAfterPayment(
    bookingId: string,
  ): Promise<FlightBookingDocument> {
    if (!isValidObjectId(bookingId)) {
      throw new BadRequestException(`Invalid booking ID format: '${bookingId}'`);
    }

    await this.releaseExpiredHolds();

    const booking = await this.flightBookingModel.findById(bookingId).exec();
    if (!booking) {
      throw new NotFoundException(`Flight booking '${bookingId}' not found`);
    }

    if (booking.status === FlightBookingStatus.CONFIRMED) {
      return booking;
    }

    if (
      booking.status !== FlightBookingStatus.HELD &&
      booking.status !== FlightBookingStatus.PENDING_PAYMENT
    ) {
      throw new BadRequestException(
        `Cannot confirm booking in '${booking.status}' status`,
      );
    }

    if (booking.holdExpiresAt && booking.holdExpiresAt.getTime() <= Date.now()) {
      await this.releaseExpiredHolds();
      throw new BadRequestException(
        'Seat hold has expired; please create a new seat hold',
      );
    }

    if (booking.passengers.length !== booking.passengerCount) {
      throw new BadRequestException(
        'Passenger details must be submitted before confirming the booking',
      );
    }

    const now = new Date();
    const priorStatus = booking.status;
    const priorHoldExpiresAt = booking.holdExpiresAt;

    // Atomically claim transition to CONFIRMED before moving seats so concurrent calls cannot double-commit
    const claimed = await this.flightBookingModel
      .findOneAndUpdate(
        {
          _id: booking._id,
          status: {
            $in: [FlightBookingStatus.HELD, FlightBookingStatus.PENDING_PAYMENT],
          },
          $or: [
            { holdExpiresAt: { $exists: false } },
            { holdExpiresAt: null },
            { holdExpiresAt: { $gt: now } },
          ],
        },
        {
          $set: {
            status: FlightBookingStatus.CONFIRMED,
            bookingReference:
              booking.bookingReference ?? this.generateCode('FB'),
            eTicketCode: booking.eTicketCode ?? this.generateCode('ETK'),
          },
          $unset: { holdExpiresAt: 1 },
        },
        { new: true },
      )
      .exec();

    if (!claimed) {
      const latest = await this.flightBookingModel.findById(bookingId).exec();
      if (latest?.status === FlightBookingStatus.CONFIRMED) {
        return latest;
      }
      if (latest?.status === FlightBookingStatus.EXPIRED) {
        throw new BadRequestException(
          'Seat hold has expired; please create a new seat hold',
        );
      }
      throw new ConflictException(
        'Booking state changed concurrently; please refresh and try again',
      );
    }

    try {
      await this.commitHeldSeatsAtomically(
        claimed.flightId.toString(),
        claimed.cabinClass,
        claimed.passengerCount,
      );

      if (claimed.returnFlightId && claimed.returnCabinClass) {
        try {
          await this.commitHeldSeatsAtomically(
            claimed.returnFlightId.toString(),
            claimed.returnCabinClass,
            claimed.passengerCount,
          );
        } catch (error) {
          await this.revertCommittedSeatsAtomically(
            claimed.flightId.toString(),
            claimed.cabinClass,
            claimed.passengerCount,
          );
          throw error;
        }
      }
    } catch (error) {
      await this.flightBookingModel
        .findOneAndUpdate(
          {
            _id: claimed._id,
            status: FlightBookingStatus.CONFIRMED,
          },
          {
            $set: {
              status: priorStatus,
              ...(priorHoldExpiresAt ? { holdExpiresAt: priorHoldExpiresAt } : {}),
            },
          },
        )
        .exec();
      throw error;
    }

    return claimed;
  }

  /**
   * Lists the authenticated user's own flight bookings (FLT-25).
   */
  async findMyBookings(
    currentUser: AuthenticatedUser,
    status?: string,
  ): Promise<FlightBookingDocument[]> {
    await this.releaseExpiredHolds();

    const filter: Record<string, unknown> = {
      userId: new Types.ObjectId(currentUser.id),
    };
    if (status && status.trim()) {
      filter.status = status.trim().toUpperCase();
    }

    return this.flightBookingModel
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .populate(
        'flightId',
        'flightNumber departureAirportIata arrivalAirportIata departureTimeLocal arrivalTimeLocal departureTimeUtc arrivalTimeUtc status',
      )
      .populate(
        'returnFlightId',
        'flightNumber departureAirportIata arrivalAirportIata departureTimeLocal arrivalTimeLocal departureTimeUtc arrivalTimeUtc status',
      )
      .exec();
  }

  /**
   * Fetches one flight booking by ID with strict ownership / admin check (FLT-25).
   */
  async findOneById(
    id: string,
    currentUser: AuthenticatedUser,
  ): Promise<FlightBookingDocument> {
    if (!isValidObjectId(id)) {
      throw new BadRequestException(`Invalid booking ID format: '${id}'`);
    }

    await this.releaseExpiredHolds();

    const booking = await this.flightBookingModel
      .findById(id)
      .populate({
        path: 'flightId',
        select:
          'airlineId flightNumber departureAirportIata arrivalAirportIata departureTimeLocal arrivalTimeLocal departureTimeUtc arrivalTimeUtc status',
        populate: { path: 'airlineId', select: 'name iataCode logoUrl' },
      })
      .populate({
        path: 'returnFlightId',
        select:
          'airlineId flightNumber departureAirportIata arrivalAirportIata departureTimeLocal arrivalTimeLocal departureTimeUtc arrivalTimeUtc status',
        populate: { path: 'airlineId', select: 'name iataCode logoUrl' },
      })
      .exec();

    if (!booking) {
      throw new NotFoundException(`Flight booking '${id}' not found`);
    }

    this.assertBookingOwnership(booking, currentUser);
    return booking;
  }

  /**
   * Generates a structured e-ticket payload for a confirmed booking (FLT-23).
   */
  async getETicket(id: string, currentUser: AuthenticatedUser) {
    const booking = await this.findOneById(id, currentUser);

    if (booking.status !== FlightBookingStatus.CONFIRMED) {
      throw new BadRequestException(
        `E-ticket is only available for CONFIRMED bookings (current status: '${booking.status}')`,
      );
    }

    return {
      eTicketCode: booking.eTicketCode,
      bookingReference: booking.bookingReference,
      status: booking.status,
      issuedAt: booking.updatedAt,
      cabinClass: booking.cabinClass,
      returnCabinClass: booking.returnCabinClass ?? null,
      passengerCount: booking.passengerCount,
      passengers: booking.passengers,
      outboundFlight: booking.flightId,
      returnFlight: booking.returnFlightId ?? null,
      baggageAllowance: {
        cabinBagAllowanceKg: booking.policySnapshot.cabinBagAllowanceKg,
        checkedBagAllowanceKg: booking.policySnapshot.checkedBagAllowanceKg,
        extraBaggageKg: booking.extraBaggageKg,
      },
      priceBreakdown: booking.priceBreakdown,
    };
  }

  /**
   * Cancels a booking, releases seats atomically, and calculates refund from policy snapshot (FLT-26).
   */
  async cancelBooking(
    id: string,
    dto: CancelFlightBookingDto,
    currentUser: AuthenticatedUser,
  ) {
    if (!isValidObjectId(id)) {
      throw new BadRequestException(`Invalid booking ID format: '${id}'`);
    }

    await this.releaseExpiredHolds();

    const booking = await this.flightBookingModel.findById(id).exec();
    if (!booking) {
      throw new NotFoundException(`Flight booking '${id}' not found`);
    }

    this.assertBookingOwnership(booking, currentUser);

    if (booking.status === FlightBookingStatus.CANCELLED) {
      throw new BadRequestException('Flight booking is already cancelled');
    }

    if (booking.status === FlightBookingStatus.EXPIRED) {
      throw new BadRequestException(
        'Cannot cancel an expired seat hold',
      );
    }

    let refundAmount = 0;
    const seatField: 'heldSeats' | 'bookedSeats' =
      booking.status === FlightBookingStatus.CONFIRMED
        ? 'bookedSeats'
        : 'heldSeats';

    if (booking.status === FlightBookingStatus.CONFIRMED) {
      const flight = await this.flightModel
        .findById(booking.flightId)
        .select('departureTimeUtc flightNumber status')
        .lean()
        .exec();

      if (!flight) {
        throw new NotFoundException('Associated outbound flight not found');
      }

      let returnFlight: { status?: FlightStatus } | null = null;
      if (booking.returnFlightId) {
        returnFlight = await this.flightModel
          .findById(booking.returnFlightId)
          .select('status')
          .lean()
          .exec();
      }

      const cancelledByAirline =
        flight.status === FlightStatus.CANCELLED ||
        returnFlight?.status === FlightStatus.CANCELLED;

      const nowMs = Date.now();
      const departureMs = new Date(flight.departureTimeUtc).getTime();
      if (!cancelledByAirline && departureMs <= nowMs) {
        throw new BadRequestException(
          'Cannot cancel a flight booking after departure',
        );
      }

      if (cancelledByAirline) {
        refundAmount = booking.priceBreakdown.totalPrice;
      } else {
        const hoursRemaining = (departureMs - nowMs) / (1000 * 60 * 60);
        if (hoursRemaining >= booking.policySnapshot.freeCancellationHours) {
          refundAmount =
            Math.round(
              booking.priceBreakdown.totalPrice *
                (booking.policySnapshot.refundPercentage / 100) *
                100,
            ) / 100;
        }
      }
    }

    // Atomically transition status before decrementing flight seats to prevent double release
    const cancelled = await this.flightBookingModel
      .findOneAndUpdate(
        {
          _id: booking._id,
          status: booking.status,
        },
        {
          $set: {
            status: FlightBookingStatus.CANCELLED,
            cancelledAt: new Date(),
            refundAmount,
            ...(dto.reason ? { cancellationReason: dto.reason } : {}),
          },
        },
        { new: true },
      )
      .exec();

    if (!cancelled) {
      throw new ConflictException(
        'Booking state changed concurrently; please refresh and try again',
      );
    }

    await this.releaseSeatsAtomically(
      cancelled.flightId.toString(),
      cancelled.cabinClass,
      cancelled.passengerCount,
      seatField,
    );

    if (cancelled.returnFlightId && cancelled.returnCabinClass) {
      await this.releaseSeatsAtomically(
        cancelled.returnFlightId.toString(),
        cancelled.returnCabinClass,
        cancelled.passengerCount,
        seatField,
      );
    }

    return {
      booking: cancelled,
      refundAmount,
      policyApplied: {
        freeCancellationHours: booking.policySnapshot.freeCancellationHours,
        refundPercentage: booking.policySnapshot.refundPercentage,
      },
    };
  }

  /**
   * Lists all bookings for a specific flight for its assigned airline moderator or admin (FLT-29).
   */
  async getFlightBookings(
    flightId: string,
    currentUser: AuthenticatedUser,
  ): Promise<FlightBookingDocument[]> {
    const flight = await this.authorizeFlightModerator(flightId, currentUser);

    await this.releaseExpiredHolds();

    return this.flightBookingModel
      .find({
        $or: [{ flightId: flight._id }, { returnFlightId: flight._id }],
        status: { $ne: FlightBookingStatus.EXPIRED },
      })
      .sort({ createdAt: -1 })
      .populate('userId', 'name email')
      .exec();
  }

  /**
   * Exports confirmed passenger manifest for a flight in JSON or CSV format (FLT-29).
   */
  async exportFlightPassengers(
    flightId: string,
    format: 'json' | 'csv',
    currentUser: AuthenticatedUser,
  ) {
    const flight = await this.authorizeFlightModerator(flightId, currentUser);

    const bookings = await this.flightBookingModel
      .find({
        $or: [{ flightId: flight._id }, { returnFlightId: flight._id }],
        status: FlightBookingStatus.CONFIRMED,
      })
      .sort({ createdAt: 1 })
      .lean()
      .exec();

    const rows = bookings.flatMap((booking) => {
      const isReturnLeg =
        booking.returnFlightId?.toString() === flight._id.toString();
      const cabinClass = isReturnLeg
        ? (booking.returnCabinClass ?? booking.cabinClass)
        : booking.cabinClass;

      return booking.passengers.map((passenger) => ({
        bookingReference: booking.bookingReference ?? '',
        eTicketCode: booking.eTicketCode ?? '',
        cabinClass,
        firstName: passenger.firstName,
        lastName: passenger.lastName,
        passportNumber: passenger.passportNumber,
        dateOfBirth: passenger.dateOfBirth,
        nationality: passenger.nationality ?? '',
        extraBaggageKg: booking.extraBaggageKg ?? 0,
      }));
    });

    if (format === 'csv') {
      const headers = [
        'bookingReference',
        'eTicketCode',
        'cabinClass',
        'firstName',
        'lastName',
        'passportNumber',
        'dateOfBirth',
        'nationality',
        'extraBaggageKg',
      ];
      const csvLines = [
        headers.join(','),
        ...rows.map((row) =>
          headers
            .map((h) => this.escapeCsvCell(row[h as keyof typeof row]))
            .join(','),
        ),
      ];
      return {
        filename: `${flight.flightNumber}-${flight.departureDateLocal}-passengers.csv`,
        contentType: 'text/csv',
        data: csvLines.join('\n'),
      };
    }

    return {
      flightId: flight._id.toString(),
      flightNumber: flight.flightNumber,
      departureAirportIata: flight.departureAirportIata,
      arrivalAirportIata: flight.arrivalAirportIata,
      departureDateLocal: flight.departureDateLocal,
      totalPassengers: rows.length,
      passengers: rows,
    };
  }

  /**
   * Finds expired HELD/PENDING_PAYMENT bookings, marks each EXPIRED atomically,
   * and returns held seats back to flight inventory.
   */
  async releaseExpiredHolds(): Promise<number> {
    const now = new Date();
    const expiredCandidates = await this.flightBookingModel
      .find({
        status: {
          $in: [
            FlightBookingStatus.HELD,
            FlightBookingStatus.PENDING_PAYMENT,
          ],
        },
        holdExpiresAt: { $lte: now },
      })
      .select('_id')
      .lean()
      .exec();

    let releasedCount = 0;

    for (const candidate of expiredCandidates) {
      const expired = await this.flightBookingModel
        .findOneAndUpdate(
          {
            _id: candidate._id,
            status: {
              $in: [
                FlightBookingStatus.HELD,
                FlightBookingStatus.PENDING_PAYMENT,
              ],
            },
            holdExpiresAt: { $lte: now },
          },
          { $set: { status: FlightBookingStatus.EXPIRED } },
          { new: true },
        )
        .exec();

      if (!expired) {
        continue;
      }

      await this.releaseSeatsAtomically(
        expired.flightId.toString(),
        expired.cabinClass,
        expired.passengerCount,
        'heldSeats',
      );

      if (expired.returnFlightId && expired.returnCabinClass) {
        await this.releaseSeatsAtomically(
          expired.returnFlightId.toString(),
          expired.returnCabinClass,
          expired.passengerCount,
          'heldSeats',
        );
      }

      releasedCount += 1;
    }

    return releasedCount;
  }

  /**
   * Lists paginated flight bookings for Admin oversight (ACC-17).
   */
  async listAllBookings(query: { page: number; limit: number; status?: string }) {
    const filter: Record<string, unknown> = {};
    if (query.status) {
      filter.status = query.status.toUpperCase();
    }

    const [items, total] = await Promise.all([
      this.flightBookingModel
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .populate('userId', 'name email')
        .populate(
          'flightId',
          'flightNumber departureAirportIata arrivalAirportIata departureTimeUtc',
        )
        .populate(
          'returnFlightId',
          'flightNumber departureAirportIata arrivalAirportIata departureTimeUtc',
        )
        .lean()
        .exec(),
      this.flightBookingModel.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }

  /**
   * Checks whether a user has any confirmed upcoming flight (used by ACC-12 account deactivation).
   */
  async hasUpcomingConfirmedBooking(userId: string): Promise<boolean> {
    if (!isValidObjectId(userId)) {
      return false;
    }

    const bookings = await this.flightBookingModel
      .find({
        userId: new Types.ObjectId(userId),
        status: FlightBookingStatus.CONFIRMED,
      })
      .populate<{
        flightId?: { departureTimeUtc?: Date };
        returnFlightId?: { departureTimeUtc?: Date };
      }>([
        { path: 'flightId', select: 'departureTimeUtc' },
        { path: 'returnFlightId', select: 'departureTimeUtc' },
      ])
      .lean()
      .exec();

    const nowMs = Date.now();
    return bookings.some((booking) => {
      const outboundMs = booking.flightId?.departureTimeUtc
        ? new Date(booking.flightId.departureTimeUtc).getTime()
        : 0;
      const returnMs = booking.returnFlightId?.departureTimeUtc
        ? new Date(booking.returnFlightId.departureTimeUtc).getTime()
        : 0;

      return outboundMs > nowMs || returnMs > nowMs;
    });
  }

  private assertBookingOwnership(
    booking: FlightBookingDocument,
    currentUser: AuthenticatedUser,
  ): void {
    if (currentUser.role === UserRole.ADMINISTRATOR) {
      return;
    }

    const rawUserId = booking.userId as
      | Types.ObjectId
      | { _id?: Types.ObjectId };
    const ownerId =
      typeof rawUserId === 'object' && '_id' in rawUserId && rawUserId._id
        ? rawUserId._id.toString()
        : String(booking.userId);

    if (ownerId !== currentUser.id) {
      throw new ForbiddenException(
        'You do not have permission to access this flight booking',
      );
    }
  }

  private async authorizeFlightModerator(
    flightId: string,
    currentUser: AuthenticatedUser,
  ): Promise<FlightDocument> {
    if (!isValidObjectId(flightId)) {
      throw new BadRequestException(`Invalid flight ID format: '${flightId}'`);
    }

    const flight = await this.flightModel.findById(flightId).exec();
    if (!flight) {
      throw new NotFoundException(`Flight with ID '${flightId}' not found`);
    }

    if (currentUser.role === UserRole.ADMINISTRATOR) {
      return flight;
    }

    if (currentUser.role === UserRole.AIRLINE_MODERATOR) {
      if (
        !currentUser.airlineId ||
        currentUser.airlineId !== flight.airlineId.toString()
      ) {
        throw new ForbiddenException(
          'You can only view bookings and manifests for your assigned airline',
        );
      }
      return flight;
    }

    throw new ForbiddenException(
      'Only the assigned airline moderator or an administrator is authorized',
    );
  }

  private async reserveSeatsAtomically(
    flightId: string,
    cabinClass: CabinClass,
    passengerCount: number,
  ): Promise<FlightDocument> {
    if (!isValidObjectId(flightId)) {
      throw new BadRequestException(`Invalid flight ID format: '${flightId}'`);
    }

    const updated = await this.flightModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(flightId),
          status: FlightStatus.SCHEDULED,
          departureTimeUtc: { $gt: new Date() },
          $expr: {
            $gt: [
              {
                $size: {
                  $filter: {
                    input: '$cabins',
                    as: 'c',
                    cond: {
                      $and: [
                        { $eq: ['$$c.cabinClass', cabinClass] },
                        {
                          $gte: [
                            {
                              $subtract: [
                                '$$c.seatCount',
                                {
                                  $add: [
                                    { $ifNull: ['$$c.bookedSeats', 0] },
                                    { $ifNull: ['$$c.heldSeats', 0] },
                                  ],
                                },
                              ],
                            },
                            passengerCount,
                          ],
                        },
                      ],
                    },
                  },
                },
              },
              0,
            ],
          },
        },
        {
          $inc: { 'cabins.$[target].heldSeats': passengerCount },
        },
        {
          arrayFilters: [{ 'target.cabinClass': cabinClass }],
          new: true,
        },
      )
      .exec();

    if (updated) {
      return updated;
    }

    const flight = await this.flightModel.findById(flightId).lean().exec();
    if (!flight) {
      throw new NotFoundException(`Flight with ID '${flightId}' not found`);
    }
    if (flight.status !== FlightStatus.SCHEDULED) {
      throw new BadRequestException(
        `Flight '${flight.flightNumber}' is '${flight.status}' and cannot be booked`,
      );
    }
    if (new Date(flight.departureTimeUtc).getTime() <= Date.now()) {
      throw new BadRequestException(
        `Flight '${flight.flightNumber}' has already departed`,
      );
    }

    const cabin = flight.cabins.find((c) => c.cabinClass === cabinClass);
    if (!cabin) {
      throw new BadRequestException(
        `Cabin class '${cabinClass}' is not offered on flight '${flight.flightNumber}'`,
      );
    }

    const available =
      cabin.seatCount - (cabin.bookedSeats || 0) - (cabin.heldSeats || 0);
    throw new ConflictException(
      `Not enough seats in '${cabinClass}' on flight '${flight.flightNumber}': requested ${passengerCount}, available ${Math.max(0, available)}`,
    );
  }

  private async releaseSeatsAtomically(
    flightId: string,
    cabinClass: CabinClass,
    count: number,
    field: 'heldSeats' | 'bookedSeats',
  ): Promise<void> {
    if (!isValidObjectId(flightId) || count <= 0) {
      return;
    }

    await this.flightModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(flightId),
          cabins: {
            $elemMatch: {
              cabinClass,
              [field]: { $gte: count },
            },
          },
        },
        {
          $inc: { [`cabins.$[target].${field}`]: -count },
        },
        {
          arrayFilters: [{ 'target.cabinClass': cabinClass }],
        },
      )
      .exec();
  }

  private async commitHeldSeatsAtomically(
    flightId: string,
    cabinClass: CabinClass,
    count: number,
  ): Promise<void> {
    const updated = await this.flightModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(flightId),
          cabins: {
            $elemMatch: {
              cabinClass,
              heldSeats: { $gte: count },
            },
          },
        },
        {
          $inc: {
            'cabins.$[target].heldSeats': -count,
            'cabins.$[target].bookedSeats': count,
          },
        },
        {
          arrayFilters: [{ 'target.cabinClass': cabinClass }],
          new: true,
        },
      )
      .exec();

    if (!updated) {
      throw new ConflictException(
        'Held seats are no longer available to confirm this booking',
      );
    }
  }

  private async revertCommittedSeatsAtomically(
    flightId: string,
    cabinClass: CabinClass,
    count: number,
  ): Promise<void> {
    await this.flightModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(flightId),
          cabins: {
            $elemMatch: {
              cabinClass,
              bookedSeats: { $gte: count },
            },
          },
        },
        {
          $inc: {
            'cabins.$[target].bookedSeats': -count,
            'cabins.$[target].heldSeats': count,
          },
        },
        {
          arrayFilters: [{ 'target.cabinClass': cabinClass }],
        },
      )
      .exec();
  }

  private generateCode(prefix: string): string {
    return `${prefix}-${randomBytes(4).toString('hex').toUpperCase()}`;
  }

  private escapeCsvCell(value: unknown): string {
    const raw = String(value ?? '');
    const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
    if (/[",\n\r]/.test(safe)) {
      return `"${safe.replaceAll('"', '""')}"`;
    }
    return safe;
  }
}
