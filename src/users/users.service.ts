import { Injectable } from '@nestjs/common';
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
      .select('+password') //req pass hash for comparison
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
  return this.userModel
    .findById(id)
    .select('+refreshTokenHash')
    .exec();
}

async updatePassword(
  id: string,
  updates: {
    password: string;
    mustChangePassword: boolean;
    refreshTokenHash: string | null;
  },
) {
  return this.userModel.findByIdAndUpdate(
    id,
    updates,
    { new: true },
  );
}
async findByIdWithPassword(id: string) {
  return this.userModel
    .findById(id)
    .select('+password')
    .exec();
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
    .findByIdAndUpdate(
      id,
      { $set: updates },
      {
        new: true,
        runValidators: true,
      },
    )
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

  if (query.search?.trim()) {
    const escaped = query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
}
