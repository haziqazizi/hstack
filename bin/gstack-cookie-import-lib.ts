import { Database } from 'bun:sqlite';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface BrowserInfo {
  name: string;
  dataDir: string;
  keychainService: string;
  aliases: string[];
}

export interface DomainEntry {
  domain: string;
  count: number;
}

export interface AgentBrowserCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  secure: boolean;
  httpOnly: boolean;
  sameSite: 'Strict' | 'Lax' | 'None';
}

export interface ImportResult {
  cookies: AgentBrowserCookie[];
  count: number;
  failed: number;
  domainCounts: Record<string, number>;
}

export class CookieImportError extends Error {
  constructor(
    message: string,
    public code: string,
    public action?: 'retry',
  ) {
    super(message);
    this.name = 'CookieImportError';
  }
}

const BROWSER_REGISTRY: BrowserInfo[] = [
  { name: 'Comet', dataDir: 'Comet/', keychainService: 'Comet Safe Storage', aliases: ['comet', 'perplexity'] },
  { name: 'Chrome', dataDir: 'Google/Chrome/', keychainService: 'Chrome Safe Storage', aliases: ['chrome', 'google-chrome'] },
  { name: 'Arc', dataDir: 'Arc/User Data/', keychainService: 'Arc Safe Storage', aliases: ['arc'] },
  { name: 'Brave', dataDir: 'BraveSoftware/Brave-Browser/', keychainService: 'Brave Safe Storage', aliases: ['brave'] },
  { name: 'Edge', dataDir: 'Microsoft Edge/', keychainService: 'Microsoft Edge Safe Storage', aliases: ['edge'] },
];

const keyCache = new Map<string, Buffer>();

function homeDir(): string {
  return process.env.HOME || os.homedir();
}

export function findInstalledBrowsers(): BrowserInfo[] {
  const appSupport = path.join(homeDir(), 'Library', 'Application Support');
  return BROWSER_REGISTRY.filter((browser) => {
    const dbPath = path.join(appSupport, browser.dataDir, 'Default', 'Cookies');
    try {
      return fs.existsSync(dbPath);
    } catch {
      return false;
    }
  });
}

export function listDomains(browserName: string, profile = 'Default'): { browser: string; domains: DomainEntry[] } {
  const browser = resolveBrowser(browserName);
  const dbPath = getCookieDbPath(browser, profile);
  const db = openDb(dbPath, browser.name);
  try {
    const now = chromiumNow();
    const rows = db.query(
      `SELECT host_key AS domain, COUNT(*) AS count
       FROM cookies
       WHERE has_expires = 0 OR expires_utc > ?
       GROUP BY host_key
       ORDER BY count DESC`
    ).all(now) as DomainEntry[];
    return { browser: browser.name, domains: rows };
  } finally {
    db.close();
  }
}

export async function importCookies(browserName: string, domains: string[], profile = 'Default'): Promise<ImportResult> {
  if (domains.length === 0) {
    return { cookies: [], count: 0, failed: 0, domainCounts: {} };
  }

  const browser = resolveBrowser(browserName);
  const derivedKey = await getDerivedKey(browser);
  const dbPath = getCookieDbPath(browser, profile);
  const db = openDb(dbPath, browser.name);

  try {
    const now = chromiumNow();
    const placeholders = domains.map(() => '?').join(',');
    const rows = db.query(
      `SELECT host_key, name, value, encrypted_value, path, expires_utc,
              is_secure, is_httponly, has_expires, samesite
       FROM cookies
       WHERE host_key IN (${placeholders})
         AND (has_expires = 0 OR expires_utc > ?)
       ORDER BY host_key, name`
    ).all(...domains, now) as RawCookie[];

    const cookies: AgentBrowserCookie[] = [];
    let failed = 0;
    const domainCounts: Record<string, number> = {};

    for (const row of rows) {
      try {
        const value = decryptCookieValue(row, derivedKey);
        const cookie = toCookie(row, value);
        cookies.push(cookie);
        domainCounts[row.host_key] = (domainCounts[row.host_key] || 0) + 1;
      } catch {
        failed++;
      }
    }

    return { cookies, count: cookies.length, failed, domainCounts };
  } finally {
    db.close();
  }
}

export function toAgentBrowserCommands(cookies: AgentBrowserCookie[]): string[] {
  return cookies.map(formatCookieSetCommand);
}

export function formatCookieSetCommand(cookie: AgentBrowserCookie): string {
  const parts = [
    'cookies set',
    shellQuote(cookie.name),
    shellQuote(cookie.value),
    '--domain', shellQuote(cookie.domain),
    '--path', shellQuote(cookie.path || '/'),
  ];

  if (cookie.httpOnly) parts.push('--httpOnly');
  if (cookie.secure) parts.push('--secure');
  if (cookie.sameSite) parts.push('--sameSite', cookie.sameSite);
  if (cookie.expires >= 0) parts.push('--expires', String(cookie.expires));

  return parts.join(' ');
}

function shellQuote(value: string): string {
  return JSON.stringify(value);
}

function resolveBrowser(nameOrAlias: string): BrowserInfo {
  const needle = nameOrAlias.toLowerCase().trim();
  const browser = BROWSER_REGISTRY.find((entry) =>
    entry.aliases.includes(needle) || entry.name.toLowerCase() === needle,
  );
  if (!browser) {
    const supported = BROWSER_REGISTRY.flatMap((entry) => entry.aliases).join(', ');
    throw new CookieImportError(`Unknown browser '${nameOrAlias}'. Supported: ${supported}`, 'unknown_browser');
  }
  return browser;
}

function validateProfile(profile: string): void {
  if (/[/\\]|\.\./.test(profile) || /[\x00-\x1f]/.test(profile)) {
    throw new CookieImportError(`Invalid profile name: '${profile}'`, 'bad_request');
  }
}

function getCookieDbPath(browser: BrowserInfo, profile: string): string {
  validateProfile(profile);
  const appSupport = path.join(homeDir(), 'Library', 'Application Support');
  const dbPath = path.join(appSupport, browser.dataDir, profile, 'Cookies');
  if (!fs.existsSync(dbPath)) {
    throw new CookieImportError(
      `${browser.name} is not installed (no cookie database at ${dbPath})`,
      'not_installed',
    );
  }
  return dbPath;
}

function openDb(dbPath: string, browserName: string): Database {
  try {
    return new Database(dbPath, { readonly: true });
  } catch (err: any) {
    if (err.message?.includes('SQLITE_BUSY') || err.message?.includes('database is locked')) {
      return openDbFromCopy(dbPath, browserName);
    }
    if (err.message?.includes('SQLITE_CORRUPT') || err.message?.includes('malformed')) {
      throw new CookieImportError(`Cookie database for ${browserName} is corrupt`, 'db_corrupt');
    }
    throw err;
  }
}

function openDbFromCopy(dbPath: string, browserName: string): Database {
  const tmpPath = `/tmp/gstack-cookies-${browserName.toLowerCase()}-${crypto.randomUUID()}.db`;
  try {
    fs.copyFileSync(dbPath, tmpPath);
    const walPath = dbPath + '-wal';
    const shmPath = dbPath + '-shm';
    if (fs.existsSync(walPath)) fs.copyFileSync(walPath, tmpPath + '-wal');
    if (fs.existsSync(shmPath)) fs.copyFileSync(shmPath, tmpPath + '-shm');

    const db = new Database(tmpPath, { readonly: true });
    const originalClose = db.close.bind(db);
    db.close = () => {
      originalClose();
      try { fs.unlinkSync(tmpPath); } catch {}
      try { fs.unlinkSync(tmpPath + '-wal'); } catch {}
      try { fs.unlinkSync(tmpPath + '-shm'); } catch {}
    };
    return db;
  } catch {
    try { fs.unlinkSync(tmpPath); } catch {}
    throw new CookieImportError(
      `Cookie database is locked (${browserName} may be running). Try closing ${browserName} first.`,
      'db_locked',
      'retry',
    );
  }
}

async function getDerivedKey(browser: BrowserInfo): Promise<Buffer> {
  const cached = keyCache.get(browser.keychainService);
  if (cached) return cached;

  const password = await getKeychainPassword(browser.keychainService);
  const derived = crypto.pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1');
  keyCache.set(browser.keychainService, derived);
  return derived;
}

async function getKeychainPassword(service: string): Promise<string> {
  const proc = Bun.spawn(['security', 'find-generic-password', '-s', service, '-w'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => {
      proc.kill();
      reject(new CookieImportError(
        `macOS is waiting for Keychain permission. Look for a dialog asking to allow access to "${service}".`,
        'keychain_timeout',
        'retry',
      ));
    }, 10_000),
  );

  try {
    const exitCode = await Promise.race([proc.exited, timeout]);
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();

    if (exitCode !== 0) {
      const errText = stderr.trim().toLowerCase();
      if (errText.includes('user canceled') || errText.includes('denied') || errText.includes('interaction not allowed')) {
        throw new CookieImportError(
          `Keychain access denied. Click "Allow" in the macOS dialog for "${service}".`,
          'keychain_denied',
          'retry',
        );
      }
      if (errText.includes('could not be found') || errText.includes('not found')) {
        throw new CookieImportError(`No Keychain entry for "${service}".`, 'keychain_not_found');
      }
      throw new CookieImportError(`Could not read Keychain: ${stderr.trim()}`, 'keychain_error', 'retry');
    }

    return stdout.trim();
  } catch (err) {
    if (err instanceof CookieImportError) throw err;
    throw new CookieImportError(`Could not read Keychain: ${(err as Error).message}`, 'keychain_error', 'retry');
  }
}

interface RawCookie {
  host_key: string;
  name: string;
  value: string;
  encrypted_value: Buffer | Uint8Array;
  path: string;
  expires_utc: number | bigint;
  is_secure: number;
  is_httponly: number;
  has_expires: number;
  samesite: number;
}

function decryptCookieValue(row: RawCookie, key: Buffer): string {
  if (row.value && row.value.length > 0) return row.value;

  const encryptedValue = Buffer.from(row.encrypted_value);
  if (encryptedValue.length === 0) return '';

  const prefix = encryptedValue.slice(0, 3).toString('utf-8');
  if (prefix !== 'v10') {
    throw new Error(`Unknown encryption prefix: ${prefix}`);
  }

  const ciphertext = encryptedValue.slice(3);
  const iv = Buffer.alloc(16, 0x20);
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  if (plaintext.length <= 32) return '';
  return plaintext.slice(32).toString('utf-8');
}

function toCookie(row: RawCookie, value: string): AgentBrowserCookie {
  return {
    name: row.name,
    value,
    domain: row.host_key,
    path: row.path || '/',
    expires: chromiumEpochToUnix(row.expires_utc, row.has_expires),
    secure: row.is_secure === 1,
    httpOnly: row.is_httponly === 1,
    sameSite: mapSameSite(row.samesite),
  };
}

const CHROMIUM_EPOCH_OFFSET = 11644473600000000n;

function chromiumNow(): bigint {
  return BigInt(Date.now()) * 1000n + CHROMIUM_EPOCH_OFFSET;
}

function chromiumEpochToUnix(epoch: number | bigint, hasExpires: number): number {
  if (hasExpires === 0 || epoch === 0 || epoch === 0n) return -1;
  const epochBig = BigInt(epoch);
  const unixMicro = epochBig - CHROMIUM_EPOCH_OFFSET;
  return Number(unixMicro / 1000000n);
}

function mapSameSite(value: number): 'Strict' | 'Lax' | 'None' {
  switch (value) {
    case 0: return 'None';
    case 1: return 'Lax';
    case 2: return 'Strict';
    default: return 'Lax';
  }
}
