import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateCabinDto {
  @ApiPropertyOptional({ example: 180, description: 'Updated total seat capacity in this cabin' })
  @IsOptional()
  @IsInt()
  @Min(1)
  seatCount?: number;

  @ApiPropertyOptional({ example: 299.99, description: 'Updated base fare per passenger in USD' })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  price?: number;

  @ApiPropertyOptional({ example: 2, description: 'Updated number of free bags included' })
  @IsOptional()
  @IsInt()
  @Min(0)
  freeBaggageBags?: number;

  @ApiPropertyOptional({ example: 25, description: 'Updated max weight (kg) allowed per bag' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  baggageMaxWeightKg?: number;
}
