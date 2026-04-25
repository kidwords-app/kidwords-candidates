import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubWorkflowClient } from '@/lib/providers/github/GitHubWorkflowClient';
import { ProviderError } from '@/lib/types';

describe('GitHubWorkflowClient', () => {
  const config = { token: 'test-token', owner: 'kidwords-app', repo: 'kidwords-candidates' };
  let client:    GitHubWorkflowClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client    = new GitHubWorkflowClient(config);
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  function mockDispatch(status = 204) {
    fetchMock.mockResolvedValueOnce({
      ok:     status >= 200 && status < 300,
      status,
      text:   () => Promise.resolve('{"message":"mock GitHub error"}'),
    });
  }

  function dispatchUrl(workflow: string) {
    return `https://api.github.com/repos/${config.owner}/${config.repo}/actions/workflows/${workflow}/dispatches`;
  }

  // ── triggerRegeneration ──────────────────────────────────────────────────────

  describe('triggerRegeneration', () => {
    it('dispatches generate-images.yaml for type=image mode=replace', async () => {
      mockDispatch();
      await client.triggerRegeneration('empathy', '2026-03-03', {
        type: 'image', mode: 'replace', prompt: 'two children sharing',
      });
      expect(fetchMock).toHaveBeenCalledWith(
        dispatchUrl('generate-images.yaml'),
        expect.objectContaining({ method: 'POST' }),
      );
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.inputs.wordId).toBe('empathy');
      expect(body.inputs.mode).toBe('replace');
      expect(body.inputs.prompt).toBe('two children sharing');
    });

    it('dispatches generate-images.yaml for type=image mode=subprompt', async () => {
      mockDispatch();
      await client.triggerRegeneration('empathy', '2026-03-03', {
        type: 'image', mode: 'subprompt', subprompt: 'warmer colors',
      });
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.inputs.mode).toBe('subprompt');
      expect(body.inputs.subprompt).toBe('warmer colors');
    });

    it('dispatches generate-definitions.yaml for type=full', async () => {
      mockDispatch();
      await client.triggerRegeneration('empathy', '2026-03-03', {
        type: 'full', levels: ['preK', 'K'], subprompt: 'simpler',
      });
      expect(fetchMock).toHaveBeenCalledWith(
        dispatchUrl('generate-definitions.yaml'),
        expect.anything(),
      );
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.inputs.levels).toBe('preK,K');
      expect(body.inputs.subprompt).toBe('simpler');
    });

    it('throws ProviderError when dispatch returns non-204 error', async () => {
      mockDispatch(422);
      await expect(
        client.triggerRegeneration('empathy', '2026-03-03', {
          type: 'image', mode: 'replace', prompt: 'test',
        }),
      ).rejects.toThrow(ProviderError);
    });
  });

  // ── triggerPublish ───────────────────────────────────────────────────────────

  describe('triggerPublish', () => {
    it('dispatches publish-word.yaml with wordId and roundId', async () => {
      mockDispatch();
      await client.triggerPublish('empathy', '2026-03-03');
      expect(fetchMock).toHaveBeenCalledWith(
        dispatchUrl('publish-word.yaml'),
        expect.anything(),
      );
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.inputs.wordId).toBe('empathy');
      expect(body.inputs.roundId).toBe('2026-03-03');
    });
  });

  // ── triggerRoundPublish ──────────────────────────────────────────────────────

  describe('triggerRoundPublish', () => {
    it('dispatches publish-round.yaml with roundId', async () => {
      mockDispatch();
      await client.triggerRoundPublish('2026-03-03');
      expect(fetchMock).toHaveBeenCalledWith(
        dispatchUrl('publish-round.yaml'),
        expect.anything(),
      );
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.inputs.roundId).toBe('2026-03-03');
    });
  });

  // ── auth ─────────────────────────────────────────────────────────────────────

  it('includes Authorization header on all requests', async () => {
    mockDispatch();
    await client.triggerPublish('empathy', '2026-03-03');
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers['Authorization']).toBe('Bearer test-token');
  });
});
