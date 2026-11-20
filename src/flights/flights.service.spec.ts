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
import { localToUtc } from './utils/timezone.util';
import { AirlinesService } from '../airlines/airlines.service';
import { AirportsService } from '../airports/airports.service';
import { UserRole } from '../users/users-role.enum';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { CreateFlightDto } from './dtos/create-flight.dto';
import { FlightSortBy, SearchFlightsDto } from './dtos/search-flights.dto';

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
    mockFlightModel.find = jest.fn();
    mockFlightModel.findOneAndUpdate = jest.fn();

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

    it('should reject flight scheduling with impossible calendar date (e.g. Feb 30)', async () => {
      const impossibleDateDto: CreateFlightDto = {
        ...sampleValidDto,
        departureTimeLocal: '2026-02-30T10:00:00',
        arrivalTimeLocal: '2026-02-30T14:00:00',
      };

      await expect(service.create(impossibleDateDto, mockModeratorUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject flight scheduling with invalid clock times (e.g. 25:00:00)', async () => {
      const invalidTimeDto: CreateFlightDto = {
        ...sampleValidDto,
        departureTimeLocal: '2026-12-01T25:00:00',
        arrivalTimeLocal: '2026-12-01T28:00:00',
      };

      await expect(service.create(invalidTimeDto, mockModeratorUser)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('search - public flight search (FLT-11, FLT-12, FLT-15)', () => {
    const mockFlightDoc = {
      _id: new Types.ObjectId('665f1a2b3c4d5e6f78905555'),
      flightNumber: 'MS777',
      airlineId: {
        _id: new Types.ObjectId(validAirlineId),
        name: 'EgyptAir',
        iataCode: 'MS',
        logoUrl: 'https://example.com/logo.png',
      },
      departureAirportIata: 'CAI',
      arrivalAirportIata: 'BER',
      departureDateLocal: '2026-12-01',
      departureTimeLocal: '2026-12-01T14:30:00',
      arrivalTimeLocal: '2026-12-01T18:45:00',
      departureTimeUtc: new Date('2026-12-01T12:30:00.000Z'),
      arrivalTimeUtc: new Date('2026-12-01T17:45:00.000Z'),
      status: FlightStatus.SCHEDULED,
      cabins: [
        {
          cabinClass: CabinClass.ECONOMY,
          seatCount: 150,
          bookedSeats: 10,
          heldSeats: 0,
          price: 250,
          freeBaggageBags: 1,
          baggageMaxWeightKg: 23,
        },
        {
          cabinClass: CabinClass.BUSINESS,
          seatCount: 20,
          bookedSeats: 5,
          heldSeats: 0,
          price: 800,
          freeBaggageBags: 2,
          baggageMaxWeightKg: 32,
        },
      ],
    };

    it('should search one-way flights and choose cheapest eligible cabin when cabinClass is omitted', async () => {
      mockFlightModel.find.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([mockFlightDoc]),
        }),
      });

      const query: SearchFlightsDto = {
        origin: 'CAI',
        destination: 'BER',
        departureDate: '2026-12-01',
        passengers: 2,
      };

      const results = await service.search(query);

      expect(results).toHaveLength(1);
      expect(results[0].flightNumber).toBe('MS777');
      expect(results[0].durationMinutes).toBe(315); // 5h 15m = 315 min
      // Cheapest cabin is Economy (250)
      expect(results[0].selectedCabin.cabinClass).toBe(CabinClass.ECONOMY);
      expect(results[0].selectedCabin.pricePerPassenger).toBe(250);
      expect(results[0].selectedCabin.totalPrice).toBe(500); // 2 * 250
      expect(results[0].selectedCabin.availableSeats).toBe(140); // 150 - 10
      expect(results[0].availableCabins).toHaveLength(2);
    });

    it('should filter by specific cabinClass when provided', async () => {
      mockFlightModel.find.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([mockFlightDoc]),
        }),
      });

      const query: SearchFlightsDto = {
        origin: 'cai',
        destination: 'ber',
        departureDate: '2026-12-01',
        passengers: 3,
        cabinClass: CabinClass.BUSINESS,
      };

      const results = await service.search(query);

      expect(results).toHaveLength(1);
      expect(results[0].selectedCabin.cabinClass).toBe(CabinClass.BUSINESS);
      expect(results[0].selectedCabin.pricePerPassenger).toBe(800);
      expect(results[0].selectedCabin.totalPrice).toBe(2400); // 3 * 800
      expect(results[0].selectedCabin.availableSeats).toBe(15); // 20 - 5
    });

    it('should exclude flights when available seats are less than requested passengers', async () => {
      const fullFlight = {
        ...mockFlightDoc,
        cabins: [
          {
            cabinClass: CabinClass.ECONOMY,
            seatCount: 150,
            bookedSeats: 150, // 0 available
            heldSeats: 0,
            price: 250,
          },
        ],
      };

      mockFlightModel.find.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([fullFlight]),
        }),
      });

      const query: SearchFlightsDto = {
        origin: 'CAI',
        destination: 'BER',
        departureDate: '2026-12-01',
        passengers: 1,
      };

      const results = await service.search(query);
      expect(results).toEqual([]);
    });

    it('should reject search when origin and destination are identical', async () => {
      const invalidQuery: SearchFlightsDto = {
        origin: 'CAI',
        destination: 'cai',
        departureDate: '2026-12-01',
      };

      await expect(service.search(invalidQuery)).rejects.toThrow(BadRequestException);
    });

    it('should reject search with impossible calendar date (e.g. Feb 30 or non-leap Feb 29)', async () => {
      const feb30Query: SearchFlightsDto = {
        origin: 'CAI',
        destination: 'BER',
        departureDate: '2026-02-30',
      };
      await expect(service.search(feb30Query)).rejects.toThrow(BadRequestException);

      const nonLeapFeb29Query: SearchFlightsDto = {
        origin: 'CAI',
        destination: 'BER',
        departureDate: '2026-02-29', // 2026 is not a leap year
      };
      await expect(service.search(nonLeapFeb29Query)).rejects.toThrow(BadRequestException);
    });

    it('should sort search results by duration (FLT-15)', async () => {
      const flight1 = {
        ...mockFlightDoc,
        _id: new Types.ObjectId(),
        flightNumber: 'MS777',
        departureTimeUtc: new Date('2026-12-01T12:00:00.000Z'),
        arrivalTimeUtc: new Date('2026-12-01T16:00:00.000Z'), // 240 mins
      };
      const flight2 = {
        ...mockFlightDoc,
        _id: new Types.ObjectId(),
        flightNumber: 'MS888',
        departureTimeUtc: new Date('2026-12-01T12:00:00.000Z'),
        arrivalTimeUtc: new Date('2026-12-01T15:00:00.000Z'), // 180 mins
      };

      mockFlightModel.find.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([flight1, flight2]),
        }),
      });

      const query: SearchFlightsDto = {
        origin: 'CAI',
        destination: 'BER',
        departureDate: '2026-12-01',
        sortBy: FlightSortBy.DURATION,
      };

      const results = await service.search(query);
      expect(results).toHaveLength(2);
      expect(results[0].flightNumber).toBe('MS888'); // 180 min duration first
      expect(results[1].flightNumber).toBe('MS777'); // 240 min duration second
    });

    it('should exclude flights that departed in the past', async () => {
      const pastFlight = {
        ...mockFlightDoc,
        _id: new Types.ObjectId(),
        flightNumber: 'MS999',
        departureTimeUtc: new Date(Date.now() - 3600 * 1000), // 1 hour ago
        arrivalTimeUtc: new Date(Date.now() + 3600 * 1000),
      };

      mockFlightModel.find.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([pastFlight]),
        }),
      });

      const query: SearchFlightsDto = {
        origin: 'CAI',
        destination: 'BER',
        departureDate: '2026-12-01',
      };

      const results = await service.search(query);
      expect(results).toEqual([]);
    });

    it('should return outbound and return legs for round-trip searches and filter impossible same-day returns (FLT-12)', async () => {
      const outboundDoc = {
        _id: new Types.ObjectId(),
        flightNumber: 'MS777',
        airlineId: { name: 'EgyptAir', iataCode: 'MS', isActive: true },
        departureAirportIata: 'CAI',
        arrivalAirportIata: 'BER',
        departureTimeLocal: '2026-12-01T10:00:00',
        arrivalTimeLocal: '2026-12-01T14:00:00',
        departureTimeUtc: new Date('2026-12-01T08:00:00.000Z'),
        arrivalTimeUtc: new Date('2026-12-01T13:00:00.000Z'),
        departureDateLocal: '2026-12-01',
        status: FlightStatus.SCHEDULED,
        cabins: [
          {
            cabinClass: CabinClass.ECONOMY,
            seatCount: 100,
            price: 250,
            freeBaggageBags: 1,
            baggageMaxWeightKg: 23,
            bookedSeats: 0,
            heldSeats: 0,
          },
        ],
      };

      const impossibleSameDayReturn = {
        ...outboundDoc,
        _id: new Types.ObjectId(),
        flightNumber: 'MS778-EARLY',
        departureAirportIata: 'BER',
        arrivalAirportIata: 'CAI',
        departureTimeUtc: new Date('2026-12-01T11:00:00.000Z'), // before 13:00 outbound arrival!
        arrivalTimeUtc: new Date('2026-12-01T15:00:00.000Z'),
      };

      const validSameDayReturn = {
        ...outboundDoc,
        _id: new Types.ObjectId(),
        flightNumber: 'MS778',
        departureAirportIata: 'BER',
        arrivalAirportIata: 'CAI',
        departureTimeUtc: new Date('2026-12-01T16:00:00.000Z'), // after 13:00 outbound arrival
        arrivalTimeUtc: new Date('2026-12-01T20:00:00.000Z'),
      };

      mockFlightModel.find
        .mockReturnValueOnce({
          populate: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([outboundDoc]),
          }),
        })
        .mockReturnValueOnce({
          populate: jest.fn().mockReturnValue({
            exec: jest
              .fn()
              .mockResolvedValue([impossibleSameDayReturn, validSameDayReturn]),
          }),
        });

      const res = await service.search({
        origin: 'CAI',
        destination: 'BER',
        departureDate: '2026-12-01',
        returnDate: '2026-12-01',
      });

      expect(res.tripType).toBe('round-trip');
      expect(res.outbound).toHaveLength(1);
      expect(res.return).toHaveLength(1);
      expect(res.return[0].flightNumber).toBe('MS778');
    });

    it('should reject returnDate earlier than departureDate and minPrice > maxPrice (FLT-12, FLT-15)', async () => {
      await expect(
        service.search({
          origin: 'CAI',
          destination: 'BER',
          departureDate: '2026-12-10',
          returnDate: '2026-12-05',
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.search({
          origin: 'CAI',
          destination: 'BER',
          departureDate: '2026-12-10',
          minPrice: 500,
          maxPrice: 200,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should filter by minPrice, maxPrice, airline IATA, and exclude inactive airlines (FLT-15)', async () => {
      const matchingFlight = {
        _id: new Types.ObjectId(),
        flightNumber: 'MS101',
        airlineId: { name: 'EgyptAir', iataCode: 'MS', isActive: true },
        departureAirportIata: 'CAI',
        arrivalAirportIata: 'BER',
        departureTimeLocal: '2026-12-01T10:00:00',
        arrivalTimeLocal: '2026-12-01T14:00:00',
        departureTimeUtc: new Date('2026-12-01T08:00:00.000Z'),
        arrivalTimeUtc: new Date('2026-12-01T13:00:00.000Z'),
        departureDateLocal: '2026-12-01',
        status: FlightStatus.SCHEDULED,
        cabins: [
          {
            cabinClass: CabinClass.ECONOMY,
            seatCount: 50,
            price: 300,
            freeBaggageBags: 1,
            baggageMaxWeightKg: 23,
            bookedSeats: 0,
            heldSeats: 0,
          },
          {
            cabinClass: CabinClass.BUSINESS,
            seatCount: 10,
            price: 900,
            freeBaggageBags: 2,
            baggageMaxWeightKg: 32,
            bookedSeats: 0,
            heldSeats: 0,
          },
        ],
      };

      const inactiveAirlineFlight = {
        ...matchingFlight,
        _id: new Types.ObjectId(),
        flightNumber: 'MS999',
        airlineId: { name: 'OldAir', iataCode: 'MS', isActive: false },
      };

      const otherAirlineFlight = {
        ...matchingFlight,
        _id: new Types.ObjectId(),
        flightNumber: 'LH100',
        airlineId: { name: 'Lufthansa', iataCode: 'LH', isActive: true },
      };

      mockFlightModel.find.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          exec: jest
            .fn()
            .mockResolvedValue([
              matchingFlight,
              inactiveAirlineFlight,
              otherAirlineFlight,
            ]),
        }),
      });

      const results = await service.search({
        origin: 'CAI',
        destination: 'BER',
        departureDate: '2026-12-01',
        minPrice: 200,
        maxPrice: 500,
        airline: 'MS',
      });

      expect(results).toHaveLength(1);
      expect(results[0].flightNumber).toBe('MS101');
      expect(results[0].availableCabins).toHaveLength(1); // Business (900) excluded by maxPrice 500
    });
  });

  describe('Flight & Cabin Management (FLT-04, FLT-05, FLT-06)', () => {
    const flightId = new Types.ObjectId().toString();

    it('updateFlight recalculates UTC timestamps and checks ownership (FLT-05)', async () => {
      const doc: any = {
        _id: new Types.ObjectId(flightId),
        airlineId: new Types.ObjectId(validAirlineId),
        flightNumber: 'MS777',
        departureAirportIata: 'CAI',
        arrivalAirportIata: 'BER',
        departureTimeLocal: '2026-12-01T14:30:00',
        arrivalTimeLocal: '2026-12-01T18:45:00',
        departureDateLocal: '2026-12-01',
        status: FlightStatus.SCHEDULED,
        save: jest.fn().mockImplementation(function (this: any) {
          return Promise.resolve(this);
        }),
      };

      mockFlightModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(doc),
      });

      const updated = await service.updateFlight(
        flightId,
        {
          departureTimeLocal: '2026-12-01T15:30:00',
          arrivalTimeLocal: '2026-12-01T19:45:00',
        },
        mockModeratorUser,
      );

      expect(updated.departureTimeLocal).toBe('2026-12-01T15:30:00');
      expect(updated.departureTimeUtc).toBeInstanceOf(Date);
    });

    it('cancelFlight transitions Scheduled flight to Cancelled and blocks cross-airline moderator or departed flight (FLT-06)', async () => {
      const otherMod: AuthenticatedUser = {
        ...mockModeratorUser,
        airlineId: otherAirlineId,
      };
      const futureDoc: any = {
        _id: new Types.ObjectId(flightId),
        airlineId: new Types.ObjectId(validAirlineId),
        departureTimeUtc: new Date(Date.now() + 24 * 3600 * 1000),
        status: FlightStatus.SCHEDULED,
      };

      mockFlightModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(futureDoc),
      });

      await expect(service.cancelFlight(flightId, otherMod)).rejects.toThrow(
        ForbiddenException,
      );

      mockFlightModel.findOneAndUpdate.mockReturnValueOnce({
        exec: jest
          .fn()
          .mockResolvedValue({ ...futureDoc, status: FlightStatus.CANCELLED }),
      });

      const cancelled = await service.cancelFlight(flightId, mockModeratorUser);
      expect(cancelled.status).toBe(FlightStatus.CANCELLED);

      // Already-departed Scheduled flight must be rejected
      mockFlightModel.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValue({
          ...futureDoc,
          departureTimeUtc: new Date(Date.now() - 3600 * 1000),
        }),
      });
      await expect(
        service.cancelFlight(flightId, mockModeratorUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('addCabin rejects duplicate tier and updateCabin updates atomically while enforcing seatCount >= booked + held (FLT-04, FLT-05)', async () => {
      const doc: any = {
        _id: new Types.ObjectId(flightId),
        airlineId: new Types.ObjectId(validAirlineId),
        flightNumber: 'MS777',
        status: FlightStatus.SCHEDULED,
        cabins: [
          {
            cabinClass: CabinClass.ECONOMY,
            seatCount: 100,
            price: 250,
            freeBaggageBags: 1,
            baggageMaxWeightKg: 23,
            bookedSeats: 30,
            heldSeats: 10,
          },
        ],
      };

      mockFlightModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(doc),
      });

      await expect(
        service.addCabin(
          flightId,
          {
            cabinClass: CabinClass.ECONOMY,
            seatCount: 50,
            price: 200,
            freeBaggageBags: 1,
            baggageMaxWeightKg: 23,
          },
          mockModeratorUser,
        ),
      ).rejects.toThrow(ConflictException);

      // Cannot shrink below 30 booked + 10 held = 40
      await expect(
        service.updateCabin(
          flightId,
          'Economy',
          { seatCount: 35 },
          mockModeratorUser,
        ),
      ).rejects.toThrow(BadRequestException);

      mockFlightModel.findOneAndUpdate.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValue({
          ...doc,
          cabins: [
            {
              ...doc.cabins[0],
              seatCount: 120,
              price: 275,
            },
          ],
        }),
      });

      const updated = await service.updateCabin(
        flightId,
        'Economy',
        { seatCount: 120, price: 275 },
        mockModeratorUser,
      );
      expect(updated.cabins[0].seatCount).toBe(120);
      expect(updated.cabins[0].price).toBe(275);
      expect(mockFlightModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
    });

    it('localToUtc accurately handles DST boundaries and rejects non-existent spring-forward times', () => {
      // 2026-03-29 01:30 Europe/Berlin (before 02:00 CET->CEST jump) = 00:30 UTC
      const preJump = localToUtc('2026-03-29T01:30:00', 'Europe/Berlin');
      expect(preJump.toISOString()).toBe('2026-03-29T00:30:00.000Z');

      // 2026-03-29 02:30 Europe/Berlin does not exist (clock jumps 02:00 -> 03:00)
      expect(() =>
        localToUtc('2026-03-29T02:30:00', 'Europe/Berlin'),
      ).toThrow(BadRequestException);
    });
  });
});
import { jest } from '@jest/globals';
