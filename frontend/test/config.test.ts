import { describe, expect, it } from 'vitest';

import { loadFrontendConfig } from '../src/config';

describe('loadFrontendConfig', () => {
  it('uses an explicit WebSocket URL', () => {
    expect(
      loadFrontendConfig('wss://market.example/ws', {
        protocol: 'https:',
        host: 'app.example',
      }).webSocketUrl,
    ).toBe('wss://market.example/ws');
  });

  it('derives a same-origin secure URL when configuration is blank', () => {
    expect(
      loadFrontendConfig('', {
        protocol: 'https:',
        host: 'app.example',
      }).webSocketUrl,
    ).toBe('wss://app.example/ws');
  });

  it('rejects non-WebSocket protocols', () => {
    expect(() =>
      loadFrontendConfig('https://market.example/ws', {
        protocol: 'https:',
        host: 'app.example',
      }),
    ).toThrow('must use ws:// or wss://');
  });
});
