import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { AirlinesService } from './airlines.service';
import { Airline } from './schemas/airline.schema';
import { UserRole } from '../users/users-role.enum';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';

describe('AirlinesService', () => {
  let service: AirlinesService;
  let mockAirlineModel: any;

  const validId = '665f1a2b3c4d5e6f78901234';
  const otherId = '665f1a2b3c4d5e6f78909999';

  const mockAdminUser: AuthenticatedUser = {
    id: 'user-admin-id',
    email: 'admin@travel.com',
    role: UserRole.ADMINISTRATOR,
  };

  const mockModeratorUser: AuthenticatedUser = {
    id: 'user-mod-id',
    email: 'mod@egyptair.com',
    role: UserRole.AIRLINE_MODERATOR,
    airlineId: validId,
  };

  const mockOtherModeratorUser: AuthenticatedUser = {
    id: 'user-mod-other-id',
    email: 'mod2@other.com',
    role: UserRole.AIRLINE_MODERATOR,
    airlineId: otherId,
  };

  beforeEach(async () => {
    mockAirlineModel = jest.fn().mockImplementation((dto) => ({
      ...dto,
      save: jest.fn().mockResolvedValue({ _id: validId, ...dto }),
    }));

    mockAirlineModel.findOne = jest.fn();
    mockAirlineModel.find = jest.fn();
    mockAirlineModel.findById = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AirlinesService,
        {
          provide: getModelToken(Airline.name),
          useValue: mockAirlineModel,
        },
      ],
    }).compile();

    service = module.get<AirlinesService>(AirlinesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create an airline with uppercase IATA code', async () => {
      mockAirlineModel.findOne.mockResolvedValue(null);

      const result = await service.create({
        name: 'EgyptAir',
        iataCode: 'ms',
        country: 'Egypt',
      });

      expect(mockAirlineModel.findOne).toHaveBeenCalledWith({ iataCode: 'MS' });
      expect(result).toBeDefined();
    });

    it('should throw ConflictException if IATA code is duplicated', async () => {
      mockAirlineModel.findOne.mockResolvedValue({ _id: validId, iataCode: 'MS' });

      await expect(
        service.create({
          name: 'EgyptAir Duplicate',
          iataCode: 'MS',
          country: 'Egypt',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update ownership restrictions', () => {
    const existingAirline = {
      _id: validId,
      name: 'EgyptAir',
      iataCode: 'MS',
      save: jest.fn().mockResolvedValue(this),
    };

    beforeEach(() => {
      mockAirlineModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(existingAirline),
      });
    });

    it('should allow ADMINISTRATOR to update any airline', async () => {
      const result = await service.update(validId, { name: 'EgyptAir Updated' }, mockAdminUser);
      expect(result).toBeDefined();
    });

    it('should allow assigned AIRLINE_MODERATOR to update their airline', async () => {
      const result = await service.update(validId, { name: 'EgyptAir Updated' }, mockModeratorUser);
      expect(result).toBeDefined();
    });

    it('should forbid AIRLINE_MODERATOR from updating a different airline', async () => {
      await expect(
        service.update(validId, { name: 'Hack Name' }, mockOtherModeratorUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
