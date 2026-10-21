import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DESKTOP_PORT,
  dataDirFor,
  desktopPort,
  gmWindowUrl,
  isOwnPage,
  startErrorMessage,
  webRootFor,
} from '../src/launch';

describe('desktop launch helpers', () => {
  it('puts the GM key only in the fragment of a localhost URL', () => {
    expect(gmWindowUrl(30333, 'k+y/=')).toBe('http://localhost:30333/gm#key=k%2By%2F%3D');
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
      'Port 30333 is already in use',
    );
    expect(startErrorMessage(new Error('boom'), 1)).toBe('The System could not start: boom');
  });
});
