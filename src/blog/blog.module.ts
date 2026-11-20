import { User, UserSchema } from '../users/schemas/user.schema';
import { UploadsModule } from '../uploads/uploads.module';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { LikesController } from './likes.controller';
import { LikesService } from './likes.service';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { TagsController } from './tags.controller';
import { AuthorsController } from './authors.controller';
import { AuthorsService } from './authors.service';
import { Comment, CommentSchema } from './schemas/comment.schema';
import { Like, LikeSchema } from './schemas/like.schema';
import { Post, PostSchema } from './schemas/post.schema';

@Module({
  imports: [ UploadsModule,
    MongooseModule.forFeature([
      { name: Post.name, schema: PostSchema },
      { name: Comment.name, schema: CommentSchema },
      { name: User.name, schema: UserSchema }, 
      { name: Like.name, schema: LikeSchema },
    ]),
  ],
  controllers: [PostsController, TagsController, CommentsController, LikesController, AuthorsController],
  providers: [PostsService, CommentsService, LikesService, AuthorsService],
  exports: [PostsService],
})
export class BlogModule {}
