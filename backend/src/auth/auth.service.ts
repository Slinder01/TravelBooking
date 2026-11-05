import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
// import { error } from 'console';


import * as bcrypt from 'bcrypt';

import { UsersService } from '../users/users.service';
import { RegisterDto } from './dtos/register.dto';
import { UserRole } from '../users/users-role.enum';

@Injectable()
export class AuthService {
  constructor(private readonly usersService: UsersService) {}

  async register(dto: RegisterDto) {
    if (!dto.termsAccepted) {
      throw new BadRequestException(
        'Terms and privacy consent are required',
      );
    }

    const existingUser = await this.usersService.findByEmail(dto.email);

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    try {
      const user = await this.usersService.create({
        name: dto.name.trim(),
        email: dto.email.toLowerCase().trim(),
        password: hashedPassword,
        role: UserRole.REGISTERED_USER,
        termsAccepted: true,
        termsAcceptedAt: new Date(),
      });

      return {
        message: 'Registration successful',
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      };
    }  catch (e: any) {
      if (e?.code === 11000) {
        throw new ConflictException('Email already registered');
      }

      throw e;
    }
  }
}