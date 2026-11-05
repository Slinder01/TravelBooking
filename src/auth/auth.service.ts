import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
// import { TooManyRequestsException } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dtos/login.dto';
import { RegisterDto } from './dtos/register.dto';
import { UserRole } from '../users/users-role.enum';
import { randomBytes } from 'crypto';
import { randomUUID } from 'crypto';
import { UserDocument } from '../users/schemas/user.schema';
// import { error } from 'console';




@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

   async login(dto: LoginDto) {
    const email = dto.email.toLowerCase().trim();

    const user = await this.usersService.findByEmail(email);

    
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    
    if (user.isSuspended) {
      throw new ForbiddenException('Account suspended');
    }

    if (user.isDeactivated) {
      throw new ForbiddenException('Account deactivated');
    }

    const now = new Date();

    
    if (user.lockUntil && user.lockUntil > now) {
      throw new HttpException(
        'Account locked. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    
    if (user.lockUntil && user.lockUntil <= now) {
      user.failedLoginAttempts = 0;
      user.lockUntil = null;
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.password,
    );

    if (!passwordMatches) {
      user.failedLoginAttempts += 1;

      if (user.failedLoginAttempts >= 5) {
        user.lockUntil = new Date(
          Date.now() + 15 * 60 * 1000,
        );

        await user.save();

        throw new HttpException(
          'Account locked for 15 minutes due to repeated failed login attempts.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      await user.save();

      throw new UnauthorizedException('Invalid email or password');
    }

    // ACC-05: Successful login resets the counter
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    user.lastActivityAt = new Date();
    await user.save();

    const payload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
      redirectTo: this.getRoleHome(user.role),
    };
  }

  private getRoleHome(role: UserRole): string {
    switch (role) {
      case UserRole.ADMINISTRATOR:
        return '/admin';

      case UserRole.AIRLINE_MODERATOR:
        return '/airline/dashboard';

      case UserRole.HOTEL_MODERATOR:
        return '/hotel/dashboard';

      default:
        return '/dashboard';
    }
  }
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

  async logout(userId: string) {
  await this.usersService.clearRefreshToken(userId);

  return { message: 'Logged out successfully' };
}
  private async generateTokens(user: UserDocument) {
  const payload = {
    sub: user._id.toString(),
    role: user.role,
  };

  const accessToken = await this.jwtService.signAsync(payload, {
    secret: process.env.JWT_ACCESS_SECRET,
    expiresIn: '15m',
  });

  const refreshToken = await this.jwtService.signAsync(
    {
      ...payload,
      jti: randomUUID(),
    },
    {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: '7d',
    },
  );

  user.refreshTokenHash = await bcrypt.hash(refreshToken, 10);
  await user.save();

  return { accessToken, refreshToken };
}
async refresh(refreshToken: string) {
  if (!refreshToken) {
    throw new UnauthorizedException('Session expired');
  }

  let payload: { sub: string; role: string };

  try {
    payload = await this.jwtService.verifyAsync(refreshToken, {
      secret: process.env.JWT_REFRESH_SECRET,
    });
  } catch {
    throw new UnauthorizedException('Session expired');
  }

  const user = await this.usersService.findByIdWithRefreshToken(
    payload.sub,
  );

  if (!user || !user.refreshTokenHash) {
    throw new UnauthorizedException('Session expired');
  }

  const tokenMatches = await bcrypt.compare(
    refreshToken,
    user.refreshTokenHash,
  );

  if (!tokenMatches) {
    throw new UnauthorizedException('Session expired');
  }

  
  const lastActivity = user.lastActivityAt?.getTime() ?? 0;

  if (Date.now() - lastActivity >= 30 * 60 * 1000) {
    await this.usersService.clearRefreshToken(user._id.toString());

    throw new UnauthorizedException('Session expired');
  }

  if (user.isSuspended || user.isDeactivated) {
    throw new UnauthorizedException('Account unavailable');
  }

  // Rotate tokens
  const tokens = await this.generateTokens(user);

  return tokens;
}
}
