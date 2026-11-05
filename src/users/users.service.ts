import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { User, UserDocument } from './schemas/user.schema';

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
}