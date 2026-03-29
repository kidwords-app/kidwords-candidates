import type { WorkflowClient, RegenOptions } from '@/lib/types';
import { makeGitHubClient, type GitHubConfig } from './github-client';

/**
 * Workflow files in .github/workflows/ that this client can trigger.
 * See specs/pipeline-03-generation-jobs.md for what each workflow does.
 */
const WORKFLOWS = {
  generateImages:      'generate-images.yaml',
  generateDefinitions: 'generate-definitions.yaml',
  publishWord:         'publish-word.yaml',
  publishRound:        'publish-round.yaml',
} as const;

const DEFAULT_REF = 'main';

export class GitHubWorkflowClient implements WorkflowClient {
  private readonly gh: ReturnType<typeof makeGitHubClient>;

  constructor(config: GitHubConfig) {
    this.gh = makeGitHubClient(config);
  }

  async triggerRegeneration(wordId: string, roundId: string, options: RegenOptions): Promise<void> {
    if (options.type === 'image') {
      await this.gh.dispatchWorkflow(WORKFLOWS.generateImages, DEFAULT_REF, {
        wordId,
        roundId,
        mode:      options.mode,
        prompt:    options.mode === 'replace'   ? options.prompt    : '',
        subprompt: options.mode === 'subprompt' ? options.subprompt : '',
      });
    } else {
      // type === 'full': regenerate text first, then image
      await this.gh.dispatchWorkflow(WORKFLOWS.generateDefinitions, DEFAULT_REF, {
        wordId,
        roundId,
        levels:    options.levels.join(','),
        subprompt: options.subprompt ?? '',
      });
    }
  }

  async triggerPublish(wordId: string, roundId: string): Promise<void> {
    await this.gh.dispatchWorkflow(WORKFLOWS.publishWord, DEFAULT_REF, { wordId, roundId });
  }

  async triggerRoundPublish(roundId: string): Promise<void> {
    await this.gh.dispatchWorkflow(WORKFLOWS.publishRound, DEFAULT_REF, { roundId });
  }
}
