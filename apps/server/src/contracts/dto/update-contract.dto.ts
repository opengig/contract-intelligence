import { IsString, IsOptional, IsIn } from 'class-validator';

export class UpdateContractDto {
  @IsString()
  @IsOptional()
  vendorId?: string;

  @IsString()
  @IsOptional()
  clientId?: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsIn(['rate_sheet', 'amendment', 'surcharge', 'other'])
  @IsOptional()
  type?: string;
}
