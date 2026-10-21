export const DEFAULT_PORT = 30333;
export const DEFAULT_HOST = '0.0.0.0';

export interface ServerOptions {
  port: number;
  host: string;
  /** Directory holding the built web app (index.html + assets). */
  webRoot: string;
}

export class ConfigError extends Error {}

/** Parses a port value; 0 means "pick a free port". Pure, for unit tests. */
export function parsePort(raw: string | undefined, fallback = DEFAULT_PORT): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  if (!/^\d+$/.test(raw.trim())) throw new ConfigError(`Invalid port "${raw}"`);
  const port = Number(raw);
  if (port > 65535) throw new ConfigError(`Port ${port} is out of range (0-65535)`);
  return port;
}

/** Reads `--port`, `--host`, `--web-root` flags, falling back to env vars. */
export function resolveOptions(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  defaultWebRoot: string,
): ServerOptions {
  const flag = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    if (i === -1) return undefined;
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new ConfigError(`Missing value for --${name}`);
    }
    return value;
  };
  return {
    port: parsePort(flag('port') ?? env['PORT']),
    host: flag('host') ?? env['HOST'] ?? DEFAULT_HOST,
    webRoot: flag('web-root') ?? env['WEB_ROOT'] ?? defaultWebRoot,
  };
}
