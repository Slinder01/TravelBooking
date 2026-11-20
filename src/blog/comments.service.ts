import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { CreateCommentDto } from './dtos/create-comment.dto';
import { UpdateCommentDto } from './dtos/update-comment.dto';
import { Comment } from './schemas/comment.schema';
import { Post, PostStatus } from './schemas/post.schema';

@Injectable()
export class CommentsService {
  constructor(
    @InjectModel(Comment.name) private readonly commentModel: Model<Comment>,
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
  ) {}

  // BLG-05: only on published, visible posts
  async create(postId: string, userId: string, dto: CreateCommentDto) {
    if (!isValidObjectId(postId)) throw new NotFoundException('Post not found');
    const post = await this.postModel.findOne({
      _id: postId,
      status: PostStatus.PUBLISHED,
      isHidden: false,
    });
    if (!post) throw new NotFoundException('Post not found');

    const comment = await this.commentModel.create({
      post: post._id,
      author: new Types.ObjectId(userId),
      content: dto.content,
    });
    await this.postModel.updateOne({ _id: post._id }, { $inc: { commentCount: 1 } });
    return comment;
  }

  // BLG-07
  async update(id: string, userId: string, dto: UpdateCommentDto) {
    const comment = await this.getOwned(id, userId);
    comment.content = dto.content;
    return comment.save();
  }

  // BLG-07
  async remove(id: string, userId: string) {
    const comment = await this.getOwned(id, userId);
    await comment.deleteOne();
    await this.postModel.updateOne(
      { _id: comment.post, commentCount: { $gt: 0 } },
      { $inc: { commentCount: -1 } },
    );
    return { message: 'Comment deleted successfully' };
  }

  async adminRemove(id: string) {
    if (!isValidObjectId(id)) throw new NotFoundException('Comment not found');
    const comment = await this.commentModel.findById(id);
    if (!comment) throw new NotFoundException('Comment not found');
    await comment.deleteOne();
    await this.postModel.updateOne(
      { _id: comment.post, commentCount: { $gt: 0 } },
      { $inc: { commentCount: -1 } },
    );
    return { message: 'Comment deleted successfully' };
  }

  private async getOwned(id: string, userId: string) {
    if (!isValidObjectId(id)) throw new NotFoundException('Comment not found');
    const comment = await this.commentModel.findById(id);
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.author.toString() !== userId) {
      throw new ForbiddenException('You can only modify your own comments');
    }
    return comment;
  }
}
