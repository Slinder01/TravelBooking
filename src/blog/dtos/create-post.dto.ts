import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { 
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PostStatus } from '../schemas/post.schema';

// BLG-08: trim, lowercase, drop empties and duplicates before validation runs
export const normalizeTags = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? [
        ...new Set(
          value
            .filter((t): t is string => typeof t === 'string')
            .map((t) => t.trim().toLowerCase())
            .filter((t) => t.length > 0),
        ),
      ]
    : value;

export class CreatePostDto {
  @ApiProperty({ example: 'Three days in Cairo', maxLength: 150 })
  @IsString()
  @IsNotEmpty({ message: 'Title is required' })
  @MaxLength(150, { message: 'Title must be at most 150 characters' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  title: string;

  @ApiProperty({ example: 'We started the trip at the Egyptian Museum...' })
  @IsString()
  @IsNotEmpty({ message: 'Body is required' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  body: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['cairo', 'history'],
    description: 'Up to 5 tags, max 30 characters each',
  })
  @IsOptional()
  @Transform(normalizeTags)
  @IsArray()
  @ArrayMaxSize(5, { message: 'A post can have at most 5 tags' })
  @IsString({ each: true })
  @MaxLength(30, { each: true, message: 'Each tag must be at most 30 characters' })
  tags?: string[];

  @ApiPropertyOptional({ enum: PostStatus, default: PostStatus.DRAFT })
  @IsOptional()
  @IsEnum(PostStatus, { message: 'Status must be draft or published' })
  status?: PostStatus;
}