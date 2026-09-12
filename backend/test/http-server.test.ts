import { EventEmitter } from 'node:events';
import type { Server } from 'node:http';

import type { Express } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { startHttpServer } from '../src/http-server.js';

function fakeApp(event: 'error' | 'listening'): Express {
  const server = new EventEmitter() as Server;
  const listen = vi.fn(() => {
    queueMicrotask(() => {
      if (event === 'error') server.emit('error', new Error('address in use'));
      else server.emit('listening');
    });
    return server;
  });
  return { listen } as unknown as Express;
}

describe('startHttpServer', () => {
  it('resolves only after the server is listening', async () => {
    await expect(
      startHttpServer(fakeApp('listening'), 3000, '127.0.0.1'),
    ).resolves.toBeDefined();
  });

  it('rejects asynchronous listen errors so startup can fail cleanly', async () => {
    await expect(
      startHttpServer(fakeApp('error'), 3000, '127.0.0.1'),
    ).rejects.toThrow('address in use');
  });
});
