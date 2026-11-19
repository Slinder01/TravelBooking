import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { UserRole } from './users-role.enum';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async findByEmail(email: string) {
    return this.userModel
      .findOne({ email: email.toLowerCase() })
      .select('+password')
      .exec();
  }

  async create(data: Partial<User>) {
    return this.userModel.create(data);
  }

  async findById(id: string) {
    return this.userModel.findById(id).exec();
  }

  async updateLastActivity(id: string) {
    return this.userModel
      .updateOne({ _id: id }, { $set: { lastActivityAt: new Date() } })
      .exec();
  }

  async clearRefreshToken(id: string) {
    return this.userModel.findByIdAndUpdate(id, {
      refreshTokenHash: null,
    });
  }

  async findByIdWithRefreshToken(id: string) {
    return this.userModel.findById(id).select('+refreshTokenHash').exec();
  }

  async updatePassword(
    id: string,
    updates: {
      password: string;
      mustChangePassword: boolean;
      refreshTokenHash: string | null;
    },
  ) {
    return this.userModel.findByIdAndUpdate(id, updates, { new: true });
  }

  async findByIdWithPassword(id: string) {
    return this.userModel.findById(id).select('+password').exec();
  }

  async updateProfile(
    id: string,
    updates: {
      name?: string;
      phone?: string;
      preferredCurrency?: string;
    },
  ) {
    return this.userModel
      .findByIdAndUpdate(id, { $set: updates }, { new: true, runValidators: true })
      .select('-password -refreshTokenHash')
      .exec();
  }

  async listAccounts(query: {
    page: number;
    limit: number;
    search?: string;
    role?: UserRole;
    status?: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
  }) {
    const filter: Record<string, unknown> = {};

    if (query.role) filter.role = query.role;
    if (query.status === 'ACTIVE') {
      filter.isSuspended = { $ne: true };
      filter.isDeactivated = { $ne: true };
    } else if (query.status === 'SUSPENDED') {
      filter.isSuspended = true;
      filter.isDeactivated = { $ne: true };
    } else if (query.status === 'DEACTIVATED') {
      filter.isDeactivated = true;
    }

    const search = query.search?.trim();
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
      ];
    }

    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      this.userModel
        .find(filter)
        .select('name email role isSuspended isDeactivated createdAt')
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(query.limit)
        .lean()
        .exec(),
      this.userModel.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }

  async setAccountSuspended(id: string, suspended: boolean) {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('Account not found');
    }

    if (user.role === UserRole.ADMINISTRATOR || user.role === UserRole.GUEST) {
      throw new BadRequestException(
        'Only registered users and moderators can be suspended',
      );
    }

    const updates: Record<string, unknown> = { isSuspended: suspended };
    if (suspended) updates.refreshTokenHash = null;

    const updated = await this.userModel
      .findByIdAndUpdate(id, { $set: updates }, { new: true })
      .select('name email role isSuspended isDeactivated')
      .exec();

    if (!updated) {
      throw new NotFoundException('Account not found');
    }

    return updated;
  }

  async deactivateAccount(id: string) {
    const user = await this.userModel.findById(id).exec();
    if (!user) throw new NotFoundException('Account not found');
    if (user.role !== UserRole.REGISTERED_USER) {
      throw new BadRequestException('Only registered users can deactivate their account');
    }
    user.isDeactivated = true;
    user.refreshTokenHash = null;
    user.email = `deleted+${user._id.toString()}@accounts.invalid`;
    user.name = 'Deleted account';
    user.phone = undefined;
    await user.save();
    return { message: 'Account deactivated successfully' };
  }

  async createModerator(input: {
    name: string;
    email: string;
    password: string;
    role: UserRole.AIRLINE_MODERATOR | UserRole.HOTEL_MODERATOR;
    airlineId?: string;
    hotelId?: string;
  }) {
    const existing = await this.userModel.findOne({ email: input.email.toLowerCase().trim() }).exec();
    if (existing) throw new BadRequestException('Email already registered');
    try {
      return await this.userModel.create({
        ...input,
        email: input.email.toLowerCase().trim(),
        mustChangePassword: true,
        termsAccepted: true,
        termsAcceptedAt: new Date(),
      });
    } catch (error: any) {
      if (error?.code === 11000) throw new BadRequestException('Email already registered');
      throw error;
    }
  }
}
