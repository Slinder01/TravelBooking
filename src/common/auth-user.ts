// Shape of request.user (matches the team's AuthenticatedUser: id, email, role).
export interface AuthUser {
  id: string;
  email: string;
  role: string;
}
