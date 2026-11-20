import { Controller, Delete, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Viewer } from './posts.service';
import { LikesService } from './likes.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user/current-user.decorator';

@ApiTags('Blog - Likes')
@UseGuards(JwtAuthGuard)
@Controller('posts/:id/like')
export class LikesController {
  constructor(private readonly likesService: LikesService) {}

  @Post()
  @ApiOperation({ summary: 'Like a post once (BLG-06)' })
  like(@Param('id') id: string, @CurrentUser() user: Viewer) {
    return this.likesService.like(id, user.id);
  }

  @Delete()
  @ApiOperation({ summary: 'Remove my like (BLG-06)' })
  unlike(@Param('id') id: string, @CurrentUser() user: Viewer) {
    return this.likesService.unlike(id, user.id);
  }
}