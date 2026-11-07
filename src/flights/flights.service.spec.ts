import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { FlightsService } from './flights.service';
import { CabinClass, Flight, FlightStatus } from './schemas/flight.schema';
import { AirlinesService } from '../airlines/airlines.service';
import { AirportsService } from '../airports/airports.service';
import { UserRole } from '../users/users-role.enum';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { CreateFlightDto } from './dtos/create-flight.dto';

describe('FlightsService', () => {
  let service: FlightsService;
  let mockFlightModel: any;
  let mockAirlinesService: any;
  let mockAirportsService: any;

  const validAirlineId = '665f1a2b3c4d5e6f78901234';
  const otherAirlineId = '665f1a2b3c4d5e6f78909999';

  const mockCairoAirport = {
    _id: new Types.ObjectId(),
    iataCode: 'CAI',
    name: 'Cairo International Airport',
    city: 'Cairo',
    country: 'Egypt',
    timeZone: 'Africa/Cairo',
  };

  const mockBerlinAirport = {
    _id: new Types.ObjectId(),
    iataCode: 'BER',
    name: 'Berlin Brandenburg Airport',
    city: 'Berlin',
    country: 'Germany',
    timeZone: 'Europe/Berlin',
  };

  const mockAirline = {
    _id: new Types.ObjectId(validAirlineId),
    name: 'EgyptAir',
    iataCode: 'MS',
    isActive: true,
  };

  const mockModeratorUser: AuthenticatedUser = {
    id: 'user-mod-1',
    email: 'mod@egyptair.com',
    role: UserRole.AIRLINE_MODERATOR,
    airlineId: validAirlineId,
  };

  const mockAdminUser: AuthenticatedUser = {
    id: 'user-admin-1',
    email: 'admin@travel.com',
    role: UserRole.ADMINISTRATOR,
  };

  const sampleValidDto: CreateFlightDto = {
    flightNumber: 'MS777',
    departureAirportIata: 'CAI',
    arrivalAirportIata: 'BER',
    departureTimeLocal: '2026-12-01T14:30:00',
    arrivalTimeLocal: '2026-12-01T18:45:00',
    cabins: [
      {
        cabinClass: CabinClass.ECONOMY,
        seatCount: 150,
        price: 250,
        freeBaggageBags: 1,
        baggageMaxWeightKg: 23,
      },
      {
        cabinClass: CabinClass.BUSINESS,
        seatCount: 20,
        price: 800,
        freeBaggageBags: 2,
        baggageMaxWeightKg: 32,
      },
    ],
  };

  beforeEach(async () => {
    mockFlightModel = jest.fn().mockImplementation((doc) => ({
      ...doc,
      save: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), ...doc }),
    }));
    mockFlightModel.findOne = jest.fn();
    mockFlightModel.findById = jest.fn();

    mockAirlinesService = {
      findById: jest.fn().mockResolvedValue(mockAirline),
    };

    mockAirportsService = {
      findByIataCode: jest.fn().mockImplementation((code: string) => {
        if (code === 'CAI') return Promise.resolve(mockCairoAirport);
        if (code === 'BER') return Promise.resolve(mockBerlinAirport);
        return Promise.resolve(null);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FlightsService,
        {
          provide: getModelToken(Flight.name),
          useValue: mockFlightModel,
        },
        {
          provide: AirlinesService,
          useValue: mockAirlinesService,
        },
        {
          provide: AirportsService,
          useValue: mockAirportsService,
        },
      ],
    }).compile();

    service = module.get<FlightsService>(FlightsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create - successful scheduling (FLT-03, FLT-04)', () => {
    it('should create a flight in Scheduled status with UTC conversion and initialized seats', async () => {
      mockFlightModel.findOne.mockResolvedValue(null);

      const result = await service.create(sampleValidDto, mockModeratorUser);

      expect(result).toBeDefined();
      expect(result.flightNumber).toBe('MS777');
      expect(result.departureAirportIata).toBe('CAI');
      expect(result.arrivalAirportIata).toBe('BER');
      expect(result.status).toBe(FlightStatus.SCHEDULED);
      expect(result.departureDateLocal).toBe('2026-12-01');

      // Cairo is UTC+2 in winter, so 14:30 local is 12:30 UTC
      expect(result.departureTimeUtc.toISOString()).toBe('2026-12-01T12:30:00.000Z');
      // Berlin is UTC+1 in winter, so 18:45 local is 17:45 UTC
      expect(result.arrivalTimeUtc.toISOString()).toBe('2026-12-01T17:45:00.000Z');

      // Check cabins initialized with 0 booked and 0 held
      expect(result.cabins).toHaveLength(2);
      expect(result.cabins[0].bookedSeats).toBe(0);
      expect(result.cabins[0].heldSeats).toBe(0);
    });

    it('should allow an Administrator to create a flight when airlineId is provided', async () => {
      mockFlightModel.findOne.mockResolvedValue(null);

      const adminDto: CreateFlightDto = {
        ...sampleValidDto,
        airlineId: validAirlineId,
      };

      const result = await service.create(adminDto, mockAdminUser);
      expect(result).toBeDefined();
    });
  });

  describe('validation rules (FLT-03, FLT-04)', () => {
    it('should reject identical departure and arrival airports', async () => {
      const invalidDto: CreateFlightDto = {
        ...sampleValidDto,
        departureAirportIata: 'CAI',
        arrivalAirportIata: 'CAI',
      };

      await expect(service.create(invalidDto, mockModeratorUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject when arrival is not after departure in UTC', async () => {
      const invalidDto: CreateFlightDto = {
        ...sampleValidDto,
        departureTimeLocal: '2026-12-01T18:00:00',
        arrivalTimeLocal: '2026-12-01T10:00:00', // Arrival earlier than departure
      };

      await expect(service.create(invalidDto, mockModeratorUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject departure in the past', async () => {
      const pastDto: CreateFlightDto = {
        ...sampleValidDto,
        departureTimeLocal: '2020-01-01T10:00:00',
        arrivalTimeLocal: '2020-01-01T14:00:00',
      };

      await expect(service.create(pastDto, mockModeratorUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject duplicate flight number for the same airline on the same departure date', async () => {
      mockFlightModel.findOne.mockResolvedValue({ _id: new Types.ObjectId() });

      await expect(service.create(sampleValidDto, mockModeratorUser)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should reject duplicate cabin classes on the same flight (FLT-04)', async () => {
      const duplicateCabinDto: CreateFlightDto = {
        ...sampleValidDto,
        cabins: [
          {
            cabinClass: CabinClass.ECONOMY,
            seatCount: 100,
            price: 200,
            freeBaggageBags: 1,
            baggageMaxWeightKg: 23,
          },
          {
            cabinClass: CabinClass.ECONOMY, // Duplicate Economy
            seatCount: 50,
            price: 250,
            freeBaggageBags: 1,
            baggageMaxWeightKg: 23,
          },
        ],
      };

      await expect(service.create(duplicateCabinDto, mockModeratorUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject moderator attempting to schedule a flight for an unassigned airline', async () => {
      const unauthorizedDto: CreateFlightDto = {
        ...sampleValidDto,
        airlineId: otherAirlineId,
      };

      await expect(service.create(unauthorizedDto, mockModeratorUser)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
