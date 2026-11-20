import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  FlightBooking,
  FlightBookingSchema,
} from './schemas/flight-booking.schema';
import { FlightBookingsController } from './flight-bookings.controller';
import { FlightManifestController } from './flight-manifest.controller';
import { FlightBookingsService } from './flight-bookings.service';
import { FlightsModule } from '../flights/flights.module';
import { AirlinesModule } from '../airlines/airlines.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FlightBooking.name, schema: FlightBookingSchema },
    ]),
    FlightsModule,
    AirlinesModule,
  ],
  controllers: [FlightBookingsController, FlightManifestController],
  providers: [FlightBookingsService],
  exports: [MongooseModule, FlightBookingsService],
})
export class FlightBookingsModule {}
