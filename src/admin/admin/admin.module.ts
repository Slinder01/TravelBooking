import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { RolesGuard } from '../../common/guards/roles/roles.guard';
import { AuthModule } from '../../auth/auth.module';
import { UsersModule } from '../../users/users.module';
import { AirlinesModule } from '../../airlines/airlines.module';
import { AdminSeederService } from './admin-seeder.service';
@Module({
  imports: [AuthModule, UsersModule, AirlinesModule],
  controllers: [AdminController],
  providers: [RolesGuard, AdminSeederService],
})
export class AdminModule {}
