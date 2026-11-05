import { UserRole } from '../../users/users-role.enum';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;

  // Present for moderators:
  airlineId?: string;
  hotelId?: string;
}