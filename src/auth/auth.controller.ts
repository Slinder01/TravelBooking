import {
  Body,
  Controller,
  Post,
  Req,
  Res,
  Patch,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth/jwt-auth.guard';
import { AuthService } from './auth.service';
import { LoginDto } from './dtos/login.dto';
import { RegisterDto } from './dtos/register.dto';
import { ChangePasswordDto } from './dtos/change-password.dto';
import { UpdateProfileDto } from './dtos/update-profile.dto';

@Controller('auth')
@ApiTags('Authentication')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiCreatedResponse({
    description: 'User registered successfully',
    schema: { example: { message: 'Registration successful', user: { id: '665f1a2b3c4d5e6f78901234', name: 'Alex Morgan', email: 'alex@example.com', role: 'REGISTERED_USER' } } },
  })
  @ApiBadRequestResponse({ description: 'Invalid input or terms were not accepted' })
  @ApiConflictResponse({ description: 'Email is already registered' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Log in and set an access token cookie' })
  @ApiOkResponse({ description: 'Login successful; access token is set in an HTTP-only cookie' })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  async login(
  @Body() dto: LoginDto,
  @Res({ passthrough: true }) response: Response,
) {
  const result = await this.authService.login(dto);

  response.cookie('access_token', result.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 15 * 60 * 1000,
    path: '/',
  });

  return {
    message: 'Login successful',
    user: result.user,
    redirectTo: result.redirectTo,
  };
}
@Post('logout')
@UseGuards(JwtAuthGuard)
async logout(
  @Req() request: Request & { user: { id: string } },
  @Res({ passthrough: true }) response: Response,
) {
  await this.authService.logout(request.user.id);

  response.clearCookie('access_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });

  response.clearCookie('refresh_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth',
  });

  return { message: 'Logged out successfully' };
}
@Post('refresh')
async refresh(
  @Req() request: Request,
  @Res({ passthrough: true }) response: Response,
) {
  const refreshToken = request.cookies?.refresh_token;

  const result = await this.authService.refresh(refreshToken);

  response.cookie('access_token', result.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 15 * 60 * 1000,
    path: '/',
  });

  response.cookie('refresh_token', result.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/api/auth',
  });

  return { message: 'Session refreshed' };
}
@Post('change-password')
@UseGuards(JwtAuthGuard)
@ApiOperation({
  summary: 'Change the current user\'s password',
})
@ApiOkResponse({
  description: 'Password changed successfully',
  schema: {
    example: {
      message: 'Password changed successfully. Please log in again.',
    },
  },
})
@ApiBadRequestResponse({
  description: 'New password does not meet requirements',
})
@ApiUnauthorizedResponse({
  description: 'Invalid current password or unauthenticated request',
})
async changePassword(
  @Req() request: Request & { user: { id: string } },
  @Body() dto: ChangePasswordDto,
) {
  return this.authService.changePassword(
    request.user.id,
    dto,
  );
}
@Patch('profile')
@UseGuards(JwtAuthGuard)
@ApiOperation({ summary: 'Update the current user profile' })
@ApiOkResponse({
  description: 'Profile updated successfully',
  schema: {
    example: {
      message: 'Profile updated successfully',
      user: {
        id: '665f1a2b3c4d5e6f78901234',
        name: 'Alex Morgan',
        email: 'alex@example.com',
        phone: '+201001234567',
        preferredCurrency: 'EGP',
        role: 'REGISTERED_USER',
      },
    },
  },
})
@ApiBadRequestResponse({ description: 'Invalid profile data' })
@ApiUnauthorizedResponse({ description: 'Authentication required' })
async updateProfile(
  @Req() request: Request & { user: { id: string } },
  @Body() dto: UpdateProfileDto,
) {
  return this.authService.updateProfile(
    request.user.id,
    dto,
  );
}
}
