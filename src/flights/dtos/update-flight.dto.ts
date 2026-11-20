import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class UpdateFlightDto {
  @ApiPropertyOptional({
    example: '2026-12-01T15:30:00',
    description: 'Updated departure date-time in departure airport local time (YYYY-MM-DDTHH:mm:ss)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
    message:
      'departureTimeLocal must be in YYYY-MM-DDTHH:mm:ss format with valid 24-hour time (00:00 to 23:59)',
  })
  departureTimeLocal?: string;

  @ApiPropertyOptional({
    example: '2026-12-01T19:45:00',
    description: 'Updated arrival date-time in arrival airport local time (YYYY-MM-DDTHH:mm:ss)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
    message:
      'arrivalTimeLocal must be in YYYY-MM-DDTHH:mm:ss format with valid 24-hour time (00:00 to 23:59)',
  })
  arrivalTimeLocal?: string;
}
