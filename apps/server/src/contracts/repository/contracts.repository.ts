import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { UpdateTermDto } from '@/contracts/dto/update-term.dto';

@Injectable()
export class ContractsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.contract.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        vendor: { select: { id: true, name: true } },
        metadata: { select: { shipper: true } },
        _count: { select: { terms: true } },
      },
    });
  }

  async findOne(id: string) {
    return this.prisma.contract.findUniqueOrThrow({
      where: { id },
      include: {
        vendor: { select: { id: true, name: true } },
        terms: { orderBy: { createdAt: 'asc' } },
        metadata: true,
      },
    });
  }

  async getStatus(id: string) {
    return this.prisma.contract.findUniqueOrThrow({
      where: { id },
      select: { id: true, status: true, processingJobId: true },
    });
  }

  async create(data: {
    vendorId: string;
    name: string;
    type: string;
    storageKey: string;
    filePath: string;
    fileName: string;
    effectiveFrom?: Date;
  }) {
    return this.prisma.contract.create({ data });
  }

  async updateStatus(id: string, status: string) {
    return this.prisma.contract.update({ where: { id }, data: { status } });
  }

  async updateProcessingJobId(id: string, jobId: string) {
    return this.prisma.contract.update({
      where: { id },
      data: { processingJobId: jobId },
    });
  }

  async createTerms(
    contractId: string,
    terms: Array<{
      termType: string;
      description: string;
      route?: string | null;
      vehicleType?: string | null;
      rate?: number | null;
      unit?: string | null;
      formula?: string | null;
      conditions?: string | null;
      confidence: number;
      source?: string | null;
    }>,
  ) {
    return this.prisma.contractTerm.createMany({
      data: terms.map((t) => ({ ...t, contractId })),
    });
  }

  async updateTerm(termId: string, data: UpdateTermDto) {
    return this.prisma.contractTerm.update({ where: { id: termId }, data });
  }

  async bulkApproveTerms(contractId: string) {
    return this.prisma.contractTerm.updateMany({
      where: { contractId, status: 'pending' },
      data: { status: 'approved' },
    });
  }

  async delete(id: string) {
    return this.prisma.contract.delete({ where: { id } });
  }

  async getApprovedTerms(vendorId: string) {
    return this.prisma.contractTerm.findMany({
      where: {
        status: 'approved',
        contract: { vendorId, status: 'active' },
      },
      include: {
        contract: { select: { name: true, effectiveFrom: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
