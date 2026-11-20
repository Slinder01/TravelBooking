import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, isValidObjectId } from 'mongoose';
import {
  CabinClass,
  Flight,
  FlightDocument,
  FlightStatus,
} from './schemas/flight.schema';
import { CreateFlightDto } from './dtos/create-flight.dto';
import { UpdateFlightDto } from './dtos/update-flight.dto';
import { CabinInventoryDto } from './dtos/cabin-inventory.dto';
import { UpdateCabinDto } from './dtos/update-cabin.dto';
import { SearchFlightsDto, FlightSortBy } from './dtos/search-flights.dto';
import { AirlinesService } from '../airlines/airlines.service';
import { AirportsService } from '../airports/airports.service';
import { UserRole } from '../users/users-role.enum';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import {
  extractLocalDate,
  isValidCalendarDate,
  localToUtc,
} from './utils/timezone.util';

@Injectable()
export class FlightsService {
  constructor(
    @InjectModel(Flight.name)
    private readonly flightModel: Model<FlightDocument>,
    private readonly airlinesService: AirlinesService,
    private readonly airportsService: AirportsService,
  ) {}

  async create(
    dto: CreateFlightDto,
    currentUser: AuthenticatedUser,
  ): Promise<FlightDocument> {
    // 1. Resolve & authorize the target airline (FLT-01, FLT-03)
    const airlineIdStr = this.resolveAirlineId(dto.airlineId, currentUser);
    const airline = await this.airlinesService.findById(airlineIdStr);

    if (!airline.isActive) {
      throw new BadRequestException(
        `Airline '${airline.name}' is currently inactive`,
      );
    }

    // 2. Resolve departure and arrival airports (FLT-02, FLT-03)
    const depIata = dto.departureAirportIata.toUpperCase().trim();
    const arrIata = dto.arrivalAirportIata.toUpperCase().trim();

    if (depIata === arrIata) {
      throw new BadRequestException(
        'Departure and arrival airports must be different',
      );
    }

    const departureAirport = await this.airportsService.findByIataCode(depIata);
    const arrivalAirport = await this.airportsService.findByIataCode(arrIata);

    // 3. Time zone conversion & UTC validation (FLT-03, GEN-06)
    const departureTimeUtc = localToUtc(
      dto.departureTimeLocal,
      departureAirport.timeZone,
    );
    const arrivalTimeUtc = localToUtc(
      dto.arrivalTimeLocal,
      arrivalAirport.timeZone,
    );

    // Rule: Arrival must be after departure compared in UTC
    if (arrivalTimeUtc.getTime() <= departureTimeUtc.getTime()) {
      throw new BadRequestException(
        'Arrival time must be strictly after departure time in UTC',
      );
    }

    // Rule: Departure cannot be in the past
    if (departureTimeUtc.getTime() <= Date.now()) {
      throw new BadRequestException(
        'Flight departure time must be in the future',
      );
    }

    // 4. Extract local departure date for FLT-03 duplicate rule and FLT-11 search
    const departureDateLocal = extractLocalDate(dto.departureTimeLocal);
    const flightNumberNormalized = dto.flightNumber.toUpperCase().trim();

    // Rule: Reject duplicate flight number for the same airline on the same departure date
    const existingFlight = await this.flightModel.findOne({
      airlineId: new Types.ObjectId(airlineIdStr),
      flightNumber: flightNumberNormalized,
      departureDateLocal,
    });

    if (existingFlight) {
      throw new ConflictException(
        `Flight '${flightNumberNormalized}' already exists for airline '${airline.name}' on departure date ${departureDateLocal}`,
      );
    }

    // 5. Validate cabin categories (FLT-04: at most once per flight)
    this.validateCabinCategories(dto.cabins);

    // 6. Assemble and persist the flight document
    const cabinsInitialized = dto.cabins.map((c) => ({
      cabinClass: c.cabinClass,
      seatCount: c.seatCount,
      price: c.price,
      freeBaggageBags: c.freeBaggageBags,
      baggageMaxWeightKg: c.baggageMaxWeightKg,
      bookedSeats: 0,
      heldSeats: 0,
    }));

    const flight = new this.flightModel({
      airlineId: new Types.ObjectId(airlineIdStr),
      flightNumber: flightNumberNormalized,
      departureAirportId: departureAirport._id,
      departureAirportIata: depIata,
      arrivalAirportId: arrivalAirport._id,
      arrivalAirportIata: arrIata,
      departureTimeUtc,
      arrivalTimeUtc,
      departureTimeLocal: dto.departureTimeLocal,
      arrivalTimeLocal: dto.arrivalTimeLocal,
      departureDateLocal,
      cabins: cabinsInitialized,
      status: FlightStatus.SCHEDULED,
    });

    return this.saveWithDuplicateGuard(flight, airline.name, departureDateLocal);
  }

  async search(query: SearchFlightsDto): Promise<any> {
    const origin = query.origin.trim().toUpperCase();
    const destination = query.destination.trim().toUpperCase();

    if (origin === destination) {
      throw new BadRequestException(
        'Origin and destination airports cannot be identical',
      );
    }

    if (!isValidCalendarDate(query.departureDate)) {
      throw new BadRequestException(
        `Invalid calendar date: '${query.departureDate}'. Impossible dates (such as February 30) are not permitted.`,
      );
    }

    if (query.returnDate) {
      if (!isValidCalendarDate(query.returnDate)) {
        throw new BadRequestException(
          `Invalid calendar date: '${query.returnDate}'. Impossible dates (such as February 30) are not permitted.`,
        );
      }
      if (query.returnDate < query.departureDate) {
        throw new BadRequestException(
          'returnDate must be on or after departureDate',
        );
      }
    }

    if (
      query.minPrice !== undefined &&
      query.maxPrice !== undefined &&
      query.minPrice > query.maxPrice
    ) {
      throw new BadRequestException('minPrice cannot exceed maxPrice');
    }

    const passengers =
      query.passengers && query.passengers > 0 ? query.passengers : 1;

    const outbound = await this.searchLeg({
      origin,
      destination,
      departureDate: query.departureDate,
      passengers,
      cabinClass: query.cabinClass,
      sortBy: query.sortBy,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      airline: query.airline,
    });

    if (!query.returnDate) {
      return outbound;
    }

    if (outbound.length === 0) {
      return {
        tripType: 'round-trip',
        outbound: [],
        return: [],
      };
    }

    const minDepartureMs = Math.min(
      ...outbound.map((f) => f.arrivalTimeUtc.getTime()),
    );

    const returnFlights = await this.searchLeg({
      origin: destination,
      destination: origin,
      departureDate: query.returnDate,
      passengers,
      cabinClass: query.cabinClass,
      sortBy: query.sortBy,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      airline: query.airline,
      minDepartureMs,
    });

    return {
      tripType: 'round-trip',
      outbound,
      return: returnFlights,
    };
  }

  async findById(id: string): Promise<FlightDocument> {
    if (!isValidObjectId(id)) {
      throw new BadRequestException(`Invalid flight ID format: '${id}'`);
    }

    const flight = await this.flightModel
      .findById(id)
      .populate(
        'airlineId',
        'name iataCode logoUrl baggagePolicy cancellationPolicy',
      )
      .populate('departureAirportId', 'name city country timeZone')
      .populate('arrivalAirportId', 'name city country timeZone')
      .exec();

    if (!flight) {
      throw new NotFoundException(`Flight with ID '${id}' not found`);
    }

    return flight;
  }

  /**
   * Updates flight schedule times (FLT-05) with UTC recalculation and ownership checks.
   */
  async updateFlight(
    id: string,
    dto: UpdateFlightDto,
    currentUser: AuthenticatedUser,
  ): Promise<FlightDocument> {
    const flight = await this.findAndAuthorizeFlight(id, currentUser);

    if (flight.status !== FlightStatus.SCHEDULED) {
      throw new BadRequestException(
        `Cannot modify a flight with status '${flight.status}'`,
      );
    }

    if (
      flight.departureTimeUtc &&
      new Date(flight.departureTimeUtc).getTime() <= Date.now()
    ) {
      throw new BadRequestException(
        'Cannot reschedule a flight that has already departed',
      );
    }

    if (!dto.departureTimeLocal && !dto.arrivalTimeLocal) {
      throw new BadRequestException(
        'At least one schedule field (departureTimeLocal or arrivalTimeLocal) must be provided',
      );
    }

    const newDepLocal = dto.departureTimeLocal ?? flight.departureTimeLocal;
    const newArrLocal = dto.arrivalTimeLocal ?? flight.arrivalTimeLocal;

    const departureAirport = await this.airportsService.findByIataCode(
      flight.departureAirportIata,
    );
    const arrivalAirport = await this.airportsService.findByIataCode(
      flight.arrivalAirportIata,
    );

    const newDepartureUtc = localToUtc(newDepLocal, departureAirport.timeZone);
    const newArrivalUtc = localToUtc(newArrLocal, arrivalAirport.timeZone);

    if (newArrivalUtc.getTime() <= newDepartureUtc.getTime()) {
      throw new BadRequestException(
        'Arrival time must be strictly after departure time in UTC',
      );
    }

    if (newDepartureUtc.getTime() <= Date.now()) {
      throw new BadRequestException(
        'Flight departure time must be in the future',
      );
    }

    const newDepDateLocal = extractLocalDate(newDepLocal);
    if (newDepDateLocal !== flight.departureDateLocal) {
      const duplicate = await this.flightModel.findOne({
        airlineId: flight.airlineId,
        flightNumber: flight.flightNumber,
        departureDateLocal: newDepDateLocal,
        _id: { $ne: flight._id },
      });

      if (duplicate) {
        throw new ConflictException(
          `Flight '${flight.flightNumber}' already exists on departure date ${newDepDateLocal}`,
        );
      }
    }

    flight.departureTimeLocal = newDepLocal;
    flight.arrivalTimeLocal = newArrLocal;
    flight.departureTimeUtc = newDepartureUtc;
    flight.arrivalTimeUtc = newArrivalUtc;
    flight.departureDateLocal = newDepDateLocal;

    return this.saveWithDuplicateGuard(
      flight,
      flight.airlineId.toString(),
      newDepDateLocal,
    );
  }

  /**
   * Cancels a scheduled flight (FLT-06).
   */
  async cancelFlight(
    id: string,
    currentUser: AuthenticatedUser,
  ): Promise<FlightDocument> {
    const flight = await this.findAndAuthorizeFlight(id, currentUser);

    if (flight.status === FlightStatus.CANCELLED) {
      throw new BadRequestException('Flight is already cancelled');
    }
    if (
      flight.status === FlightStatus.DEPARTED ||
      (flight.departureTimeUtc &&
        new Date(flight.departureTimeUtc).getTime() <= Date.now())
    ) {
      throw new BadRequestException('Cannot cancel a departed flight');
    }

    const updated = await this.flightModel
      .findOneAndUpdate(
        {
          _id: flight._id,
          status: FlightStatus.SCHEDULED,
          departureTimeUtc: { $gt: new Date() },
        },
        { $set: { status: FlightStatus.CANCELLED } },
        { returnDocument: 'after' },
      )
      .exec();

    if (!updated) {
      throw new BadRequestException(
        'Flight status changed concurrently or has already departed',
      );
    }

    return updated;
  }

  /**
   * Adds a new cabin tier to an existing scheduled flight (FLT-04).
   */
  async addCabin(
    flightId: string,
    dto: CabinInventoryDto,
    currentUser: AuthenticatedUser,
  ): Promise<FlightDocument> {
    const flight = await this.findAndAuthorizeFlight(flightId, currentUser);

    if (flight.status !== FlightStatus.SCHEDULED) {
      throw new BadRequestException(
        `Cannot modify cabins on a '${flight.status}' flight`,
      );
    }

    const exists = flight.cabins.some((c) => c.cabinClass === dto.cabinClass);
    if (exists) {
      throw new ConflictException(
        `Cabin category '${dto.cabinClass}' already exists on flight '${flight.flightNumber}'`,
      );
    }

    const updated = await this.flightModel
      .findOneAndUpdate(
        {
          _id: flight._id,
          status: FlightStatus.SCHEDULED,
          'cabins.cabinClass': { $ne: dto.cabinClass },
        },
        {
          $push: {
            cabins: {
              cabinClass: dto.cabinClass,
              seatCount: dto.seatCount,
              price: dto.price,
              freeBaggageBags: dto.freeBaggageBags,
              baggageMaxWeightKg: dto.baggageMaxWeightKg,
              bookedSeats: 0,
              heldSeats: 0,
            },
          },
        },
        { returnDocument: 'after' },
      )
      .exec();

    if (!updated) {
      throw new ConflictException(
        `Cabin category '${dto.cabinClass}' already exists or flight is no longer Scheduled`,
      );
    }

    return updated;
  }

  /**
   * Updates an existing cabin tier's capacity, price, or baggage allowance atomically (FLT-04, FLT-05).
   */
  async updateCabin(
    flightId: string,
    cabinId: string,
    dto: UpdateCabinDto,
    currentUser: AuthenticatedUser,
  ): Promise<FlightDocument> {
    const flight = await this.findAndAuthorizeFlight(flightId, currentUser);

    if (flight.status !== FlightStatus.SCHEDULED) {
      throw new BadRequestException(
        `Cannot modify cabins on a '${flight.status}' flight`,
      );
    }

    if (
      dto.seatCount === undefined &&
      dto.price === undefined &&
      dto.freeBaggageBags === undefined &&
      dto.baggageMaxWeightKg === undefined
    ) {
      throw new BadRequestException(
        'At least one cabin field must be provided for update',
      );
    }

    let decodedCabinId: string;
    try {
      decodedCabinId = decodeURIComponent(cabinId);
    } catch {
      throw new BadRequestException(`Invalid cabin identifier: '${cabinId}'`);
    }

    const normalizedKey = decodedCabinId.trim().toLowerCase();
    const cabin = flight.cabins.find(
      (c) => c.cabinClass.toLowerCase() === normalizedKey,
    );

    if (!cabin) {
      throw new NotFoundException(
        `Cabin '${decodedCabinId}' not found on flight '${flight.flightNumber}'`,
      );
    }

    const committedSeats = (cabin.bookedSeats || 0) + (cabin.heldSeats || 0);
    if (dto.seatCount !== undefined && dto.seatCount < committedSeats) {
      throw new BadRequestException(
        `Cannot reduce seatCount to ${dto.seatCount} below ${committedSeats} booked/held seats`,
      );
    }

    const setFields: Record<string, number> = {};
    if (dto.seatCount !== undefined) {
      setFields['cabins.$[target].seatCount'] = dto.seatCount;
    }
    if (dto.price !== undefined) {
      setFields['cabins.$[target].price'] = dto.price;
    }
    if (dto.freeBaggageBags !== undefined) {
      setFields['cabins.$[target].freeBaggageBags'] = dto.freeBaggageBags;
    }
    if (dto.baggageMaxWeightKg !== undefined) {
      setFields['cabins.$[target].baggageMaxWeightKg'] = dto.baggageMaxWeightKg;
    }

    const filter: Record<string, unknown> = {
      _id: flight._id,
      status: FlightStatus.SCHEDULED,
      'cabins.cabinClass': cabin.cabinClass,
    };

    if (dto.seatCount !== undefined) {
      const requestedSeatCount = dto.seatCount;
      filter.$expr = {
        $gt: [
          {
            $size: {
              $filter: {
                input: '$cabins',
                as: 'c',
                cond: {
                  $and: [
                    { $eq: ['$$c.cabinClass', cabin.cabinClass] },
                    {
                      $gte: [
                        requestedSeatCount,
                        {
                          $add: [
                            { $ifNull: ['$$c.bookedSeats', 0] },
                            { $ifNull: ['$$c.heldSeats', 0] },
                          ],
                        },
                      ],
                    },
                  ],
                },
              },
            },
          },
          0,
        ],
      };
    }

    const updated = await this.flightModel
      .findOneAndUpdate(
        filter,
        { $set: setFields },
        {
          arrayFilters: [{ 'target.cabinClass': cabin.cabinClass }],
          returnDocument: 'after',
        },
      )
      .exec();

    if (!updated) {
      throw new BadRequestException(
        'Cannot update cabin: flight status changed or seatCount fell below concurrent booked/held seats',
      );
    }

    return updated;
  }

  private async searchLeg(params: {
    origin: string;
    destination: string;
    departureDate: string;
    passengers: number;
    cabinClass?: CabinClass;
    sortBy?: FlightSortBy;
    minPrice?: number;
    maxPrice?: number;
    airline?: string;
    minDepartureMs?: number;
  }) {
    const filter: Record<string, any> = {
      departureAirportIata: params.origin,
      arrivalAirportIata: params.destination,
      departureDateLocal: params.departureDate,
      status: FlightStatus.SCHEDULED,
    };

    const airlineParam = params.airline?.trim();
    if (airlineParam && isValidObjectId(airlineParam)) {
      filter.airlineId = new Types.ObjectId(airlineParam);
    }

    const flights = await this.flightModel
      .find(filter)
      .populate(
        'airlineId',
        'name iataCode logoUrl baggagePolicy cancellationPolicy isActive',
      )
      .exec();

    const results = [];
    const now = Date.now();
    const minDepThreshold = Math.max(now, params.minDepartureMs ?? 0);

    for (const flight of flights) {
      if (flight.departureTimeUtc.getTime() <= minDepThreshold) {
        continue;
      }

      const airlineObj = flight.airlineId as unknown as {
        iataCode?: string;
        isActive?: boolean;
      };
      if (!airlineObj || airlineObj.isActive === false) {
        continue;
      }

      if (airlineParam && !isValidObjectId(airlineParam)) {
        if (airlineObj?.iataCode?.toUpperCase() !== airlineParam.toUpperCase()) {
          continue;
        }
      }

      const qualifyingCabins = flight.cabins
        .map((cabin) => {
          const availableSeats =
            cabin.seatCount - (cabin.bookedSeats || 0) - (cabin.heldSeats || 0);
          return {
            cabinClass: cabin.cabinClass,
            seatCount: cabin.seatCount,
            availableSeats,
            price: cabin.price,
            totalPrice: Math.round(cabin.price * params.passengers * 100) / 100,
            freeBaggageBags: cabin.freeBaggageBags,
            baggageMaxWeightKg: cabin.baggageMaxWeightKg,
          };
        })
        .filter((c) => {
          if (c.availableSeats < params.passengers) {
            return false;
          }
          if (params.cabinClass && c.cabinClass !== params.cabinClass) {
            return false;
          }
          if (params.minPrice !== undefined && c.price < params.minPrice) {
            return false;
          }
          if (params.maxPrice !== undefined && c.price > params.maxPrice) {
            return false;
          }
          return true;
        })
        .sort((a, b) => a.price - b.price);

      if (qualifyingCabins.length === 0) {
        continue;
      }

      const selectedCabin = qualifyingCabins[0];
      const durationMinutes = Math.round(
        (flight.arrivalTimeUtc.getTime() - flight.departureTimeUtc.getTime()) /
          (1000 * 60),
      );

      results.push({
        id: flight._id.toString(),
        flightNumber: flight.flightNumber,
        airline: flight.airlineId,
        departureAirportIata: flight.departureAirportIata,
        arrivalAirportIata: flight.arrivalAirportIata,
        departureTimeLocal: flight.departureTimeLocal,
        arrivalTimeLocal: flight.arrivalTimeLocal,
        departureTimeUtc: flight.departureTimeUtc,
        arrivalTimeUtc: flight.arrivalTimeUtc,
        departureDateLocal: flight.departureDateLocal,
        durationMinutes,
        selectedCabin: {
          cabinClass: selectedCabin.cabinClass,
          pricePerPassenger: selectedCabin.price,
          totalPrice: selectedCabin.totalPrice,
          availableSeats: selectedCabin.availableSeats,
          freeBaggageBags: selectedCabin.freeBaggageBags,
          baggageMaxWeightKg: selectedCabin.baggageMaxWeightKg,
        },
        availableCabins: qualifyingCabins,
      });
    }

    const tieBreak = (a: any, b: any) =>
      a.departureTimeUtc.getTime() - b.departureTimeUtc.getTime() ||
      a.id.localeCompare(b.id);

    if (params.sortBy === FlightSortBy.DURATION) {
      results.sort(
        (a, b) => a.durationMinutes - b.durationMinutes || tieBreak(a, b),
      );
    } else if (params.sortBy === FlightSortBy.DEPARTURE_TIME) {
      results.sort(tieBreak);
    } else {
      results.sort(
        (a, b) =>
          a.selectedCabin.totalPrice - b.selectedCabin.totalPrice ||
          tieBreak(a, b),
      );
    }

    return results;
  }

  private async findAndAuthorizeFlight(
    id: string,
    currentUser: AuthenticatedUser,
  ): Promise<FlightDocument> {
    if (!isValidObjectId(id)) {
      throw new BadRequestException(`Invalid flight ID format: '${id}'`);
    }

    const flight = await this.flightModel.findById(id).exec();
    if (!flight) {
      throw new NotFoundException(`Flight with ID '${id}' not found`);
    }

    if (currentUser.role === UserRole.ADMINISTRATOR) {
      return flight;
    }

    if (currentUser.role === UserRole.AIRLINE_MODERATOR) {
      if (
        !currentUser.airlineId ||
        currentUser.airlineId.toLowerCase() !==
          flight.airlineId.toString().toLowerCase()
      ) {
        throw new ForbiddenException(
          'You are only authorized to manage flights for your assigned airline',
        );
      }
      return flight;
    }

    throw new ForbiddenException(
      'Only the assigned airline moderator or an administrator is authorized',
    );
  }

  private resolveAirlineId(
    dtoAirlineId: string | undefined,
    currentUser: AuthenticatedUser,
  ): string {
    if (currentUser.role === UserRole.AIRLINE_MODERATOR) {
      if (!currentUser.airlineId) {
        throw new ForbiddenException(
          'Airline moderator has no assigned airline associated with their account',
        );
      }
      if (
        dtoAirlineId &&
        dtoAirlineId.toLowerCase() !== currentUser.airlineId.toLowerCase()
      ) {
        throw new ForbiddenException(
          'You are only authorized to create flights for your assigned airline',
        );
      }
      return currentUser.airlineId;
    }

    if (currentUser.role === UserRole.ADMINISTRATOR) {
      if (!dtoAirlineId) {
        throw new BadRequestException(
          'airlineId must be explicitly provided when an administrator creates a flight',
        );
      }
      return dtoAirlineId;
    }

    throw new ForbiddenException(
      'Only airline moderators and administrators can create flights',
    );
  }

  private async saveWithDuplicateGuard(
    flight: FlightDocument,
    airlineLabel: string,
    departureDateLocal: string,
  ): Promise<FlightDocument> {
    try {
      return await flight.save();
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new ConflictException(
          `Flight '${flight.flightNumber}' already exists for airline '${airlineLabel}' on departure date ${departureDateLocal}`,
        );
      }
      throw error;
    }
  }

  private validateCabinCategories(cabins: { cabinClass: string }[]): void {
    const seen = new Set<string>();
    for (const cabin of cabins) {
      if (seen.has(cabin.cabinClass)) {
        throw new BadRequestException(
          `Duplicate cabin category '${cabin.cabinClass}'. Each cabin may be defined at most once per flight (FLT-04)`,
        );
      }
      seen.add(cabin.cabinClass);
    }
  }
}
