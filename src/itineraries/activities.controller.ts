import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { ItinerariesService } from './itineraries.service';
import * as D from './dto/itinerary.dto';
import { CurrentUser } from '../common/decorators/current-user/current-user.decorator';
import type { AuthUser } from '../common/auth-user';
import { JwtAuthGuard } from '../common/guards/jwt-auth/jwt-auth.guard';
import { imageUploadOptions } from '../uploads/image-uploads.options';

export const imageUpload = FileInterceptor('file', imageUploadOptions('itineraries'));

@ApiTags('Itinerary children')
@ApiCookieAuth('access_token')
@UseGuards(JwtAuthGuard)
@Controller()
export class ActivitiesController {
  constructor(private svc: ItinerariesService) {}

  @Patch('activities/:id') updateAct(@Param('id') id: string, @Body() d: D.UpdateActivityDto, @CurrentUser() u: AuthUser) { return this.svc.updateActivity(id, d, u); }
  @Delete('activities/:id') delAct(@Param('id') id: string, @CurrentUser() u: AuthUser) { return this.svc.removeActivity(id, u); }

  @Post('activities/:id/images')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(imageUpload)
  addImg(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @CurrentUser() u: AuthUser) {
    if (!file) throw new BadRequestException('file is required');
    return this.svc.addActivityImage(id, file, u);
  }
  @Delete('activities/:id/images/:imageId') delImg(@Param('id') id: string, @Param('imageId') imgId: string, @CurrentUser() u: AuthUser) { return this.svc.removeActivityImage(id, imgId, u); }

  @Patch('budgets/:id') updBudget(@Param('id') id: string, @Body() d: D.UpdateBudgetDto, @CurrentUser() u: AuthUser) { return this.svc.updateBudget(id, d, u); }
  @Delete('budgets/:id') delBudget(@Param('id') id: string, @CurrentUser() u: AuthUser) { return this.svc.removeBudget(id, u); }

  @Patch('transport-costs/:id') updTc(@Param('id') id: string, @Body() d: D.UpdateTransportCostDto, @CurrentUser() u: AuthUser) { return this.svc.updateTransport(id, d, u); }
  @Delete('transport-costs/:id') delTc(@Param('id') id: string, @CurrentUser() u: AuthUser) { return this.svc.removeTransport(id, u); }
}
