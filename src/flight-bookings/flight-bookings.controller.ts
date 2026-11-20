import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { FlightBookingsService } from './flight-bookings.service';
import { CreateHoldDto } from './dtos/create-hold.dto';
import { CreateFlightBookingDto } from './dtos/create-flight-booking.dto';
import { CancelFlightBookingDto } from './dtos/cancel-flight-booking.dto';
import { FlightBookingStatus } from './schemas/flight-booking.schema';
import { JwtAuthGuard } from '../common/guards/jwt-auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';

@ApiTags('Flight Bookings')
@ApiCookieAuth('access_token')
@UseGuards(JwtAuthGuard)
@Controller('flight-bookings')
export class FlightBookingsController {
  constructor(
    private readonly flightBookingsService: FlightBookingsService,
  ) {}

  @Post('hold')
  @ApiOperation({
    summary: 'Acquire a temporary concurrency-safe seat hold (FLT-22)',
    description:
      'Atomically reserves cabin seats for 15 minutes while releasing expired holds. Prevents overselling under concurrent requests.',
  })
  @ApiCreatedResponse({
    description: 'Seat hold acquired; returns HELD booking with holdExpiresAt timestamp',
  })
  @ApiBadRequestResponse({
    description: 'Invalid flight/cabin input, past departure, or invalid round-trip times',
  })
  @ApiConflictResponse({
    description: 'Insufficient available seats in the requested cabin',
  })
  @ApiNotFoundResponse({ description: 'Flight not found' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Registered account required' })
  createHold(
    @Body() dto: CreateHoldDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.flightBookingsService.createHold(dto, currentUser);
  }

  @Post()
  @ApiOperation({
    summary: 'Submit passenger & extra baggage details for a held booking (FLT-19, FLT-21)',
    description:
      'Validates passenger count against the active hold, calculates extra baggage fees from the airline policy snapshot, generates a booking reference, and sets status to PENDING_PAYMENT.',
  })
  @ApiCreatedResponse({
    description: 'Booking details saved and prepared for payment',
  })
  @ApiBadRequestResponse({
    description: 'Hold expired, passenger count mismatch, or invalid input',
  })
  @ApiForbiddenResponse({ description: 'Not the owner of the hold' })
  @ApiNotFoundResponse({ description: 'Seat hold not found' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  createBooking(
    @Body() dto: CreateFlightBookingDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.flightBookingsService.createBooking(dto, currentUser);
  }

  @Get()
  @ApiOperation({ summary: 'List current user flight bookings (FLT-25)' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: FlightBookingStatus,
    description: 'Optional booking status filter',
  })
  @ApiOkResponse({ description: 'List of user flight bookings' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  findMyBookings(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query('status') status?: string,
  ) {
    return this.flightBookingsService.findMyBookings(currentUser, status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get flight booking details by ID (FLT-25)' })
  @ApiOkResponse({ description: 'Booking details' })
  @ApiBadRequestResponse({ description: 'Invalid booking ID format' })
  @ApiForbiddenResponse({ description: 'Not authorized to view this booking' })
  @ApiNotFoundResponse({ description: 'Flight booking not found' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  findOne(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.flightBookingsService.findOneById(id, currentUser);
  }

  @Get(':id/e-ticket')
  @ApiOperation({ summary: 'Retrieve e-ticket for a confirmed flight booking (FLT-23)' })
  @ApiOkResponse({ description: 'Structured e-ticket payload' })
  @ApiBadRequestResponse({ description: 'Booking is not confirmed or invalid ID' })
  @ApiForbiddenResponse({ description: 'Not authorized to access this e-ticket' })
  @ApiNotFoundResponse({ description: 'Flight booking not found' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  getETicket(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.flightBookingsService.getETicket(id, currentUser);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel a flight booking and calculate policy refund (FLT-26)',
    description:
      'Releases held or booked seats atomically back to flight inventory and computes refund amount based on the snapshotted airline cancellation policy.',
  })
  @ApiOkResponse({ description: 'Booking cancelled and refund amount computed' })
  @ApiBadRequestResponse({
    description: 'Booking already cancelled/expired or flight has already departed',
  })
  @ApiForbiddenResponse({ description: 'Not authorized to cancel this booking' })
  @ApiNotFoundResponse({ description: 'Flight booking not found' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  cancelBooking(
    @Param('id') id: string,
    @Body() dto: CancelFlightBookingDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.flightBookingsService.cancelBooking(id, dto, currentUser);
  }
}
