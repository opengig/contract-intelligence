import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DocumentParserService } from './document-parser.service';

@Module({
  imports: [ConfigModule],
  providers: [DocumentParserService],
  exports: [DocumentParserService],
})
export class ParserModule {}
