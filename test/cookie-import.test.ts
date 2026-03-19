import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const TEST_PASSWORD = 'test-keychain-password';
const TEST_KEY = crypto.pbkdf2Sync(TEST_PASSWORD, 'saltysalt', 1003, 16, 'sha1');
const IV = Buffer.alloc(16, 0x20);
const CHROMIUM_EPOCH_OFFSET = 11644473600000000n;

const FIXTURE_ROOT = path.join(os.tmpdir(), 'gstack-cookie-import-fixture');
const FIXTURE_DIR = path.join(FIXTURE_ROOT, 'Library', 'Application Support', 'Google', 'Chrome', 'Default');
const FIXTURE_DB = path.join(FIXTURE_DIR, 'Cookies');

function encryptCookieValue(value: string): Buffer {
  const hmacTag = crypto.randomBytes(32);
  const plaintext = Buffer.concat([hmacTag, Buffer.from(value, 'utf-8')]);
  const blockSize = 16;
  const padLen = blockSize - (plaintext.length % blockSize);
  const padded = Buffer.concat([plaintext, Buffer.alloc(padLen, padLen)]);
  const cipher = crypto.createCipheriv('aes-128-cbc', TEST_KEY, IV);
  cipher.setAutoPadding(false);
  const encrypted = Buffer.concat([cipher.update(padded), cipher.final()]);
  return Buffer.concat([Buffer.from('v10'), encrypted]);
}

function chromiumEpoch(unixSeconds: number): bigint {
  return BigInt(unixSeconds) * 1000000n + CHROMIUM_EPOCH_OFFSET;
}

function createFixtureDb() {
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  if (fs.existsSync(FIXTURE_DB)) fs.unlinkSync(FIXTURE_DB);

  const db = new Database(FIXTURE_DB);
  db.run(`CREATE TABLE cookies (
    host_key TEXT NOT NULL,
    name TEXT NOT NULL,
    value TEXT NOT NULL DEFAULT '',
    encrypted_value BLOB NOT NULL DEFAULT x'',
    path TEXT NOT NULL DEFAULT '/',
    expires_utc INTEGER NOT NULL DEFAULT 0,
    is_secure INTEGER NOT NULL DEFAULT 0,
    is_httponly INTEGER NOT NULL DEFAULT 0,
    has_expires INTEGER NOT NULL DEFAULT 0,
    samesite INTEGER NOT NULL DEFAULT 1
  )`);

  const insert = db.prepare(`INSERT INTO cookies
    (host_key, name, value, encrypted_value, path, expires_utc, is_secure, is_httponly, has_expires, samesite)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  const futureExpiry = Number(chromiumEpoch(Math.floor(Date.now() / 1000) + 86400 * 365));
  const pastExpiry = Number(chromiumEpoch(Math.floor(Date.now() / 1000) - 86400));

  insert.run('.github.com', 'session_id', '', encryptCookieValue('abc123'), '/', futureExpiry, 1, 1, 1, 1);
  insert.run('.github.com', 'user_token', '', encryptCookieValue('token-xyz'), '/', futureExpiry, 1, 0, 1, 0);
  insert.run('.github.com', 'theme', '', encryptCookieValue('dark'), '/', futureExpiry, 0, 0, 1, 2);
  insert.run('.google.com', 'NID', '', encryptCookieValue('google-nid-value'), '/', futureExpiry, 1, 1, 1, 0);
  insert.run('.google.com', 'SID', '', encryptCookieValue('google-sid-value'), '/', futureExpiry, 1, 1, 1, 1);
  insert.run('.example.com', 'plain_cookie', 'hello-world', Buffer.alloc(0), '/', futureExpiry, 0, 0, 1, 1);
  insert.run('.expired.com', 'old', '', encryptCookieValue('expired-value'), '/', pastExpiry, 0, 0, 1, 1);
  insert.run('.session.com', 'sess', '', encryptCookieValue('session-value'), '/', 0, 1, 1, 0, 1);
  insert.run('.corrupt.com', 'bad', '', Buffer.from('v10' + 'not-valid-ciphertext-at-all'), '/', futureExpiry, 0, 0, 1, 1);
  insert.run('.mixed.com', 'good', '', encryptCookieValue('mixed-good'), '/', futureExpiry, 0, 0, 1, 1);
  insert.run('.mixed.com', 'bad', '', Buffer.from('v10' + 'garbage-data-here!!!'), '/', futureExpiry, 0, 0, 1, 1);

  db.close();
}

let findInstalledBrowsers: typeof import('../bin/gstack-cookie-import-lib').findInstalledBrowsers;
let listDomains: typeof import('../bin/gstack-cookie-import-lib').listDomains;
let importCookies: typeof import('../bin/gstack-cookie-import-lib').importCookies;
let formatCookieSetCommand: typeof import('../bin/gstack-cookie-import-lib').formatCookieSetCommand;
let CookieImportError: typeof import('../bin/gstack-cookie-import-lib').CookieImportError;
const originalHome = process.env.HOME;
const originalSpawn = Bun.spawn;

beforeAll(async () => {
  createFixtureDb();
  process.env.HOME = FIXTURE_ROOT;

  // @ts-ignore monkey patch Bun.spawn for keychain reads
  Bun.spawn = function(cmd: any, opts: any) {
    if (Array.isArray(cmd) && cmd[0] === 'security' && cmd[1] === 'find-generic-password') {
      return {
        stdout: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(TEST_PASSWORD + '\n'));
            controller.close();
          },
        }),
        stderr: new ReadableStream({
          start(controller) { controller.close(); },
        }),
        exited: Promise.resolve(0),
        kill: () => {},
      };
    }
    return originalSpawn(cmd, opts);
  };

  const mod = await import('../bin/gstack-cookie-import-lib.ts');
  findInstalledBrowsers = mod.findInstalledBrowsers;
  listDomains = mod.listDomains;
  importCookies = mod.importCookies;
  formatCookieSetCommand = mod.formatCookieSetCommand;
  CookieImportError = mod.CookieImportError;
});

afterAll(() => {
  process.env.HOME = originalHome;
  // @ts-ignore restore
  Bun.spawn = originalSpawn;
  try { fs.rmSync(FIXTURE_ROOT, { recursive: true, force: true }); } catch {}
});

describe('gstack-cookie-import', () => {
  test('findInstalledBrowsers returns installed chrome fixture', () => {
    const browsers = findInstalledBrowsers();
    expect(browsers.some((b) => b.aliases.includes('chrome'))).toBe(true);
  });

  test('listDomains returns unique domains and filters expired cookies', () => {
    const result = listDomains('chrome');
    const counts = Object.fromEntries(result.domains.map((d) => [d.domain, d.count]));
    expect(counts['.github.com']).toBe(3);
    expect(counts['.google.com']).toBe(2);
    expect(counts['.expired.com']).toBeUndefined();
    expect(counts['.session.com']).toBe(1);
  });

  test('importCookies decrypts and converts cookies', async () => {
    const result = await importCookies('chrome', ['.github.com', '.example.com', '.session.com']);
    expect(result.count).toBe(5);
    expect(result.failed).toBe(0);
    const values = Object.fromEntries(result.cookies.map((c) => [`${c.domain}:${c.name}`, c.value]));
    expect(values['.github.com:session_id']).toBe('abc123');
    expect(values['.github.com:user_token']).toBe('token-xyz');
    expect(values['.example.com:plain_cookie']).toBe('hello-world');
    expect(values['.session.com:sess']).toBe('session-value');
  });

  test('corrupt cookies are counted as failed and skipped', async () => {
    const result = await importCookies('chrome', ['.corrupt.com', '.mixed.com']);
    expect(result.count).toBe(1);
    expect(result.failed).toBe(2);
    expect(result.cookies[0].name).toBe('good');
  });

  test('formatCookieSetCommand emits agent-browser cookies set syntax', async () => {
    const result = await importCookies('chrome', ['.github.com']);
    const command = formatCookieSetCommand(result.cookies[0]);
    expect(command).toContain('cookies set');
    expect(command).toContain('--domain ".github.com"');
    expect(command).toContain('--path "/"');
    expect(command).toContain('--httpOnly');
    expect(command).toContain('--secure');
    expect(command).toContain('--sameSite Lax');
  });

  test('rejects invalid profile names', () => {
    expect(() => listDomains('chrome', '../etc')).toThrow(/Invalid profile/);
    expect(() => listDomains('chrome', 'Default\x00evil')).toThrow(/Invalid profile/);
  });

  test('throws for unknown browser', () => {
    expect(() => listDomains('firefox')).toThrow(/Unknown browser/);
  });

  test('CookieImportError has expected shape', () => {
    const err = new CookieImportError('test message', 'test_code', 'retry');
    expect(err.message).toBe('test message');
    expect(err.code).toBe('test_code');
    expect(err.action).toBe('retry');
    expect(err.name).toBe('CookieImportError');
  });
});
