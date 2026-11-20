import { Body, Controller, Delete, Param, Patch, Post, UploadedFile, UseGuards, UseInterceptors, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { ItinerariesService } from './itineraries.service';
import * as D from './dto/itinerary.dto';
import { CurrentUser } from '../common/decorators/current-user/current-user.decorator';
import type { AuthUser } from '../common/auth-user';
import { JwtAuthGuard } from '../common/guards/jwt-auth/jwt-auth.guard';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
export const imageUpload = FileInterceptor('file', {
  storage: diskStorage({
    destination: (_r, _f, cb) => {
      const dir = './uploads';
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_r, f, cb) => cb(null, `${randomUUID()}${extname(f.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_r, f, cb) => ALLOWED.includes(f.mimetype) ? cb(null, true) : cb(new BadRequestException('Only JPEG, PNG or WEBP images allowed'), false),
});

@ApiTags('Itinerary children')
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
