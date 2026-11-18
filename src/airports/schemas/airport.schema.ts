import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AirportDocument = HydratedDocument<Airport>;

@Schema({ timestamps: true })
export class Airport {
  createdAt: Date;
  updatedAt: Date;

  @Prop({
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    minlength: 3,
    maxlength: 3,
  })
  iataCode: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true })
  city: string;

  @Prop({ trim: true, default: null })
  cityId?: string;

  @Prop({ required: true, trim: true })
  country: string;

  @Prop({ trim: true, uppercase: true, default: null })
  countryCode?: string;

  @Prop({ required: true, trim: true })
  timeZone: string;
}

export const AirportSchema = SchemaFactory.createForClass(Airport);

// Create compound and text indexes for fast search
AirportSchema.index({ city: 1, country: 1 });
AirportSchema.index({ name: 'text', city: 'text', iataCode: 'text' });
