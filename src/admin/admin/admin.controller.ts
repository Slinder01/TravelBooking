import {
  Controller,
  Get,
  Param,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBearerAuth,
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

@ApiTags('Administration')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
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

  @Get('users')
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
}
