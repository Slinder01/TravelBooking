import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsArray, IsDateString, IsEnum, IsIn, IsMongoId, IsNotEmpty, IsNumber, IsOptional, IsString, Length, Min, Matches, MaxLength } from 'class-validator';
import { BUDGET_CATEGORIES } from '../schemas/itinerary.schema';

export class CreateItineraryDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(120) title: string;
  @ApiProperty() @IsString() @IsNotEmpty() country: string;
  @ApiProperty() @IsDateString() startDate: string;
  @ApiPropertyOptional({ enum: ['public', 'private'] }) @IsOptional() @IsIn(['public', 'private']) visibility?: string;
}
export class UpdateItineraryDto extends PartialType(CreateItineraryDto) {}

export class CreateDayDto {
  @ApiProperty() @IsString() @IsNotEmpty() city: string;
  @ApiPropertyOptional({ description: '1-based position to insert at; default = append' })
  @IsOptional() @IsNumber() @Min(1) position?: number;
}
export class UpdateDayDto { @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() city?: string; }
export class ReorderDaysDto { @ApiProperty({ type: [String] }) @IsArray() @IsMongoId({ each: true }) dayIds: string[]; }

export class ActivityDto {
  @ApiProperty() @IsString() @IsNotEmpty() title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startTime?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() location?: string;
}
export class UpdateActivityDto extends PartialType(ActivityDto) {}

export class BudgetDto {
  @ApiProperty({ enum: BUDGET_CATEGORIES }) @IsEnum(BUDGET_CATEGORIES as any) category: string;
  @ApiProperty() @IsNumber() @Min(0) amount: number;
  @ApiProperty() @IsString() @Length(3, 3) currency: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}
export class UpdateBudgetDto extends PartialType(BudgetDto) {}

export class TransportCostDto {
  @ApiProperty() @IsString() @IsNotEmpty() fromCity: string;
  @ApiProperty() @IsString() @IsNotEmpty() toCity: string;
  @ApiProperty() @IsString() @IsNotEmpty() mode: string;
  @ApiProperty() @IsNumber() @Min(0) amount: number;
  @ApiProperty() @IsString() @Length(3, 3) currency: string;
}
export class UpdateTransportCostDto extends PartialType(TransportCostDto) {}
