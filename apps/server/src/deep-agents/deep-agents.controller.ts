import { Controller, Post, Req, Res } from '@nestjs/common';
import { DeepAgentsService } from './deep-agents.service';
import { ContractRouterService } from './contract-router.service';
import type { Request, Response } from 'express';

@Controller('agent')
export class DeepAgentsController {
  constructor(
    private readonly agentService: DeepAgentsService,
    private readonly router: ContractRouterService,
  ) {}

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

    let scope:
      | { contractId?: string; vendorId?: string; routedContractIds?: string[] }
      | undefined;

    if (contractId || vendorId) {
      scope = { contractId, vendorId };
    } else {
      // Auto-route: build routing query from recent conversation context + latest message
      const recentUserMsgs = [...messages]
        .reverse()
        .filter((m: any) => m.role === 'user')
        .slice(0, 3);
      const latestText =
        recentUserMsgs[0]?.parts?.find((p: any) => p.type === 'text')?.text ??
        '';
      // Include prior user messages as context so the router can infer the vendor/client
      // when the latest message omits them (e.g. "How is fuel calculated under Exhibit C?")
      const contextTexts = recentUserMsgs
        .slice(1)
        .map(
          (m: any) =>
            m.parts?.find((p: any) => p.type === 'text')?.text ?? '',
        )
        .filter(Boolean);
      const queryText = contextTexts.length
        ? `${latestText}\n\n[Prior context: ${contextTexts.join(' | ')}]`
        : latestText;

      if (queryText) {
        const routed = await this.router.routeQuery(queryText, 5);
        if (routed.length > 0) {
          scope = { routedContractIds: routed.map((r) => r.id) };
        }
      }
    }

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

  // Test endpoint — non-streaming, returns plain JSON
  @Post('chat/test')
  async chatTest(@Req() req: Request, @Res() res: Response) {
    const {
      messages: rawMessages,
      sessionId,
      contractId,
      vendorId,
    } = req.body as {
      messages: any[];
      sessionId?: string;
      contractId?: string;
      vendorId?: string;
    };

    const resolvedSessionId =
      sessionId ??
      (rawMessages[0]?.id as string | undefined) ??
      crypto.randomUUID();

    const messages = rawMessages.map((m: any) => ({
      id: m.id ?? crypto.randomUUID(),
      role: m.role,
      parts:
        m.parts ??
        (m.content
          ? [
              {
                type: 'text',
                text: typeof m.content === 'string' ? m.content : '',
              },
            ]
          : []),
    }));

    let scope:
      | { contractId?: string; vendorId?: string; routedContractIds?: string[] }
      | undefined;

    if (contractId || vendorId) {
      scope = { contractId, vendorId };
    } else {
      const recentUserMsgs = [...messages]
        .reverse()
        .filter((m: any) => m.role === 'user')
        .slice(0, 3);
      const latestText =
        recentUserMsgs[0]?.parts?.find((p: any) => p.type === 'text')?.text ??
        '';
      const contextTexts = recentUserMsgs
        .slice(1)
        .map(
          (m: any) =>
            m.parts?.find((p: any) => p.type === 'text')?.text ?? '',
        )
        .filter(Boolean);
      const queryText = contextTexts.length
        ? `${latestText}\n\n[Prior context: ${contextTexts.join(' | ')}]`
        : latestText;

      if (queryText) {
        const routed = await this.router.routeQuery(queryText, 5);
        if (routed.length > 0) {
          scope = { routedContractIds: routed.map((r) => r.id) };
        }
      }
    }

    const text = await this.agentService.chatSync(
      messages,
      resolvedSessionId,
      scope,
    );

    res.json({ text });
  }
}
