import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { QueryPostsDto } from './dtos/query-post.dto';import { PostsService } from './posts.service';

@ApiTags('Blog - Tags')
@Controller('tags')
export class TagsController {
  constructor(private readonly postsService: PostsService) {}

  @Get(':tag/posts')
  @ApiOperation({ summary: 'List published posts with a tag (BLG-08, BLG-11)' })
  postsByTag(@Param('tag') tag: string, @Query() query: QueryPostsDto) {
    return this.postsService.findPublic({ ...query, tag: tag.trim().toLowerCase() });
  }
}