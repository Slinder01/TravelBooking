import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UserRole } from '../../users/users-role.enum';
import { UsersService } from '../../users/users.service';

@Injectable()
export class AdminSeederService implements OnModuleInit {
  constructor(
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  async onModuleInit(): Promise<void> {
    const email = this.config.get<string>('ADMIN_EMAIL')?.trim().toLowerCase();
    const password = this.config.get<string>('ADMIN_PASSWORD');

    if (!email && !password) return;
    if (!email || !password) {
      throw new Error('Set both ADMIN_EMAIL and ADMIN_PASSWORD to seed an administrator');
    }
    if (password.length < 12) {
      throw new Error('ADMIN_PASSWORD must be at least 12 characters');
    }

    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      if (existing.role !== UserRole.ADMINISTRATOR) {
        throw new Error('ADMIN_EMAIL is already assigned to a non-administrator account');
      }
      return;
    }

    await this.usersService.create({
      name: this.config.get<string>('ADMIN_NAME')?.trim() || 'Administrator',
      email,
      password: await bcrypt.hash(password, 12),
      role: UserRole.ADMINISTRATOR,
      termsAccepted: true,
      termsAcceptedAt: new Date(),
    });
  }
}
