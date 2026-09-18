/**
 * Security Store & Ban Enforcement
 * Mengelola status Surat Peringatan, Pelanggaran, dan Pemblokiran (Banned)
 * Beroperasi lintas localStorage, sessionStorage, cookie, serta sinkronisasi server IP.
 */

import { censorWord, type ViolationType } from './securityGuard';

export type BanType = 'temporary_1day' | 'permanent';

export interface BanState {
  isBanned: boolean;
  banType: BanType | null;
  bannedAt: string | null;
  expiresAt: string | null;
  reason: string | null;
  strikeCount: number;
  clientIp: string;
  deviceFingerprint: string;
}

export interface WarningNotice {
  noticeNumber: number; // 1, 2, atau 3
  violationType: ViolationType;
  detectedWord: string;
  reason: string;
  timestamp: string;
  clientIp: string;
  deviceFingerprint: string;
  isGuest: boolean;
  isBannedNow: boolean;
  banType?: BanType;
  expiresAt?: string;
}

const STORAGE_BAN_KEY = 'linguist_sec_ban_v2';
const STORAGE_STRIKES_KEY = 'linguist_sec_strikes_v2';
const STORAGE_DEVICE_KEY = 'linguist_device_uuid_v2';
const COOKIE_BAN_NAME = 'linguist_sec_ban';

let cachedClientIp = '';

// Helper Cookie
function setCookie(name: string, value: string, days: number) {
  try {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
  } catch {
    // ignore
  }
}

function getCookie(name: string): string | null {
  try {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
  } catch {
    return null;
  }
}

function removeCookie(name: string) {
  try {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
  } catch {
    // ignore
  }
}

/**
 * Generate atau ambil UUID perangkat unik yang persisten lintas sesi dan mode pengunjung
 */
export function getDeviceFingerprint(): string {
  try {
    let deviceId = localStorage.getItem(STORAGE_DEVICE_KEY);
    if (!deviceId) {
      deviceId = getCookie(STORAGE_DEVICE_KEY);
    }
    if (!deviceId) {
      const screenInfo = `${window.screen?.width || 0}x${window.screen?.height || 0}x${window.screen?.colorDepth || 0}`;
      const tz = Intl?.DateTimeFormat()?.resolvedOptions()?.timeZone || 'Asia/Jakarta';
      const rand = Math.random().toString(36).substring(2, 10);
      deviceId = `dev_${btoa(`${navigator.userAgent}_${screenInfo}_${tz}_${rand}`).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24)}`;
      localStorage.setItem(STORAGE_DEVICE_KEY, deviceId);
      setCookie(STORAGE_DEVICE_KEY, deviceId, 365);
    }
    return deviceId;
  } catch {
    return 'dev_client_mobile_default';
  }
}

/**
 * Dapatkan alamat IP publik klien dari server backend atau fallback
 */
export async function getClientIp(): Promise<string> {
  if (cachedClientIp) return cachedClientIp;

  // 1. Coba ambil dari endpoint server lokal Express
  try {
    const res = await fetch('/api/security/client-info');
    if (res.ok) {
      const data = await res.json();
      if (data?.ip) {
        cachedClientIp = data.ip;
        return data.ip;
      }
    }
  } catch {
    // fallback
  }

  // 2. Fallback ke layanan IP publik
  try {
    const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      if (data?.ip) {
        cachedClientIp = data.ip;
        return data.ip;
      }
    }
  } catch {
    // fallback
  }

  cachedClientIp = '127.0.0.1';
  return cachedClientIp;
}

/**
 * Baca status Ban dari penyimpanan lokal (multi-layer: localStorage, cookie, sessionStorage)
 */
export function getLocalBanState(): BanState {
  const deviceFingerprint = getDeviceFingerprint();

  let stored: any = null;
  try {
    const rawLocal = localStorage.getItem(STORAGE_BAN_KEY);
    if (rawLocal) stored = JSON.parse(rawLocal);
  } catch {
    // ignore
  }

  if (!stored) {
    try {
      const rawCookie = getCookie(COOKIE_BAN_NAME);
      if (rawCookie) stored = JSON.parse(rawCookie);
    } catch {
      // ignore
    }
  }

  if (stored && stored.isBanned) {
    // Periksa apakah ban 1 hari sudah kadaluarsa
    if (stored.banType === 'temporary_1day' && stored.expiresAt) {
      const expireTime = new Date(stored.expiresAt).getTime();
      if (Date.now() > expireTime) {
        // Sudah lewat 24 jam -> Buka blokir
        clearLocalBan();
        return {
          isBanned: false,
          banType: null,
          bannedAt: null,
          expiresAt: null,
          reason: null,
          strikeCount: 0,
          clientIp: cachedClientIp || '127.0.0.1',
          deviceFingerprint,
        };
      }
    }

    return {
      isBanned: true,
      banType: stored.banType,
      bannedAt: stored.bannedAt,
      expiresAt: stored.expiresAt,
      reason: stored.reason,
      strikeCount: stored.strikeCount || 3,
      clientIp: stored.clientIp || cachedClientIp || '127.0.0.1',
      deviceFingerprint,
    };
  }

  let strikes = 0;
  try {
    strikes = parseInt(localStorage.getItem(STORAGE_STRIKES_KEY) || '0', 10) || 0;
  } catch {
    strikes = 0;
  }

  return {
    isBanned: false,
    banType: null,
    bannedAt: null,
    expiresAt: null,
    reason: null,
    strikeCount: strikes,
    clientIp: cachedClientIp || '127.0.0.1',
    deviceFingerprint,
  };
}

/**
 * Simpan status ban ke seluruh layer penyimpanan
 */
export function saveLocalBan(state: BanState): void {
  try {
    localStorage.setItem(STORAGE_BAN_KEY, JSON.stringify(state));
    sessionStorage.setItem(STORAGE_BAN_KEY, JSON.stringify(state));
    const days = state.banType === 'permanent' ? 3650 : 1;
    setCookie(COOKIE_BAN_NAME, JSON.stringify(state), days);
  } catch {
    // ignore
  }
}

/**
 * Hapus ban lokal setelah masa hukuman 24 jam selesai
 */
export function clearLocalBan(): void {
  try {
    localStorage.removeItem(STORAGE_BAN_KEY);
    sessionStorage.removeItem(STORAGE_BAN_KEY);
    localStorage.removeItem(STORAGE_STRIKES_KEY);
    removeCookie(COOKIE_BAN_NAME);
  } catch {
    // ignore
  }
}

/**
 * Sinkronisasi status Ban dengan Server Backend
 */
export async function syncSecurityStatus(userId?: string): Promise<BanState> {
  const local = getLocalBanState();
  const deviceFingerprint = getDeviceFingerprint();

  try {
    const res = await fetch('/api/security/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceFingerprint,
        userId: userId || 'guest',
      }),
    });

    if (res.ok) {
      const serverData = await res.json();
      if (serverData?.ip) cachedClientIp = serverData.ip;

      if (serverData?.isBanned) {
        const syncedState: BanState = {
          isBanned: true,
          banType: serverData.banType,
          bannedAt: serverData.bannedAt || new Date().toISOString(),
          expiresAt: serverData.expiresAt || null,
          reason: serverData.reason || 'Pelanggaran aturan keamanan',
          strikeCount: serverData.strikeCount || 3,
          clientIp: serverData.ip || cachedClientIp || '127.0.0.1',
          deviceFingerprint,
        };
        saveLocalBan(syncedState);
        return syncedState;
      } else if (local.isBanned && local.banType === 'temporary_1day') {
        // Jika server menyatakan tidak banned tapi lokal ada expire
        const expireTime = local.expiresAt ? new Date(local.expiresAt).getTime() : 0;
        if (Date.now() > expireTime) {
          clearLocalBan();
        }
      }
    }
  } catch {
    // server unreachable, rely on robust local state
  }

  return getLocalBanState();
}

/**
 * Catat dan laporkan pelanggaran ke server dan multi-layer storage
 */
export async function recordSecurityViolation(params: {
  type: ViolationType;
  excerpt: string;
  isGuest: boolean;
  userId?: string;
}): Promise<WarningNotice> {
  const { type, excerpt, isGuest, userId } = params;
  const ip = await getClientIp();
  const deviceFingerprint = getDeviceFingerprint();
  const timestamp = new Date().toISOString();

  // 1. Skrip Berbahaya -> BANNED SELAMANYA (Permanent Ban Langsung)
  if (type === 'malicious_script') {
    const permanentBanState: BanState = {
      isBanned: true,
      banType: 'permanent',
      bannedAt: timestamp,
      expiresAt: null,
      reason: 'Percobaan injeksi skrip atau kode berbahaya (XSS/SQLi/Command Injection) terhadap sistem website.',
      strikeCount: 99,
      clientIp: ip,
      deviceFingerprint,
    };
    saveLocalBan(permanentBanState);

    // Laporkan ke backend
    try {
      await fetch('/api/security/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'malicious_script',
          excerpt,
          deviceFingerprint,
          userId: userId || 'guest',
        }),
      });
    } catch {
      // ignore
    }

    return {
      noticeNumber: 99,
      violationType: 'malicious_script',
      detectedWord: excerpt,
      reason: 'Memasukkan skrip atau kode berbahaya yang berpotensi merusak keamanan dan stabilitas web.',
      timestamp,
      clientIp: ip,
      deviceFingerprint,
      isGuest,
      isBannedNow: true,
      banType: 'permanent',
    };
  }

  // 2. Kata Toxic / Vulgar -> Sistem 3x Pelanggaran = BANNED 1 HARI (24 Jam)
  let currentStrikes = 0;
  try {
    currentStrikes = parseInt(localStorage.getItem(STORAGE_STRIKES_KEY) || '0', 10) || 0;
  } catch {
    currentStrikes = 0;
  }

  currentStrikes += 1;
  try {
    localStorage.setItem(STORAGE_STRIKES_KEY, String(currentStrikes));
  } catch {
    // ignore
  }

  let isBannedNow = false;
  let banExpiresAt: string | undefined = undefined;

  if (currentStrikes >= 3) {
    isBannedNow = true;
    const expireDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 Jam (1 Hari)
    banExpiresAt = expireDate.toISOString();

    const tempBanState: BanState = {
      isBanned: true,
      banType: 'temporary_1day',
      bannedAt: timestamp,
      expiresAt: banExpiresAt,
      reason: 'Melanggar aturan bahasa sebanyak 3 kali (penggunaan kata kasar, toxic, atau vulgar).',
      strikeCount: currentStrikes,
      clientIp: ip,
      deviceFingerprint,
    };
    saveLocalBan(tempBanState);
  }

  // Laporkan ke backend
  try {
    await fetch('/api/security/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'toxic',
        excerpt,
        deviceFingerprint,
        userId: userId || 'guest',
        strikeCount: currentStrikes,
      }),
    });
  } catch {
    // ignore
  }

  return {
    noticeNumber: Math.min(currentStrikes, 3),
    violationType: 'toxic',
    detectedWord: censorWord(excerpt),
    reason: 'Penggunaan kata kasar, umpatan, atau bahasa vulgar yang dilarang.',
    timestamp,
    clientIp: ip,
    deviceFingerprint,
    isGuest,
    isBannedNow,
    banType: isBannedNow ? 'temporary_1day' : undefined,
    expiresAt: banExpiresAt,
  };
}

/**
 * Hitung sisa waktu pemblokiran untuk live countdown timer
 */
export function getRemainingBanTime(expiresAtStr: string | null): {
  hours: number;
  minutes: number;
  seconds: number;
  isExpired: boolean;
  formatted: string;
} {
  if (!expiresAtStr) {
    return { hours: 0, minutes: 0, seconds: 0, isExpired: false, formatted: 'Permanen' };
  }

  const expireTime = new Date(expiresAtStr).getTime();
  const diff = expireTime - Date.now();

  if (diff <= 0) {
    return { hours: 0, minutes: 0, seconds: 0, isExpired: true, formatted: '00:00:00' };
  }

  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');
  const formatted = `${pad(hours)} : ${pad(minutes)} : ${pad(seconds)}`;

  return { hours, minutes, seconds, isExpired: false, formatted };
}
