import { ExecutionContext, Injectable } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

@Injectable()
export class OptionalJwtAuthGuard extends JwtAuthGuard {
  override canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      cookies?: { access_token?: string };
    }>();

    if (request.cookies?.access_token === undefined) {
      return true; // Guest reading a public route
    }

    return super.canActivate(context);
  }
}