import { IsDateString, IsNumber, Min } from 'class-validator';

export class CreateRoomAvailabilityDto {
  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsNumber()
  @Min(0)
  availableCount: number;
}