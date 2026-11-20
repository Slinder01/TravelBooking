import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin/admin.module';
import { CommonModule } from './common/common.module';
import { HotelModule } from './hotels/hotel.module';
import { BookingModule } from './bookings/booking.module';
import { ReviewModule } from './reviews/review.module';
import { AirlinesModule } from './airlines/airlines.module';
import { AirportsModule } from './airports/airports.module';
import { FlightsModule } from './flights/flights.module';
import { FlightBookingsModule } from './flight-bookings/flight-bookings.module';

@Module({
  imports: [
    AuthModule,
    AirlinesModule,
    AirportsModule,
    FlightsModule,
    FlightBookingsModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri:
          configService.get<string>('MONGO_URI') ||
          configService.get<string>('MONGODB_URI') ||
          'mongodb://127.0.0.1:27017/travel_booking',
      }),
      inject: [ConfigService],
    }),
    AdminModule,
    CommonModule,
    HotelModule,
    BookingModule,
    ReviewModule,
  ],
})
export class AppModule {}
