import {
  Body,
  Controller,
  Post,
} from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthService } from './auth.service';
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
}
