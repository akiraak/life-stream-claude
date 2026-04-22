import * as SecureStore from 'expo-secure-store';
import client from '../../src/api/client';

const secure = SecureStore as jest.Mocked<typeof SecureStore> & { __reset: () => void };

const TOKEN_KEY = 'auth_token';

beforeEach(() => {
  secure.__reset();
  jest.clearAllMocks();
});

async function runRequestInterceptor(config: { headers: Record<string, string> }) {
  const handlers = (client.interceptors.request as unknown as {
    handlers: Array<{ fulfilled: (c: typeof config) => Promise<typeof config> | typeof config } | null>;
  }).handlers.filter(Boolean) as Array<{ fulfilled: (c: typeof config) => Promise<typeof config> | typeof config }>;
  let result = config;
  for (const handler of handlers) {
    result = await handler.fulfilled(result);
  }
  return result;
}

async function runResponseErrorInterceptor(error: { response?: { status: number } }) {
  const handlers = (client.interceptors.response as unknown as {
    handlers: Array<{ rejected?: (e: typeof error) => Promise<unknown> } | null>;
  }).handlers.filter(Boolean) as Array<{ rejected?: (e: typeof error) => Promise<unknown> }>;
  for (const handler of handlers) {
    if (handler.rejected) {
      try {
        await handler.rejected(error);
      } catch {
        // interceptors re-reject the error; swallow for test purposes
      }
    }
  }
}

describe('api client', () => {
  describe('request interceptor', () => {
    it('attaches Authorization header when token is present', async () => {
      await secure.setItemAsync(TOKEN_KEY, 'jwt-token');

      const result = await runRequestInterceptor({ headers: {} });

      expect(result.headers.Authorization).toBe('Bearer jwt-token');
    });

    it('leaves Authorization header unset when no token is stored', async () => {
      const result = await runRequestInterceptor({ headers: {} });

      expect(result.headers.Authorization).toBeUndefined();
    });
  });

  describe('response interceptor', () => {
    it('removes the stored token on 401', async () => {
      await secure.setItemAsync(TOKEN_KEY, 'jwt-token');

      await runResponseErrorInterceptor({ response: { status: 401 } });

      expect(secure.deleteItemAsync).toHaveBeenCalledWith(TOKEN_KEY);
      expect(await secure.getItemAsync(TOKEN_KEY)).toBeNull();
    });

    it('keeps the token on non-401 errors', async () => {
      await secure.setItemAsync(TOKEN_KEY, 'jwt-token');

      await runResponseErrorInterceptor({ response: { status: 500 } });

      expect(secure.deleteItemAsync).not.toHaveBeenCalled();
      expect(await secure.getItemAsync(TOKEN_KEY)).toBe('jwt-token');
    });
  });
});
