import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Max, Min } from 'class-validator';

export class UpdateCancellationPolicyDto {
  @ApiProperty({ example: 24, description: 'Hours before departure eligible for cancellation' })
  @IsNumber()
  @Min(0)
  freeCancellationHours: number;

  @ApiProperty({ example: 85, description: 'Refund percentage (0-100)' })
  @IsNumber()
  @Min(0)
  @Max(100)
  refundPercentage: number;
}
