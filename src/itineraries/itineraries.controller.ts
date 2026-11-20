import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ItinerariesService } from './itineraries.service';
import * as D from './dto/itinerary.dto';
import { CurrentUser } from '../common/decorators/current-user/current-user.decorator';
import type { AuthUser } from '../common/auth-user';
import { JwtAuthGuard } from '../common/guards/jwt-auth/jwt-auth.guard';

@ApiTags('Itineraries')
@Controller('itineraries')
export class ItinerariesController {
  constructor(private svc: ItinerariesService) {}

  // ---- PUBLIC (no guard) -- declared first ----
  @Get('public/search') publicSearch(@Query() q: any) { return this.svc.publicSearch(q); }
  @Get('public/:id') getPublic(@Param('id') id: string) { return this.svc.getPublic(id); }

  // ---- PRIVATE ----
  @UseGuards(JwtAuthGuard) @Post() create(@Body() d: D.CreateItineraryDto, @CurrentUser() u: AuthUser) { return this.svc.create(d, u); }
  @UseGuards(JwtAuthGuard) @Get() list(@Query('page') p: number, @Query('limit') l: number, @CurrentUser() u: AuthUser) { return this.svc.listMine(u, +p || 1, +l || 10); }
  @UseGuards(JwtAuthGuard) @Get(':id') get(@Param('id') id: string, @CurrentUser() u: AuthUser) { return this.svc.getOne(id, u); }
  @UseGuards(JwtAuthGuard) @Patch(':id') update(@Param('id') id: string, @Body() d: D.UpdateItineraryDto, @CurrentUser() u: AuthUser) { return this.svc.update(id, d, u); }
  @UseGuards(JwtAuthGuard) @Delete(':id') remove(@Param('id') id: string, @CurrentUser() u: AuthUser) { return this.svc.remove(id, u); }

  @UseGuards(JwtAuthGuard) @Post(':id/days') addDay(@Param('id') id: string, @Body() d: D.CreateDayDto, @CurrentUser() u: AuthUser) { return this.svc.addDay(id, d, u); }
  @UseGuards(JwtAuthGuard) @Patch(':id/days/reorder') reorder(@Param('id') id: string, @Body() d: D.ReorderDaysDto, @CurrentUser() u: AuthUser) { return this.svc.reorderDays(id, d, u); }
  @UseGuards(JwtAuthGuard) @Patch(':id/days/:dayId') updateDay(@Param('id') id: string, @Param('dayId') dayId: string, @Body() d: D.UpdateDayDto, @CurrentUser() u: AuthUser) { return this.svc.updateDay(id, dayId, d, u); }
  @UseGuards(JwtAuthGuard) @Delete(':id/days/:dayId') removeDay(@Param('id') id: string, @Param('dayId') dayId: string, @CurrentUser() u: AuthUser) { return this.svc.removeDay(id, dayId, u); }

  @UseGuards(JwtAuthGuard) @Post(':id/days/:dayId/activities') addActivity(@Param('id') id: string, @Param('dayId') dayId: string, @Body() d: D.ActivityDto, @CurrentUser() u: AuthUser) { return this.svc.addActivity(id, dayId, d, u); }
  @UseGuards(JwtAuthGuard) @Post(':id/days/:dayId/budgets') addBudget(@Param('id') id: string, @Param('dayId') dayId: string, @Body() d: D.BudgetDto, @CurrentUser() u: AuthUser) { return this.svc.addBudget(id, dayId, d, u); }

  @UseGuards(JwtAuthGuard) @Post(':id/transport-costs') addTransport(@Param('id') id: string, @Body() d: D.TransportCostDto, @CurrentUser() u: AuthUser) { return this.svc.addTransport(id, d, u); }
  @UseGuards(JwtAuthGuard) @Get(':id/budget-summary') summary(@Param('id') id: string, @Query('currency') c: string = 'USD', @CurrentUser() u: AuthUser) { return this.svc.budgetSummary(id, c, u); }
  @UseGuards(JwtAuthGuard) @Post(':id/clone') clone(@Param('id') id: string, @CurrentUser() u: AuthUser) { return this.svc.clone(id, u); }
}
