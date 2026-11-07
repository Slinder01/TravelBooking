import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class BaggagePolicyDto {
  @ApiPropertyOptional({ example: 7, description: 'Cabin baggage allowance in kg' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  cabinBagAllowanceKg?: number;

  @ApiPropertyOptional({ example: 23, description: 'Checked baggage allowance in kg' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  checkedBagAllowanceKg?: number;

  @ApiPropertyOptional({ example: 25, description: 'Excess baggage fee per kg in USD' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  excessBagFeePerKg?: number;
}

export class CancellationPolicyDto {
  @ApiPropertyOptional({ example: 24, description: 'Hours before departure eligible for cancellation' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  freeCancellationHours?: number;

  @ApiPropertyOptional({ example: 85, description: 'Refund percentage (0-100)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  refundPercentage?: number;
}

export class CreateAirlineDto {
  @ApiProperty({ example: 'EgyptAir', description: 'Name of the airline' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'MS', description: '2-letter IATA airline code' })
  @IsString()
  @Length(2, 3)
  @Transform(({ value }) => value?.trim().toUpperCase())
  iataCode: string;

  @ApiProperty({ example: 'Egypt', description: 'Country of origin' })
  @IsString()
  @IsNotEmpty()
  country: string;

  @ApiPropertyOptional({ example: 'contact@egyptair.com', description: 'Official contact email' })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional({ example: 'https://www.egyptair.com', description: 'Official website URL' })
  @IsOptional()
  @IsUrl()
  website?: string;

  @ApiPropertyOptional({ type: BaggagePolicyDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BaggagePolicyDto)
  baggagePolicy?: BaggagePolicyDto;

  @ApiPropertyOptional({ type: CancellationPolicyDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CancellationPolicyDto)
  cancellationPolicy?: CancellationPolicyDto;
}
