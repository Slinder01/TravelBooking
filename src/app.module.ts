import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin/admin.module';
import { CommonModule } from './common/common.module';
import { HotelModule } from './hotels/hotel.module';
import { BookingModule } from './bookings/booking.module';
import { ReviewModule } from './reviews/review.module';

@Module({
  imports: [
    AuthModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGO_URI'),
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