import { SetMetadata } from '@nestjs/common';
import type { Actions, Subjects } from '@repo/auth';

export const CHECK_ABILITY_KEY = 'check_ability';

export interface AbilityCheck {
  action: Actions;
  subject: Subjects;
}

export const CheckAbility = (action: Actions, subject: Subjects) =>
  SetMetadata(CHECK_ABILITY_KEY, { action, subject } satisfies AbilityCheck);
