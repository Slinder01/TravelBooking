import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Body,
    Param,
    Req,
    UseGuards,
  } from '@nestjs/common';
  import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
  } from '@nestjs/swagger';
  import { ReviewService } from './review.service';
  import { CreateReviewDto } from './dto/create-review.dto';
  import { JwtAuthGuard } from '../common/guards/jwt-auth/jwt-auth.guard';
  
  @ApiTags('Review')
  @Controller()
  export class ReviewController {
    constructor(private readonly reviewService: ReviewService) {}
  
    @Post('hotel-bookings/:id/review')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Submit a review for a completed hotel stay (HTL-23)' })
    @ApiResponse({ status: 201, description: 'Review successfully created.' })
    async createReview(
      @Req() req: any,
      @Param('id') bookingId: string,
      @Body() dto: CreateReviewDto,
    ) {
      const userId = req.user?.userId || req.user?._id;
      return this.reviewService.createReview(bookingId, userId, dto);
    }
  
    @Patch('reviews/:id')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Update an existing hotel review (HTL-23)' })
    @ApiResponse({ status: 200, description: 'Review successfully updated.' })
    async updateReview(
      @Req() req: any,
      @Param('id') reviewId: string,
      @Body() dto: CreateReviewDto,
    ) {
      const userId = req.user?.userId || req.user?._id;
      return this.reviewService.updateReview(reviewId, userId, dto);
    }
  
    @Delete('reviews/:id')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Delete a hotel review (HTL-23)' })
    @ApiResponse({ status: 200, description: 'Review successfully deleted.' })
    async deleteReview(@Req() req: any, @Param('id') reviewId: string) {
      const userId = req.user?.userId || req.user?._id;
      return this.reviewService.deleteReview(reviewId, userId);
    }
  
    @Get('hotels/:id/reviews')
    @ApiOperation({ summary: 'Get reviews and rating summary for a hotel (HTL-24)' })
    @ApiResponse({ status: 200, description: 'List of hotel reviews.' })
    async getHotelReviews(@Param('id') hotelId: string) {
      return this.reviewService.getHotelReviews(hotelId);
    }
  }