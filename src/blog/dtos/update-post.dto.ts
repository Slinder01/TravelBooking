import { PartialType } from '@nestjs/swagger';
import { CreatePostDto } from './create-post.dto';

// BLG-04 / BLG-08: every field optional on edit (including tags and status)
export class UpdatePostDto extends PartialType(CreatePostDto) {}