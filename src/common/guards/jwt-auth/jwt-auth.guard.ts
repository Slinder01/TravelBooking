import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    return super.canActivate(context);
  }

  handleRequest<TUser = any>(
    error: unknown,
    user: TUser & { mustChangePassword?: boolean },
    _info: unknown,
    context: ExecutionContext,
  ): TUser {
    if (error || !user) {
      throw error || new UnauthorizedException();
    }

    if (user.mustChangePassword && context.getHandler().name !== 'changePassword') {
      throw new ForbiddenException('Password change required');
    }

    return user;
  }
}
