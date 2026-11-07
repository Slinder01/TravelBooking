import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';
import { CabinInventoryDto } from './cabin-inventory.dto';

export class CreateFlightDto {
  @ApiProperty({ example: 'MS777', description: 'Flight identifier/number' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim().toUpperCase())
  flightNumber: string;

  @ApiPropertyOptional({
    example: '665f1a2b3c4d5e6f78901234',
    description: 'Airline ID (required for Admin; defaults to assigned airline for Moderator)',
  })
  @IsOptional()
  @IsString()
  airlineId?: string;

  @ApiProperty({ example: 'CAI', description: '3-letter IATA departure airport code' })
  @IsString()
  @Length(3, 3)
  @Transform(({ value }) => value?.trim().toUpperCase())
  departureAirportIata: string;

  @ApiProperty({ example: 'BER', description: '3-letter IATA arrival airport code' })
  @IsString()
  @Length(3, 3)
  @Transform(({ value }) => value?.trim().toUpperCase())
  arrivalAirportIata: string;

  @ApiProperty({
    example: '2026-12-01T14:30:00',
    description: 'Departure date-time in departure airport local time (YYYY-MM-DDTHH:mm:ss)',
  })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/, {
    message: 'departureTimeLocal must be in YYYY-MM-DDTHH:mm:ss format',
  })
  departureTimeLocal: string;

  @ApiProperty({
    example: '2026-12-01T18:45:00',
    description: 'Arrival date-time in arrival airport local time (YYYY-MM-DDTHH:mm:ss)',
  })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/, {
    message: 'arrivalTimeLocal must be in YYYY-MM-DDTHH:mm:ss format',
  })
  arrivalTimeLocal: string;

  @ApiProperty({
    type: [CabinInventoryDto],
    description: 'Cabin categories defined for this flight (1 to 4 categories, each used at most once)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => CabinInventoryDto)
  cabins: CabinInventoryDto[];
}
