import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Get,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth/jwt-auth.guard';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dtos/change-password.dto';
import { LoginDto } from './dtos/login.dto';
import { RegisterDto } from './dtos/register.dto';
import { UpdateProfileDto } from './dtos/update-profile.dto';

@Controller('auth')
@ApiTags('Authentication')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiCreatedResponse({
    description: 'User registered successfully',
    schema: {
      example: {
        message: 'Registration successful',
        user: {
          id: '665f1a2b3c4d5e6f78901234',
          name: 'Alex Morgan',
          email: 'alex@example.com',
          role: 'REGISTERED_USER',
        },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid input or terms were not accepted' })
  @ApiConflictResponse({ description: 'Email is already registered' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in and set authentication cookies' })
  @ApiOkResponse({ description: 'Login successful; access and refresh tokens are HTTP-only cookies' })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  @ApiForbiddenResponse({ description: 'Account suspended or deactivated' })
  @ApiTooManyRequestsResponse({ description: 'Account is locked after repeated failed attempts' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(dto);
    this.setAuthCookies(response, result.accessToken, result.refreshToken);

    return {
      message: 'Login successful',
      user: result.user,
      redirectTo: result.redirectTo,
    };
  }

  @Get('me')
  @ApiCookieAuth('access_token')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get the current authenticated account' })
  @ApiOkResponse({ description: 'Current account profile' })
  @ApiUnauthorizedResponse({ description: 'Authentication required or session expired' })
  getCurrentUser(@Req() request: Request & { user: { id: string } }) {
    return this.authService.getCurrentUser(request.user.id);
  }

  @Post('logout')
  @ApiCookieAuth('access_token')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Log out and revoke the refresh session' })
  @ApiOkResponse({ description: 'Refresh session revoked and authentication cookies cleared' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async logout(
    @Req() request: Request & { user: { id: string } },
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.logout(request.user.id);
    this.clearAuthCookies(response);
    return { message: 'Logged out successfully' };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate access and refresh tokens' })
  @ApiOkResponse({ description: 'Session refreshed; both HTTP-only cookies rotated' })
  @ApiUnauthorizedResponse({ description: 'Refresh session is missing, expired, idle, or revoked' })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.refresh(request.cookies?.refresh_token);
    this.setAuthCookies(response, result.accessToken, result.refreshToken);
    return { message: 'Session refreshed' };
  }

  @Patch('change-password')
  @ApiCookieAuth('access_token')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Change the current user password' })
  @ApiOkResponse({ description: 'Password changed and refresh session revoked' })
  @ApiBadRequestResponse({ description: 'New password is invalid or unchanged' })
  @ApiUnauthorizedResponse({ description: 'Invalid current password or unauthenticated request' })
  async changePassword(
    @Req() request: Request & { user: { id: string } },
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.changePassword(request.user.id, dto);
    this.clearAuthCookies(response);
    return result;
  }

  @Patch('profile')
  @ApiCookieAuth('access_token')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update the current user profile' })
  @ApiOkResponse({ description: 'Profile updated successfully' })
  @ApiBadRequestResponse({ description: 'Invalid profile data or no fields supplied' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  updateProfile(
    @Req() request: Request & { user: { id: string } },
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(request.user.id, dto);
  }

  private setAuthCookies(response: Response, accessToken: string, refreshToken: string) {
    const sharedOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV !== 'development',
      sameSite: 'lax' as const,
    };

    response.cookie('access_token', accessToken, {
      ...sharedOptions,
      maxAge: 15 * 60 * 1000,
      path: '/',
    });
    response.cookie('refresh_token', refreshToken, {
      ...sharedOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/auth',
    });
  }

  private clearAuthCookies(response: Response) {
    const sharedOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV !== 'development',
      sameSite: 'lax' as const,
    };

    response.clearCookie('access_token', { ...sharedOptions, path: '/' });
    response.clearCookie('refresh_token', { ...sharedOptions, path: '/api/auth' });
  }
}
