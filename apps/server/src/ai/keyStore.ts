// The GM's Anthropic API key, stored encrypted on the GM laptop (MC.1,
// DESIGN §11). The desktop app supplies the cipher (Electron safeStorage,
// which uses the OS keychain / DPAPI); without one the key cannot be saved
// at all, so it is never written in plain text. The key never goes into the
// repo, a log, a player frame or an HTTP response body.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface SecretCipher {
  /** False when the OS offers no encryption (then nothing is saved). */
  isAvailable(): boolean;
  encrypt(plain: string): Buffer;
  decrypt(data: Buffer): string;
}

export class KeyStoreError extends Error {}

export const KEY_FILE = 'anthropic-key.bin';

/** A key has the shape the Anthropic console issues; checked before saving. */
export function looksLikeKey(key: string): boolean {
  return /^sk-ant-[A-Za-z0-9_-]{20,300}$/.test(key);
}

export class KeyStore {
  private readonly file: string;

  constructor(
    dir: string,
    private readonly cipher: SecretCipher | null,
  ) {
    this.file = path.join(dir, KEY_FILE);
  }

  /** Whether this install can save a key (the desktop app with OS encryption). */
  canSave(): boolean {
    return this.cipher !== null && this.cipher.isAvailable();
  }

  has(): boolean {
    return existsSync(this.file);
  }

  save(key: string): void {
    const trimmed = key.trim();
    if (!looksLikeKey(trimmed)) {
      throw new KeyStoreError('That does not look like an Anthropic API key (it starts sk-ant-)');
    }
    if (!this.canSave() || this.cipher === null) {
      throw new KeyStoreError(
        'This computer offers no encryption for the key, so it cannot be saved',
      );
    }
    mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, this.cipher.encrypt(trimmed), { mode: 0o600 });
    renameSync(tmp, this.file);
  }

  /** The key, or null when none is saved or it cannot be decrypted here. */
  load(): string | null {
    if (!this.has() || this.cipher === null || !this.cipher.isAvailable()) return null;
    try {
      const key = this.cipher.decrypt(readFileSync(this.file));
      return looksLikeKey(key) ? key : null;
    } catch {
      return null;
    }
  }

  remove(): void {
    rmSync(this.file, { force: true });
  }
}
