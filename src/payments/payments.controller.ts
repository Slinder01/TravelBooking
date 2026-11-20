import { Body, Controller, Get, Headers, Param, ParseEnumPipe, Post, RawBodyRequest, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CurrentUser } from '../common/decorators/current-user/current-user.decorator';
import type { AuthUser } from '../common/auth-user';
import { JwtAuthGuard } from '../common/guards/jwt-auth/jwt-auth.guard';   // teammate's guard, adjust the path

enum BookingType { flight = 'flight', hotel = 'hotel' }

@ApiTags('Payments')
@Controller()
export class PaymentsController {
  constructor(private svc: PaymentsService) {}

  @UseGuards(JwtAuthGuard) @Get('bookings/:type/:id/policies')
  policies(@Param('type', new ParseEnumPipe(BookingType)) t: BookingType, @Param('id') id: string, @CurrentUser() u: AuthUser) {
    return this.svc.getPolicies(t, id, u);
  }

  @UseGuards(JwtAuthGuard) @Post('bookings/:type/:id/accept-policies')
  accept(@Param('type', new ParseEnumPipe(BookingType)) t: BookingType, @Param('id') id: string, @CurrentUser() u: AuthUser) {
    return this.svc.acceptPolicies(t, id, u);
  }

  @UseGuards(JwtAuthGuard) @Post('payments')
  create(@Body() dto: CreatePaymentDto, @CurrentUser() u: AuthUser) { return this.svc.create(dto, u); }

  @UseGuards(JwtAuthGuard) @Post('payments/:id/retry')
  retry(@Param('id') id: string, @CurrentUser() u: AuthUser) { return this.svc.retry(id, u); }

  @UseGuards(JwtAuthGuard) @Get('payments/:id')
  get(@Param('id') id: string, @CurrentUser() u: AuthUser) { return this.svc.get(id, u); }

  // NO auth guard: Stripe calls this. Security = signature verification.
  @Post('payments/webhook')
  webhook(@Req() req: any, @Headers('stripe-signature') sig: string) {
    return this.svc.handleWebhook(req.rawBody as Buffer, sig);
  }
}
