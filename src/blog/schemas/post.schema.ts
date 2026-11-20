import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PostDocument = HydratedDocument<Post>;

export enum PostStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
}

// Embedded sub-document: images belong only to their post (GEN-08, BLG-10).
// Each image gets its own _id so DELETE /posts/:id/images/:imageId works.
@Schema()
export class PostImage {
  _id?: Types.ObjectId;

  @Prop({ required: true })
  url: string; // e.g. /uploads/posts/abc123.jpg

  @Prop({ required: true })
  filename: string; // stored file name, needed to delete the file from disk
}
export const PostImageSchema = SchemaFactory.createForClass(PostImage);

@Schema({ timestamps: true })
export class Post {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  author: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 150 })
  title: string;

  @Prop({ required: true, trim: true })
  body: string;

  // BLG-08: max 5 tags, max 30 chars each (enforced again in the DTO/service).
  // Stored lowercase and trimmed so tag search and filtering are consistent.
  @Prop({
    type: [String],
    default: [],
    validate: [
      (tags: string[]) => tags.length <= 5,
      'A post can have at most 5 tags',
    ],
  })
  tags: string[];

  // BLG-10 / GEN-08: max 5 images per post
  @Prop({
    type: [PostImageSchema],
    default: [],
    validate: [
      (imgs: PostImage[]) => imgs.length <= 5,
      'A post can have at most 5 images',
    ],
  })
  images: PostImage[];

  @Prop({ enum: PostStatus, default: PostStatus.DRAFT, index: true })
  status: PostStatus;

  // GEN-10: hidden content is visible only to its author and admins
  @Prop({ default: false, index: true })
  isHidden: boolean;

  // Denormalised counters, updated with $inc.
  // Used for BLG-09 ranking (likeCount + commentCount) and BLG-03 listing.
  @Prop({ default: 0, min: 0 })
  likeCount: number;

  @Prop({ default: 0, min: 0 })
  commentCount: number;

  // Set when the post is first published; used for ordering and tie-breaking
  @Prop()
  publishedAt?: Date;

  // Added by { timestamps: true }
  createdAt?: Date;
  updatedAt?: Date;
}

export const PostSchema = SchemaFactory.createForClass(Post);

// Public listing / tag filter: published, visible posts, newest first
PostSchema.index({ status: 1, isHidden: 1, publishedAt: -1 });
// BLG-08: clicking a tag lists matching posts
PostSchema.index({ tags: 1 });
// BLG-03: "my posts" listing
PostSchema.index({ author: 1, createdAt: -1 });