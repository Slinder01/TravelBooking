import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type LikeDocument = HydratedDocument<Like>;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class Like {
  @Prop({ type: Types.ObjectId, ref: 'Post', required: true })
  post: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user: Types.ObjectId;

  createdAt?: Date;
}

export const LikeSchema = SchemaFactory.createForClass(Like);

// BLG-06: a user can like a given post at most once.
// The database enforces this even under double-clicks or concurrent requests.
LikeSchema.index({ post: 1, user: 1 }, { unique: true });