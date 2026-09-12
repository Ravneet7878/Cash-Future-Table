import pino from 'pino';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import type { Database } from '../src/database.js';

function createDatabase(query: Database['query']): Database {
  return {
    query,
    connect: vi.fn(),
    end: vi.fn(),
  } as unknown as Database;
}

const logger = pino({ enabled: false });

describe('health routes', () => {
  it('reports liveness without querying dependencies', async () => {
    const query = vi.fn();
    const response = await request(
      createApp({ database: createDatabase(query), logger }),
    ).get('/health/live');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(query).not.toHaveBeenCalled();
  });

  it('reports readiness when PostgreSQL is reachable', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const response = await request(
      createApp({ database: createDatabase(query), logger }),
    ).get('/health/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ready',
      checks: { database: 'up' },
    });
  });

  it('reports unavailable when PostgreSQL is unreachable', async () => {
    const query = vi.fn().mockRejectedValue(new Error('unavailable'));
    const response = await request(
      createApp({ database: createDatabase(query), logger }),
    ).get('/health/ready');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: 'not_ready',
      checks: { database: 'down' },
    });
  });
});

describe('JSON errors', () => {
  it('returns a structured 404 response', async () => {
    const response = await request(
      createApp({ database: createDatabase(vi.fn()), logger }),
    ).get('/missing');
    const body = response.body as {
      error: { code: string; message: string; requestId: string };
    };

    expect(response.status).toBe(404);
    expect(body.error).toMatchObject({
      code: 'not_found',
      message: 'Route not found',
    });
    expect(body.error.requestId).toEqual(expect.any(String));
  });
});
