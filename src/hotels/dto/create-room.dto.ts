import { IsString, IsNumber, Min, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateRoomDto {
  @ApiProperty({ example: 'Room 101' })
  @IsString()
  @IsNotEmpty()
  roomNumber: string;

  @ApiProperty({ example: 'Deluxe Double' })
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiProperty({ example: 2 })
  @IsNumber()
  @Min(1)
  beds: number;

  @ApiProperty({ example: 2 })
  @IsNumber()
  @Min(1)
  maxOccupancy: number;

  @ApiProperty({ example: 150 })
  @IsNumber()
  @Min(0.01)
  pricePerNight: number;
}