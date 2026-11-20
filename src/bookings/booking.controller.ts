import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiCookieAuth } from '@nestjs/swagger';
import { BookingService } from './booking.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';

@ApiTags('Hotel Bookings')
@Controller('hotel-bookings')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Create a concurrency-safe hotel reservation (HTL-16, HTL-18)' })
  @ApiResponse({ status: 201, description: 'Booking successfully created.' })
  @ApiResponse({ status: 400, description: 'Room not available or invalid dates.' })
  async createBooking(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBookingDto,
  ) {
    return this.bookingService.createBooking(user.id, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'List user hotel bookings (HTL-20)' })
  @ApiResponse({ status: 200, description: 'List of user hotel reservations.' })
  async getUserBookings(@CurrentUser() user: AuthenticatedUser) {
    return this.bookingService.getUserBookings(user.id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Get specific hotel booking details (HTL-20)' })
  @ApiResponse({ status: 200, description: 'Booking details found.' })
  @ApiResponse({ status: 404, description: 'Booking not found.' })
  async getBookingById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.bookingService.getBookingById(id, user.id);
  }

  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Cancel an eligible hotel reservation and restore inventory (HTL-21)' })
  @ApiResponse({ status: 200, description: 'Booking successfully cancelled.' })
  @ApiResponse({ status: 400, description: 'Booking already cancelled.' })
  async cancelBooking(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.bookingService.cancelBooking(id, user.id);
  }
}
