import { IsString, IsOptional, IsNumber, IsIn } from 'class-validator';

export class UpdateTermDto {
  @IsIn(['pending', 'approved', 'rejected', 'review'])
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @IsOptional()
  rate?: number;

  @IsString()
  @IsOptional()
  unit?: string;

  @IsString()
  @IsOptional()
  formula?: string;
}
