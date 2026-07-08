import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class VendorsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.vendor.findMany({ orderBy: { name: 'asc' } });
  }

  findOne(id: string) {
    return this.prisma.vendor.findUniqueOrThrow({ where: { id } });
  }

  create(name: string) {
    return this.prisma.vendor.create({ data: { name } });
  }
}
