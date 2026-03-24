/**
 * Composition root — the single place that wires provider implementations.
 *
 * To swap providers, change the imports and constructors here.
 * No API route code changes are required.
 *
 * PROVIDER env var:
 *   'mock'   — in-memory MockCandidateRepository (tests, local dev without a token)
 *   'github' — GitHubCandidateRepository (default for deployed environments)
 */

import type { CandidateRepository } from '@/lib/types';

function createCandidateRepository(): CandidateRepository {
  const provider = process.env.PROVIDER ?? 'github';

  if (provider === 'mock') {
    // Lazy import keeps GitHub/AWS SDKs out of the test bundle
    const { MockCandidateRepository } = require('@/lib/providers/mock/MockCandidateRepository');
    return new MockCandidateRepository();
  }

  if (provider === 'github') {
    const token = process.env.CANDIDATES_REPO_TOKEN;
    const owner = process.env.CANDIDATES_REPO_OWNER ?? 'kidwords-app';
    const repo  = process.env.CANDIDATES_REPO_NAME  ?? 'kidwords-candidates';

    if (!token) {
      throw new Error('CANDIDATES_REPO_TOKEN is required when PROVIDER=github');
    }

    const { GitHubCandidateRepository } = require('@/lib/providers/github/GitHubCandidateRepository');
    return new GitHubCandidateRepository({ token, owner, repo });
  }

  throw new Error(`Unknown PROVIDER: "${provider}". Expected "mock" or "github".`);
}

export const candidateRepo: CandidateRepository = createCandidateRepository();
