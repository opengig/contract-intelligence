import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.client.findMany({ orderBy: { name: 'asc' } });
  }

  findOne(id: string) {
    return this.prisma.client.findUniqueOrThrow({ where: { id } });
  }

  create(name: string) {
    return this.prisma.client.create({ data: { name } });
  }
}
