import { ENGINE_API_VERSION } from '@the-system/engine';

/** Live protocol version; bumped on incompatible message changes. */
export const PROTOCOL_VERSION = 1;

/** First frame the server sends on every WebSocket connection. */
export interface HelloMessage {
  type: 'hello';
  protocol: number;
  server: 'the-system';
  engineApiVersion: number;
}

export function helloMessage(): HelloMessage {
  return {
    type: 'hello',
    protocol: PROTOCOL_VERSION,
    server: 'the-system',
    engineApiVersion: ENGINE_API_VERSION,
  };
}
