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
import { AirportsService } from './airports.service';
import { CreateAirportDto } from './dtos/create-airport.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles/roles.guard';
import { Roles } from '../common/decorators/roles/roles.decorator';
import { UserRole } from '../users/users-role.enum';

@ApiTags('Airports')
@Controller('airports')
export class AirportsController {
  constructor(private readonly airportsService: AirportsService) {}

  @Get()
  @ApiOperation({ summary: 'List or search airports for flight route dropdowns (FLT-03, FLT-11)' })
  @ApiQuery({ name: 'search', required: false, description: 'Filter by city, country, airport name, or IATA code' })
  @ApiOkResponse({ description: 'List of matching airports' })
  findAll(@Query('search') search?: string) {
    return this.airportsService.findAll(search);
  }

  @Get(':iataCode')
  @ApiOperation({ summary: 'Get airport details by 3-letter IATA code' })
  @ApiOkResponse({ description: 'Airport details' })
  @ApiNotFoundResponse({ description: 'Airport code not found' })
  findByIataCode(@Param('iataCode') iataCode: string) {
    return this.airportsService.findByIataCode(iataCode);
  }

  @Post()
  @ApiCookieAuth('access_token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMINISTRATOR)
  @ApiOperation({ summary: 'Create an airport reference entry (Admin only)' })
  @ApiCreatedResponse({ description: 'Airport created successfully' })
  @ApiConflictResponse({ description: 'Airport IATA code already exists' })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Administrator privileges required' })
  create(@Body() dto: CreateAirportDto) {
    return this.airportsService.create(dto);
  }

  @Post('seed')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('access_token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMINISTRATOR)
  @ApiOperation({ summary: 'Seed standard reference airports if empty (Admin only)' })
  @ApiOkResponse({ description: 'Airports seeded' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Administrator privileges required' })
  seedDefaults() {
    return this.airportsService.seedDefaults();
  }
}
