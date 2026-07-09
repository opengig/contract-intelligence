import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bullmq';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CaslModule } from './casl/casl.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { NotificationsModule } from './notifications/notifications.module';
import { FilesModule } from './files/files.module';
import { ContractsModule } from './contracts/contracts.module';
import { ParserModule } from './document-parser/document-parser.module';
import { DocumentStorageModule } from './document-storage/document-storage.module';
import { DocumentProcessingModule } from './document-processing/document-processing.module';
import { AuthModule } from './auth/auth.module';
import { DeepAgentsModule } from './deep-agents/deep-agents.module';
import { VendorsModule } from './vendors/vendors.module';
import { ClientsModule } from './clients/clients.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST') ?? 'localhost',
          port: config.get<number>('REDIS_PORT') ?? 6379,
        },
      }),
      inject: [ConfigService],
    }),
    CaslModule,
    PrismaModule,
    UsersModule,
    NotificationsModule,
    FilesModule,
    ContractsModule,
    ParserModule,
    DocumentStorageModule,
    DocumentProcessingModule,
    AuthModule,
    DeepAgentsModule,
    VendorsModule,
    ClientsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
