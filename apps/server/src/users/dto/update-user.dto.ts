import { IsOptional, IsString } from 'class-validator';
import type { UpdateUserPayload } from '@repo/types';

export class UpdateUserDto implements UpdateUserPayload {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  role?: string;
}
