/**
 * Composition root — the single place that wires provider implementations.
 *
 * To swap providers, change the imports and constructors here.
 * No API route code changes are required.
 *
 * PROVIDER env var:
 *   'mock'   — in-memory implementations (tests, local dev without tokens)
 *   'github' — GitHub API implementations (default for deployed environments)
 */

import type { CandidateRepository, AssetRepository, WorkflowClient } from '@/lib/types';

function createProviders(): {
  candidateRepo:  CandidateRepository;
  assetRepo:      AssetRepository;
  workflowClient: WorkflowClient;
} {
  const provider = process.env.PROVIDER ?? 'github';

  if (provider === 'mock') {
    const { MockCandidateRepository } = require('@/lib/providers/mock/MockCandidateRepository');
    const { MockAssetRepository }     = require('@/lib/providers/mock/MockAssetRepository');
    const { MockWorkflowClient }      = require('@/lib/providers/mock/MockWorkflowClient');
    return {
      candidateRepo:  new MockCandidateRepository(),
      assetRepo:      new MockAssetRepository(),
      workflowClient: new MockWorkflowClient(),
    };
  }

  if (provider === 'github') {
    const token = process.env.CANDIDATES_REPO_TOKEN;
    const owner = process.env.CANDIDATES_REPO_OWNER ?? 'kidwords-app';
    const repo  = process.env.CANDIDATES_REPO_NAME  ?? 'kidwords-candidates';

    if (!token) throw new Error('CANDIDATES_REPO_TOKEN is required when PROVIDER=github');

    const { GitHubCandidateRepository } = require('@/lib/providers/github/GitHubCandidateRepository');
    const { GitHubAssetRepository }     = require('@/lib/providers/github/GitHubAssetRepository');
    const { GitHubWorkflowClient }      = require('@/lib/providers/github/GitHubWorkflowClient');

    const publicToken = process.env.PUBLIC_REPO_TOKEN ?? token;
    const publicRepo  = process.env.PUBLIC_REPO_NAME  ?? 'kidwords.github.io';

    return {
      candidateRepo:  new GitHubCandidateRepository({ token, owner, repo }),
      assetRepo:      new GitHubAssetRepository({
        candidatesToken: token,
        publicToken,
        owner,
        candidatesRepo:  repo,
        publicRepo,
      }),
      workflowClient: new GitHubWorkflowClient({ token, owner, repo }),
    };
  }

  throw new Error(`Unknown PROVIDER: "${provider}". Expected "mock" or "github".`);
}

const { candidateRepo, assetRepo, workflowClient } = createProviders();

export { candidateRepo, assetRepo, workflowClient };
