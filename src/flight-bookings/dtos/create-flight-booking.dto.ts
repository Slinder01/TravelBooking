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
  registerDecorator,
  ValidateNested,
  ValidationOptions,
} from 'class-validator';
import { IsCalendarDate } from '../../flights/dtos/search-flights.dto';

function IsPastOrTodayDate(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isPastOrTodayDate',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            return false;
          }
          const todayIso = new Date().toISOString().slice(0, 10);
          return value <= todayIso;
        },
      },
    });
  };
}

export class PassengerDto {
  @ApiProperty({ example: 'Mariam' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Hassan' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ example: 'A12345678' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @IsNotEmpty()
  passportNumber: string;

  @ApiProperty({ example: '1999-05-14', description: 'YYYY-MM-DD' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'dateOfBirth must be in YYYY-MM-DD format',
  })
  @IsCalendarDate({
    message: 'dateOfBirth must be a valid calendar date (YYYY-MM-DD)',
  })
  @IsPastOrTodayDate({
    message: 'dateOfBirth cannot be in the future',
  })
  dateOfBirth: string;

  @ApiPropertyOptional({ example: 'Egyptian' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
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
