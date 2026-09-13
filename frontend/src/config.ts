export type FrontendConfig = Readonly<{
  webSocketUrl: string;
}>;

export function loadFrontendConfig(
  configuredUrl: string | undefined = import.meta.env.VITE_WEBSOCKET_URL,
  location: Pick<Location, 'protocol' | 'host'> = window.location,
): FrontendConfig {
  const candidate =
    typeof configuredUrl === 'string' ? configuredUrl.trim() : '';
  const webSocketUrl =
    candidate.length === 0
      ? `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`
      : candidate;
  const parsed = new URL(webSocketUrl);
  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    throw new Error('VITE_WEBSOCKET_URL must use ws:// or wss://.');
  }
  return Object.freeze({ webSocketUrl: parsed.toString() });
}

export const frontendConfig = loadFrontendConfig();
