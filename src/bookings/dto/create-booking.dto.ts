import { IsDateString, IsNotEmpty, IsString } from 'class-validator';

export class CreateBookingDto {
  @IsString()
  @IsNotEmpty()
  hotelId: string;

  @IsString()
  @IsNotEmpty()
  roomId: string;

  @IsDateString()
  checkInDate: string;

  @IsDateString()
  checkOutDate: string;
}