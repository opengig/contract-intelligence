import { IsString } from 'class-validator';

export class PresignDto {
  @IsString()
  fileName: string;
}
