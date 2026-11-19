import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';
import { Review, ReviewSchema } from '../hotels/schemas/review.schema';
import { Booking, BookingSchema } from '../hotels/schemas/booking.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Review.name, schema: ReviewSchema },
      { name: Booking.name, schema: BookingSchema },
    ]),
  ],
  controllers: [ReviewController],
  providers: [ReviewService],
})
export class ReviewModule {}