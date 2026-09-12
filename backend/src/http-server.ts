import type { Server } from 'node:http';

import type { Express } from 'express';

export async function startHttpServer(
  app: Express,
  port: number,
  host: string,
): Promise<Server> {
  return await new Promise<Server>((resolve, reject) => {
    const server = app.listen(port, host);
    const onError = (error: Error): void => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.off('error', onError);
      resolve(server);
    };
    server.once('error', onError);
    server.once('listening', onListening);
  });
}
