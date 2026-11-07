import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Airport, AirportDocument } from './schemas/airport.schema';
import { CreateAirportDto } from './dtos/create-airport.dto';

@Injectable()
export class AirportsService {
  constructor(
    @InjectModel(Airport.name)
    private readonly airportModel: Model<AirportDocument>,
  ) {}

  async create(dto: CreateAirportDto): Promise<AirportDocument> {
    const code = dto.iataCode.toUpperCase().trim();
    const existing = await this.airportModel.findOne({ iataCode: code });

    if (existing) {
      throw new ConflictException(`Airport with IATA code '${code}' already exists`);
    }

    const created = new this.airportModel({
      ...dto,
      iataCode: code,
    });

    return created.save();
  }

  async findAll(search?: string): Promise<AirportDocument[]> {
    if (search && search.trim()) {
      const term = search.trim();
      const regex = new RegExp(term, 'i');
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
      { iataCode: 'CAI', name: 'Cairo International Airport', city: 'Cairo', country: 'Egypt', timeZone: 'Africa/Cairo' },
      { iataCode: 'BER', name: 'Berlin Brandenburg Airport', city: 'Berlin', country: 'Germany', timeZone: 'Europe/Berlin' },
      { iataCode: 'DXB', name: 'Dubai International Airport', city: 'Dubai', country: 'United Arab Emirates', timeZone: 'Asia/Dubai' },
      { iataCode: 'LHR', name: 'London Heathrow Airport', city: 'London', country: 'United Kingdom', timeZone: 'Europe/London' },
      { iataCode: 'JFK', name: 'John F. Kennedy International Airport', city: 'New York', country: 'United States', timeZone: 'America/New_York' },
      { iataCode: 'CDG', name: 'Charles de Gaulle Airport', city: 'Paris', country: 'France', timeZone: 'Europe/Paris' },
      { iataCode: 'HND', name: 'Tokyo Haneda Airport', city: 'Tokyo', country: 'Japan', timeZone: 'Asia/Tokyo' },
      { iataCode: 'IST', name: 'Istanbul Airport', city: 'Istanbul', country: 'Turkey', timeZone: 'Europe/Istanbul' },
    ];

    await this.airportModel.insertMany(defaultAirports);
    return { message: 'Reference airports seeded successfully', count: defaultAirports.length };
  }
}
