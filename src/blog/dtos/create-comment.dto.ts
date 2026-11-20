import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// BLG-05: non-empty, max 500 characters
export class CreateCommentDto {
  @ApiProperty({ example: 'Great post, thanks for sharing!', maxLength: 500 })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty({ message: 'Comment cannot be empty' })
  @MaxLength(500, { message: 'Comment must be at most 500 characters' })
  content: string;
}