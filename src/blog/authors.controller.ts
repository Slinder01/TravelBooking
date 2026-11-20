import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthorsService } from './authors.service';
import { QueryPostsDto } from './dtos/query-post.dto';

@ApiTags('Blog - Authors')
@Controller('authors')
export class AuthorsController {
  constructor(private readonly authorsService: AuthorsService) {}

  @Get(':id')
  @ApiOperation({
    summary: 'Public author page: name, join date, published posts, public itineraries (BLG-12)',
  })
  findOne(@Param('id') id: string, @Query() query: QueryPostsDto) {
    return this.authorsService.findOne(id, query);
  }
}