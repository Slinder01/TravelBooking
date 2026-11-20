import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Delete,
  ConflictException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { UpdateProfileDto } from '../auth/dtos/update-profile.dto';
import { UsersService } from './users.service';
import { BookingService } from '../bookings/booking.service';
import { ApiConflictResponse } from '@nestjs/swagger';
import { FlightBookingsService } from '../flight-bookings/flight-bookings.service';

@ApiTags('Users')
@ApiCookieAuth('access_token')
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly bookingService: BookingService,
    private readonly flightBookingsService: FlightBookingsService,
  ) {}

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get the current user profile' })
  @ApiOkResponse({ description: 'Current user profile' })
  @ApiUnauthorizedResponse({ description: 'Authentication required or session expired' })
  async getProfile(@CurrentUser() currentUser: AuthenticatedUser) {
    const user = await this.usersService.findById(currentUser.id);
    if (!user) {
      throw new BadRequestException('Account no longer exists');
    }

    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      preferredCurrency: user.preferredCurrency,
      mustChangePassword: user.mustChangePassword,
      createdAt: user.createdAt,
    };
  }

  @Patch('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update the current user profile' })
  @ApiOkResponse({ description: 'Profile updated successfully' })
  @ApiBadRequestResponse({ description: 'Invalid profile fields or no fields supplied' })
  @ApiUnauthorizedResponse({ description: 'Authentication required or session expired' })
  async updateProfile(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ) {
    if (!dto.name && !dto.phone && !dto.preferredCurrency) {
      throw new BadRequestException('At least one profile field must be provided');
    }

    const user = await this.usersService.updateProfile(currentUser.id, dto);
    if (!user) {
      throw new BadRequestException('Account no longer exists');
    }

    return {
      message: 'Profile updated successfully',
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        preferredCurrency: user.preferredCurrency,
      },
    };
  }

  @Delete('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate the current account (ACC-12)' })
  @ApiOkResponse({ description: 'Account deactivated and personal profile data anonymized' })
  @ApiConflictResponse({ description: 'Account has an upcoming confirmed hotel or flight booking' })
  async deleteMyAccount(@CurrentUser() currentUser: AuthenticatedUser) {
    const [hasHotelBooking, hasFlightBooking] = await Promise.all([
      this.bookingService.hasUpcomingConfirmedBooking(currentUser.id),
      this.flightBookingsService.hasUpcomingConfirmedBooking(currentUser.id),
    ]);
    if (hasHotelBooking || hasFlightBooking) {
      throw new ConflictException('Cancel upcoming confirmed bookings before deactivating your account');
    }
    return this.usersService.deactivateAccount(currentUser.id);
  }
}
