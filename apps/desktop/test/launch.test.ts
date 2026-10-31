import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  packagedSpeechFiles,
  packagedSpeechLoad,
  speechPackageDir,
  DEFAULT_DESKTOP_PORT,
  dataDirFor,
  desktopPort,
  gmWindowUrl,
  allowsPermission,
  isOwnPage,
  startErrorMessage,
  webRootFor,
  machineIdFor,
  isPortUnavailable,
  portFallbackMessage,
  splashHtml,
  splashUrl,
  startOnFreePort,
  SPLASH_TITLE,
  QUIT_FOR_UPDATE,
  isQuitForUpdate,
} from '../src/launch';

describe('desktop launch helpers', () => {
  it('puts the GM key only in the fragment of a localhost URL', () => {
    expect(gmWindowUrl(30333, 'k+y/=')).toBe('http://127.0.0.1:30333/gm#key=k%2By%2F%3D');
  });
  it('finds the web build packaged or in the repo', () => {
    expect(webRootFor(true, '/res', '/x/dist')).toBe(path.join('/res', 'web'));
    expect(webRootFor(false, '/res', '/repo/apps/desktop/dist')).toBe(
      path.resolve('/repo/apps/web/dist'),
    );
  });
  it('keeps campaign data in the app-data folder', () => {
    expect(dataDirFor('/home/u/.config/The System')).toBe(
      path.join('/home/u/.config/The System', 'data'),
    );
  });
  it('reads the port override, falling back to the default', () => {
    expect(desktopPort({})).toBe(DEFAULT_DESKTOP_PORT);
    expect(desktopPort({ THE_SYSTEM_PORT: '0' })).toBe(0);
    expect(desktopPort({ THE_SYSTEM_PORT: '4000' })).toBe(4000);
    expect(desktopPort({ THE_SYSTEM_PORT: 'abc' })).toBe(DEFAULT_DESKTOP_PORT);
    expect(desktopPort({ THE_SYSTEM_PORT: '70000' })).toBe(DEFAULT_DESKTOP_PORT);
  });
  it('allows only the local server’s own pages in the GM window', () => {
    expect(isOwnPage('http://localhost:30333/gm', 30333)).toBe(true);
    expect(isOwnPage('http://127.0.0.1:30333/play/x', 30333)).toBe(true);
    expect(isOwnPage('http://localhost:30334/gm', 30333)).toBe(false);
    expect(isOwnPage('https://localhost:30333/gm', 30333)).toBe(false);
    expect(isOwnPage('http://evil.example:30333/', 30333)).toBe(false);
    expect(isOwnPage('not a url', 30333)).toBe(false);
  });
  it('explains a busy port', () => {
    expect(startErrorMessage({ code: 'EADDRINUSE' }, 30333)).toContain(
      'Ports 30333–30352 are all in use or blocked',
    );
    expect(startErrorMessage({ code: 'EACCES' }, 65530)).toContain('Ports 65530–65535');
    expect(startErrorMessage(new Error('boom'), 1)).toBe('The System could not start: boom');
  });
});

describe('machineIdFor', () => {
  it('creates an id once, keeps it, and replaces a damaged one', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'the-system-machine-'));
    try {
      let n = 0;
      const make = () => `id-0000000${++n}`;
      expect(machineIdFor(path.join(dir, 'user'), make)).toBe('id-00000001');
      expect(machineIdFor(path.join(dir, 'user'), make)).toBe('id-00000001');
      expect(readFileSync(path.join(dir, 'user', 'machine-id'), 'utf8')).toBe('id-00000001\n');
      writeFileSync(path.join(dir, 'user', 'machine-id'), '../../bad id');
      expect(machineIdFor(path.join(dir, 'user'), make)).toBe('id-00000002');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('startOnFreePort (MS.7)', () => {
  const busy = (code: string) => Object.assign(new Error(code), { code });
  it('uses the first port when it is free', async () => {
    const tried: number[] = [];
    const r = await startOnFreePort(30333, (p) => {
      tried.push(p);
      return Promise.resolve(`on ${p}`);
    });
    expect(r).toEqual({ value: 'on 30333', port: 30333, fellBack: false });
    expect(tried).toEqual([30333]);
  });
  it('moves to the next free port when the first is taken or reserved', async () => {
    const tried: number[] = [];
    const r = await startOnFreePort(30333, (p) => {
      tried.push(p);
      if (p === 30333) return Promise.reject(busy('EADDRINUSE'));
      if (p === 30334) return Promise.reject(busy('EACCES'));
      return Promise.resolve(p);
    });
    expect(r).toEqual({ value: 30335, port: 30335, fellBack: true });
    expect(tried).toEqual([30333, 30334, 30335]);
  });
  it('throws the first error after the last try and stops at 65535', async () => {
    const tried: number[] = [];
    const first = busy('EADDRINUSE');
    await expect(
      startOnFreePort(65533, (p) => {
        tried.push(p);
        return Promise.reject(p === 65533 ? first : busy('EADDRINUSE'));
      }),
    ).rejects.toBe(first);
    expect(tried).toEqual([65533, 65534, 65535]);
    const many: number[] = [];
    await expect(
      startOnFreePort(
        1000,
        (p) => {
          many.push(p);
          return Promise.reject(busy('EADDRINUSE'));
        },
        3,
      ),
    ).rejects.toThrow('EADDRINUSE');
    expect(many).toEqual([1000, 1001, 1002]);
  });
  it('does not retry other errors or port 0', async () => {
    let calls = 0;
    await expect(
      startOnFreePort(30333, () => {
        calls++;
        return Promise.reject(new Error('campaign locked'));
      }),
    ).rejects.toThrow('campaign locked');
    expect(calls).toBe(1);
    calls = 0;
    await expect(
      startOnFreePort(0, () => {
        calls++;
        return Promise.reject(busy('EADDRINUSE'));
      }),
    ).rejects.toThrow();
    expect(calls).toBe(1);
  });
  it('recognises unavailable-port errors only', () => {
    expect(isPortUnavailable(busy('EADDRINUSE'))).toBe(true);
    expect(isPortUnavailable(busy('EACCES'))).toBe(true);
    expect(isPortUnavailable(busy('ENOENT'))).toBe(false);
    expect(isPortUnavailable(null)).toBe(false);
  });
  it('tells the GM which port is in use', () => {
    expect(portFallbackMessage(30333, 30334)).toContain(
      'Port 30333 is used by another program, so The System is using port 30334',
    );
  });
});

describe('splash (MS.7)', () => {
  it('is a self-contained page with no scripts or remote loads', () => {
    const html = splashHtml();
    expect(html).toContain(`<title>${SPLASH_TITLE}</title>`);
    expect(html).not.toMatch(/<script|https?:/i);
    expect(html).toContain("default-src 'none'");
    expect(decodeURIComponent(splashUrl().replace(/^data:text\/html;charset=utf-8,/, ''))).toBe(
      html,
    );
  });
});

describe('permissions (MC.5)', () => {
  const own = 'http://127.0.0.1:4700/gm';
  it('grants the mic to the GM window on its own page only', () => {
    expect(allowsPermission(true, 'media', ['audio'], own, 4700)).toBe(true);
    expect(allowsPermission(false, 'media', ['audio'], own, 4700)).toBe(false);
    expect(allowsPermission(true, 'media', ['audio'], 'http://evil.example:4700/', 4700)).toBe(
      false,
    );
    expect(allowsPermission(true, 'media', ['audio'], own, 4701)).toBe(false);
  });
  it('refuses video, mixed or unspecified media and every other permission', () => {
    expect(allowsPermission(true, 'media', ['video'], own, 4700)).toBe(false);
    expect(allowsPermission(true, 'media', ['audio', 'video'], own, 4700)).toBe(false);
    expect(allowsPermission(true, 'media', [], own, 4700)).toBe(false);
    expect(allowsPermission(true, 'media', undefined, own, 4700)).toBe(false);
    for (const p of ['geolocation', 'notifications', 'clipboard-read', 'display-capture']) {
      expect(allowsPermission(true, p, ['audio'], own, 4700)).toBe(false);
    }
  });
});

describe('packaged speech engine (MC.5, D236)', () => {
  it('loads sherpa-onnx-node from resources/speech, outside the asar', async () => {
    const resources = mkdtempSync(path.join(tmpdir(), 'the-system-res-'));
    try {
      expect(speechPackageDir(resources)).toBe(path.join(resources, 'speech', 'node_modules'));
      const pkg = path.join(speechPackageDir(resources), 'sherpa-onnx-node');
      mkdirSync(pkg, { recursive: true });
      writeFileSync(path.join(pkg, 'package.json'), '{"name":"sherpa-onnx-node","main":"x.js"}');
      writeFileSync(path.join(pkg, 'x.js'), 'module.exports = { OfflineRecognizer: "stub" };');
      await expect(packagedSpeechLoad(resources)()).resolves.toEqual({ OfflineRecognizer: 'stub' });
      const empty = path.join(resources, 'elsewhere');
      await expect(packagedSpeechLoad(empty)()).rejects.toThrow(/sherpa-onnx-node/);
    } finally {
      rmSync(resources, { recursive: true, force: true });
    }
  });

  it("names the JS package and this platform's native addon (review M6)", () => {
    const dir = path.join('res', 'speech', 'node_modules');
    expect(packagedSpeechFiles('res', 'win32', 'x64')).toEqual({
      packageDir: path.join(dir, 'sherpa-onnx-node'),
      addon: path.join(dir, 'sherpa-onnx-win-x64', 'sherpa-onnx.node'),
    });
    expect(packagedSpeechFiles('res', 'linux', 'x64').addon).toBe(
      path.join(dir, 'sherpa-onnx-linux-x64', 'sherpa-onnx.node'),
    );
    expect(packagedSpeechFiles('res', 'darwin', 'arm64').addon).toBe(
      path.join(dir, 'sherpa-onnx-darwin-arm64', 'sherpa-onnx.node'),
    );
  });
});

describe('QF.45 quit for update', () => {
  it('spots the installer flag anywhere in the arguments', () => {
    expect(QUIT_FOR_UPDATE).toBe('--quit-for-update');
    expect(isQuitForUpdate(['TheSystem.exe', '--quit-for-update'])).toBe(true);
    expect(isQuitForUpdate(['electron', 'main.cjs', '--no-sandbox', '--quit-for-update'])).toBe(
      true,
    );
    expect(isQuitForUpdate(['TheSystem.exe'])).toBe(false);
    expect(isQuitForUpdate(['TheSystem.exe', '--quit-for-updates'])).toBe(false);
  });
});
