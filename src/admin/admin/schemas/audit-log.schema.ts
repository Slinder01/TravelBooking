import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type AuditLogDocument = HydratedDocument<AuditLog>;

@Schema({ timestamps: { createdAt: true, updatedAt: false }, versionKey: false })
export class AuditLog {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  actorUserId: Types.ObjectId;

  @Prop({ required: true, trim: true, index: true })
  action: string;

  @Prop({ required: true, trim: true, index: true })
  targetType: string;

  @Prop({ required: true, trim: true, index: true })
  targetId: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata: Record<string, unknown>;

  createdAt: Date;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ createdAt: -1, _id: -1 });
