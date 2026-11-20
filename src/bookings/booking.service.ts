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

  private getStayDates(checkIn: Date, checkOut: Date): Date[] {
    const dates: Date[] = [];
    const cursor = new Date(Date.UTC(checkIn.getUTCFullYear(), checkIn.getUTCMonth(), checkIn.getUTCDate()));
    const end = new Date(Date.UTC(checkOut.getUTCFullYear(), checkOut.getUTCMonth(), checkOut.getUTCDate()));

    while (cursor < end) {
      dates.push(new Date(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return dates;
  }

  async createBooking(userId: string, dto: CreateBookingDto): Promise<Booking> {
    const checkIn = new Date(dto.checkInDate);
    const checkOut = new Date(dto.checkOutDate);

    if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime())) {
      throw new BadRequestException('Invalid check-in or check-out date');
    }

    if (checkIn >= checkOut) {
      throw new BadRequestException('Check-out date must be after check-in date');
    }

    const stayDates = this.getStayDates(checkIn, checkOut);
    if (stayDates.length === 0) {
      throw new BadRequestException('Booking must be for at least one night');
    }

    const decrementedDates: Date[] = [];

    // ATOMIC CONCURRENCY-SAFE AVAILABILITY DECREMENT PER NIGHT
    for (const nightDate of stayDates) {
      const updated = await this.roomAvailabilityModel
        .findOneAndUpdate(
          {
            roomId: dto.roomId as any,
            hotelId: dto.hotelId as any,
            date: nightDate,
            isBlocked: { $ne: true },
            availableCount: { $gt: 0 },
          },
          { $inc: { availableCount: -1 } },
          { new: true },
        )
        .exec();

      if (!updated) {
        // Roll back earlier nights if a later night has no availability
        for (const prevDate of decrementedDates) {
          await this.roomAvailabilityModel
            .findOneAndUpdate(
              {
                roomId: dto.roomId as any,
                hotelId: dto.hotelId as any,
                date: prevDate,
              },
              { $inc: { availableCount: 1 } },
            )
            .exec();
        }

        throw new BadRequestException('Room is not available for the selected dates or is fully booked');
      }

      decrementedDates.push(nightDate);
    }

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
      for (const prevDate of decrementedDates) {
        await this.roomAvailabilityModel
          .findOneAndUpdate(
            {
              roomId: dto.roomId as any,
              hotelId: dto.hotelId as any,
              date: prevDate,
            },
            { $inc: { availableCount: 1 } },
          )
          .exec();
      }
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

    const stayDates = this.getStayDates(new Date(booking.checkInDate), new Date(booking.checkOutDate));

    for (const nightDate of stayDates) {
      await this.roomAvailabilityModel
        .findOneAndUpdate(
          {
            roomId: booking.roomId as any,
            hotelId: booking.hotelId as any,
            date: nightDate,
          },
          { $inc: { availableCount: 1 } },
        )
        .exec();
    }

    booking.status = 'cancelled';
    return booking.save();
  }

  async listAllBookings(query: { page: number; limit: number; status?: string }) {
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    const [items, total] = await Promise.all([
      this.bookingModel.find(filter).sort({ createdAt: -1, _id: -1 })
        .skip((query.page - 1) * query.limit).limit(query.limit)
        .populate('userId', 'name email').populate('hotelId', 'name city country')
        .populate('roomId', 'roomNumber type').lean().exec(),
      this.bookingModel.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }

  async hasUpcomingConfirmedBooking(userId: string): Promise<boolean> {
    return this.bookingModel.exists({
      userId: userId as any,
      status: 'confirmed',
      checkOutDate: { $gt: new Date() },
    }).then(Boolean);
  }
}
