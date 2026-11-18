import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, isValidObjectId } from 'mongoose';
import { Flight, FlightDocument, FlightStatus } from './schemas/flight.schema';
import { CreateFlightDto } from './dtos/create-flight.dto';
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
      throw new BadRequestException(`Airline '${airline.name}' is currently inactive`);
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

    return flight.save();
  }

  async search(query: SearchFlightsDto) {
    const origin = query.origin.trim().toUpperCase();
    const destination = query.destination.trim().toUpperCase();

    if (origin === destination) {
      throw new BadRequestException('Origin and destination airports cannot be identical');
    }

    if (!isValidCalendarDate(query.departureDate)) {
      throw new BadRequestException(
        `Invalid calendar date: '${query.departureDate}'. Impossible dates (such as February 30) are not permitted.`,
      );
    }

    const passengers = query.passengers && query.passengers > 0 ? query.passengers : 1;

    // Filter by route, local departure date, and Scheduled status (FLT-11)
    const filter: Record<string, any> = {
      departureAirportIata: origin,
      arrivalAirportIata: destination,
      departureDateLocal: query.departureDate,
      status: FlightStatus.SCHEDULED,
    };

    const flights = await this.flightModel
      .find(filter)
      .populate('airlineId', 'name iataCode logoUrl baggagePolicy cancellationPolicy')
      .exec();

    const results = [];
    const now = Date.now();

    for (const flight of flights) {
      // Exclude flights that have already departed (even if on today's calendar date)
      if (flight.departureTimeUtc.getTime() <= now) {
        continue;
      }

      // Find qualifying cabins for the requested passenger count
      const qualifyingCabins = flight.cabins
        .map((cabin) => {
          const availableSeats =
            cabin.seatCount - (cabin.bookedSeats || 0) - (cabin.heldSeats || 0);
          return {
            cabinClass: cabin.cabinClass,
            seatCount: cabin.seatCount,
            availableSeats,
            price: cabin.price,
            totalPrice: Math.round(cabin.price * passengers * 100) / 100,
            freeBaggageBags: cabin.freeBaggageBags,
            baggageMaxWeightKg: cabin.baggageMaxWeightKg,
          };
        })
        .filter((c) => {
          if (c.availableSeats < passengers) {
            return false;
          }
          if (query.cabinClass) {
            return c.cabinClass === query.cabinClass;
          }
          return true;
        })
        .sort((a, b) => a.price - b.price); // Cheapest first

      if (qualifyingCabins.length === 0) {
        continue;
      }

      // When cabinClass is omitted, use the cheapest cabin with sufficient available seats
      const selectedCabin = qualifyingCabins[0];
      const durationMinutes = Math.round(
        (flight.arrivalTimeUtc.getTime() - flight.departureTimeUtc.getTime()) / (1000 * 60),
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

    // Apply sorting (FLT-15)
    if (query.sortBy === FlightSortBy.DURATION) {
      results.sort((a, b) => a.durationMinutes - b.durationMinutes);
    } else if (query.sortBy === FlightSortBy.DEPARTURE_TIME) {
      results.sort((a, b) => a.departureTimeUtc.getTime() - b.departureTimeUtc.getTime());
    } else {
      results.sort((a, b) => a.selectedCabin.totalPrice - b.selectedCabin.totalPrice);
    }

    return results;
  }

  async findById(id: string): Promise<FlightDocument> {
    if (!isValidObjectId(id)) {
      throw new BadRequestException(`Invalid flight ID format: '${id}'`);
    }

    const flight = await this.flightModel
      .findById(id)
      .populate('airlineId', 'name iataCode baggagePolicy cancellationPolicy')
      .populate('departureAirportId', 'name city country timeZone')
      .populate('arrivalAirportId', 'name city country timeZone')
      .exec();

    if (!flight) {
      throw new NotFoundException(`Flight with ID '${id}' not found`);
    }

    return flight;
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
      if (dtoAirlineId && dtoAirlineId !== currentUser.airlineId) {
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
