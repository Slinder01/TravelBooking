import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Req, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { HotelService } from './hotel.service';
import { CreateHotelDto } from './dto/create-hotel.dto';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { HotelPolicyDto } from './dto/hotel-policy.dto';
import { SearchHotelDto } from './dto/search-hotel.dto';
import { UpdateHotelDto } from './dto/update-hotel.dto';
import { CreateRoomAvailabilityDto } from './dto/create-room-availability.dto';
import { UpdateRoomAvailabilityDto } from './dto/update-room-availability.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth/jwt-auth.guard';

@ApiTags('Hotels & Rooms')
@Controller('hotels')
export class HotelController {
  constructor(private readonly hotelService: HotelService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a hotel profile (HTL-01)' })
  @ApiResponse({ status: 201, description: 'Hotel successfully created.' })
  async create(@Body() createHotelDto: CreateHotelDto, @Req() req: any) {
    const moderatorId = req.user?.userId || '650c1234567890abcdef1234';
    return this.hotelService.create(createHotelDto, moderatorId);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search and filter hotels by destination, rating, price, and guests (HTL-11, HTL-12)' })
  @ApiResponse({ status: 200, description: 'List of matching hotels.' })
  async searchHotels(@Query() searchDto: SearchHotelDto) {
    return this.hotelService.searchHotels(searchDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all hotels' })
  async findAll() {
    return this.hotelService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get specific hotel details and its rooms (HTL-02)' })
  async findOne(@Param('id') id: string) {
    return this.hotelService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update hotel profile (HTL-01)' })
  async update(
    @Param('id') id: string,
    @Body() updateHotelDto: UpdateHotelDto,
  ) {
    return this.hotelService.update(id, updateHotelDto);
  }

  @Post(':id/rooms')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a room to a hotel (HTL-03)' })
  async createRoom(
    @Param('id') hotelId: string,
    @Body() createRoomDto: CreateRoomDto,
  ) {
    return this.hotelService.createRoom(hotelId, createRoomDto);
  }

  @Patch(':id/rooms/:roomId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update room details (HTL-05)' })
  async updateRoom(
    @Param('roomId') roomId: string,
    @Body() updateRoomDto: UpdateRoomDto,
  ) {
    return this.hotelService.updateRoom(roomId, updateRoomDto);
  }

  @Delete(':id/rooms/:roomId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a room (HTL-06)' })
  async removeRoom(@Param('roomId') roomId: string) {
    return this.hotelService.removeRoom(roomId);
  }

  @Get(':id/rooms/:roomId/availability')
  @ApiOperation({ summary: 'Get availability records for a specific room' })
  async getRoomAvailability(@Param('roomId') roomId: string) {
    return this.hotelService.getRoomAvailability(roomId);
  }

  @Put(':id/policies')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set or update hotel cancellation and stay policies (HTL-09, HTL-10)' })
  async updatePolicies(
    @Param('id') hotelId: string,
    @Body() policyDto: HotelPolicyDto,
  ) {
    return this.hotelService.updatePolicies(hotelId, policyDto);
  }

  @Post(':id/rooms/:roomId/availability')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set availability and pricing for a room (HTL-04)' })
  async createRoomAvailability(
    @Param('id') hotelId: string,
    @Param('roomId') roomId: string,
    @Body() dto: CreateRoomAvailabilityDto,
  ) {
    return this.hotelService.createRoomAvailability(hotelId, roomId, dto);
  }

  @Patch(':id/rooms/:roomId/availability/:availabilityId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update availability and blocked dates for a room (HTL-05, HTL-06)' })
  async updateRoomAvailability(
    @Param('id') hotelId: string,
    @Param('roomId') roomId: string,
    @Param('availabilityId') availabilityId: string,
    @Body() dto: UpdateRoomAvailabilityDto,
  ) {
    return this.hotelService.updateRoomAvailability(hotelId, roomId, availabilityId, dto);
  }

  @Get(':id/availability')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get overall hotel availability overview (HTL-08)' })
  async getHotelAvailability(@Param('id') hotelId: string) {
    return this.hotelService.getHotelAvailability(hotelId);
  }

  @Get(':id/rooms/available')
  @ApiOperation({ summary: 'Check available rooms for specific dates (HTL-15)' })
  async getAvailableRooms(
    @Param('id') hotelId: string,
    @Query('checkIn') checkIn: string,
    @Query('checkOut') checkOut: string,
  ) {
    return this.hotelService.getAvailableRooms(hotelId, checkIn, checkOut);
  }

  @Get(':id/reservations')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'View reservations for the hotel moderator (HTL-22)' })
  async getHotelReservations(@Param('id') hotelId: string) {
    return this.hotelService.getHotelReservations(hotelId);
  }
}