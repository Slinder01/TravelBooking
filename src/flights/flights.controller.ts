import {
  Body,
  Controller,
  Get,
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
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { FlightsService } from './flights.service';
import { CreateFlightDto } from './dtos/create-flight.dto';
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
  @ApiCreatedResponse({ description: 'Flight created successfully in Scheduled status' })
  @ApiBadRequestResponse({
    description:
      'Invalid data: identical airports, arrival not after departure, departure in the past, or duplicate cabin classes',
  })
  @ApiConflictResponse({
    description: 'Duplicate flight number for the same airline on the same departure date',
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
    summary: 'Search scheduled flights (FLT-11, FLT-12, FLT-15)',
    description:
      'Public endpoint to search available scheduled flights by route, local date, and passenger count. Automatically chooses the cheapest eligible cabin when cabinClass is omitted.',
  })
  @ApiOkResponse({
    description: 'Matching flights sorted by price, duration, or departure time',
  })
  @ApiBadRequestResponse({
    description: 'Invalid search parameters (e.g., identical origin and destination, invalid date)',
  })
  search(@Query() query: SearchFlightsDto) {
    return this.flightsService.search(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get flight details by ID (FLT-17)' })
  @ApiOkResponse({ description: 'Flight details including airline, airports, and cabin availability' })
  @ApiNotFoundResponse({ description: 'Flight not found' })
  @ApiBadRequestResponse({ description: 'Invalid flight ID format' })
  findById(@Param('id') id: string) {
    return this.flightsService.findById(id);
  }
}
