import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListAuditLogsQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit = 20;

  @ApiPropertyOptional({ description: 'Filter by action, e.g. ACCOUNT_SUSPENDED' })
  @IsOptional() @IsString()
  action?: string;

  @ApiPropertyOptional({ description: 'Filter by target type, e.g. user or hotel' })
  @IsOptional() @IsString()
  targetType?: string;
}
