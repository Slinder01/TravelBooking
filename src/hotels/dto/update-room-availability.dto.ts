import { IsDateString, IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateRoomAvailabilityDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  availableCount?: number;
}