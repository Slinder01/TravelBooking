import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { Booking, BookingSchema } from '../hotels/schemas/booking.schema';
import { RoomAvailability, RoomAvailabilitySchema } from '../hotels/schemas/room-availability.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Booking.name, schema: BookingSchema },
      { name: RoomAvailability.name, schema: RoomAvailabilitySchema },
    ]),
  ],
  controllers: [BookingController],
  providers: [BookingService],
  exports: [BookingService],
})
export class BookingModule {}
