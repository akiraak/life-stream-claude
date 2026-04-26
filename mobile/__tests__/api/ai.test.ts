jest.mock('../../src/api/client', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    get: jest.fn(),
  },
}));

import client from '../../src/api/client';
import { suggestAi, getAiQuota, AiQuotaError } from '../../src/api/ai';

const mockClient = client as unknown as { post: jest.Mock; get: jest.Mock };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('suggestAi', () => {
  it('returns ingredients, recipes, and X-AI-Remaining', async () => {
    mockClient.post.mockResolvedValue({
      data: {
        success: true,
        data: {
          ingredients: [{ name: '肉', category: '' }],
          recipes: [{ title: 'r', summary: '', steps: [], ingredients: [] }],
        },
      },
      headers: { 'x-ai-remaining': '2' },
    });

    const result = await suggestAi('豚汁');

    expect(mockClient.post).toHaveBeenCalledWith('/api/ai/suggest', {
      dishName: '豚汁',
      extraIngredients: undefined,
    });
    expect(result.ingredients).toHaveLength(1);
    expect(result.recipes).toHaveLength(1);
    expect(result.remaining).toBe(2);
  });

  it('returns remaining = null when the header is missing', async () => {
    mockClient.post.mockResolvedValue({
      data: { success: true, data: { ingredients: [], recipes: [] } },
      headers: {},
    });
    const result = await suggestAi('カレー');
    expect(result.remaining).toBeNull();
  });

  it('throws AiQuotaError on 429 ai_quota_exceeded', async () => {
    mockClient.post.mockRejectedValue({
      response: {
        status: 429,
        data: { error: 'ai_quota_exceeded', resetAt: '2026-04-23T00:00:00+09:00' },
      },
    });

    await expect(suggestAi('鍋')).rejects.toBeInstanceOf(AiQuotaError);
    await expect(suggestAi('鍋')).rejects.toMatchObject({
      remaining: 0,
      resetAt: '2026-04-23T00:00:00+09:00',
    });
  });

  it('re-throws other errors unchanged', async () => {
    const err = new Error('network');
    mockClient.post.mockRejectedValue(err);
    await expect(suggestAi('A')).rejects.toBe(err);
  });

  it('forwards extraIngredients', async () => {
    mockClient.post.mockResolvedValue({
      data: { success: true, data: { ingredients: [], recipes: [] } },
      headers: {},
    });
    await suggestAi('カレー', ['チキン']);
    expect(mockClient.post).toHaveBeenCalledWith('/api/ai/suggest', {
      dishName: 'カレー',
      extraIngredients: ['チキン'],
    });
  });
});

describe('getAiQuota', () => {
  it('returns remaining/limit/resetAt from /api/ai/quota', async () => {
    mockClient.get.mockResolvedValue({
      data: {
        success: true,
        data: { remaining: 12, limit: 20, resetAt: '2026-04-27T15:00:00.000Z' },
      },
    });

    const q = await getAiQuota();
    expect(mockClient.get).toHaveBeenCalledWith('/api/ai/quota');
    expect(q).toEqual({ remaining: 12, limit: 20, resetAt: '2026-04-27T15:00:00.000Z' });
  });

  it('passes through nulls (unauthenticated guest without device-id)', async () => {
    mockClient.get.mockResolvedValue({
      data: {
        success: true,
        data: { remaining: null, limit: null, resetAt: '2026-04-27T15:00:00.000Z' },
      },
    });
    const q = await getAiQuota();
    expect(q.remaining).toBeNull();
    expect(q.limit).toBeNull();
  });

  it('throws when success is false', async () => {
    mockClient.get.mockResolvedValue({
      data: { success: false, data: null, error: 'boom' },
    });
    await expect(getAiQuota()).rejects.toThrow('boom');
  });
});
