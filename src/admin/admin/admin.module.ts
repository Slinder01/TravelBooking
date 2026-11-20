import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { RolesGuard } from '../../common/guards/roles/roles.guard';
import { AuthModule } from '../../auth/auth.module';
import { UsersModule } from '../../users/users.module';
import { AirlinesModule } from '../../airlines/airlines.module';
import { HotelModule } from '../../hotels/hotel.module';
import { BookingModule } from '../../bookings/booking.module';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLog, AuditLogSchema } from './schemas/audit-log.schema';
import { AuditLogService } from './audit-log.service';
import { AdminSeederService } from './admin-seeder.service';
import { FlightBookingsModule } from '../../flight-bookings/flight-bookings.module';
import { BlogModule } from '../../blog/blog.module';
import { ReviewModule } from '../../reviews/review.module';
@Module({
  imports: [
    AuthModule,
    UsersModule,
    AirlinesModule,
    HotelModule,
    BookingModule,
    FlightBookingsModule,
    BlogModule,
    ReviewModule,
    MongooseModule.forFeature([{ name: AuditLog.name, schema: AuditLogSchema }]),
  ],
  controllers: [AdminController],
  providers: [RolesGuard, AdminSeederService, AuditLogService],
})
export class AdminModule {}
