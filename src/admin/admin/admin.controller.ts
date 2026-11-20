import {
  Controller,
  Get,
  Param,
  Post,
  Body,
  Query,
  UseGuards,
  Patch,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
  ApiCreatedResponse,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../../common/guards/jwt-auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles/roles.guard';

import { Roles } from '../../common/decorators/roles/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user/current-user.decorator';

import { UserRole } from '../../users/users-role.enum';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AuthService } from '../../auth/auth.service';
import { UsersService } from '../../users/users.service';
import { AdminResetPasswordDto } from '../../auth/dtos/admin-reset-password.dto';
import { ListAccountsQueryDto } from './dtos/list-accounts-query.dto';
import { AirlinesService } from '../../airlines/airlines.service';
import { HotelService } from '../../hotels/hotel.service';
import { BookingService } from '../../bookings/booking.service';
import { CreateModeratorDto } from './dtos/create-moderator.dto';
import { ListBookingsQueryDto } from './dtos/list-bookings-query.dto';
import { ListAuditLogsQueryDto } from './dtos/list-audit-logs-query.dto';
import { AuditLogService } from './audit-log.service';
import * as bcrypt from 'bcrypt';
import { FlightBookingsService } from '../../flight-bookings/flight-bookings.service';

@ApiTags('Administration')
@ApiCookieAuth('access_token')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly airlinesService: AirlinesService,
    private readonly hotelService: HotelService,
    private readonly bookingService: BookingService,
    private readonly auditLogService: AuditLogService,
    private readonly flightBookingsService: FlightBookingsService,
  ) {}

  @Get('dashboard')
  @Roles(UserRole.ADMINISTRATOR)
  @ApiOperation({
    summary: 'Access the administrator dashboard',
  })
  @ApiOkResponse({
    description: 'Administrator access granted',
  })
  @ApiUnauthorizedResponse({
    description: 'User is not authenticated',
  })
  @ApiForbiddenResponse({
    description: 'User does not have administrator privileges',
  })
  getDashboard(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return {
      message: 'Welcome to the admin dashboard',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  @Get(['users', 'accounts'])
  @Roles(UserRole.ADMINISTRATOR)
  @ApiOperation({ summary: 'List, search, and filter accounts' })
  @ApiOkResponse({ description: 'Paginated account list' })
  async listAccounts(
    @Query() query: ListAccountsQueryDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    const { items, total } = await this.usersService.listAccounts(query);
    await this.auditLogService.record({
      actorUserId: admin.id,
      action: 'ACCOUNTS_LISTED',
      targetType: 'account_collection',
      targetId: 'all',
      metadata: { page: query.page, limit: query.limit, role: query.role, status: query.status },
    });
    return {
      items: items.map((account) => ({
        id: account._id.toString(),
        name: account.name,
        email: account.email,
        role: account.role,
        status: account.isDeactivated
          ? 'DEACTIVATED'
          : account.isSuspended
            ? 'SUSPENDED'
            : 'ACTIVE',
        registeredAt: account.createdAt,
      })),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    };
  }

  @Post('users/:userId/reset-password')
  @Roles(UserRole.ADMINISTRATOR)
  @ApiOperation({ summary: 'Reset a user or moderator password' })
  @ApiCreatedResponse({ description: 'Temporary password applied; user must change it on next login' })
  @ApiBadRequestResponse({ description: 'Invalid temporary password or target account role' })
  @ApiUnauthorizedResponse({ description: 'User is not authenticated' })
  @ApiForbiddenResponse({ description: 'User is not an administrator' })
  resetPassword(
    @Param('userId') userId: string,
    @Body() dto: AdminResetPasswordDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.authService.adminResetPassword(userId, dto.temporaryPassword).then(async (result) => {
      await this.auditLogService.record({
        actorUserId: admin.id,
        action: 'USER_PASSWORD_RESET',
        targetType: 'user',
        targetId: userId,
      });
      return result;
    });
  }

  @Post('moderators')
  @Roles(UserRole.ADMINISTRATOR)
  @ApiOperation({ summary: 'Create an airline or hotel moderator (ACC-13)' })
  @ApiCreatedResponse({ description: 'Moderator created; temporary password change is required at next login' })
  @ApiBadRequestResponse({ description: 'Invalid role, provider, or duplicate email' })
  async createModerator(
    @Body() dto: CreateModeratorDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    if (dto.role === UserRole.AIRLINE_MODERATOR) {
      if (!dto.airlineId || dto.hotelId) throw new BadRequestException('Provide only airlineId for an airline moderator');
      await this.airlinesService.findById(dto.airlineId);
    } else {
      if (!dto.hotelId || dto.airlineId) throw new BadRequestException('Provide only hotelId for a hotel moderator');
      await this.hotelService.findOne(dto.hotelId);
    }
    const moderator = await this.usersService.createModerator({
      name: dto.name.trim(),
      email: dto.email,
      password: await bcrypt.hash(dto.temporaryPassword, 12),
      role: dto.role,
      ...(dto.airlineId ? { airlineId: dto.airlineId as any } : {}),
      ...(dto.hotelId ? { hotelId: dto.hotelId as any } : {}),
    });
    await this.auditLogService.record({
      actorUserId: admin.id,
      action: 'MODERATOR_CREATED',
      targetType: 'user',
      targetId: moderator._id.toString(),
      metadata: {
        role: moderator.role,
        providerId: dto.airlineId ?? dto.hotelId,
      },
    });
    return {
      id: moderator._id.toString(),
      name: moderator.name,
      email: moderator.email,
      role: moderator.role,
      mustChangePassword: moderator.mustChangePassword,
    };
  }

  @Get('bookings')
  @Roles(UserRole.ADMINISTRATOR)
  @ApiOperation({ summary: 'List paginated hotel and flight bookings (ACC-17)' })
  @ApiOkResponse({ description: 'Paginated hotel and flight booking collections with user and service summaries' })
  async listBookings(
    @Query() query: ListBookingsQueryDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    const [hotel, flight] = await Promise.all([
      this.bookingService.listAllBookings(query),
      this.flightBookingsService.listAllBookings(query),
    ]);
    await this.auditLogService.record({
      actorUserId: admin.id,
      action: 'BOOKINGS_LISTED',
      targetType: 'booking_collection',
      targetId: 'all',
      metadata: { page: query.page, limit: query.limit, status: query.status },
    });
    return {
      hotelBookings: hotel.items,
      flightBookings: flight.items,
      page: query.page,
      limit: query.limit,
      totals: { hotel: hotel.total, flight: flight.total },
    };
  }

  @Get('audit-logs')
  @Roles(UserRole.ADMINISTRATOR)
  @ApiOperation({ summary: 'List administrator audit events (GEN-07)' })
  @ApiOkResponse({ description: 'Paginated audit events, newest first' })
  async listAuditLogs(@Query() query: ListAuditLogsQueryDto) {
    const { items, total } = await this.auditLogService.list(query);
    return {
      items,
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    };
  }

  @Patch('accounts/:id/suspend')
  @Roles(UserRole.ADMINISTRATOR)
  @ApiOperation({ summary: 'Suspend a registered user or moderator' })
  @ApiOkResponse({ description: 'Account suspended and refresh session revoked' })
  @ApiBadRequestResponse({ description: 'Account role cannot be suspended' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Administrator privileges required' })
  suspendAccount(@Param('id') id: string, @CurrentUser() admin: AuthenticatedUser) {
    return this.usersService.setAccountSuspended(id, true).then(async (user) => {
      await this.auditLogService.record({
        actorUserId: admin.id,
        action: 'ACCOUNT_SUSPENDED',
        targetType: 'user',
        targetId: id,
        metadata: { role: user.role },
      });
      return {
      id: user._id.toString(),
      status: 'SUSPENDED',
      };
    });
  }

  @Patch('accounts/:id/reactivate')
  @Roles(UserRole.ADMINISTRATOR)
  @ApiOperation({ summary: 'Reactivate a suspended user or moderator' })
  @ApiOkResponse({ description: 'Account reactivated' })
  @ApiBadRequestResponse({ description: 'Account role cannot be reactivated' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Administrator privileges required' })
  reactivateAccount(@Param('id') id: string, @CurrentUser() admin: AuthenticatedUser) {
    return this.usersService.setAccountSuspended(id, false).then(async (user) => {
      await this.auditLogService.record({
        actorUserId: admin.id,
        action: 'ACCOUNT_REACTIVATED',
        targetType: 'user',
        targetId: id,
        metadata: { role: user.role },
      });
      return {
      id: user._id.toString(),
      status: user.isDeactivated ? 'DEACTIVATED' : 'ACTIVE',
      };
    });
  }

  @Patch('providers/:type/:id/deactivate')
  @Roles(UserRole.ADMINISTRATOR)
  @ApiOperation({ summary: 'Deactivate an airline or hotel provider (ACC-15)' })
  @ApiOkResponse({ description: 'Provider deactivated and hidden from public listings' })
  @ApiBadRequestResponse({ description: 'Provider type is invalid or unsupported' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Administrator privileges required' })
  async deactivateProvider(
    @Param('type') type: string,
    @Param('id') id: string,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    if (type === 'hotel') {
      const hotel = await this.hotelService.setHotelActive(id, false);
      await this.auditLogService.record({ actorUserId: admin.id, action: 'PROVIDER_DEACTIVATED', targetType: 'hotel', targetId: id });
      return hotel;
    }
    if (type !== 'airline') {
      throw new NotFoundException(`Provider type '${type}' is not available in this backend`);
    }
    const airline = await this.airlinesService.update(id, { isActive: false }, admin);
    await this.auditLogService.record({ actorUserId: admin.id, action: 'PROVIDER_DEACTIVATED', targetType: 'airline', targetId: id });
    return airline;
  }

  @Patch('providers/:type/:id/reactivate')
  @Roles(UserRole.ADMINISTRATOR)
  @ApiOperation({ summary: 'Reactivate an airline or hotel provider (ACC-15)' })
  @ApiOkResponse({ description: 'Provider reactivated' })
  @ApiBadRequestResponse({ description: 'Provider type is invalid or unsupported' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Administrator privileges required' })
  async reactivateProvider(
    @Param('type') type: string,
    @Param('id') id: string,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    if (type === 'hotel') {
      const hotel = await this.hotelService.setHotelActive(id, true);
      await this.auditLogService.record({ actorUserId: admin.id, action: 'PROVIDER_REACTIVATED', targetType: 'hotel', targetId: id });
      return hotel;
    }
    if (type !== 'airline') {
      throw new NotFoundException(`Provider type '${type}' is not available in this backend`);
    }
    const airline = await this.airlinesService.update(id, { isActive: true }, admin);
    await this.auditLogService.record({ actorUserId: admin.id, action: 'PROVIDER_REACTIVATED', targetType: 'airline', targetId: id });
    return airline;
  }

}
