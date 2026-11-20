import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CommentDocument = HydratedDocument<Comment>;

@Schema({ timestamps: true })
export class Comment {
  @Prop({ type: Types.ObjectId, ref: 'Post', required: true })
  post: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  author: Types.ObjectId;

  // BLG-05: non-empty, max 500 characters
  @Prop({ required: true, trim: true, minlength: 1, maxlength: 500 })
  content: string;

  // GEN-10: hidden content is visible only to its author and admins
  @Prop({ default: false })
  isHidden: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const CommentSchema = SchemaFactory.createForClass(Comment);

// BLG-05: comments of a post in chronological order
CommentSchema.index({ post: 1, createdAt: 1 });