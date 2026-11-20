import { IsString, IsArray, ValidateNested, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

class CancellationTierDto {
  @IsNumber()
  @Min(0)
  daysBeforeCheckIn: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  refundPercentage: number;
}

export class HotelPolicyDto {
  @IsString()
  checkInTime: string;

  @IsString()
  checkOutTime: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CancellationTierDto)
  cancellationTiers: CancellationTierDto[];
}