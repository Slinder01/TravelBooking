import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema';

@Injectable()
export class AuditLogService {
  constructor(
    @InjectModel(AuditLog.name) private readonly auditLogModel: Model<AuditLogDocument>,
  ) {}

  record(input: {
    actorUserId: string;
    action: string;
    targetType: string;
    targetId: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.auditLogModel.create({
      ...input,
      actorUserId: new Types.ObjectId(input.actorUserId),
      metadata: input.metadata ?? {},
    });
  }

  async list(query: { page: number; limit: number; action?: string; targetType?: string }) {
    const filter: Record<string, unknown> = {};
    if (query.action) filter.action = query.action;
    if (query.targetType) filter.targetType = query.targetType;
    const [items, total] = await Promise.all([
      this.auditLogModel.find(filter)
        .populate('actorUserId', 'name email role')
        .sort({ createdAt: -1, _id: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean()
        .exec(),
      this.auditLogModel.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }
}
