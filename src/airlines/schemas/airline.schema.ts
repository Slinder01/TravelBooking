import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AirlineDocument = HydratedDocument<Airline>;

@Schema({ _id: false })
export class BaggagePolicy {
  @Prop({ type: Number, default: 7 })
  cabinBagAllowanceKg: number;

  @Prop({ type: Number, default: 23 })
  checkedBagAllowanceKg: number;

  @Prop({ type: Number, default: 20 })
  excessBagFeePerKg: number;
}
export const BaggagePolicySchema = SchemaFactory.createForClass(BaggagePolicy);

@Schema({ _id: false })
export class CancellationPolicy {
  @Prop({ type: Number, default: 24 })
  freeCancellationHours: number;

  @Prop({ type: Number, default: 80 })
  refundPercentage: number;
}
export const CancellationPolicySchema = SchemaFactory.createForClass(CancellationPolicy);

@Schema({ timestamps: true })
export class Airline {
  createdAt: Date;
  updatedAt: Date;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    minlength: 2,
    maxlength: 3,
  })
  iataCode: string;

  @Prop({ required: true, trim: true })
  country: string;

  @Prop({ trim: true, default: null })
  contactEmail?: string;

  @Prop({ trim: true, default: null })
  website?: string;

  @Prop({ type: BaggagePolicySchema, default: () => ({}) })
  baggagePolicy: BaggagePolicy;

  @Prop({ type: CancellationPolicySchema, default: () => ({}) })
  cancellationPolicy: CancellationPolicy;

  @Prop({ default: true })
  isActive: boolean;
}

export const AirlineSchema = SchemaFactory.createForClass(Airline);
