import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
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
import { AirlinesService } from './airlines.service';
import { CreateAirlineDto } from './dtos/create-airline.dto';
import { UpdateAirlineDto } from './dtos/update-airline.dto';
import { UpdateBaggagePolicyDto } from './dtos/update-baggage-policy.dto';
import { UpdateCancellationPolicyDto } from './dtos/update-cancellation-policy.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles/roles.guard';
import { Roles } from '../common/decorators/roles/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user/current-user.decorator';
import { UserRole } from '../users/users-role.enum';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';

@ApiTags('Airlines')
@Controller('airlines')
export class AirlinesController {
  constructor(private readonly airlinesService: AirlinesService) {}

  @Post()
  @ApiCookieAuth('access_token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMINISTRATOR)
  @ApiOperation({ summary: 'Create a new airline (Admin only)' })
  @ApiCreatedResponse({ description: 'Airline created successfully' })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  @ApiConflictResponse({ description: 'IATA code already registered' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Administrator privileges required' })
  create(@Body() dto: CreateAirlineDto) {
    return this.airlinesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all active airlines' })
  @ApiOkResponse({ description: 'List of active airlines' })
  findAll() {
    return this.airlinesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get airline profile by ID' })
  @ApiOkResponse({ description: 'Airline details' })
  @ApiNotFoundResponse({ description: 'Airline not found' })
  @ApiBadRequestResponse({ description: 'Invalid ID format' })
  findById(@Param('id') id: string) {
    return this.airlinesService.findById(id);
  }

  @Patch(':id')
  @ApiCookieAuth('access_token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMINISTRATOR, UserRole.AIRLINE_MODERATOR)
  @ApiOperation({ summary: 'Update airline profile (Admin or assigned Moderator)' })
  @ApiOkResponse({ description: 'Airline updated successfully' })
  @ApiBadRequestResponse({ description: 'Invalid input data or ID format' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Only assigned moderator or admin authorized' })
  @ApiNotFoundResponse({ description: 'Airline not found' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAirlineDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.airlinesService.update(id, dto, currentUser);
  }

  @Put(':id/baggage-policy')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('access_token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMINISTRATOR, UserRole.AIRLINE_MODERATOR)
  @ApiOperation({ summary: 'Update airline baggage policy (FLT-04, FLT-08)' })
  @ApiOkResponse({ description: 'Baggage policy updated successfully' })
  @ApiBadRequestResponse({ description: 'Invalid policy values' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Only assigned moderator or admin authorized' })
  @ApiNotFoundResponse({ description: 'Airline not found' })
  updateBaggagePolicy(
    @Param('id') id: string,
    @Body() dto: UpdateBaggagePolicyDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.airlinesService.updateBaggagePolicy(id, dto, currentUser);
  }

  @Put(':id/cancellation-policy')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('access_token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMINISTRATOR, UserRole.AIRLINE_MODERATOR)
  @ApiOperation({ summary: 'Update airline cancellation & refund policy (FLT-09)' })
  @ApiOkResponse({ description: 'Cancellation policy updated successfully' })
  @ApiBadRequestResponse({ description: 'Invalid policy values' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Only assigned moderator or admin authorized' })
  @ApiNotFoundResponse({ description: 'Airline not found' })
  updateCancellationPolicy(
    @Param('id') id: string,
    @Body() dto: UpdateCancellationPolicyDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.airlinesService.updateCancellationPolicy(id, dto, currentUser);
  }
}
