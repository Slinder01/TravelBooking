import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { CabinClass } from '../../flights/schemas/flight.schema';

export class CreateHoldDto {
  @ApiProperty({
    example: '665f1a2b3c4d5e6f78901234',
    description: 'Outbound flight ObjectId to reserve seats on',
  })
  @IsMongoId()
  flightId: string;

  @ApiProperty({
    enum: CabinClass,
    example: CabinClass.ECONOMY,
    description: 'Cabin class to hold seats in',
  })
  @IsEnum(CabinClass)
  cabinClass: CabinClass;

  @ApiProperty({
    example: 2,
    minimum: 1,
    maximum: 9,
    description: 'Number of passenger seats to hold temporarily (1 to 9)',
  })
  @IsInt()
  @Min(1)
  @Max(9)
  passengerCount: number;

  @ApiPropertyOptional({
    example: '665f1a2b3c4d5e6f78905678',
    description: 'Optional return flight ObjectId for round-trip reservations',
  })
  @IsOptional()
  @IsMongoId()
  returnFlightId?: string;

  @ApiPropertyOptional({
    enum: CabinClass,
    example: CabinClass.ECONOMY,
    description: 'Optional cabin class for return leg (defaults to outbound cabinClass)',
  })
  @IsOptional()
  @IsEnum(CabinClass)
  returnCabinClass?: CabinClass;
}
