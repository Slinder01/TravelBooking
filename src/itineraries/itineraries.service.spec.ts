import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import mongoose, { Types } from 'mongoose';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ItinerariesService } from './itineraries.service';
import { Itinerary, ItinerarySchema } from './schemas/itinerary.schema';
import { FxService } from './fx.service';
import { UploadsService } from '../uploads/uploads.service';
import { UPLOADS_ROOT } from '../uploads/image-uploads.options';
import { UserRole } from '../users/users-role.enum';

const localMongoose = new mongoose.Mongoose();
const LocalItineraryModel = localMongoose.model('ItinerarySpecModel', ItinerarySchema);
const ITINERARY_UPLOADS_DIR = join(UPLOADS_ROOT, 'itineraries');

describe('ItinerariesService', () => {
  let service: ItinerariesService;
  let fxService: FxService;
  let uploadsService: UploadsService;
  let mockItineraryModel: any;

  const userId = new Types.ObjectId().toString();
  const otherUserId = new Types.ObjectId().toString();
  const itineraryId = new Types.ObjectId().toString();

  const user = { id: userId, email: 'user@example.com', role: UserRole.REGISTERED_USER };
  const otherUser = { id: otherUserId, email: 'other@example.com', role: UserRole.REGISTERED_USER };
  const guestUser = { id: userId, email: 'guest@example.com', role: UserRole.GUEST };

  let mockItineraryDoc: any;
  const createdTempFiles: string[] = [];

  afterAll(() => {
    for (const p of createdTempFiles) {
      if (existsSync(p)) {
        try { unlinkSync(p); } catch { /* ignore */ }
      }
    }
  });

  beforeEach(async () => {
    mockItineraryDoc = {
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
        UploadsService,
        { provide: getModelToken(Itinerary.name), useValue: mockItineraryModel },
      ],
    }).compile();

    service = module.get<ItinerariesService>(ItinerariesService);
    fxService = module.get<FxService>(FxService);
    uploadsService = module.get<UploadsService>(UploadsService);
  });

  it('getOwned throws ForbiddenException when accessed by another user', async () => {
    await expect(service.getOwned(itineraryId, otherUser)).rejects.toThrow(ForbiddenException);
  });

  it('create blocks GUEST role with ForbiddenException', () => {
    expect(() =>
      service.create({ title: 'Trip', country: 'FR', startDate: '2026-06-01' }, guestUser),
    ).toThrow(ForbiddenException);
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

  it('adminModerate throws NotFoundException for malformed ObjectId', async () => {
    await expect(service.adminModerate('not-an-id', 'HIDE')).rejects.toThrow(NotFoundException);
    expect(mockItineraryModel.findById).not.toHaveBeenCalled();
  });

  it('publicSearch and listMine clamp invalid/negative/NaN pagination safely', async () => {
    const res = await service.publicSearch({ page: Number.NaN, limit: -10, country: ['US'] as any });
    expect(res.page).toBe(1);
    expect(res.limit).toBe(1);

    const mine = await service.listMine(user, -5, 999);
    expect(mine.page).toBe(1);
    expect(mine.limit).toBe(50);
  });

  it('addActivityImage rejects spoofed non-image bytes and deletes uploaded file on 404/failure', async () => {
    mkdirSync(ITINERARY_UPLOADS_DIR, { recursive: true });
    const fakeFilename = `fake-${Date.now()}.png`;
    const fakePath = join(ITINERARY_UPLOADS_DIR, fakeFilename);
    writeFileSync(fakePath, '<script>alert(1)</script>');
    createdTempFiles.push(fakePath);

    const fakeFile: any = {
      filename: fakeFilename,
      path: fakePath,
      destination: ITINERARY_UPLOADS_DIR,
    };

    await expect(service.addActivityImage(new Types.ObjectId().toString(), fakeFile, user)).rejects.toThrow(
      BadRequestException,
    );
    expect(existsSync(fakePath)).toBe(false);

    // Valid PNG magic bytes, but nonexistent activity -> 404 and file cleaned up
    const orphanFilename = `orphan-${Date.now()}.png`;
    const orphanPath = join(ITINERARY_UPLOADS_DIR, orphanFilename);
    writeFileSync(orphanPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    createdTempFiles.push(orphanPath);

    await expect(
      service.addActivityImage(
        new Types.ObjectId().toString(),
        { filename: orphanFilename, path: orphanPath, destination: ITINERARY_UPLOADS_DIR } as any,
        user,
      ),
    ).rejects.toThrow(NotFoundException);
    expect(existsSync(orphanPath)).toBe(false);
    expect(uploadsService).toBeDefined();
  });

  it('clone copies activity image files so deleting clone image preserves original author file', async () => {
    mkdirSync(ITINERARY_UPLOADS_DIR, { recursive: true });
    const origFilename = `orig-${Date.now()}.png`;
    const origPath = join(ITINERARY_UPLOADS_DIR, origFilename);
    writeFileSync(origPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    createdTempFiles.push(origPath);

    const srcDoc = new LocalItineraryModel({
      ownerId: new Types.ObjectId(userId),
      title: 'Public Photo Trip',
      country: 'France',
      startDate: new Date('2026-06-01'),
      visibility: 'public',
      days: [
        {
          dayNumber: 1,
          date: new Date('2026-06-01'),
          city: 'Paris',
          activities: [
            { title: 'Museum', images: [{ url: `/uploads/itineraries/${origFilename}`, filename: origFilename }] },
          ],
          budgets: [],
        },
      ],
    });

    let clonedDoc: any;
    mockItineraryModel.findById.mockResolvedValueOnce(srcDoc);
    mockItineraryModel.create.mockImplementationOnce(async (data: any) => {
      clonedDoc = new LocalItineraryModel(data);
      clonedDoc.save = jest.fn().mockResolvedValue(clonedDoc);
      return clonedDoc;
    });
    mockItineraryModel.findOne.mockImplementationOnce(async () => clonedDoc);

    const clone: any = await service.clone(srcDoc._id.toString(), otherUser);
    const clonedImg = clone.days[0].activities[0].images[0];
    expect(clonedImg.filename).not.toBe(origFilename);
    const clonedPath = join(ITINERARY_UPLOADS_DIR, clonedImg.filename);
    createdTempFiles.push(clonedPath);
    expect(existsSync(clonedPath)).toBe(true);

    // Other user deletes image from THEIR clone -> clone copy removed, original author's file intact!
    await service.removeActivityImage(
      String(clone.days[0].activities[0]._id),
      String(clonedImg._id),
      otherUser,
    );
    expect(existsSync(clonedPath)).toBe(false);
    expect(existsSync(origPath)).toBe(true);
  });

  it('removeActivity, removeDay, and remove unlink associated activity image files', async () => {
    mkdirSync(ITINERARY_UPLOADS_DIR, { recursive: true });
    const f1 = `del-act-${Date.now()}.png`;
    const f2 = `del-day-${Date.now()}.png`;
    const f3 = `del-it-${Date.now()}.png`;
    for (const f of [f1, f2, f3]) {
      const p = join(ITINERARY_UPLOADS_DIR, f);
      writeFileSync(p, 'png');
      createdTempFiles.push(p);
    }

    const doc = new LocalItineraryModel({
      ownerId: new Types.ObjectId(userId),
      title: 'Cleanup Trip',
      country: 'IT',
      startDate: new Date('2026-07-01'),
      days: [
        { dayNumber: 1, date: new Date('2026-07-01'), city: 'Rome', activities: [{ title: 'A1', images: [{ url: `/uploads/itineraries/${f1}`, filename: f1 }] }], budgets: [] },
        { dayNumber: 2, date: new Date('2026-07-02'), city: 'Milan', activities: [{ title: 'A2', images: [{ url: `/uploads/itineraries/${f2}`, filename: f2 }] }], budgets: [] },
        { dayNumber: 3, date: new Date('2026-07-03'), city: 'Venice', activities: [{ title: 'A3', images: [{ url: `/uploads/itineraries/${f3}`, filename: f3 }] }], budgets: [] },
      ],
    });
    doc.save = jest.fn().mockResolvedValue(doc) as any;
    doc.deleteOne = jest.fn().mockResolvedValue({ deletedCount: 1 }) as any;
    mockItineraryModel.findById.mockResolvedValue(doc);
    mockItineraryModel.findOne.mockResolvedValue(doc);

    await service.removeActivity(String((doc as any).days[0].activities[0]._id), user);
    await service.removeDay(doc._id.toString(), String((doc as any).days[1]._id), user);
    await service.remove(doc._id.toString(), user);

    expect(existsSync(join(ITINERARY_UPLOADS_DIR, f1))).toBe(false);
    expect(existsSync(join(ITINERARY_UPLOADS_DIR, f2))).toBe(false);
    expect(existsSync(join(ITINERARY_UPLOADS_DIR, f3))).toBe(false);
  });
});
