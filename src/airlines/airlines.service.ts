import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import { Airline, AirlineDocument } from './schemas/airline.schema';
import { CreateAirlineDto } from './dtos/create-airline.dto';
import { UpdateAirlineDto } from './dtos/update-airline.dto';
import { UpdateBaggagePolicyDto } from './dtos/update-baggage-policy.dto';
import { UpdateCancellationPolicyDto } from './dtos/update-cancellation-policy.dto';
import { UserRole } from '../users/users-role.enum';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';

@Injectable()
export class AirlinesService {
  constructor(
    @InjectModel(Airline.name)
    private readonly airlineModel: Model<AirlineDocument>,
  ) {}

  async create(dto: CreateAirlineDto): Promise<AirlineDocument> {
    const existing = await this.airlineModel.findOne({
      iataCode: dto.iataCode.toUpperCase().trim(),
    });

    if (existing) {
      throw new ConflictException(
        `Airline with IATA code '${dto.iataCode}' already exists`,
      );
    }

    const created = new this.airlineModel({
      ...dto,
      iataCode: dto.iataCode.toUpperCase().trim(),
    });

    return created.save();
  }

  async findAll(): Promise<AirlineDocument[]> {
    return this.airlineModel.find({ isActive: true }).exec();
  }

  async findById(id: string): Promise<AirlineDocument> {
    this.validateObjectId(id);

    const airline = await this.airlineModel.findById(id).exec();
    if (!airline) {
      throw new NotFoundException(`Airline with ID '${id}' not found`);
    }

    return airline;
  }

  async update(
    id: string,
    dto: UpdateAirlineDto,
    currentUser: AuthenticatedUser,
  ): Promise<AirlineDocument> {
    this.validateObjectId(id);
    this.assertModeratorOwnership(id, currentUser);

    const airline = await this.findById(id);

    if (dto.iataCode && dto.iataCode.toUpperCase() !== airline.iataCode) {
      const existing = await this.airlineModel.findOne({
        iataCode: dto.iataCode.toUpperCase().trim(),
        _id: { $ne: id },
      });
      if (existing) {
        throw new ConflictException(
          `Airline with IATA code '${dto.iataCode}' already exists`,
        );
      }
      airline.iataCode = dto.iataCode.toUpperCase().trim();
    }

    if (dto.name !== undefined) airline.name = dto.name;
    if (dto.country !== undefined) airline.country = dto.country;
    if (dto.contactEmail !== undefined) airline.contactEmail = dto.contactEmail;
    if (dto.website !== undefined) airline.website = dto.website;
    if (dto.isActive !== undefined) airline.isActive = dto.isActive;

    return airline.save();
  }

  async updateBaggagePolicy(
    id: string,
    dto: UpdateBaggagePolicyDto,
    currentUser: AuthenticatedUser,
  ): Promise<AirlineDocument> {
    this.validateObjectId(id);
    this.assertModeratorOwnership(id, currentUser);

    const airline = await this.findById(id);
    airline.baggagePolicy = {
      cabinBagAllowanceKg: dto.cabinBagAllowanceKg,
      checkedBagAllowanceKg: dto.checkedBagAllowanceKg,
      excessBagFeePerKg: dto.excessBagFeePerKg,
    };

    return airline.save();
  }

  async updateCancellationPolicy(
    id: string,
    dto: UpdateCancellationPolicyDto,
    currentUser: AuthenticatedUser,
  ): Promise<AirlineDocument> {
    this.validateObjectId(id);
    this.assertModeratorOwnership(id, currentUser);

    const airline = await this.findById(id);
    airline.cancellationPolicy = {
      freeCancellationHours: dto.freeCancellationHours,
      refundPercentage: dto.refundPercentage,
    };

    return airline.save();
  }

  private assertModeratorOwnership(
    targetAirlineId: string,
    currentUser: AuthenticatedUser,
  ): void {
    if (currentUser.role === UserRole.ADMINISTRATOR) {
      return; // Admins can manage all airlines
    }

    if (currentUser.role === UserRole.AIRLINE_MODERATOR) {
      if (!currentUser.airlineId || currentUser.airlineId !== targetAirlineId) {
        throw new ForbiddenException(
          'You are only authorized to manage your assigned airline',
        );
      }
      return;
    }

    throw new ForbiddenException('Insufficient permissions');
  }

  private validateObjectId(id: string): void {
    if (!isValidObjectId(id)) {
      throw new BadRequestException(`Invalid airline ID format: '${id}'`);
    }
  }
}
