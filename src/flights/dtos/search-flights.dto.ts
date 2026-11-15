import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';
import { CabinClass } from '../schemas/flight.schema';
import { isValidCalendarDate } from '../utils/timezone.util';

export function IsCalendarDate(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isCalendarDate',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          return typeof value === 'string' && isValidCalendarDate(value);
        },
        defaultMessage() {
          return 'departureDate must be a valid real-world calendar date (YYYY-MM-DD)';
        },
      },
    });
  };
}

export enum FlightSortBy {
  PRICE = 'price',
  DURATION = 'duration',
  DEPARTURE_TIME = 'departureTime',
}

export class SearchFlightsDto {
  @ApiProperty({
    example: 'CAI',
    description: '3-letter IATA code of departure airport (origin)',
  })
  @IsString()
  @Length(3, 3)
  @Transform(({ value }) => value?.trim().toUpperCase())
  origin: string;

  @ApiProperty({
    example: 'DXB',
    description: '3-letter IATA code of arrival airport (destination)',
  })
  @IsString()
  @Length(3, 3)
  @Transform(({ value }) => value?.trim().toUpperCase())
  destination: string;

  @ApiProperty({
    example: '2026-12-01',
    description: 'Departure date at the departure airport in local calendar format (YYYY-MM-DD)',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'departureDate must be in YYYY-MM-DD format',
  })
  @IsCalendarDate()
  departureDate: string;

  @ApiPropertyOptional({
    example: 1,
    description: 'Number of passenger seats required (1 to 9, default: 1)',
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(9)
  passengers?: number = 1;

  @ApiPropertyOptional({
    enum: CabinClass,
    description: 'Optional cabin class filter. If omitted, all cabins with available seats are considered and priced at the cheapest qualifying cabin.',
  })
  @IsOptional()
  @IsEnum(CabinClass)
  cabinClass?: CabinClass;

  @ApiPropertyOptional({
    enum: FlightSortBy,
    description: 'Sort criteria: price (lowest first), duration (shortest first), or departureTime (earliest first)',
    default: FlightSortBy.PRICE,
  })
  @IsOptional()
  @IsEnum(FlightSortBy)
  sortBy?: FlightSortBy = FlightSortBy.PRICE;
}
