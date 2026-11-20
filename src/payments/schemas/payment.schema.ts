import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

export type PaymentStatus = 'pending' | 'succeeded' | 'failed';

@Schema({ timestamps: true })
export class Payment {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true }) userId: Types.ObjectId;
  @Prop({ enum: ['flight', 'hotel'], required: true }) bookingType: 'flight' | 'hotel';
  @Prop({ type: Types.ObjectId, required: true, index: true }) bookingId: Types.ObjectId;
  @Prop({ required: true }) amount: number;            // major units
  @Prop({ required: true }) currency: string;          // upper case
  @Prop({ enum: ['pending', 'succeeded', 'failed'], default: 'pending' }) status: PaymentStatus;
  @Prop({ unique: true, sparse: true }) stripePaymentIntentId: string;
  @Prop() failureReason?: string;
  @Prop() paidAt?: Date;
  @Prop({ default: 1 }) attempts: number;
}
export const PaymentSchema = SchemaFactory.createForClass(Payment);
