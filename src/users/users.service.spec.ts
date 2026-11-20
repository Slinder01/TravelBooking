import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { getModelToken } from '@nestjs/mongoose';
import { User } from './schemas/user.schema';
import { jest } from '@jest/globals';
import { UserRole } from './users-role.enum';

describe('UsersService', () => {
  let service: UsersService;
  let userModel: any;

  beforeEach(async () => {
    userModel = {
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getModelToken(User.name), useValue: userModel },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('suspends a registered account and revokes its refresh token', async () => {
    const user = { role: UserRole.REGISTERED_USER };
    userModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(user) });
    const exec = jest.fn().mockResolvedValue({
      _id: 'user-id',
      isSuspended: true,
      role: UserRole.REGISTERED_USER,
    });
    const select = jest.fn().mockReturnValue({ exec });
    userModel.findByIdAndUpdate.mockReturnValue({ select });

    await service.setAccountSuspended('user-id', true);

    expect(userModel.findByIdAndUpdate).toHaveBeenCalledWith(
      'user-id',
      { $set: { isSuspended: true, refreshTokenHash: null } },
      { new: true },
    );
  });

  it('does not allow suspending an administrator', async () => {
    userModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ role: UserRole.ADMINISTRATOR }),
    });

    await expect(service.setAccountSuspended('admin-id', true)).rejects.toThrow(
      'Only registered users and moderators can be suspended',
    );
    expect(userModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});
