import { UseGuards, Get, Controller } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth/jwt-auth.guard';

@Controller('users')
export class UsersController {
  @Get('me')
  @UseGuards(JwtAuthGuard)
  getProfile() {
    // nts: implement the current-user decorator later.
    return { message: 'Authenticated request' };
  }
}