import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Payment, PaymentSchema } from './schemas/payment.schema';
import { Refund, RefundSchema } from './schemas/refund.schema';
import { PolicyAcceptance, PolicyAcceptanceSchema } from './schemas/policy-acceptance.schema';
import { PaymentsService } from './payments.service';
import { RefundsService } from './refunds.service';
import { PaymentsController } from './payments.controller';
import { RefundsController } from './refunds.controller';

@Module({
  imports: [MongooseModule.forFeature([
    { name: Payment.name, schema: PaymentSchema },
    { name: Refund.name, schema: RefundSchema },
    { name: PolicyAcceptance.name, schema: PolicyAcceptanceSchema },
  ])],
  controllers: [PaymentsController, RefundsController],
  providers: [PaymentsService, RefundsService],
  exports: [RefundsService, PaymentsService],   // teammates import PaymentsModule to call processCancellation
})
export class PaymentsModule {}
