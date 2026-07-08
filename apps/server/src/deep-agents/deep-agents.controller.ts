import { Controller, Post, Req, Res } from '@nestjs/common';
import { DeepAgentsService } from './deep-agents.service';
import type { Request, Response } from 'express';

@Controller('agent')
export class DeepAgentsController {
  constructor(private readonly agentService: DeepAgentsService) {}

  @Post('chat')
  async chat(@Req() req: Request, @Res() res: Response) {
    const { messages, sessionId, contractId, vendorId } = req.body as {
      messages: any[];
      sessionId?: string;
      contractId?: string;
      vendorId?: string;
    };

    const resolvedSessionId =
      sessionId ??
      (messages[0]?.id as string | undefined) ??
      crypto.randomUUID();

    const scope = contractId || vendorId ? { contractId, vendorId } : undefined;

    const webResponse = await this.agentService.chat(
      messages,
      resolvedSessionId,
      scope,
    );

    // Forward headers and stream the body back to the Express response
    res.status(webResponse.status);
    webResponse.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    const reader = webResponse.body!.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          res.end();
          break;
        }
        res.write(value);
      }
    };
    pump().catch((err) => {
      res.end();
      throw err;
    });
  }
}
