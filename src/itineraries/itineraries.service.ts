import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { Itinerary } from './schemas/itinerary.schema';
import { FxService } from './fx.service';
import * as D from './dto/itinerary.dto';
import type { AuthUser } from '../common/auth-user';

const addDays = (d: Date, n: number) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };

@Injectable()
export class ItinerariesService {
  constructor(@InjectModel(Itinerary.name) private model: Model<Itinerary>, private fx: FxService) {}

  // ---------- helpers ----------
  /** Array order is the source of truth. Re-number + re-date every day (ITN-05/07/08). */
  private recompute(it: any) {
    it.days.forEach((d: any, i: number) => { d.dayNumber = i + 1; d.date = addDays(it.startDate, i); });
  }

  async getOwned(id: string, user: AuthUser): Promise<any> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Itinerary not found');
    const it = await this.model.findById(id);
    if (!it) throw new NotFoundException('Itinerary not found');
    if (String(it.ownerId) !== user.id) throw new ForbiddenException('Not your itinerary');
    return it;
  }

  /** Finds the itinerary containing a given activity/budget id, then checks ownership. */
  private async findByChild(path: 'activities' | 'budgets', childId: string, user: AuthUser) {
    if (!Types.ObjectId.isValid(childId)) throw new NotFoundException('Not found');
    const it: any = await this.model.findOne({ [`days.${path}._id`]: childId });
    if (!it) throw new NotFoundException('Not found');
    if (String(it.ownerId) !== user.id) throw new ForbiddenException('Not your itinerary');
    for (const day of it.days) {
      const child = day[path].id(childId);
      if (child) return { it, day, child };
    }
    throw new NotFoundException('Not found');
  }

  // ---------- itinerary CRUD ----------
  create(dto: D.CreateItineraryDto, user: AuthUser) {
    return this.model.create({ ...dto, startDate: new Date(dto.startDate), ownerId: user.id });
  }

  async listMine(user: AuthUser, page = 1, limit = 10) {
    const filter = { ownerId: user.id };
    const [items, total] = await Promise.all([
      this.model.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).select('-days.activities.images'),
      this.model.countDocuments(filter),
    ]);
    return { items, total, page, limit };
  }

  getOne(id: string, user: AuthUser) { return this.getOwned(id, user); }

  async update(id: string, dto: D.UpdateItineraryDto, user: AuthUser) {
    const it = await this.getOwned(id, user);
    if (dto.title !== undefined) it.title = dto.title;
    if (dto.country !== undefined) it.country = dto.country;
    if (dto.visibility !== undefined) it.visibility = dto.visibility;
    if (dto.startDate !== undefined) { it.startDate = new Date(dto.startDate); this.recompute(it); }  // dates shift
    return it.save();
  }

  async remove(id: string, user: AuthUser) {
    const it = await this.getOwned(id, user);
    await it.deleteOne();
    return { deleted: true };
  }

  // ---------- days ----------
  async addDay(id: string, dto: D.CreateDayDto, user: AuthUser) {
    const it = await this.getOwned(id, user);
    const day = { city: dto.city, dayNumber: 0, date: it.startDate, activities: [], budgets: [] };
    const idx = dto.position ? Math.min(dto.position - 1, it.days.length) : it.days.length;
    it.days.splice(idx, 0, day as any);
    this.recompute(it);
    return it.save();
  }

  async updateDay(id: string, dayId: string, dto: D.UpdateDayDto, user: AuthUser) {
    const it = await this.getOwned(id, user);
    const day = it.days.id(dayId);
    if (!day) throw new NotFoundException('Day not found');
    if (dto.city) day.city = dto.city;
    return it.save();
  }

  async removeDay(id: string, dayId: string, user: AuthUser) {
    const it = await this.getOwned(id, user);
    const day = it.days.id(dayId);
    if (!day) throw new NotFoundException('Day not found');
    day.deleteOne();
    this.recompute(it);
    return it.save();
  }

  async reorderDays(id: string, dto: D.ReorderDaysDto, user: AuthUser) {
    const it = await this.getOwned(id, user);
    const current = it.days.map((d: any) => String(d._id)).sort();
    const incoming = [...dto.dayIds].sort();
    if (current.length !== incoming.length || current.some((v: string, i: number) => v !== incoming[i]))
      throw new BadRequestException('dayIds must contain every day of the itinerary exactly once');
    const byId = new Map(it.days.map((d: any) => [String(d._id), d]));
    it.days = dto.dayIds.map(x => byId.get(x)) as any;
    this.recompute(it);
    return it.save();
  }

  // ---------- activities ----------
  async addActivity(id: string, dayId: string, dto: D.ActivityDto, user: AuthUser) {
    const it = await this.getOwned(id, user);
    const day = it.days.id(dayId);
    if (!day) throw new NotFoundException('Day not found');
    day.activities.push(dto);
    await it.save();
    return day.activities[day.activities.length - 1];
  }
  async updateActivity(actId: string, dto: D.UpdateActivityDto, user: AuthUser) {
    const { it, child } = await this.findByChild('activities', actId, user);
    Object.assign(child, dto);
    await it.save(); return child;
  }
  async removeActivity(actId: string, user: AuthUser) {
    const { it, child } = await this.findByChild('activities', actId, user);
    child.deleteOne(); await it.save(); return { deleted: true };
  }
  async addActivityImage(actId: string, file: Express.Multer.File, user: AuthUser) {
    const { it, child } = await this.findByChild('activities', actId, user);
    child.images.push({ url: `/uploads/${file.filename}`, filename: file.filename });
    await it.save(); return child;
  }
  async removeActivityImage(actId: string, imageId: string, user: AuthUser) {
    const { it, child } = await this.findByChild('activities', actId, user);
    const img = child.images.id(imageId);
    if (!img) throw new NotFoundException('Image not found');
    if (img.filename) {
      const filepath = join(process.cwd(), 'uploads', img.filename);
      if (existsSync(filepath)) {
        try { unlinkSync(filepath); } catch { /* ignore */ }
      }
    }
    img.deleteOne(); await it.save(); return { deleted: true };
  }

  // ---------- budgets ----------
  async addBudget(id: string, dayId: string, dto: D.BudgetDto, user: AuthUser) {
    this.fx.assertCode(dto.currency.toUpperCase());
    const it = await this.getOwned(id, user);
    const day = it.days.id(dayId);
    if (!day) throw new NotFoundException('Day not found');
    day.budgets.push({ ...dto, currency: dto.currency.toUpperCase() });
    await it.save();
    return day.budgets[day.budgets.length - 1];
  }
  async updateBudget(budgetId: string, dto: D.UpdateBudgetDto, user: AuthUser) {
    if (dto.currency) { dto.currency = dto.currency.toUpperCase(); this.fx.assertCode(dto.currency); }
    const { it, child } = await this.findByChild('budgets', budgetId, user);
    Object.assign(child, dto); await it.save(); return child;
  }
  async removeBudget(budgetId: string, user: AuthUser) {
    const { it, child } = await this.findByChild('budgets', budgetId, user);
    child.deleteOne(); await it.save(); return { deleted: true };
  }

  // ---------- transport costs ----------
  async addTransport(id: string, dto: D.TransportCostDto, user: AuthUser) {
    this.fx.assertCode(dto.currency.toUpperCase());
    const it = await this.getOwned(id, user);
    it.transportCosts.push({ ...dto, currency: dto.currency.toUpperCase() });
    await it.save(); return it.transportCosts[it.transportCosts.length - 1];
  }
  private async findTransport(tid: string, user: AuthUser) {
    if (!Types.ObjectId.isValid(tid)) throw new NotFoundException('Transport cost not found');
    const it: any = await this.model.findOne({ 'transportCosts._id': tid });
    if (!it) throw new NotFoundException('Transport cost not found');
    if (String(it.ownerId) !== user.id) throw new ForbiddenException('Not your itinerary');
    return { it, tc: it.transportCosts.id(tid) };
  }
  async updateTransport(tid: string, dto: D.UpdateTransportCostDto, user: AuthUser) {
    if (dto.currency) { dto.currency = dto.currency.toUpperCase(); this.fx.assertCode(dto.currency); }
    const { it, tc } = await this.findTransport(tid, user);
    Object.assign(tc, dto); await it.save(); return tc;
  }
  async removeTransport(tid: string, user: AuthUser) {
    const { it, tc } = await this.findTransport(tid, user);
    tc.deleteOne(); await it.save(); return { deleted: true };
  }

  // ---------- budget summary with currency conversion (ITN-14, ITN-18) ----------
  async budgetSummary(id: string, currency: string, user: AuthUser) {
    const it = await this.getOwned(id, user);
    return this.summarize(it, currency.toUpperCase());
  }

  private async summarize(it: any, target: string) {
    this.fx.assertCode(target);
    const byCategory: Record<string, number> = { food: 0, accommodation: 0, local_transport: 0, activities: 0 };
    const byCity: Record<string, number> = {};
    for (const day of it.days) {
      for (const b of day.budgets) {
        const v = await this.fx.convert(b.amount, b.currency, target);
        byCategory[b.category] += v;
        byCity[day.city] = (byCity[day.city] ?? 0) + v;
      }
    }
    let intercity = 0;
    for (const t of it.transportCosts) intercity += await this.fx.convert(t.amount, t.currency, target);
    const round = (n: number) => Math.round(n * 100) / 100;
    const dailyTotal = Object.values(byCategory).reduce((a, b) => a + b, 0);
    return {
      currency: target,
      byCategory: Object.fromEntries(Object.entries(byCategory).map(([k, v]) => [k, round(v)])),
      byCity: Object.fromEntries(Object.entries(byCity).map(([k, v]) => [k, round(v)])),
      intercityTransport: round(intercity),
      grandTotal: round(dailyTotal + intercity),
    };
  }

  // ---------- public + clone (ITN-20, ITN-21) ----------
  async publicSearch(q: { q?: string; country?: string; page?: number; limit?: number; sort?: string }) {
    const page = Math.max(1, +(q.page ?? 1)); const limit = Math.min(50, +(q.limit ?? 10));
    const filter: any = { visibility: 'public', isHidden: { $ne: true }, ownerDeactivated: { $ne: true } };
    if (q.country) filter.country = new RegExp(`^${q.country.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    if (q.q) filter.$text = { $search: q.q };
    const sort: any = q.sort === 'oldest' ? { createdAt: 1 } : { createdAt: -1 };
    const [items, total] = await Promise.all([
      this.model.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).select('title country startDate ownerId createdAt'),
      this.model.countDocuments(filter),
    ]);
    return { items, total, page, limit };
  }

  async getPublic(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Public itinerary not found');
    const it = await this.model.findOne({ _id: id, visibility: 'public', isHidden: { $ne: true }, ownerDeactivated: { $ne: true } });
    if (!it) throw new NotFoundException('Public itinerary not found');
    return it;
  }

  async clone(id: string, user: AuthUser) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Public itinerary not found');
    const src: any = await this.model.findById(id);
    const isOwner = !!src && String(src.ownerId) === user.id;
    const visible = !!src && src.visibility === 'public' && !src.isHidden && !src.ownerDeactivated;
    if (!src || (!visible && !isOwner)) throw new NotFoundException('Public itinerary not found');
    const plain = JSON.parse(JSON.stringify(src.toObject()));
    const strip = (o: any) => {            // drop every _id so Mongoose generates fresh ones
      if (Array.isArray(o)) o.forEach(strip);
      else if (o && typeof o === 'object') { delete o._id; Object.values(o).forEach(strip); }
    };
    strip(plain);
    delete plain.createdAt; delete plain.updatedAt; delete plain.__v;
    return this.model.create({
      ...plain, ownerId: user.id, visibility: 'private', isHidden: false, ownerDeactivated: false,
      title: plain.title, startDate: new Date(plain.startDate),
      clonedFrom: { itineraryId: src._id, originalTitle: src.title, authorId: src.ownerId },
    });
  }

  // ---------- hooks for OTHER modules ----------
  /** Admin module calls this for GEN-10 (HIDE or DELETE). The admin module records the audit log entry. */
  async adminModerate(id: string, action: 'HIDE' | 'DELETE') {
    const it = await this.model.findById(id);
    if (!it) throw new NotFoundException('Itinerary not found');
    if (action === 'DELETE') await it.deleteOne();
    else { it.isHidden = true; await it.save(); }
    return { type: 'itinerary', id, action };
  }

  /** Accounts module calls this when a user deactivates (true) or is reactivated (false), ACC-12. */
  setOwnerDeactivated(userId: string, deactivated: boolean) {
    return this.model.updateMany({ ownerId: userId }, { ownerDeactivated: deactivated });
  }
}
