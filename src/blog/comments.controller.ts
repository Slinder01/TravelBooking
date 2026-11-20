import { Body, Controller, Delete, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateCommentDto } from './dtos/create-comment.dto';
import { UpdateCommentDto } from './dtos/update-comment.dto';
import type { Viewer } from './posts.service';
import { CommentsService } from './comments.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user/current-user.decorator';

@ApiTags('Blog - Comments')
@UseGuards(JwtAuthGuard)
@Controller()
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post('posts/:id/comments')
  @ApiOperation({ summary: 'Comment on a published post (BLG-05)' })
  create(
    @Param('id') id: string,
    @CurrentUser() user: Viewer,
    @Body() dto: CreateCommentDto,
  ) {
    return this.commentsService.create(id, user.id, dto);
  }

  @Patch('comments/:id')
  @ApiOperation({ summary: 'Edit own comment (BLG-07)' })
  update(
    @Param('id') id: string,
    @CurrentUser() user: Viewer,
    @Body() dto: UpdateCommentDto,
  ) {
    return this.commentsService.update(id, user.id, dto);
  }

  @Delete('comments/:id')
  @ApiOperation({ summary: 'Delete own comment (BLG-07)' })
  remove(@Param('id') id: string, @CurrentUser() user: Viewer) {
    return this.commentsService.remove(id, user.id);
  }
}