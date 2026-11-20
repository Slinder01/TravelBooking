import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Hotel, HotelSchema } from './schemas/hotel.schema';
import { Room, RoomSchema } from './schemas/room.schema';
import { Booking, BookingSchema } from './schemas/booking.schema';
import { Review, ReviewSchema } from './schemas/review.schema';
import { RoomAvailability, RoomAvailabilitySchema } from './schemas/room-availability.schema';
import { HotelController } from './hotel.controller';
import { HotelService } from './hotel.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Hotel.name, schema: HotelSchema },
      { name: Room.name, schema: RoomSchema },
      { name: Booking.name, schema: BookingSchema },
      { name: Review.name, schema: ReviewSchema },
      { name: RoomAvailability.name, schema: RoomAvailabilitySchema },
      { name: Booking.name, schema: BookingSchema },
    ]),
  ],
  controllers: [HotelController],
  providers: [HotelService],
  exports: [HotelService],
})
export class HotelModule {}
