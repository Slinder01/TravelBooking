import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Hotel, HotelDocument } from './schemas/hotel.schema';
import { Room, RoomDocument } from './schemas/room.schema';
import { Booking } from './schemas/booking.schema'; 
import { RoomAvailability, RoomAvailabilityDocument } from './schemas/room-availability.schema';
import { CreateHotelDto } from './dto/create-hotel.dto';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { HotelPolicyDto } from './dto/hotel-policy.dto';
import { SearchHotelDto } from './dto/search-hotel.dto';
import { UpdateHotelDto } from './dto/update-hotel.dto';
import { CreateRoomAvailabilityDto } from './dto/create-room-availability.dto';
import { UpdateRoomAvailabilityDto } from './dto/update-room-availability.dto';


@Injectable()
export class HotelService {
  constructor(
    @InjectModel(Hotel.name) private hotelModel: Model<HotelDocument>,
    @InjectModel(Room.name) private roomModel: Model<RoomDocument>,
    @InjectModel(RoomAvailability.name) private roomAvailabilityModel: Model<RoomAvailabilityDocument>,
    @InjectModel(Booking.name) private bookingModel: Model<Booking>,
  ) {}

  async create(createHotelDto: CreateHotelDto, moderatorId: string): Promise<Hotel> {
    const newHotel = new this.hotelModel({
      ...createHotelDto,
      moderatorId,
    });
    return newHotel.save();
  }

  async findAll(): Promise<Hotel[]> {
    return this.hotelModel.find().exec();
  }

  async findOne(id: string): Promise<Hotel> {
    const hotel = await this.hotelModel.findById(id).exec();
    if (!hotel) {
      throw new NotFoundException(`Hotel with ID ${id} not found`);
    }
    return hotel;
  }

  async createRoom(hotelId: string, createRoomDto: CreateRoomDto): Promise<Room> {
    await this.findOne(hotelId);
    const newRoom = new this.roomModel({
      ...createRoomDto,
      hotelId,
    });
    return newRoom.save();
  }

  async updateRoom(roomId: string, updateRoomDto: UpdateRoomDto): Promise<Room> {
    const updatedRoom = await this.roomModel
      .findByIdAndUpdate(roomId, updateRoomDto, { new: true })
      .exec();
    if (!updatedRoom) {
      throw new NotFoundException(`Room with ID ${roomId} not found`);
    }
    return updatedRoom;
  }

  async removeRoom(roomId: string): Promise<{ message: string }> {
    const result = await this.roomModel.findByIdAndDelete(roomId).exec();
    if (!result) {
      throw new NotFoundException(`Room with ID ${roomId} not found`);
    }
    return { message: `Room with ID ${roomId} successfully deleted` };
  }

  // Check Room Availability
  async getRoomAvailability(roomId: string): Promise<any[]> {
    return this.roomAvailabilityModel.find({ roomId: roomId as any }).exec();
  }

  // Update Hotel Policies (Requirements HTL-09, HTL-10)
  async updatePolicies(hotelId: string, policyDto: HotelPolicyDto): Promise<Hotel> {
    const updatedHotel = await this.hotelModel
      .findByIdAndUpdate(
        hotelId,
        { policies: policyDto },
        { new: true, runValidators: true },
      )
      .exec();

    if (!updatedHotel) {
      throw new NotFoundException(`Hotel with ID ${hotelId} not found`);
    }
    return updatedHotel;
  }

  async searchHotels(searchDto: SearchHotelDto): Promise<any[]> {
    const { city, destination, minRating, sortBy, minPrice, maxPrice, guests } = searchDto;
    const filter: any = {};

    const searchTarget = city || destination;
    if (searchTarget) {
      filter.$or = [
        { city: { $regex: searchTarget, $options: 'i' } },
        { country: { $regex: searchTarget, $options: 'i' } },
        { name: { $regex: searchTarget, $options: 'i' } },
      ];
    }

    if (minRating) {
      filter.averageRating = { $gte: Number(minRating) };
    }

    const hotels = await this.hotelModel.find(filter).lean().exec();
    let results: any[] = hotels;

    // Filter by price range and guests capacity across rooms if specified
    if (minPrice !== undefined || maxPrice !== undefined || guests !== undefined) {
      const filteredHotels = [];

      for (const hotel of hotels) {
        const rooms = await this.roomModel.find({
          hotelId: hotel._id as any,
          ...(guests ? { maxOccupancy: { $gte: Number(guests) } } : {}),
          ...(minPrice !== undefined || maxPrice !== undefined ? {
            pricePerNight: {
              ...(minPrice !== undefined ? { $gte: Number(minPrice) } : {}),
              ...(maxPrice !== undefined ? { $lte: Number(maxPrice) } : {}),
            }
          } : {})
        }).lean().exec();

        if (rooms.length > 0) {
          filteredHotels.push({
            ...hotel,
            availableMatchingRooms: rooms,
          });
        }
      }
      results = filteredHotels;
    }

    // Optional sorting
    if (sortBy === 'rating') {
      results.sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0));
    }

    return results;
  }

  async update(id: string, updateHotelDto: UpdateHotelDto): Promise<Hotel> {
    const updatedHotel = await this.hotelModel
      .findByIdAndUpdate(id, updateHotelDto, { new: true, runValidators: true })
      .exec();

    if (!updatedHotel) {
      throw new NotFoundException(`Hotel with ID ${id} not found`);
    }
    return updatedHotel;
  }

  async createRoomAvailability(
    hotelId: string,
    roomId: string,
    dto: CreateRoomAvailabilityDto,
  ): Promise<RoomAvailability> {
    // Verify room exists and belongs to the hotel
    const room = await this.roomModel.findOne({ 
        _id: roomId as any, 
        hotelId: hotelId as any 
      }).exec();
    if (!room) {
      throw new NotFoundException(`Room with ID ${roomId} not found in hotel ${hotelId}`);
    }

    const newAvailability = new this.roomAvailabilityModel({
      roomId,
      hotelId,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      availableCount: dto.availableCount,
    });

    return newAvailability.save();
  }

  async updateRoomAvailability(
    hotelId: string,
    roomId: string,
    availabilityId: string,
    dto: UpdateRoomAvailabilityDto,
  ): Promise<RoomAvailability> {
    const updated = await this.roomAvailabilityModel
      .findOneAndUpdate(
        { _id: availabilityId as any, roomId: roomId as any, hotelId: hotelId as any },
        dto,
        { new: true, runValidators: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException(`Room availability record not found`);
    }
    return updated;
  }

  // View Room Status for a Hotel (Requirement HTL-08)
  async getHotelAvailability(hotelId: string): Promise<RoomAvailability[]> {
    return this.roomAvailabilityModel
      .find({ hotelId: hotelId as any })
      .exec();
  }

  // View Available Rooms for Specific Dates (Requirement HTL-15)
  async getAvailableRooms(hotelId: string, checkIn: string, checkOut: string): Promise<any[]> {
    const startDate = new Date(checkIn);
    const endDate = new Date(checkOut);

    // Find availability records for this hotel overlapping with the dates and availableCount > 0
    const availabilities = await this.roomAvailabilityModel.find({
      hotelId: hotelId as any,
      startDate: { $lte: endDate },
      endDate: { $gte: startDate },
      availableCount: { $gt: 0 },
    }).exec();

    const roomIds = availabilities.map((a) => a.roomId);

    // Fetch the actual room details for those IDs
    return this.roomModel.find({
      _id: { $in: roomIds as any },
      hotelId: hotelId as any,
    }).exec();
  }

  // Hotel Moderator View of Reservations (Requirement HTL-22)
  async getHotelReservations(hotelId: string): Promise<any[]> {
    // Assuming you have a Hotel Booking model or similar schema injected in hotel module
    // If your booking model is imported, we can query it directly:
    return this.bookingModel.find({ hotelId: hotelId as any }).exec();
  }
}