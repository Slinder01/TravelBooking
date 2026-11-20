import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { UserRole } from '../users-role.enum';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
  createdAt: Date;
  updatedAt: Date;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  })
  email: string;

  @Prop({ required: true, select: false })
  password: string;

  @Prop({
    type: String,
    enum: UserRole,
    default: UserRole.REGISTERED_USER,
  })
  role: UserRole;

  
  @Prop({ required: true })
  termsAccepted: boolean;

  @Prop({ required: true })
  termsAcceptedAt: Date;

  
  @Prop()
  phone?: string;

  @Prop({ default: 'USD' })
  preferredCurrency: string;
  
  @Prop({ default: 0 })
  failedLoginAttempts: number;

  @Prop({ type: Date, default: null })
  lockUntil: Date | null;

  @Prop({ default: false })
  isSuspended: boolean;
  
  @Prop({ default: false })
  isDeactivated: boolean;
  
  @Prop({ default: false })
  mustChangePassword: boolean;

  @Prop({ type: Types.ObjectId, ref: 'Airline' })
  airlineId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Hotel' })
  hotelId?: Types.ObjectId;

 @Prop({ type: String, default: null, select: false })
refreshTokenHash: string | null;

 

@Prop({ type: Date, default: null })
lastActivityAt: Date | null;
}

export const UserSchema = SchemaFactory.createForClass(User);
