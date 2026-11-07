import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUrl,
  Length,
} from 'class-validator';

export class UpdateAirlineDto {
  @ApiPropertyOptional({ example: 'EgyptAir', description: 'Updated airline name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'MS', description: '2-letter IATA airline code' })
  @IsOptional()
  @IsString()
  @Length(2, 3)
  @Transform(({ value }) => value?.trim().toUpperCase())
  iataCode?: string;

  @ApiPropertyOptional({ example: 'Egypt', description: 'Country of origin' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ example: 'support@egyptair.com', description: 'Official contact email' })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional({ example: 'https://www.egyptair.com', description: 'Official website URL' })
  @IsOptional()
  @IsUrl()
  website?: string;

  @ApiPropertyOptional({ example: true, description: 'Whether the airline is active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
