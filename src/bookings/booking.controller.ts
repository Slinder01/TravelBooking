import { Controller, Get, Post, Body, Req, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { BookingService } from './booking.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth/jwt-auth.guard'; // Adjust path if needed

@ApiTags('Hotel Bookings')
@Controller('hotel-bookings')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a concurrency-safe hotel reservation (HTL-16, HTL-18)' })
  @ApiResponse({ status: 201, description: 'Booking successfully created.' })
  @ApiResponse({ status: 400, description: 'Room not available or invalid dates.' })
  async createBooking(@Req() req: any, @Body() dto: CreateBookingDto) {
    const userId = req.user?.userId || req.user?._id;
    return this.bookingService.createBooking(userId, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List user hotel bookings (HTL-20)' })
  @ApiResponse({ status: 200, description: 'List of user hotel reservations.' })
  async getUserBookings(@Req() req: any) {
    const userId = req.user?.userId || req.user?._id;
    return this.bookingService.getUserBookings(userId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get specific hotel booking details (HTL-20)' })
  @ApiResponse({ status: 200, description: 'Booking details found.' })
  @ApiResponse({ status: 404, description: 'Booking not found.' })
  async getBookingById(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.userId || req.user?._id;
    return this.bookingService.getBookingById(id, userId);
  }

  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel an eligible hotel reservation and restore inventory (HTL-21)' })
  @ApiResponse({ status: 200, description: 'Booking successfully cancelled.' })
  @ApiResponse({ status: 400, description: 'Booking already cancelled.' })
  async cancelBooking(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.userId || req.user?._id;
    return this.bookingService.cancelBooking(id, userId);
  }
}