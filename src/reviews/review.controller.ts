import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { ReviewService } from './review.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';

@ApiTags('Review')
@Controller()
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Post('hotel-bookings/:id/review')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Submit a review for a completed hotel stay (HTL-23)' })
  @ApiResponse({ status: 201, description: 'Review successfully created.' })
  async createReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') bookingId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewService.createReview(bookingId, user.id, dto);
  }

  @Patch('reviews/:id')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Update an existing hotel review (HTL-23)' })
  @ApiResponse({ status: 200, description: 'Review successfully updated.' })
  async updateReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') reviewId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewService.updateReview(reviewId, user.id, dto);
  }

  @Delete('reviews/:id')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Delete a hotel review (HTL-23)' })
  @ApiResponse({ status: 200, description: 'Review successfully deleted.' })
  async deleteReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') reviewId: string,
  ) {
    return this.reviewService.deleteReview(reviewId, user.id);
  }

  @Get('hotels/:id/reviews')
  @ApiOperation({ summary: 'Get reviews and rating summary for a hotel (HTL-24)' })
  @ApiResponse({ status: 200, description: 'List of hotel reviews.' })
  async getHotelReviews(@Param('id') hotelId: string) {
    return this.reviewService.getHotelReviews(hotelId);
  }
}
