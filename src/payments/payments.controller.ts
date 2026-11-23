import { Body, Controller, Get, Headers, Param, ParseEnumPipe, Post, Req, UseGuards, type RawBodyRequest } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CurrentUser } from '../common/decorators/current-user/current-user.decorator';
import type { AuthUser } from '../common/auth-user';
import { JwtAuthGuard } from '../common/guards/jwt-auth/jwt-auth.guard';

enum BookingType { flight = 'flight', hotel = 'hotel' }

@ApiTags('Payments')
@Controller()
export class PaymentsController {
  constructor(private svc: PaymentsService) {}

  @ApiCookieAuth('access_token')
  @UseGuards(JwtAuthGuard) @Get('bookings/:type/:id/policies')
  policies(@Param('type', new ParseEnumPipe(BookingType)) t: BookingType, @Param('id') id: string, @CurrentUser() u: AuthUser) {
    return this.svc.getPolicies(t, id, u);
  }

  @ApiCookieAuth('access_token')
  @UseGuards(JwtAuthGuard) @Post('bookings/:type/:id/accept-policies')
  accept(@Param('type', new ParseEnumPipe(BookingType)) t: BookingType, @Param('id') id: string, @CurrentUser() u: AuthUser) {
    return this.svc.acceptPolicies(t, id, u);
  }

  @ApiCookieAuth('access_token')
  @UseGuards(JwtAuthGuard) @Post('payments')
  create(@Body() dto: CreatePaymentDto, @CurrentUser() u: AuthUser) { return this.svc.create(dto, u); }

  @ApiCookieAuth('access_token')
  @UseGuards(JwtAuthGuard) @Post('payments/:id/retry')
  retry(@Param('id') id: string, @CurrentUser() u: AuthUser) { return this.svc.retry(id, u); }

  @ApiCookieAuth('access_token')
  @UseGuards(JwtAuthGuard) @Get('payments/:id')
  get(@Param('id') id: string, @CurrentUser() u: AuthUser) { return this.svc.get(id, u); }

  // NO auth guard: Stripe calls this. Security = signature verification.
  @Post('payments/webhook')
  webhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') sig: string) {
    return this.svc.handleWebhook(req.rawBody as Buffer, sig);
  }
}
