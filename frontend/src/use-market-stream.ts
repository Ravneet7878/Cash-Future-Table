import { useEffect, useMemo, useSyncExternalStore } from 'react';

import { frontendConfig } from './config';
import { MarketStreamController } from './market-stream';

export function useMarketStream(url = frontendConfig.webSocketUrl) {
  const controller = useMemo(() => new MarketStreamController(url), [url]);
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState,
  );

  useEffect(() => {
    controller.start();
    return () => controller.stop();
  }, [controller]);

  return state;
}
