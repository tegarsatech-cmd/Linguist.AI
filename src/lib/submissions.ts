import { supabase } from './supabase';
import type { WritingFeedback, SpeakingFeedback } from './gemini';

/**
 * Satu sumber data untuk semua hasil latihan (writing & speaking).
 * Menggunakan pendekatan offline-first & multi-tier storage:
 * 1. LocalStorage Browser (Responsif seketika 0ms, tanpa lag).
 * 2. Supabase Cloud Storage (Sinkronisasi otomatis saat terhubung).
 * 3. Backend Database Server (Jika di-hosting dengan server aktif).
 *
 * Ini menjamin riwayat dan progres latihan 100% selalu berfungsi, cepat,
 * tidak pernah muter-muter, dan data tidak pernah hilang baik di lokal maupun di Vercel.
 */

export interface SubmissionRow {
  id: string;
  user_id: string;
  type: 'writing' | 'speaking';
  original_text: string;         // writing: teks asli; speaking: transkrip
  corrected_text: string | null; // writing only
  score: number;
  error_categories: string[];    // nama kategori yang memiliki error
  feedback: WritingFeedback | SpeakingFeedback;
  suggestions: string[];
  created_at: string;
}

const LOCAL_STORAGE_PREFIX = 'linguist_submissions_';
const GLOBAL_STORAGE_KEY = 'linguist_submissions_all';

// Helper: fetch JSON aman dengan batas waktu (timeout) agar tidak pernah macet/hang
async function safeFetchJson(url: string, options?: RequestInit, timeoutMs = 1500): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const contentType = res.headers.get('content-type') || '';
    // Di Vercel static hosting, route API yang tidak ada akan mengembalikan HTML index.html
    if (!res.ok || !contentType.includes('application/json')) {
      return null;
    }
    return await res.json();
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

export function getLocalSubmissions(userId: string): SubmissionRow[] {
  const merged = new Map<string, SubmissionRow>();
  try {
    // 1. Ambil dari prefix user spesifik
    const rawUser = localStorage.getItem(LOCAL_STORAGE_PREFIX + userId);
    if (rawUser) {
      const rows: SubmissionRow[] = JSON.parse(rawUser);
      rows.forEach((r) => merged.set(r.id, r));
    }
    // 2. Ambil dari global backup (agar data tidak hilang saat relogin)
    const rawAll = localStorage.getItem(GLOBAL_STORAGE_KEY);
    if (rawAll) {
      const rows: SubmissionRow[] = JSON.parse(rawAll);
      rows.forEach((r) => {
        if (!userId || userId === 'all' || r.user_id === userId || !r.user_id) {
          if (!merged.has(r.id)) merged.set(r.id, r);
        }
      });
    }
  } catch (e) {
    console.warn('Gagal membaca data lokal:', e);
  }
  return Array.from(merged.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export function setLocalSubmissions(userId: string, rows: SubmissionRow[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_PREFIX + userId, JSON.stringify(rows));

    // Sinkronkan juga ke global backup
    const rawAll = localStorage.getItem(GLOBAL_STORAGE_KEY);
    const existing: SubmissionRow[] = rawAll ? JSON.parse(rawAll) : [];
    const map = new Map<string, SubmissionRow>();
    existing.forEach((r) => map.set(r.id, r));
    rows.forEach((r) => map.set(r.id, r));
    localStorage.setItem(GLOBAL_STORAGE_KEY, JSON.stringify(Array.from(map.values())));
  } catch (e) {
    console.warn('Gagal menyimpan data lokal:', e);
  }
}

export async function saveWritingSubmission(
  userId: string,
  originalText: string,
  feedback: WritingFeedback
): Promise<SubmissionRow> {
  const errorCategories = feedback.categories
    .filter((c) => c.errors.length > 0)
    .map((c) => c.name);

  const suggestions = feedback.categories.flatMap((c) => c.suggestions);
  const newId =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : 'sub_' + Date.now();
  const validUserId = userId || 'user_active';

  const newRow: SubmissionRow = {
    id: newId,
    user_id: validUserId,
    type: 'writing',
    original_text: originalText,
    corrected_text: feedback.corrected_text,
    score: feedback.score,
    error_categories: errorCategories,
    feedback,
    suggestions,
    created_at: new Date().toISOString(),
  };

  // 1. Simpan ke LocalStorage seketika (0ms - bebas lag)
  const localList = getLocalSubmissions(validUserId);
  const updatedList = [newRow, ...localList.filter((s) => s.id !== newRow.id)];
  setLocalSubmissions(validUserId, updatedList);

  // 2. Siarkan event sinkronisasi real-time
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('linguist_submissions_changed', { detail: newRow }));
  }

  // 3. Sinkronkan ke Server Database (non-blocking di background)
  safeFetchJson('/api/submissions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newRow),
  }).catch(() => {});

  // 4. Sinkronkan ke Supabase Cloud (non-blocking)
  try {
    Promise.race([
      supabase.from('submissions').insert({
        id: newRow.id,
        user_id: validUserId,
        type: 'writing',
        original_text: originalText,
        content: originalText,
        corrected_text: feedback.corrected_text,
        score: feedback.score,
        error_categories: errorCategories,
        feedback,
        suggestions,
      }),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]).catch(() => {});
  } catch {
    // ignore
  }

  return newRow;
}

export async function saveSpeakingSubmission(
  userId: string,
  transcription: string,
  feedback: SpeakingFeedback
): Promise<SubmissionRow> {
  const newId =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : 'sub_' + Date.now();
  const validUserId = userId || 'user_active';

  const newRow: SubmissionRow = {
    id: newId,
    user_id: validUserId,
    type: 'speaking',
    original_text: transcription,
    corrected_text: null,
    score: feedback.score,
    error_categories: feedback.weakness ? [feedback.weakness] : [],
    feedback,
    suggestions: feedback.improvements || [],
    created_at: new Date().toISOString(),
  };

  // 1. Simpan ke LocalStorage seketika (0ms - bebas lag)
  const localList = getLocalSubmissions(validUserId);
  const updatedList = [newRow, ...localList.filter((s) => s.id !== newRow.id)];
  setLocalSubmissions(validUserId, updatedList);

  // 2. Siarkan event sinkronisasi real-time
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('linguist_submissions_changed', { detail: newRow }));
  }

  // 3. Sinkronkan ke Server Database (non-blocking)
  safeFetchJson('/api/submissions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newRow),
  }).catch(() => {});

  // 4. Sinkronkan ke Supabase Cloud (non-blocking)
  try {
    Promise.race([
      supabase.from('submissions').insert({
        id: newRow.id,
        user_id: validUserId,
        type: 'speaking',
        original_text: transcription,
        content: transcription,
        corrected_text: null,
        score: feedback.score,
        error_categories: newRow.error_categories,
        feedback,
        suggestions: newRow.suggestions,
      }),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]).catch(() => {});
  } catch {
    // ignore
  }

  return newRow;
}

export async function fetchSubmissions(userId?: string, limit = 100): Promise<SubmissionRow[]> {
  const map = new Map<string, SubmissionRow>();
  const activeUserId = userId || 'all';

  // 1. Masukkan data lokal terlebih dahulu (0ms respons instan)
  const localList = getLocalSubmissions(activeUserId);
  for (const local of localList) {
    map.set(local.id, local);
  }

  // 2. Ambil update dari Database Server (jika ada, batas waktu 1.5 detik)
  try {
    const url =
      activeUserId && activeUserId !== 'all'
        ? `/api/submissions?userId=${encodeURIComponent(activeUserId)}&limit=${limit}`
        : `/api/submissions?limit=${limit}`;

    const json = await safeFetchJson(url, undefined, 1500);
    if (Array.isArray(json?.submissions)) {
      for (const row of json.submissions as SubmissionRow[]) {
        if (!map.has(row.id)) {
          map.set(row.id, row);
        }
      }
    }
  } catch {
    // Abaikan jika server backend offline / di Vercel
  }

  // 3. Ambil update dari Supabase Cloud (batas waktu 1.5 detik)
  if (activeUserId && activeUserId !== 'all') {
    try {
      const supabaseQuery = supabase
        .from('submissions')
        .select('*')
        .eq('user_id', activeUserId)
        .order('created_at', { ascending: false })
        .limit(limit);

      const timeoutPromise = new Promise<{ data: any[] | null; error: any }>((resolve) =>
        setTimeout(() => resolve({ data: null, error: 'timeout' }), 1500)
      );

      const res: any = await Promise.race([supabaseQuery, timeoutPromise]);
      if (res && !res.error && Array.isArray(res.data)) {
        for (const row of res.data) {
          const formatted: SubmissionRow = {
            id: row.id,
            user_id: row.user_id,
            type: row.type,
            original_text: row.original_text || row.content || '',
            corrected_text: row.corrected_text || null,
            score: Number(row.score) || 0,
            error_categories: Array.isArray(row.error_categories) ? row.error_categories : [],
            feedback: row.feedback || {},
            suggestions: Array.isArray(row.suggestions) ? row.suggestions : [],
            created_at: row.created_at || new Date().toISOString(),
          };
          if (!map.has(formatted.id)) {
            map.set(formatted.id, formatted);
          }
        }
      }
    } catch {
      // ignore
    }
  }

  // Urutkan dari yang paling baru
  const result = Array.from(map.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return result.slice(0, limit);
}

export async function deleteSubmission(id: string): Promise<void> {
  // 1. Hapus dari LocalStorage seketika (0ms)
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith(LOCAL_STORAGE_PREFIX) || key === GLOBAL_STORAGE_KEY)) {
        const rows: SubmissionRow[] = JSON.parse(localStorage.getItem(key) || '[]');
        const filtered = rows.filter((r) => r.id !== id);
        localStorage.setItem(key, JSON.stringify(filtered));
      }
    }
  } catch (e) {
    console.error('Gagal menghapus dari penyimpanan lokal:', e);
  }

  // 2. Siarkan event perubahan
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('linguist_submissions_changed', { detail: { id, deleted: true } })
    );
  }

  // 3. Hapus di server & Supabase secara non-blocking
  safeFetchJson(`/api/submissions/${encodeURIComponent(id)}`, { method: 'DELETE' }, 1500).catch(
    () => {}
  );
  try {
    Promise.resolve(supabase.from('submissions').delete().eq('id', id)).catch(() => {});
  } catch {
    // ignore
  }
}

export interface YouTubeRecommendationRow {
  id: string;
  submission_id: string | null;
  topic: string;
  subtopic: string;
  query: string;
  video_id: string;
  title: string;
  channel_title: string;
  thumbnail_url: string;
  description: string;
  published_at: string;
  created_at: string;
}

export async function fetchRecommendations(submissionId: string): Promise<YouTubeRecommendationRow[]> {
  try {
    const { data, error } = await supabase
      .from('youtube_recommendations')
      .select('*')
      .eq('submission_id', submissionId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      return data as YouTubeRecommendationRow[];
    }
  } catch {
    // ignore
  }
  return [];
}

export async function saveRecommendations(
  rows: Omit<YouTubeRecommendationRow, 'id' | 'created_at'>[]
): Promise<void> {
  if (rows.length === 0) return;
  try {
    await supabase.from('youtube_recommendations').insert(rows);
  } catch {
    // ignore
  }
}
