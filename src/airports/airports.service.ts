import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Airport, AirportDocument } from './schemas/airport.schema';
import { CreateAirportDto } from './dtos/create-airport.dto';
import { isValidIanaTimeZone } from '../flights/utils/timezone.util';

@Injectable()
export class AirportsService {
  constructor(
    @InjectModel(Airport.name)
    private readonly airportModel: Model<AirportDocument>,
  ) {}

  async create(dto: CreateAirportDto): Promise<AirportDocument> {
    if (!isValidIanaTimeZone(dto.timeZone)) {
      throw new BadRequestException(`Invalid IANA time zone: '${dto.timeZone}'`);
    }

    const code = dto.iataCode.toUpperCase().trim();
    const existing = await this.airportModel.findOne({ iataCode: code });

    if (existing) {
      throw new ConflictException(`Airport with IATA code '${code}' already exists`);
    }

    const created = new this.airportModel({
      ...dto,
      iataCode: code,
    });

    try {
      return await created.save();
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new ConflictException(`Airport with IATA code '${code}' already exists`);
      }
      throw error;
    }
  }

  async findAll(search?: string): Promise<AirportDocument[]> {
    if (search && search.trim()) {
      const term = search.trim();
      // Escape regular expression special characters to prevent ReDoS or syntax crashes
      const sanitized = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(sanitized, 'i');
      return this.airportModel
        .find({
          $or: [{ iataCode: regex }, { name: regex }, { city: regex }, { country: regex }],
        })
        .sort({ iataCode: 1 })
        .exec();
    }

    return this.airportModel.find().sort({ iataCode: 1 }).exec();
  }

  async findByIataCode(iataCode: string): Promise<AirportDocument> {
    const code = iataCode.toUpperCase().trim();
    const airport = await this.airportModel.findOne({ iataCode: code }).exec();

    if (!airport) {
      throw new NotFoundException(`Airport with IATA code '${code}' not found`);
    }

    return airport;
  }

  async seedDefaults(): Promise<{ message: string; count: number }> {
    const count = await this.airportModel.countDocuments();
    if (count > 0) {
      return { message: 'Airports already seeded', count };
    }

    const defaultAirports: CreateAirportDto[] = [
      { iataCode: 'CAI', name: 'Cairo International Airport', city: 'Cairo', cityId: 'cai', country: 'Egypt', countryCode: 'EG', timeZone: 'Africa/Cairo' },
      { iataCode: 'DXB', name: 'Dubai International Airport', city: 'Dubai', cityId: 'dxb', country: 'United Arab Emirates', countryCode: 'AE', timeZone: 'Asia/Dubai' },
      { iataCode: 'LHR', name: 'London Heathrow Airport', city: 'London', cityId: 'lon', country: 'United Kingdom', countryCode: 'GB', timeZone: 'Europe/London' },
      { iataCode: 'JFK', name: 'John F. Kennedy International Airport', city: 'New York', cityId: 'nyc', country: 'United States', countryCode: 'US', timeZone: 'America/New_York' },
      { iataCode: 'CDG', name: 'Charles de Gaulle Airport', city: 'Paris', cityId: 'par', country: 'France', countryCode: 'FR', timeZone: 'Europe/Paris' },
      { iataCode: 'HND', name: 'Tokyo Haneda Airport', city: 'Tokyo', cityId: 'tyo', country: 'Japan', countryCode: 'JP', timeZone: 'Asia/Tokyo' },
      { iataCode: 'RUH', name: 'King Khalid International Airport', city: 'Riyadh', cityId: 'ruh', country: 'Saudi Arabia', countryCode: 'SA', timeZone: 'Asia/Riyadh' },
      { iataCode: 'FRA', name: 'Frankfurt Airport', city: 'Frankfurt', cityId: 'fra', country: 'Germany', countryCode: 'DE', timeZone: 'Europe/Berlin' },
      { iataCode: 'BER', name: 'Berlin Brandenburg Airport', city: 'Berlin', cityId: 'ber', country: 'Germany', countryCode: 'DE', timeZone: 'Europe/Berlin' },
    ];

    await this.airportModel.insertMany(defaultAirports);
    return { message: 'Reference airports seeded successfully', count: defaultAirports.length };
  }
}
