import type { WorkflowClient, RegenOptions } from '@/lib/types';

export interface WorkflowCall {
  method:  string;
  wordId?: string;
  roundId?: string;
  options?: RegenOptions;
}

/**
 * In-memory WorkflowClient for tests and local dev.
 * Records every call so tests can assert the right jobs were triggered
 * without firing real GitHub Actions workflows.
 */
export class MockWorkflowClient implements WorkflowClient {
  readonly calls: WorkflowCall[] = [];

  async triggerRegeneration(wordId: string, roundId: string, options: RegenOptions): Promise<void> {
    this.calls.push({ method: 'triggerRegeneration', wordId, roundId, options });
  }

  async triggerPublish(wordId: string, roundId: string): Promise<void> {
    this.calls.push({ method: 'triggerPublish', wordId, roundId });
  }

  async triggerRoundPublish(roundId: string): Promise<void> {
    this.calls.push({ method: 'triggerRoundPublish', roundId });
  }

  /** Convenience: reset call log between tests. */
  reset(): void {
    this.calls.length = 0;
  }
}
