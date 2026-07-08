import { Injectable } from '@nestjs/common';
import { defineAbilityFor, type AuthUser, type AppAbility } from '@repo/auth';

@Injectable()
export class CaslAbilityFactory {
  createForUser(user: AuthUser): AppAbility {
    return defineAbilityFor(user);
  }
}
