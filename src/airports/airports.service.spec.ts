import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AirportsService } from './airports.service';
import { Airport } from './schemas/airport.schema';

describe('AirportsService', () => {
  let service: AirportsService;
  let mockAirportModel: any;

  beforeEach(async () => {
    mockAirportModel = jest.fn().mockImplementation((dto) => ({
      ...dto,
      save: jest.fn().mockResolvedValue({ _id: '123', ...dto }),
    }));

    mockAirportModel.findOne = jest.fn();
    mockAirportModel.find = jest.fn();
    mockAirportModel.countDocuments = jest.fn();
    mockAirportModel.insertMany = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AirportsService,
        {
          provide: getModelToken(Airport.name),
          useValue: mockAirportModel,
        },
      ],
    }).compile();

    service = module.get<AirportsService>(AirportsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create an airport with uppercase code', async () => {
    mockAirportModel.findOne.mockResolvedValue(null);

    const result = await service.create({
      iataCode: 'cai',
      name: 'Cairo International Airport',
      city: 'Cairo',
      country: 'Egypt',
      timeZone: 'Africa/Cairo',
    });

    expect(mockAirportModel.findOne).toHaveBeenCalledWith({ iataCode: 'CAI' });
    expect(result).toBeDefined();
  });

  it('should throw ConflictException for duplicate IATA code', async () => {
    mockAirportModel.findOne.mockResolvedValue({ iataCode: 'CAI' });

    await expect(
      service.create({
        iataCode: 'CAI',
        name: 'Cairo Airport',
        city: 'Cairo',
        country: 'Egypt',
        timeZone: 'Africa/Cairo',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('should find airport by IATA code', async () => {
    mockAirportModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ iataCode: 'CAI', city: 'Cairo' }),
    });

    const result = await service.findByIataCode('cai');
    expect(result.iataCode).toBe('CAI');
  });

  it('should throw NotFoundException if IATA code not found', async () => {
    mockAirportModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });

    await expect(service.findByIataCode('XYZ')).rejects.toThrow(NotFoundException);
  });

  it('should safely handle special regex characters in search without crashing', async () => {
    mockAirportModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      }),
    });

    const result = await service.findAll('(');
    expect(result).toEqual([]);
  });
});
