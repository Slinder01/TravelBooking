import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';

export class UpdateBaggagePolicyDto {
  @ApiProperty({ example: 7, description: 'Cabin baggage allowance in kg' })
  @IsNumber()
  @Min(0)
  cabinBagAllowanceKg: number;

  @ApiProperty({ example: 23, description: 'Checked baggage allowance in kg' })
  @IsNumber()
  @Min(0)
  checkedBagAllowanceKg: number;

  @ApiProperty({ example: 25, description: 'Excess baggage fee per kg in USD' })
  @IsNumber()
  @Min(0)
  excessBagFeePerKg: number;
}
