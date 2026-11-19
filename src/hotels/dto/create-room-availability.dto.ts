import { IsBoolean, IsDateString, IsNumber, IsOptional, Min } from 'class-validator';

export class CreateRoomAvailabilityDto {
  @IsDateString()
  date: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsNumber()
  @Min(0)
  availableCount: number;

  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @IsBoolean()
  isBlocked?: boolean;
}