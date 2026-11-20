import { UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes } from '@nestjs/swagger';
import { imageUploadOptions } from '../uploads/image-uploads.options';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreatePostDto } from './dtos/create-post.dto';
import { QueryPostsDto } from './dtos/query-post.dto';
import { UpdatePostDto } from './dtos/update-post.dto';
import { PostsService, type Viewer } from './posts.service';

// TODO: replace these three imports with the real ones from the auth module (Part 1)
import { JwtAuthGuard } from '../common/guards/jwt-auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/jwt-auth/optional-jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user/current-user.decorator';

@ApiTags('Blog - Posts')
@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create a post as draft or published (BLG-01)' })
  create(@CurrentUser() user: Viewer, @Body() dto: CreatePostDto) {
    return this.postsService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Browse/search published posts, filter by tag (BLG-02, BLG-08, BLG-09)',
  })
  findPublic(@Query() query: QueryPostsDto) {
    return this.postsService.findPublic(query);
  }

  // IMPORTANT: must stay above @Get(':id'), or "mine" is treated as an id
  @Get('mine')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List my posts including drafts (BLG-03)' })
  findMine(@CurrentUser() user: Viewer, @Query() query: QueryPostsDto) {
    return this.postsService.findMine(user.id, query);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard) // guests allowed; sets user if logged in
  @ApiOperation({ summary: 'View a post (BLG-02)' })
  findOne(@Param('id') id: string, @CurrentUser() user?: Viewer) {
    return this.postsService.findOne(id, user);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Edit own post, tags and status (BLG-04, BLG-08)' })
  update(
    @Param('id') id: string,
    @CurrentUser() user: Viewer,
    @Body() dto: UpdatePostDto,
  ) {
    return this.postsService.update(id, user.id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete own post (BLG-04)' })
  remove(@Param('id') id: string, @CurrentUser() user: Viewer) {
    return this.postsService.remove(id, user.id);
  }

  @Post(':id/images')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Upload a post image, JPG/PNG max 5 MB, max 5 per post (BLG-10)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { image: { type: 'string', format: 'binary' } } },
  })
  @UseInterceptors(FileInterceptor('image', imageUploadOptions('posts')))
  addImage(
    @Param('id') id: string,
    @CurrentUser() user: Viewer,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.postsService.addImage(id, user.id, file);
  }

  @Delete(':id/images/:imageId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Remove a post image (BLG-10)' })
  removeImage(
    @Param('id') id: string,
    @Param('imageId') imageId: string,
    @CurrentUser() user: Viewer,
  ) {
    return this.postsService.removeImage(id, imageId, user.id);
  }
}