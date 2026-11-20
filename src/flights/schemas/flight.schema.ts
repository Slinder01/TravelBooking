import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type FlightDocument = HydratedDocument<Flight>;

export enum FlightStatus {
  SCHEDULED = 'Scheduled',
  CANCELLED = 'Cancelled',
  DEPARTED = 'Departed',
}

export enum CabinClass {
  ECONOMY = 'Economy',
  PREMIUM_ECONOMY = 'Premium Economy',
  BUSINESS = 'Business',
  FIRST = 'First',
}

@Schema({ _id: false })
export class CabinInventory {
  @Prop({ type: String, enum: CabinClass, required: true })
  cabinClass: CabinClass;

  @Prop({ type: Number, required: true, min: 1 })
  seatCount: number;

  @Prop({ type: Number, required: true, min: 0.01 })
  price: number;

  @Prop({ type: Number, required: true, default: 1, min: 0 })
  freeBaggageBags: number;

  @Prop({ type: Number, required: true, default: 23, min: 1 })
  baggageMaxWeightKg: number;

  @Prop({ type: Number, default: 0, min: 0 })
  bookedSeats: number;

  @Prop({ type: Number, default: 0, min: 0 })
  heldSeats: number;
}
export const CabinInventorySchema = SchemaFactory.createForClass(CabinInventory);

@Schema({ timestamps: true })
export class Flight {
  createdAt: Date;
  updatedAt: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Airline', required: true, index: true })
  airlineId: Types.ObjectId;

  @Prop({ required: true, uppercase: true, trim: true })
  flightNumber: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Airport', required: true })
  departureAirportId: Types.ObjectId;

  @Prop({ required: true, uppercase: true, minlength: 3, maxlength: 3, index: true })
  departureAirportIata: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Airport', required: true })
  arrivalAirportId: Types.ObjectId;

  @Prop({ required: true, uppercase: true, minlength: 3, maxlength: 3, index: true })
  arrivalAirportIata: string;

  // Stored strictly in UTC (FLT-03)
  @Prop({ type: Date, required: true, index: true })
  departureTimeUtc: Date;

  @Prop({ type: Date, required: true })
  arrivalTimeUtc: Date;

  // Stored in departure/arrival airport's local times (GEN-06)
  @Prop({ required: true })
  departureTimeLocal: string;

  @Prop({ required: true })
  arrivalTimeLocal: string;

  // Local departure calendar date (YYYY-MM-DD) for FLT-03 duplicate rule & FLT-11 search
  @Prop({ required: true, index: true })
  departureDateLocal: string;

  @Prop({ type: [CabinInventorySchema], required: true, default: [] })
  cabins: CabinInventory[];

  @Prop({
    type: String,
    enum: FlightStatus,
    default: FlightStatus.SCHEDULED,
    index: true,
  })
  status: FlightStatus;
}

export const FlightSchema = SchemaFactory.createForClass(Flight);

// Compound unique index enforcing FLT-03: No duplicate flight number for the same airline on the same departure date
FlightSchema.index(
  { airlineId: 1, flightNumber: 1, departureDateLocal: 1 },
  { unique: true },
);

// Compound index for fast FLT-11 search by route, local date, and status
FlightSchema.index({
  departureAirportIata: 1,
  arrivalAirportIata: 1,
  departureDateLocal: 1,
  status: 1,
});
