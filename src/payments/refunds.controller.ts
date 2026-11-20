import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RefundsService } from './refunds.service';
import { CurrentUser } from '../common/decorators/current-user/current-user.decorator';
import type { AuthUser } from '../common/auth-user';
import { JwtAuthGuard } from '../common/guards/jwt-auth/jwt-auth.guard';

@ApiTags('Refunds')
@Controller('refunds')
export class RefundsController {
  constructor(private svc: RefundsService) {}
  @UseGuards(JwtAuthGuard) @Get(':id')
  get(@Param('id') id: string, @CurrentUser() u: AuthUser) { return this.svc.get(id, u); }
}
