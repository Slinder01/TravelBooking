import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type HotelDocument = HydratedDocument<Hotel>;

@Schema({ timestamps: true })
export class Hotel {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true })
  description: string;

  @Prop({ required: true, trim: true })
  city: string;

  @Prop({ required: true, trim: true })
  country: string;

  @Prop({ required: true, trim: true })
  address: string;

  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop({ required: true })
  checkInTime: string;

  @Prop({ required: true })
  checkOutTime: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  moderatorId: MongooseSchema.Types.ObjectId;

  @Prop({ default: true })
  isActive: boolean;
}

export const HotelSchema = SchemaFactory.createForClass(Hotel);