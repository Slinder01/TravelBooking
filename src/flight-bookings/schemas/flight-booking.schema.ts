import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { CabinClass } from '../../flights/schemas/flight.schema';

export type FlightBookingDocument = HydratedDocument<FlightBooking>;

export enum FlightBookingStatus {
  HELD = 'HELD',
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

@Schema({ _id: false })
export class Passenger {
  @Prop({ required: true, trim: true })
  firstName: string;

  @Prop({ required: true, trim: true })
  lastName: string;

  @Prop({ required: true, trim: true, uppercase: true })
  passportNumber: string;

  @Prop({ required: true })
  dateOfBirth: string;

  @Prop({ trim: true })
  nationality?: string;
}
export const PassengerSchema = SchemaFactory.createForClass(Passenger);

@Schema({ _id: false })
export class BookingPolicySnapshot {
  @Prop({ type: Number, required: true, min: 0 })
  cabinBagAllowanceKg: number;

  @Prop({ type: Number, required: true, min: 0 })
  checkedBagAllowanceKg: number;

  @Prop({ type: Number, required: true, min: 0 })
  excessBagFeePerKg: number;

  @Prop({ type: Number, required: true, min: 0 })
  freeCancellationHours: number;

  @Prop({ type: Number, required: true, min: 0, max: 100 })
  refundPercentage: number;

  @Prop({ type: Date })
  acceptedAt?: Date;
}
export const BookingPolicySnapshotSchema = SchemaFactory.createForClass(
  BookingPolicySnapshot,
);

@Schema({ _id: false })
export class PriceBreakdown {
  @Prop({ type: Number, required: true, min: 0 })
  baseFarePerPassenger: number;

  @Prop({ type: Number, required: true, min: 1, max: 9 })
  passengerCount: number;

  @Prop({ type: Number, required: true, min: 0 })
  baseTotal: number;

  @Prop({ type: Number, default: 0, min: 0 })
  extraBaggageKg: number;

  @Prop({ type: Number, default: 0, min: 0 })
  extraBaggageFee: number;

  @Prop({ type: Number, required: true, min: 0 })
  totalPrice: number;

  @Prop({ default: 'USD' })
  currency: string;
}
export const PriceBreakdownSchema = SchemaFactory.createForClass(PriceBreakdown);

@Schema({ timestamps: true })
export class FlightBooking {
  createdAt: Date;
  updatedAt: Date;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Flight',
    required: true,
    index: true,
  })
  flightId: Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Flight',
  })
  returnFlightId?: Types.ObjectId;

  @Prop({ type: String, enum: CabinClass, required: true })
  cabinClass: CabinClass;

  @Prop({ type: String, enum: CabinClass })
  returnCabinClass?: CabinClass;

  @Prop({ type: Number, required: true, min: 1, max: 9 })
  passengerCount: number;

  @Prop({ type: [PassengerSchema], default: [] })
  passengers: Passenger[];

  @Prop({ type: Number, default: 0, min: 0 })
  extraBaggageKg: number;

  @Prop({ type: PriceBreakdownSchema, required: true })
  priceBreakdown: PriceBreakdown;

  @Prop({ type: BookingPolicySnapshotSchema, required: true })
  policySnapshot: BookingPolicySnapshot;

  @Prop({
    type: String,
    enum: FlightBookingStatus,
    default: FlightBookingStatus.HELD,
    index: true,
  })
  status: FlightBookingStatus;

  @Prop({ type: Date, index: true })
  holdExpiresAt?: Date;

  @Prop({ trim: true, uppercase: true })
  bookingReference?: string;

  @Prop({ trim: true, uppercase: true })
  eTicketCode?: string;

  @Prop({ type: Date })
  cancelledAt?: Date;

  @Prop({ type: Number, min: 0 })
  refundAmount?: number;

  @Prop({ trim: true })
  cancellationReason?: string;
}

export const FlightBookingSchema = SchemaFactory.createForClass(FlightBooking);

FlightBookingSchema.index({ userId: 1, status: 1 });
FlightBookingSchema.index({ status: 1, holdExpiresAt: 1 });
FlightBookingSchema.index(
  { bookingReference: 1 },
  { unique: true, sparse: true },
);
FlightBookingSchema.index(
  { eTicketCode: 1 },
  { unique: true, sparse: true },
);
