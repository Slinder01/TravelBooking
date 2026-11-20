import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { Like } from './schemas/like.schema';
import { Post, PostStatus } from './schemas/post.schema';

@Injectable()
export class LikesService {
  constructor(
    @InjectModel(Like.name) private readonly likeModel: Model<Like>,
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
  ) {}

  // BLG-06: like once (enforced by the unique (post, user) index)
  async like(postId: string, userId: string) {
    const post = await this.findLikeablePost(postId);
    try {
      await this.likeModel.create({
        post: post._id,
        user: new Types.ObjectId(userId),
      });
    } catch (err: any) {
      if (err?.code === 11000) {
        throw new ConflictException('You have already liked this post');
      }
      throw err;
    }
    return this.bumpCount(post._id, 1);
  }

  // BLG-06: remove the like
  async unlike(postId: string, userId: string) {
    const post = await this.findLikeablePost(postId);
    const { deletedCount } = await this.likeModel.deleteOne({
      post: post._id,
      user: new Types.ObjectId(userId),
    });
    if (!deletedCount) throw new NotFoundException('You have not liked this post');
    return this.bumpCount(post._id, -1);
  }

  private async findLikeablePost(postId: string) {
    if (!isValidObjectId(postId)) throw new NotFoundException('Post not found');
    const post = await this.postModel.findOne({
      _id: postId,
      status: PostStatus.PUBLISHED,
      isHidden: false,
    });
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  private async bumpCount(postId: Types.ObjectId, delta: 1 | -1) {
    const updated = await this.postModel.findByIdAndUpdate(
      postId,
      { $inc: { likeCount: delta } },
      { new: true },
    );
    return { likeCount: updated?.likeCount ?? 0 };
  }
}