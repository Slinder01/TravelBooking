import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ItinerariesService } from './itineraries.service';
import { Itinerary } from './schemas/itinerary.schema';
import { FxService } from './fx.service';

describe('ItinerariesService', () => {
  let service: ItinerariesService;
  let fxService: FxService;
  let mockItineraryModel: any;

  const userId = new Types.ObjectId().toString();
  const otherUserId = new Types.ObjectId().toString();
  const itineraryId = new Types.ObjectId().toString();

  const user = { id: userId, email: 'user@example.com', role: 'registered_user' };
  const otherUser = { id: otherUserId, email: 'other@example.com', role: 'registered_user' };

  const mockItineraryDoc: any = {
    _id: new Types.ObjectId(itineraryId),
    title: 'Europe Trip',
    country: 'FR',
    startDate: new Date('2026-06-01T00:00:00.000Z'),
    ownerId: userId,
    days: [
      {
        _id: new Types.ObjectId(),
        city: 'Paris',
        dayNumber: 1,
        date: new Date('2026-06-01T00:00:00.000Z'),
        activities: [],
        budgets: [],
      },
    ],
    save: jest.fn().mockImplementation(function (this: any) {
      return Promise.resolve(this);
    }),
    deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
  };

  beforeEach(async () => {
    mockItineraryModel = {
      findById: jest.fn().mockImplementation((id: any) => {
        if (id.toString() === itineraryId) return Promise.resolve(mockItineraryDoc);
        return Promise.resolve(null);
      }),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((doc: any) => Promise.resolve({ ...doc, _id: new Types.ObjectId() })),
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue([mockItineraryDoc]),
      }),
      countDocuments: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ItinerariesService,
        FxService,
        { provide: getModelToken(Itinerary.name), useValue: mockItineraryModel },
      ],
    }).compile();

    service = module.get<ItinerariesService>(ItinerariesService);
    fxService = module.get<FxService>(FxService);
  });

  it('getOwned throws ForbiddenException when accessed by another user', async () => {
    await expect(service.getOwned(itineraryId, otherUser)).rejects.toThrow(ForbiddenException);
  });

  it('addDay inserts day and recomputes dayNumber and dates', async () => {
    const res = await service.addDay(itineraryId, { city: 'Nice' }, user);
    expect(res.days).toHaveLength(2);
    expect(res.days[1].city).toBe('Nice');
    expect(res.days[1].dayNumber).toBe(2);
  });

  it('FxService.convert returns same amount when from === to', async () => {
    const converted = await fxService.convert(100, 'USD', 'USD');
    expect(converted).toBe(100);
  });

  it('FxService.assertCode rejects invalid currency code formats', () => {
    expect(() => fxService.assertCode('US')).toThrow(BadRequestException);
    expect(() => fxService.assertCode('USDD')).toThrow(BadRequestException);
  });
});
