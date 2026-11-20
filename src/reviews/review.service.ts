import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Review } from '../hotels/schemas/review.schema';
import { Booking } from '../hotels/schemas/booking.schema';
import { CreateReviewDto } from './dto/create-review.dto';

@Injectable()
export class ReviewService {
  constructor(
    @InjectModel(Review.name) private reviewModel: Model<Review>,
    @InjectModel(Booking.name) private bookingModel: Model<Booking>,
  ) {}

  async createReview(bookingId: string, userId: string, dto: CreateReviewDto): Promise<Review> {
    const booking = await this.bookingModel.findOne({ _id: bookingId, userId }).exec();
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.status !== 'completed' && new Date() < new Date(booking.checkOutDate)) {
      throw new BadRequestException('You can only review a completed stay');
    }

    const existingReview = await this.reviewModel.findOne({ bookingId }).exec();
    if (existingReview) {
      throw new BadRequestException('You have already reviewed this booking');
    }

    const review = new this.reviewModel({
      userId,
      hotelId: booking.hotelId,
      bookingId,
      rating: dto.rating,
      comment: dto.comment,
    });

    return review.save();
  }

  async updateReview(reviewId: string, userId: string, dto: CreateReviewDto): Promise<Review> {
    const review = await this.reviewModel.findById(reviewId).exec();
    if (!review) {
      throw new NotFoundException('Review not found');
    }

    if (review.userId.toString() !== userId) {
      throw new ForbiddenException('You can only edit your own reviews');
    }

    review.rating = dto.rating ?? review.rating;
    review.comment = dto.comment ?? review.comment;
    return review.save();
  }

  async deleteReview(reviewId: string, userId: string): Promise<{ message: string }> {
    const review = await this.reviewModel.findById(reviewId).exec();
    if (!review) {
      throw new NotFoundException('Review not found');
    }

    if (review.userId.toString() !== userId) {
      throw new ForbiddenException('You can only delete your own reviews');
    }

    await this.reviewModel.deleteOne({ _id: reviewId });
    return { message: 'Review deleted successfully' };
  }

  async adminDeleteReview(reviewId: string): Promise<{ message: string }> {
    const review = await this.reviewModel.findById(reviewId).exec();
    if (!review) throw new NotFoundException('Review not found');
    await this.reviewModel.deleteOne({ _id: reviewId }).exec();
    return { message: 'Review deleted successfully' };
  }

  async getHotelReviews(hotelId: string): Promise<Review[]> {
    return (this.reviewModel.find({ hotelId: hotelId as any } as any)
      .sort({ createdAt: -1 })
      .exec()) as unknown as Review[];
  }
}
