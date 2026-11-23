import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Schema({ timestamps: { createdAt: 'acceptedAt', updatedAt: false } })
export class PolicyAcceptance {
  @Prop({ type: Types.ObjectId, required: true }) userId: Types.ObjectId;
  @Prop({ enum: ['flight', 'hotel'], required: true }) bookingType: string;
  @Prop({ type: Types.ObjectId, required: true }) bookingId: Types.ObjectId;
  @Prop({ type: Object }) policySnapshot: any;
  acceptedAt: Date;
}
export const PolicyAcceptanceSchema = SchemaFactory.createForClass(PolicyAcceptance);
PolicyAcceptanceSchema.index({ bookingType: 1, bookingId: 1, userId: 1 }, { unique: true });
