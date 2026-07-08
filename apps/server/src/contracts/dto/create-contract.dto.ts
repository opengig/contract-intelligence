import { IsString, IsOptional, IsIn } from 'class-validator';

export class CreateContractDto {
  @IsString()
  vendorId: string;

  @IsString()
  name: string;

  @IsIn(['rate_sheet', 'amendment', 'surcharge', 'other'])
  type: string;

  @IsString()
  storageKey: string;

  @IsString()
  fileName: string;

  @IsString()
  @IsOptional()
  effectiveFrom?: string;
}
