import {
  Body,
  Controller,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { AuthService } from './auth.service';
import { LoginDto } from './dtos/login.dto';
import { RegisterDto } from './dtos/register.dto';

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
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.login(dto);
    const { accessToken, ...loginResponse } = result;

    response.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 15 * 60 * 1000,
    });

    return loginResponse;
  }
}
