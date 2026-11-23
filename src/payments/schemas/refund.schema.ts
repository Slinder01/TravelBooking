import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Schema({ timestamps: true })
export class Refund {
  @Prop({ type: Types.ObjectId, ref: 'Payment', required: true }) paymentId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true, index: true }) bookingId: Types.ObjectId;
  @Prop({ enum: ['flight', 'hotel'], required: true }) bookingType: string;
  @Prop({ type: Types.ObjectId, required: true }) userId: Types.ObjectId;
  @Prop({ required: true }) amount: number;
  @Prop({ required: true }) currency: string;
  @Prop({ required: true }) refundPercent: number;
  @Prop({ enum: ['pending', 'succeeded', 'failed', 'not_applicable'], default: 'pending' }) status: string;
  @Prop() stripeRefundId?: string;
  @Prop({ type: Object }) policyApplied?: any;   // snapshot of the tiers used
}
export const RefundSchema = SchemaFactory.createForClass(Refund);
