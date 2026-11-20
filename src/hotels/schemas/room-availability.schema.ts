import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type RoomAvailabilityDocument = HydratedDocument<RoomAvailability>;

@Schema({ timestamps: true })
export class RoomAvailability {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Hotel', required: true })
  hotelId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Room', required: true })
  roomId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  date: Date;

  @Prop({ required: true, min: 0 })
  availableCount: number;

  @Prop({ required: true, min: 0 })
  price: number;

  @Prop({ default: false })
  isBlocked: boolean;
}

export const RoomAvailabilitySchema = SchemaFactory.createForClass(RoomAvailability);