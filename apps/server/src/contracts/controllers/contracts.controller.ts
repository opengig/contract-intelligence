import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { ContractsService } from '@/contracts/contracts.service';
import { CreateContractDto } from '@/contracts/dto/create-contract.dto';
import { UpdateTermDto } from '@/contracts/dto/update-term.dto';
import { PresignDto } from '@/contracts/dto/presign.dto';
import { FilesService } from '@/files/files.service';

@UseGuards(JwtAuthGuard)
@Controller('contracts')
export class ContractsController {
  constructor(
    private readonly contractsService: ContractsService,
    private readonly filesService: FilesService,
  ) {}

  @Get()
  findAll() {
    return this.contractsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.contractsService.findOne(id);
  }

  @Get(':id/status')
  getStatus(@Param('id') id: string) {
    return this.contractsService.getStatus(id);
  }

  /** Step 1 — get an upload target (SAS URL or local endpoint info) */
  @Post('upload/presign')
  presign(@Body() dto: PresignDto) {
    return this.contractsService.presign(dto.fileName);
  }

  /** Step 2 (local dev) — receive the file and persist it locally */
  @Put('upload/local')
  @UseInterceptors(FileInterceptor('file'))
  uploadLocal(@UploadedFile() file: Express.Multer.File) {
    this.filesService.validateFileType(file);
    return this.contractsService.saveLocalUpload(file);
  }

  /** Step 3 — create the DB record and enqueue processing */
  @Post()
  create(@Body() dto: CreateContractDto) {
    return this.contractsService.create(dto);
  }

  @Patch(':id/terms/:termId')
  updateTerm(
    @Param('id') contractId: string,
    @Param('termId') termId: string,
    @Body() dto: UpdateTermDto,
  ) {
    return this.contractsService.updateTerm(contractId, termId, dto);
  }

  @Patch(':id/activate')
  activate(@Param('id') id: string) {
    return this.contractsService.activate(id);
  }

  @Post(':id/reprocess')
  reprocess(@Param('id') id: string) {
    return this.contractsService.reprocess(id);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.contractsService.delete(id);
  }
}
