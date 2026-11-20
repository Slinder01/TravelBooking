import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { QueryPostsDto } from './dtos/query-post.dto';
import { Post, PostStatus } from './schemas/post.schema';

// TODO: fix this import path/name to match the real User schema
import { User } from '../users/schemas/user.schema';

const EXCERPT_LENGTH = 200;

@Injectable()
export class AuthorsService {
  constructor(
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  // BLG-12: public author page
  async findOne(id: string, query: QueryPostsDto) {
    if (!isValidObjectId(id)) throw new NotFoundException('Author not found');

    // TODO: adjust selected fields to match user.schema.ts (name, createdAt)
    const user = await this.userModel.findById(id).select('name createdAt').lean<any>();
    if (!user) throw new NotFoundException('Author not found');

    const { page = 1, limit = 10 } = query;
    const filter = {
      author: new Types.ObjectId(id),
      status: PostStatus.PUBLISHED,
      isHidden: false,
    };

    const [posts, total] = await Promise.all([
      this.postModel
        .find(filter)
        .sort({ publishedAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('title body tags publishedAt likeCount commentCount images')
        .lean(),
      this.postModel.countDocuments(filter),
    ]);

    return {
      author: { id: user._id, name: user.name, joinedAt: user.createdAt },
      posts: {
        data: posts.map(({ body, images, ...p }) => ({
          ...p,
          excerpt: body.slice(0, EXCERPT_LENGTH),
          coverImage: images?.[0]?.url,
        })),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      // TODO (Part 4, ITN-20): replace with the itineraries service call,
      // e.g. await this.itinerariesService.findPublicByAuthor(id)
      publicItineraries: [],
    };
  }
}