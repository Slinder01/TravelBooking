import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNumber, Min } from 'class-validator';
import { CabinClass } from '../schemas/flight.schema';

export class CabinInventoryDto {
  @ApiProperty({
    enum: CabinClass,
    example: CabinClass.ECONOMY,
    description: 'Cabin category (Economy, Premium Economy, Business, First)',
  })
  @IsEnum(CabinClass)
  cabinClass: CabinClass;

  @ApiProperty({ example: 150, description: 'Total seat capacity in this cabin' })
  @IsInt()
  @Min(1)
  seatCount: number;

  @ApiProperty({ example: 250.0, description: 'Base price per passenger in USD' })
  @IsNumber()
  @Min(0.01)
  price: number;

  @ApiProperty({ example: 1, description: 'Number of free bags included in fare' })
  @IsInt()
  @Min(0)
  freeBaggageBags: number;

  @ApiProperty({ example: 23, description: 'Maximum weight (kg) allowed per bag' })
  @IsNumber()
  @Min(1)
  baggageMaxWeightKg: number;
}
