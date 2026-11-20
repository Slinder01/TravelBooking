import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../../auth/auth.service';
import { AdminController } from './admin.controller';
import { UsersService } from '../../users/users.service';
import { AirlinesService } from '../../airlines/airlines.service';
import { HotelService } from '../../hotels/hotel.service';
import { BookingService } from '../../bookings/booking.service';
import { AuditLogService } from './audit-log.service';
import { FlightBookingsService } from '../../flight-bookings/flight-bookings.service';
import { PostsService } from '../../blog/posts.service';
import { CommentsService } from '../../blog/comments.service';
import { ReviewService } from '../../reviews/review.service';

describe('AdminController', () => {
  let controller: AdminController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: AuthService, useValue: {} },
        { provide: UsersService, useValue: {} },
        { provide: AirlinesService, useValue: {} },
        { provide: HotelService, useValue: {} },
        { provide: BookingService, useValue: {} },
        { provide: AuditLogService, useValue: {} },
        { provide: FlightBookingsService, useValue: {} },
        { provide: PostsService, useValue: {} },
        { provide: CommentsService, useValue: {} },
        { provide: ReviewService, useValue: {} },
      ],
    }).compile();

    controller = module.get<AdminController>(AdminController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
