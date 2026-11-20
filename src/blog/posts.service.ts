import { BadRequestException } from '@nestjs/common';
import { UploadsService } from '../uploads/uploads.service';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, PipelineStage, Types } from 'mongoose';
import { CreatePostDto } from './dtos/create-post.dto';
import { QueryPostsDto } from './dtos/query-post.dto';
import { UpdatePostDto } from './dtos/update-post.dto';
import { Comment } from './schemas/comment.schema';
import { Like } from './schemas/like.schema';
import { Post, PostDocument, PostStatus } from './schemas/post.schema';

// The logged-in user (or undefined for guests). Adjust to match your auth payload.
export interface Viewer {
  id: string;
  role: string; // e.g. 'admin' | 'user'
}

const EXCERPT_LENGTH = 200;
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

@Injectable()
export class PostsService {
  constructor(
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    @InjectModel(Comment.name) private readonly commentModel: Model<Comment>,
    @InjectModel(Like.name) private readonly likeModel: Model<Like>,
    private readonly uploads: UploadsService,

  ) {}

    async addImage(id: string, userId: string, file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('An image file is required (field "image")');
    try {
      const post = await this.getOwnedPost(id, userId);
      await this.uploads.assertImageSignature(file);

      const image = {
        _id: new Types.ObjectId(),
        url: `/uploads/posts/${file.filename}`,
        filename: file.filename,
      };
      // Atomic: only pushes if the post has fewer than 5 images (GEN-08)
      const res = await this.postModel.updateOne(
        { _id: post._id, 'images.4': { $exists: false } },
        { $push: { images: image } },
      );
      if (!res.modifiedCount) {
        throw new BadRequestException('A post can have at most 5 images');
      }
      return image;
    } catch (err) {
      await this.uploads.deleteFile('posts', file.filename); // no orphan files
      throw err;
    }
  }

    async removeImage(id: string, imageId: string, userId: string) {
    const post = await this.getOwnedPost(id, userId);
    const image = isValidObjectId(imageId)
      ? post.images.find((i) => i._id?.toString() === imageId)
      : undefined;
    if (!image) throw new NotFoundException('Image not found');

    await this.postModel.updateOne({ _id: post._id }, { $pull: { images: { _id: image._id } } });
    await this.uploads.deleteFile('posts', image.filename);
    return { message: 'Image deleted successfully' };
  }


  // ---------- BLG-01 ----------
  async create(authorId: string, dto: CreatePostDto) {
    const status = dto.status ?? PostStatus.DRAFT;
    return this.postModel.create({
      title: dto.title,
      body: dto.body,
      tags: dto.tags ?? [],
      status,
      author: new Types.ObjectId(authorId),
      publishedAt: status === PostStatus.PUBLISHED ? new Date() : undefined,
    });
  }

  // ---------- BLG-02 / BLG-08 / BLG-09 ----------
  // Public list: published + not hidden. Optional tag filter and keyword search.
  // With a keyword, results are ranked by (likes + comments) desc, newest first.
  async findPublic(query: QueryPostsDto) {
    const { q, tag, page = 1, limit = 10 } = query;

    const match: Record<string, unknown> = {
      status: PostStatus.PUBLISHED,
      isHidden: false,
    };
    if (tag) match.tags = tag;

    const pipeline: PipelineStage[] = [
      { $match: match },
      // NOTE: 'users' is the default collection name for the User model
      {
        $lookup: {
          from: 'users',
          localField: 'author',
          foreignField: '_id',
          as: 'author',
        },
      },
      { $unwind: '$author' },
    ];

    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      // TODO: 'author.name' must match the real field name in user.schema.ts
      pipeline.push({
        $match: { $or: [{ title: rx }, { tags: rx }, { 'author.name': rx }] },
      });
    }

    pipeline.push(
      { $addFields: { interactionScore: { $add: ['$likeCount', '$commentCount'] } } },
      {
        $sort: q
          ? { interactionScore: -1, publishedAt: -1, _id: -1 }
          : { publishedAt: -1, _id: -1 },
      },
      {
        $facet: {
          data: [
            { $skip: (page - 1) * limit },
            { $limit: limit },
            {
              $project: {
                title: 1,
                tags: 1,
                publishedAt: 1,
                likeCount: 1,
                commentCount: 1,
                interactionScore: 1,
                coverImage: { $arrayElemAt: ['$images.url', 0] },
                excerpt: { $substrCP: ['$body', 0, EXCERPT_LENGTH] },
                author: { _id: '$author._id', name: '$author.name' },
              },
            },
          ],
          total: [{ $count: 'count' }],
        },
      },
    );

    const [result] = await this.postModel.aggregate(pipeline);
    const total: number = result.total[0]?.count ?? 0;
    return this.paginated(result.data, total, page, limit);
  }

  // ---------- BLG-03 ----------
  async findMine(userId: string, query: QueryPostsDto) {
    const { page = 1, limit = 10 } = query;
    const filter = { author: new Types.ObjectId(userId) };

    const [data, total] = await Promise.all([
      this.postModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('title status createdAt publishedAt likeCount commentCount isHidden')
        .lean(),
      this.postModel.countDocuments(filter),
    ]);
    return this.paginated(data, total, page, limit);
  }

  // ---------- BLG-02 (post page) ----------
  // Drafts and hidden posts are visible only to their author and admins;
  // everyone else gets 404 so existence is not leaked.
  async findOne(id: string, viewer?: Viewer) {
    this.assertValidId(id);
    const post = await this.postModel
      .findById(id)
      // TODO: adjust the selected fields to match user.schema.ts
      .populate('author', 'name createdAt')
      .lean<any>();
    if (!post) throw new NotFoundException('Post not found');

    const isOwner = !!viewer && post.author._id.toString() === viewer.id;
    const isAdmin = viewer?.role === 'admin';
    const isPubliclyVisible = post.status === PostStatus.PUBLISHED && !post.isHidden;
    if (!isPubliclyVisible && !isOwner && !isAdmin) {
      throw new NotFoundException('Post not found');
    }

    // TODO (comments step): attach comments in chronological order here
    return post;
  }

  // ---------- BLG-04 / BLG-08 ----------
  async update(id: string, userId: string, dto: UpdatePostDto) {
    const post = await this.getOwnedPost(id, userId);

    if (dto.title !== undefined) post.title = dto.title;
    if (dto.body !== undefined) post.body = dto.body;
    if (dto.tags !== undefined) post.tags = dto.tags;
    if (dto.status !== undefined) {
      post.status = dto.status;
      // publishedAt is set only the first time the post is published
      if (dto.status === PostStatus.PUBLISHED && !post.publishedAt) {
        post.publishedAt = new Date();
      }
    }
    return post.save();
  }

  // ---------- BLG-04 ----------
  async remove(id: string, userId: string) {
    const post = await this.getOwnedPost(id, userId);

    await Promise.all([
      this.commentModel.deleteMany({ post: post._id }),
      this.likeModel.deleteMany({ post: post._id }),
    ]);
    await Promise.all(post.images.map((image) => this.uploads.deleteFile('posts', image.filename)));
    await post.deleteOne();
    return { message: 'Post deleted successfully' };
  }

  async adminRemove(id: string) {
    this.assertValidId(id);
    const post = await this.postModel.findById(id);
    if (!post) throw new NotFoundException('Post not found');
    await Promise.all([
      this.commentModel.deleteMany({ post: post._id }),
      this.likeModel.deleteMany({ post: post._id }),
    ]);
    await Promise.all(post.images.map((image) => this.uploads.deleteFile('posts', image.filename)));
    await post.deleteOne();
    return { message: 'Post deleted successfully' };
  }

  // ---------- helpers ----------
  private assertValidId(id: string) {
    if (!isValidObjectId(id)) throw new NotFoundException('Post not found');
  }

  private async getOwnedPost(id: string, userId: string): Promise<PostDocument> {
    this.assertValidId(id);
    const post = await this.postModel.findById(id);
    if (!post) throw new NotFoundException('Post not found');
    if (post.author.toString() !== userId) {
      throw new ForbiddenException('You can only modify your own posts');
    }
    return post;
  }

  private paginated<T>(data: T[], total: number, page: number, limit: number) {
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
  
}
