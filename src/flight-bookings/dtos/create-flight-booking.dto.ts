import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsCalendarDate } from '../../flights/dtos/search-flights.dto';

export class PassengerDto {
  @ApiProperty({ example: 'Mariam' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  firstName: string;

  @ApiProperty({ example: 'Hassan' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  lastName: string;

  @ApiProperty({ example: 'A12345678' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim().toUpperCase())
  passportNumber: string;

  @ApiProperty({ example: '1999-05-14', description: 'YYYY-MM-DD' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'dateOfBirth must be in YYYY-MM-DD format',
  })
  @IsCalendarDate({
    message: 'dateOfBirth must be a valid calendar date (YYYY-MM-DD)',
  })
  dateOfBirth: string;

  @ApiPropertyOptional({ example: 'Egyptian' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  nationality?: string;
}

export class CreateFlightBookingDto {
  @ApiProperty({
    example: '665f1a2b3c4d5e6f78909999',
    description: 'Active booking hold ID returned by POST /api/flight-bookings/hold',
  })
  @IsMongoId()
  holdId: string;

  @ApiProperty({
    type: [PassengerDto],
    description: 'Passenger details (length must match held passengerCount)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(9)
  @ValidateNested({ each: true })
  @Type(() => PassengerDto)
  passengers: PassengerDto[];

  @ApiPropertyOptional({
    example: 10,
    minimum: 0,
    default: 0,
    description: 'Total extra checked baggage in kg beyond airline allowance',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  extraBaggageKg?: number = 0;

  @ApiPropertyOptional({
    example: true,
    description: 'Explicit confirmation that traveler accepts airline baggage & cancellation policies (PAY-02)',
  })
  @IsOptional()
  @IsBoolean()
  acceptPolicies?: boolean;
}
