import { Injectable, Logger } from '@nestjs/common';
import { ContractsRepository } from './repository/contracts.repository';
import { DocumentStorageService } from '@/document-storage/document-storage.service';
import { DocumentProcessingProducer } from '@/document-processing/document-processing.producer';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { UploadTarget } from '@/document-storage/document-storage.types';

@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);

  constructor(
    private readonly contractsRepository: ContractsRepository,
    private readonly storage: DocumentStorageService,
    private readonly producer: DocumentProcessingProducer,
  ) {}

  findAll() {
    return this.contractsRepository.findAll();
  }

  findOne(id: string) {
    return this.contractsRepository.findOne(id);
  }

  async getStatus(id: string) {
    return this.contractsRepository.getStatus(id);
  }

  async presign(fileName: string): Promise<UploadTarget> {
    return this.storage.generateUploadTarget(fileName);
  }

  async saveLocalUpload(
    file: Express.Multer.File,
  ): Promise<{ storageKey: string }> {
    const storageKey = await this.storage.saveLocal(file);
    return { storageKey };
  }

  async create(dto: CreateContractDto) {
    const name =
      dto.name?.trim() ||
      dto.fileName
        .replace(/\.[^/.]+$/, '')
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());

    const contract = await this.contractsRepository.create({
      vendorId: dto.vendorId,
      name,
      type: dto.type ?? 'other',
      storageKey: dto.storageKey,
      filePath: this.storage.getFilePath(dto.storageKey),
      fileName: dto.fileName,
      effectiveFrom: dto.effectiveFrom
        ? new Date(dto.effectiveFrom)
        : undefined,
    });

    const jobId = await this.producer.enqueue({
      contractId: contract.id,
      storageKey: dto.storageKey,
      fileName: contract.fileName,
    });

    await this.contractsRepository.updateProcessingJobId(contract.id, jobId);

    this.logger.log(
      `Contract ${contract.id} queued for processing (job ${jobId})`,
    );

    return { ...contract, processingJobId: jobId };
  }

  async reprocess(id: string) {
    const contract = await this.contractsRepository.findOne(id);

    await this.contractsRepository.updateStatus(id, 'uploaded');

    const jobId = await this.producer.enqueue({
      contractId: contract.id,
      storageKey: contract.storageKey!,
      fileName: contract.fileName,
    });

    await this.contractsRepository.updateProcessingJobId(id, jobId);

    this.logger.log(`Contract ${id} re-queued for processing (job ${jobId})`);

    return { id, status: 'uploaded', processingJobId: jobId };
  }

  async update(id: string, dto: UpdateContractDto) {
    return this.contractsRepository.update(id, dto);
  }

  async delete(id: string) {
    return this.contractsRepository.delete(id);
  }

  async updateTerm(contractId: string, termId: string, data: any) {
    return this.contractsRepository.updateTerm(termId, data);
  }

  async activate(contractId: string) {
    await this.contractsRepository.bulkApproveTerms(contractId);
    return this.contractsRepository.updateStatus(contractId, 'active');
  }
}
