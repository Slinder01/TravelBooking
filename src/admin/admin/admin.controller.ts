import {
  Controller,
  Get,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../../common/guards/jwt-auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles/roles.guard';

import { Roles } from '../../common/decorators/roles/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user/current-user.decorator';

import { UserRole } from '../../users/users-role.enum';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';

@ApiTags('Administration')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {

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
}