import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export class CreateAirportDto {
  @ApiProperty({ example: 'CAI', description: '3-letter IATA airport code' })
  @IsString()
  @Length(3, 3)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  iataCode: string;

  @ApiProperty({ example: 'Cairo International Airport', description: 'Airport name' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name: string;

  @ApiProperty({ example: 'Cairo', description: 'City served' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  city: string;

  @ApiPropertyOptional({ example: 'cairo', description: 'City reference ID' })
  @IsOptional()
  @IsString()
  cityId?: string;

  @ApiProperty({ example: 'Egypt', description: 'Country' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  country: string;

  @ApiPropertyOptional({ example: 'EG', description: '2-letter country code' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  countryCode?: string;

  @ApiProperty({ example: 'Africa/Cairo', description: 'IANA time zone' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  timeZone: string;
}
