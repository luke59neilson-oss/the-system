// The co-DM's server side (MC.1): key store, model settings, per-session
// spend counter and the GM-only settings routes. Every route sits under
// /api/gm/, which the server's onRequest hook keeps behind the GM key; no
// reply body ever carries the API key.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AnthropicClient } from './anthropic';
import {
  AiError,
  DEFAULT_AI_MODELS,
  SpendCounter,
  counted,
  type AiClient,
  type AiModelSettings,
  type SpendSnapshot,
} from './client';
import { KeyStore, KeyStoreError, type SecretCipher } from './keyStore';

export const AI_SETTINGS_FILE = 'ai-settings.json';

const modelId = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9._:@-]+$/, 'A model id has letters, digits and . _ : @ - only');
const modelsSchema = z.strictObject({ fast: modelId, strong: modelId });

export interface CoDmOptions {
  /** Folder for the encrypted key and the model settings (the OS app-data folder). */
  dir: string;
  /** Electron safeStorage in the desktop app; null elsewhere (the key cannot be saved). */
  cipher: SecretCipher | null;
  /**
   * Builds the client from the key and model getters. Defaults to the live
   * Anthropic client; tests pass a fixture fake (LOOP: runs never call the API).
   */
  makeClient?: (key: () => string | null, models: () => AiModelSettings) => AiClient;
  /**
   * The play session running now (null between sessions). The spend counter
   * starts again at 0 whenever this changes, so it shows one session's cost.
   */
  sessionId?: () => string | null;
}

export interface CoDmStatus {
  readonly hasKey: boolean;
  readonly canSave: boolean;
  /** Why a key cannot be saved, so the panel can say what to do; null when it can. */
  readonly saveBlocked: 'no-desktop' | 'no-encryption' | null;
  readonly models: AiModelSettings;
  readonly spend: SpendSnapshot;
}

export class CoDm {
  readonly keys: KeyStore;
  /** The OS app-data folder the co-DM keeps its settings in. */
  readonly dir: string;
  readonly spend = new SpendCounter();
  /** Every AI call goes through this; each reply is counted. */
  readonly client: AiClient;
  private models: AiModelSettings;
  private readonly settingsFile: string;
  private readonly sessionId: () => string | null;
  private countedFor: string | null;

  constructor(options: CoDmOptions) {
    this.dir = options.dir;
    this.keys = new KeyStore(options.dir, options.cipher);
    this.settingsFile = path.join(options.dir, AI_SETTINGS_FILE);
    this.models = this.readModels();
    this.sessionId = options.sessionId ?? (() => null);
    this.countedFor = this.sessionId();
    const make =
      options.makeClient ??
      ((key: () => string | null, models: () => AiModelSettings) =>
        new AnthropicClient(key, models));
    const inner = counted(
      make(
        () => this.keys.load(),
        () => this.models,
      ),
      this.spend,
    );
    this.client = {
      complete: (request) => {
        this.followSession();
        return inner.complete(request);
      },
    };
  }

  /** Resets the spend counter when a new session (or none) is running. */
  private followSession(): void {
    const now = this.sessionId();
    if (now !== this.countedFor) {
      this.countedFor = now;
      this.spend.reset();
    }
  }

  status(): CoDmStatus {
    this.followSession();
    return {
      // A file this laptop can no longer decrypt is no key (MC.1 review M3).
      hasKey: this.keys.load() !== null,
      canSave: this.keys.canSave(),
      saveBlocked: this.keys.whyCannotSave(),
      models: this.models,
      spend: this.spend.snapshot(),
    };
  }

  setModels(models: AiModelSettings): void {
    mkdirSync(path.dirname(this.settingsFile), { recursive: true });
    writeFileSync(this.settingsFile, JSON.stringify({ models }, null, 2));
    this.models = models;
  }

  /** A one-line call on the fast model to prove the key and network work. */
  async test(): Promise<{ ok: true; model: string } | { ok: false; error: string }> {
    try {
      const reply = await this.client.complete({
        role: 'fast',
        system: 'Reply with the single word: ready',
        messages: [{ role: 'user', content: 'Connection test' }],
        maxTokens: 5,
      });
      return { ok: true, model: reply.model };
    } catch (e) {
      return { ok: false, error: e instanceof AiError ? e.message : 'The test call failed' };
    }
  }

  private readModels(): AiModelSettings {
    if (!existsSync(this.settingsFile)) return DEFAULT_AI_MODELS;
    try {
      const parsed = modelsSchema.safeParse(
        (JSON.parse(readFileSync(this.settingsFile, 'utf8')) as { models?: unknown }).models,
      );
      return parsed.success ? parsed.data : DEFAULT_AI_MODELS;
    } catch {
      return DEFAULT_AI_MODELS;
    }
  }
}

/** GM-only co-DM settings routes (all under /api/gm/, behind the GM key). */
export function registerCoDmRoutes(root: FastifyInstance, coDm: CoDm): void {
  void root.register((app, _opts, done) => {
    // A body that fails to parse must not echo its text (it may hold the key):
    // every error in this scope gets a fixed message (MC.1 review M4).
    app.setErrorHandler((error: { statusCode?: number }, _request, reply) => {
      const code = error.statusCode ?? 500;
      return reply.code(code).send({
        error: code < 500 ? 'Bad request to the co-DM settings' : 'Co-DM settings failed',
      });
    });
    app.get('/api/gm/ai', () => coDm.status());

    app.put('/api/gm/ai/key', { bodyLimit: 4096 }, (request, reply) => {
      const body = z.strictObject({ key: z.string().max(400) }).safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: 'Send { key }' });
      try {
        coDm.keys.save(body.data.key);
      } catch (e) {
        if (e instanceof KeyStoreError) return reply.code(400).send({ error: e.message });
        return reply.code(500).send({ error: 'The key could not be saved' });
      }
      return coDm.status();
    });

    app.delete('/api/gm/ai/key', () => {
      coDm.keys.remove();
      return coDm.status();
    });

    app.put('/api/gm/ai/models', { bodyLimit: 4096 }, (request, reply) => {
      const body = modelsSchema.safeParse(request.body);
      if (!body.success) {
        return reply
          .code(400)
          .send({ error: body.error.issues[0]?.message ?? 'Send { fast, strong }' });
      }
      coDm.setModels(body.data);
      return coDm.status();
    });

    app.post('/api/gm/ai/test', async () => ({ ...(await coDm.test()), status: coDm.status() }));
    done();
  });
}
