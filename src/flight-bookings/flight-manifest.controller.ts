import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { FlightBookingsService } from './flight-bookings.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles/roles.guard';
import { Roles } from '../common/decorators/roles/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user/current-user.decorator';
import { UserRole } from '../users/users-role.enum';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';

@ApiTags('Flights')
@ApiCookieAuth('access_token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.AIRLINE_MODERATOR, UserRole.ADMINISTRATOR)
@Controller('flights')
export class FlightManifestController {
  constructor(
    private readonly flightBookingsService: FlightBookingsService,
  ) {}

  @Get(':id/bookings')
  @ApiOperation({
    summary: 'List bookings for a flight (FLT-29)',
    description:
      'Airline moderators can view bookings only for flights belonging to their assigned airline.',
  })
  @ApiOkResponse({ description: 'Bookings associated with the flight' })
  @ApiBadRequestResponse({ description: 'Invalid flight ID format' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({
    description: 'Only assigned airline moderator or administrator authorized',
  })
  @ApiNotFoundResponse({ description: 'Flight not found' })
  getFlightBookings(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.flightBookingsService.getFlightBookings(id, currentUser);
  }

  @Get(':id/passengers/export')
  @ApiOperation({
    summary: 'Export confirmed passenger manifest for a flight (FLT-29)',
    description:
      'Returns confirmed passenger manifest in JSON (default) or downloadable CSV format.',
  })
  @ApiQuery({
    name: 'format',
    required: false,
    enum: ['json', 'csv'],
    description: 'Export format: json (default) or csv',
  })
  @ApiOkResponse({ description: 'Passenger manifest exported' })
  @ApiBadRequestResponse({ description: 'Invalid flight ID format' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({
    description: 'Only assigned airline moderator or administrator authorized',
  })
  @ApiNotFoundResponse({ description: 'Flight not found' })
  async exportPassengers(
    @Param('id') id: string,
    @Query('format') format: string = 'json',
    @CurrentUser() currentUser: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const normalized = format?.toLowerCase() === 'csv' ? 'csv' : 'json';
    const result = await this.flightBookingsService.exportFlightPassengers(
      id,
      normalized,
      currentUser,
    );

    if (normalized === 'csv' && 'data' in result) {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${result.filename}"`,
      );
      return result.data;
    }

    return result;
  }
}
