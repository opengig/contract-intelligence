import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ExecuteCodeResult {
  success: boolean;
  stdout: string;
  stderr: string;
  error?: string;
  exitCode: number;
}

/**
 * Executes Python code via an Azure Function (local or deployed).
 *
 * Required env vars:
 *   AZURE_EXECUTE_CODE_ENDPOINT  — e.g. http://localhost:7071/api/execute (local)
 *                                       https://<app>.azurewebsites.net/api/execute (prod)
 *   AZURE_EXECUTE_CODE_KEY       — function host key (production only; omit for local func start)
 *
 * The Azure Function receives { code, session } and returns ExecuteCodeResult.
 * DB credentials (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD) must be
 * configured as App Settings on the Function App (or in local.settings.json).
 */
@Injectable()
export class SandboxManagerService {
  private readonly logger = new Logger(SandboxManagerService.name);
  private readonly endpoint: string;
  private readonly functionKey: string | undefined;

  constructor(private readonly config: ConfigService) {
    this.endpoint = this.config.getOrThrow<string>(
      'AZURE_EXECUTE_CODE_ENDPOINT',
    );
    this.functionKey = this.config.get<string>('AZURE_EXECUTE_CODE_KEY');
    this.logger.log(`[sandbox] endpoint=${this.endpoint}`);
  }

  async executeCode(
    code: string,
    sessionName: string,
  ): Promise<ExecuteCodeResult> {
    this.logger.log(`[sandbox] executeCode session=${sessionName}`);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.functionKey) {
      headers['x-functions-key'] = this.functionKey;
    }

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ code, session: sessionName }),
        signal: AbortSignal.timeout(90_000),
      });

      if (!response.ok) {
        const text = await response.text();
        this.logger.error(`[sandbox] HTTP ${response.status}: ${text}`);
        return {
          success: false,
          stdout: '',
          stderr: text,
          error: `Azure Function returned HTTP ${response.status}`,
          exitCode: 1,
        };
      }

      const result = (await response.json()) as ExecuteCodeResult;
      this.logger.log(
        `[sandbox] exitCode=${result.exitCode} stdout=${result.stdout.length}b stderr=${result.stderr.length}b`,
      );
      if (!result.success) {
        this.logger.warn(`[sandbox] stderr: ${result.stderr.slice(0, 500)}`);
      }
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[sandbox] request failed: ${msg}`);
      return {
        success: false,
        stdout: '',
        stderr: msg,
        error: msg,
        exitCode: 1,
      };
    }
  }
}
