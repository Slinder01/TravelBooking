import {
  Controller,
  Post,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';

import {
  ApiOperation,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';

import { AuthService } from '../../auth/auth.service';
import { AdminResetPasswordDto } from '../../auth/dtos/admin-reset-password.dto';

import { JwtAuthGuard } from '../../common/guards/jwt-auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles/roles.guard';
import { Roles } from '../../common/decorators/roles/roles.decorator';
import { UserRole } from '../../users/users-role.enum';


@Controller('admin/accounts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMINISTRATOR)
export class AdminController {
  constructor(
    private readonly authService: AuthService,
  ) {}

  @Post(':userId/reset-password')
  @ApiOperation({
    summary: 'Reset a user or moderator password',
  })
  @ApiOkResponse({
    description: 'Password reset successfully',
    schema: {
      example: {
        message: 'Password reset successfully. User must change password at next login.',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Temporary password does not meet password rules',
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication required',
  })
  @ApiForbiddenResponse({
    description: 'Only administrators can reset passwords',
  })
  @ApiNotFoundResponse({
    description: 'Account not found',
  })
  async resetPassword(
    @Param('userId') userId: string,
    @Body() dto: AdminResetPasswordDto,
  ) {
    return this.authService.adminResetPassword(
      userId,
      dto.temporaryPassword,
    );
  }
}