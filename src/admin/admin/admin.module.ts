import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { RolesGuard } from '../../common/guards/roles/roles.guard';
import { AuthModule } from '../../auth/auth.module';
import { UsersModule } from '../../users/users.module';
@Module({
  imports: [AuthModule, UsersModule],
  controllers: [AdminController],
  providers: [RolesGuard],
})
export class AdminModule {}
