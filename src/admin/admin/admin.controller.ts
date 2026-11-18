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

@ApiTags('Administration')
@ApiCookieAuth('access_token')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly airlinesService: AirlinesService,
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
  listAccounts(@Query() query: ListAccountsQueryDto) {
    return this.usersService.listAccounts(query).then(({ items, total }) => ({
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
    }));
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
  ) {
    return this.authService.adminResetPassword(userId, dto.temporaryPassword);
  }

  @Patch('accounts/:id/suspend')
  @Roles(UserRole.ADMINISTRATOR)
  @ApiOperation({ summary: 'Suspend a registered user or moderator' })
  @ApiOkResponse({ description: 'Account suspended and refresh session revoked' })
  @ApiBadRequestResponse({ description: 'Account role cannot be suspended' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Administrator privileges required' })
  suspendAccount(@Param('id') id: string) {
    return this.usersService.setAccountSuspended(id, true).then((user) => ({
      id: user._id.toString(),
      status: 'SUSPENDED',
    }));
  }

  @Patch('accounts/:id/reactivate')
  @Roles(UserRole.ADMINISTRATOR)
  @ApiOperation({ summary: 'Reactivate a suspended user or moderator' })
  @ApiOkResponse({ description: 'Account reactivated' })
  @ApiBadRequestResponse({ description: 'Account role cannot be reactivated' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Administrator privileges required' })
  reactivateAccount(@Param('id') id: string) {
    return this.usersService.setAccountSuspended(id, false).then((user) => ({
      id: user._id.toString(),
      status: user.isDeactivated ? 'DEACTIVATED' : 'ACTIVE',
    }));
  }

  @Patch('providers/:type/:id/deactivate')
  @Roles(UserRole.ADMINISTRATOR)
  @ApiOperation({ summary: 'Deactivate an airline provider' })
  @ApiOkResponse({ description: 'Airline deactivated and hidden from airline listing' })
  @ApiBadRequestResponse({ description: 'Provider type is invalid or unsupported' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Administrator privileges required' })
  deactivateProvider(
    @Param('type') type: string,
    @Param('id') id: string,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    if (type !== 'airline') {
      throw new NotFoundException(`Provider type '${type}' is not available in this backend`);
    }
    return this.airlinesService.update(id, { isActive: false }, admin);
  }

  @Patch('providers/:type/:id/reactivate')
  @Roles(UserRole.ADMINISTRATOR)
  @ApiOperation({ summary: 'Reactivate an airline provider' })
  @ApiOkResponse({ description: 'Airline reactivated' })
  @ApiBadRequestResponse({ description: 'Provider type is invalid or unsupported' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Administrator privileges required' })
  reactivateProvider(
    @Param('type') type: string,
    @Param('id') id: string,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    if (type !== 'airline') {
      throw new NotFoundException(`Provider type '${type}' is not available in this backend`);
    }
    return this.airlinesService.update(id, { isActive: true }, admin);
  }
}
