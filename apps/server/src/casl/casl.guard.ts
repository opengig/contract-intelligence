import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthUser } from '@repo/auth';
import { CaslAbilityFactory } from './casl-ability.factory';
import {
  CHECK_ABILITY_KEY,
  type AbilityCheck,
} from './check-ability.decorator';

@Injectable()
export class CaslGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private caslAbilityFactory: CaslAbilityFactory,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const check = this.reflector.get<AbilityCheck>(
      CHECK_ABILITY_KEY,
      context.getHandler(),
    );

    if (!check) {
      return true;
    }

    const request = context.switchToHttp().getRequest();

    // Fall back to a default mock user when no auth middleware is wired up yet
    const user: AuthUser = request.user ?? { id: '1', role: 'user' };

    const ability = this.caslAbilityFactory.createForUser(user);

    if (!ability.can(check.action, check.subject)) {
      throw new ForbiddenException(
        `You lack permission to ${check.action} ${check.subject}`,
      );
    }

    return true;
  }
}
