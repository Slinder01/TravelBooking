import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelFlightBookingDto {
  @ApiPropertyOptional({
    example: 'Schedule conflict',
    description: 'Optional reason for cancelling the flight booking',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Transform(({ value }) => value?.trim())
  reason?: string;
}
