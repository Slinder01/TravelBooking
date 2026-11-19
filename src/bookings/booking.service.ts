import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Booking } from '../hotels/schemas/booking.schema';
import { RoomAvailability } from '../hotels/schemas/room-availability.schema';
import { CreateBookingDto } from './dto/create-booking.dto';

@Injectable()
export class BookingService {
  constructor(
    @InjectModel(Booking.name) private bookingModel: Model<Booking>,
    @InjectModel(RoomAvailability.name) private roomAvailabilityModel: Model<RoomAvailability>,
  ) {}

  async createBooking(userId: string, dto: CreateBookingDto): Promise<Booking> {
    const checkIn = new Date(dto.checkInDate);
    const checkOut = new Date(dto.checkOutDate);

    if (checkIn >= checkOut) {
      throw new BadRequestException('Check-out date must be after check-in date');
    }

    // ATOMIC CONCURRENCY-SAFE AVAILABILITY DECREMENT
    // This ensures two simultaneous requests cannot grab the last available room
    const availability = await this.roomAvailabilityModel.findOneAndUpdate(
      {
        roomId: dto.roomId as any,
        hotelId: dto.hotelId as any,
        startDate: { $lte: checkOut },
        endDate: { $gte: checkIn },
        availableCount: { $gt: 0 },
      },
      { $inc: { availableCount: -1 } },
      { new: true },
    ).exec();

    if (!availability) {
      throw new BadRequestException('Room is not available for the selected dates or is fully booked');
    }

    // Create the booking
    const newBooking = new this.bookingModel({
      userId: userId as any,
      hotelId: dto.hotelId as any,
      roomId: dto.roomId as any,
      checkInDate: checkIn,
      checkOutDate: checkOut,
      status: 'confirmed',
    });

    try {
      return await newBooking.save();
    } catch (error) {
      // Rollback availability count if booking save fails
      availability.availableCount += 1;
      await availability.save();
      throw error;
    }
  }

  async getUserBookings(userId: string): Promise<Booking[]> {
    return this.bookingModel.find({ userId: userId as any }).exec();
  }

  async getBookingById(bookingId: string, userId: string): Promise<Booking> {
    const booking = await this.bookingModel.findOne({ _id: bookingId, userId }).exec();
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    return booking;
  }

  async cancelBooking(bookingId: string, userId: string): Promise<Booking> {
    const booking = await this.getBookingById(bookingId, userId);

    if (booking.status === 'cancelled') {
      throw new BadRequestException('Booking is already cancelled');
    }

    // Restore room availability count
    const availability = await this.roomAvailabilityModel.findOne({
      roomId: booking.roomId as any,
      hotelId: booking.hotelId as any,
      startDate: { $lte: booking.checkOutDate },
      endDate: { $gte: booking.checkInDate },
    }).exec();

    if (availability) {
      (availability as any).availableCount += 1;
      await availability.save();
    }

    booking.status = 'cancelled';
    return booking.save();
  }
}