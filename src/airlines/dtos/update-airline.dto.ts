import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Length,
} from 'class-validator';

export class UpdateAirlineDto {
  @ApiPropertyOptional({ example: 'EgyptAir', description: 'Updated airline name' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name?: string;

  @ApiPropertyOptional({ example: 'MS', description: '2-letter IATA airline code' })
  @IsOptional()
  @IsString()
  @Length(2, 3)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  iataCode?: string;

  @ApiPropertyOptional({ example: 'Egypt', description: 'Country of origin' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  country?: string;

  @ApiPropertyOptional({ example: 'support@egyptair.com', description: 'Official contact email' })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional({ example: 'https://www.egyptair.com', description: 'Official website URL' })
  @IsOptional()
  @IsUrl()
  website?: string;

  @ApiPropertyOptional({ example: 'https://example.com/logo.png', description: 'Logo image URL' })
  @IsOptional()
  @IsUrl()
  logoUrl?: string;

  @ApiPropertyOptional({ example: true, description: 'Whether the airline is active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
