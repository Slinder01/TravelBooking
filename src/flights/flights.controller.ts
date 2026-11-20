import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
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
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { FlightsService } from './flights.service';
import { CreateFlightDto } from './dtos/create-flight.dto';
import { UpdateFlightDto } from './dtos/update-flight.dto';
import { CabinInventoryDto } from './dtos/cabin-inventory.dto';
import { UpdateCabinDto } from './dtos/update-cabin.dto';
import { SearchFlightsDto } from './dtos/search-flights.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles/roles.guard';
import { Roles } from '../common/decorators/roles/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user/current-user.decorator';
import { UserRole } from '../users/users-role.enum';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';

@ApiTags('Flights')
@Controller('flights')
export class FlightsController {
  constructor(private readonly flightsService: FlightsService) {}

  @Post()
  @ApiCookieAuth('access_token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.AIRLINE_MODERATOR, UserRole.ADMINISTRATOR)
  @ApiOperation({
    summary: 'Create a new flight with cabin categories (FLT-03, FLT-04)',
    description:
      'Creates a scheduled flight. Times are entered in airport local times and stored in UTC. Airline moderators can only create flights for their assigned airline.',
  })
  @ApiCreatedResponse({
    description: 'Flight created successfully in Scheduled status',
  })
  @ApiBadRequestResponse({
    description:
      'Invalid data: identical airports, arrival not after departure, departure in the past, or duplicate cabin classes',
  })
  @ApiConflictResponse({
    description:
      'Duplicate flight number for the same airline on the same departure date',
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({
    description: 'Only assigned airline moderator or administrator authorized',
  })
  create(
    @Body() dto: CreateFlightDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.flightsService.create(dto, currentUser);
  }

  @Get('search')
  @ApiOperation({
    summary: 'Search scheduled flights — one-way or round-trip (FLT-11, FLT-12, FLT-15)',
    description:
      'Public endpoint to search available scheduled flights by route, local departure/return dates, passenger count, cabin class, price range, and airline. Automatically chooses the cheapest eligible cabin when cabinClass is omitted.',
  })
  @ApiOkResponse({
    description:
      'Matching one-way array or { tripType: "round-trip", outbound, return } legs sorted by price, duration, or departure time',
  })
  @ApiBadRequestResponse({
    description:
      'Invalid search parameters (e.g., identical origin/destination, invalid date, returnDate before departureDate, or minPrice > maxPrice)',
  })
  search(@Query() query: SearchFlightsDto) {
    return this.flightsService.search(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get flight details by ID (FLT-17)' })
  @ApiOkResponse({
    description:
      'Flight details including airline, airports, and cabin availability',
  })
  @ApiNotFoundResponse({ description: 'Flight not found' })
  @ApiBadRequestResponse({ description: 'Invalid flight ID format' })
  findById(@Param('id') id: string) {
    return this.flightsService.findById(id);
  }

  @Patch(':id')
  @ApiCookieAuth('access_token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.AIRLINE_MODERATOR, UserRole.ADMINISTRATOR)
  @ApiOperation({
    summary: 'Update flight schedule times (FLT-05)',
    description:
      'Updates local departure/arrival times, recalculates UTC timestamps, and enforces moderator airline ownership.',
  })
  @ApiOkResponse({ description: 'Flight schedule updated' })
  @ApiBadRequestResponse({
    description:
      'Invalid times, non-scheduled flight status, or no fields provided',
  })
  @ApiConflictResponse({
    description: 'Updated date conflicts with an existing flight number',
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({
    description: 'Only assigned airline moderator or administrator authorized',
  })
  @ApiNotFoundResponse({ description: 'Flight not found' })
  updateFlight(
    @Param('id') id: string,
    @Body() dto: UpdateFlightDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.flightsService.updateFlight(id, dto, currentUser);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('access_token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.AIRLINE_MODERATOR, UserRole.ADMINISTRATOR)
  @ApiOperation({
    summary: 'Cancel a scheduled flight (FLT-06)',
    description:
      'Marks a scheduled flight as Cancelled. Restricted to the assigned airline moderator or administrator.',
  })
  @ApiOkResponse({ description: 'Flight cancelled successfully' })
  @ApiBadRequestResponse({
    description: 'Flight is already cancelled or departed',
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({
    description: 'Only assigned airline moderator or administrator authorized',
  })
  @ApiNotFoundResponse({ description: 'Flight not found' })
  cancelFlight(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.flightsService.cancelFlight(id, currentUser);
  }

  @Post(':id/cabins')
  @ApiCookieAuth('access_token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.AIRLINE_MODERATOR, UserRole.ADMINISTRATOR)
  @ApiOperation({
    summary: 'Add a cabin tier to an existing flight (FLT-04)',
  })
  @ApiCreatedResponse({ description: 'Cabin added to flight' })
  @ApiBadRequestResponse({
    description: 'Flight not in Scheduled status or invalid cabin fields',
  })
  @ApiConflictResponse({
    description: 'Cabin category already exists on this flight',
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({
    description: 'Only assigned airline moderator or administrator authorized',
  })
  @ApiNotFoundResponse({ description: 'Flight not found' })
  addCabin(
    @Param('id') id: string,
    @Body() dto: CabinInventoryDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.flightsService.addCabin(id, dto, currentUser);
  }

  @Patch(':id/cabins/:cabinId')
  @ApiCookieAuth('access_token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.AIRLINE_MODERATOR, UserRole.ADMINISTRATOR)
  @ApiParam({
    name: 'cabinId',
    description: 'Cabin class name (Economy, Premium Economy, Business, or First)',
  })
  @ApiOperation({
    summary: 'Update cabin capacity, price, or baggage allowance (FLT-04, FLT-05)',
  })
  @ApiOkResponse({ description: 'Cabin updated successfully' })
  @ApiBadRequestResponse({
    description:
      'seatCount cannot drop below booked + held seats, or flight is not Scheduled',
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({
    description: 'Only assigned airline moderator or administrator authorized',
  })
  @ApiNotFoundResponse({ description: 'Flight or cabin not found' })
  updateCabin(
    @Param('id') id: string,
    @Param('cabinId') cabinId: string,
    @Body() dto: UpdateCabinDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.flightsService.updateCabin(id, cabinId, dto, currentUser);
  }
}
