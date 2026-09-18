import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import Groq from 'groq-sdk';
import fs from 'fs';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const SUBMISSIONS_FILE = path.join(DATA_DIR, 'submissions.json');
const SECURITY_BANS_FILE = path.join(DATA_DIR, 'security_bans.json');

function ensureDataStore(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(SUBMISSIONS_FILE)) {
      fs.writeFileSync(SUBMISSIONS_FILE, JSON.stringify([], null, 2), 'utf-8');
    }
    if (!fs.existsSync(SECURITY_BANS_FILE)) {
      fs.writeFileSync(SECURITY_BANS_FILE, JSON.stringify({ bans: {}, strikes: {} }, null, 2), 'utf-8');
    }
  } catch (e) {
    console.error('Data store init error:', e);
  }
}

function readSubmissions(): any[] {
  ensureDataStore();
  try {
    const raw = fs.readFileSync(SUBMISSIONS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('Error reading submissions:', e);
    return [];
  }
}

function writeSubmissions(rows: any[]): void {
  ensureDataStore();
  try {
    fs.writeFileSync(SUBMISSIONS_FILE, JSON.stringify(rows, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error writing submissions:', e);
  }
}

interface SecurityBanRecord {
  banType: 'temporary_1day' | 'permanent';
  bannedAt: string;
  expiresAt: string | null;
  reason: string;
  strikeCount: number;
  ip: string;
  deviceFingerprint?: string;
  userId?: string;
}

interface SecurityData {
  bans: Record<string, SecurityBanRecord>;
  strikes: Record<string, { count: number; lastViolationAt: string }>;
}

function readSecurityData(): SecurityData {
  ensureDataStore();
  try {
    const raw = fs.readFileSync(SECURITY_BANS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { bans: {}, strikes: {} };
  }
}

function writeSecurityData(data: SecurityData): void {
  ensureDataStore();
  try {
    fs.writeFileSync(SECURITY_BANS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error writing security data:', e);
  }
}

function getRequestIp(req: express.Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  const rawIp = req.socket.remoteAddress || '127.0.0.1';
  return rawIp.replace(/^::ffff:/, '');
}

function numOr(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : fallback;
}

interface YouTubeSearchResponse {
  items?: {
    id?: { videoId?: string };
    snippet?: {
      title?: string;
      channelTitle?: string;
      description?: string;
      publishedAt?: string;
      thumbnails?: { high?: { url?: string }; medium?: { url?: string }; default?: { url?: string } };
    };
  }[];
  error?: { message?: string };
}

/** Search.list YouTube Data API v3 (server-side; API key tidak pernah dikirim ke browser). */
async function youtubeSearch(query: string, maxResults: number) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw Object.assign(new Error('YOUTUBE_API_KEY belum dikonfigurasi di server.'), { status: 500 });
  }

  // Permutasi query dinamis untuk hasil yang kaya dan tidak monoton
  const cleanQuery = query.replace(/practice|exercise/gi, '').trim();
  const searchPool = [
    query,
    `${cleanQuery} english lesson`,
    `${cleanQuery} grammar explanation`,
    `learn ${cleanQuery} tips`,
  ];
  const activeQuery = searchPool[Math.floor(Math.random() * searchPool.length)];

  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    q: activeQuery,
    maxResults: '12', // Ambil pool lebih besar lalu diacak
    order: 'relevance',
    videoEmbeddable: 'true',
    relevanceLanguage: 'en',
    key: apiKey,
  });

  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
  const json = (await res.json()) as YouTubeSearchResponse;

  if (!res.ok) {
    console.error('YouTube API Error:', json?.error?.message || res.status);
    throw Object.assign(new Error('YouTube API gagal.'), { status: 502 });
  }

  // Acak urutan video agar pengguna mendapatkan rekomendasi segar dan variatif
  const items = (json.items ?? [])
    .filter(it => it.id?.videoId && it.snippet?.title)
    .sort(() => 0.5 - Math.random())
    .slice(0, Math.max(1, Math.min(maxResults, 6)));

  return items.map(it => ({
    video_id: it.id!.videoId!,
    title: it.snippet!.title!,
    channel_title: it.snippet!.channelTitle ?? '',
    thumbnail_url:
      it.snippet!.thumbnails?.high?.url ||
      it.snippet!.thumbnails?.medium?.url ||
      `https://i.ytimg.com/vi/${it.id!.videoId}/hqdefault.jpg`,
    description: (it.snippet!.description ?? '').slice(0, 200),
    published_at: it.snippet!.publishedAt ?? '',
  }));
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // Initialize Groq
  const groq = process.env.GROQ_API_KEY ? new Groq({
    apiKey: process.env.GROQ_API_KEY,
  }) : null;

  // Initialize Gemini AI as reliable AI engine
  const geminiAi = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

  // --- Persistent Database Endpoints ---
  app.get('/api/database/status', (_req, res) => {
    const rows = readSubmissions();
    res.json({
      status: 'connected',
      message: 'Database terhubung dan siap.',
      total_submissions: rows.length,
      timestamp: new Date().toISOString()
    });
  });

  app.get('/api/submissions', (req, res) => {
    try {
      const { userId, limit } = req.query;
      let rows = readSubmissions();
      if (userId && typeof userId === 'string' && userId !== 'all') {
        // Return submissions for this user or any unassigned submissions
        rows = rows.filter(r => r.user_id === userId || !r.user_id || r.user_id === 'all');
      }
      rows.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
      const max = limit ? parseInt(String(limit), 10) : 100;
      res.json({ success: true, submissions: rows.slice(0, max) });
    } catch (e: any) {
      console.error('Error fetching submissions:', e?.message);
      res.status(500).json({ error: 'Gagal mengambil riwayat dari database.' });
    }
  });

  app.post('/api/submissions', (req, res) => {
    try {
      const submission = req.body;
      if (!submission || !submission.type) {
        return res.status(400).json({ error: 'Data latihan tidak valid.' });
      }

      if (!submission.id) {
        submission.id = 'sub_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      }
      if (!submission.created_at) {
        submission.created_at = new Date().toISOString();
      }

      const rows = readSubmissions();
      const filtered = rows.filter(r => r.id !== submission.id);
      const updated = [submission, ...filtered];
      writeSubmissions(updated);

      console.log(`[DB] Submission saved: ${submission.id} (type: ${submission.type}, score: ${submission.score})`);
      res.json({ success: true, submission });
    } catch (e: any) {
      console.error('Error saving submission:', e?.message);
      res.status(500).json({ error: 'Gagal menyimpan ke database.' });
    }
  });

  app.delete('/api/submissions/:id', (req, res) => {
    try {
      const { id } = req.params;
      const rows = readSubmissions();
      const updated = rows.filter(r => r.id !== id);
      writeSubmissions(updated);
      console.log(`[DB] Submission deleted: ${id}`);
      res.json({ success: true });
    } catch (e: any) {
      console.error('Error deleting submission:', e?.message);
      res.status(500).json({ error: 'Gagal menghapus dari database.' });
    }
  });

  // --- Security & Moderation Endpoints ---
  app.get('/api/security/client-info', (req, res) => {
    const ip = getRequestIp(req);
    res.json({ ip });
  });

  app.post('/api/security/status', (req, res) => {
    try {
      const ip = getRequestIp(req);
      const { deviceFingerprint, userId } = req.body || {};
      const data = readSecurityData();
      const now = Date.now();

      const keysToCheck = [
        `ip_${ip}`,
        deviceFingerprint ? `dev_${deviceFingerprint}` : null,
        userId && userId !== 'guest' ? `user_${userId}` : null,
      ].filter(Boolean) as string[];

      let activeBan: SecurityBanRecord | null = null;

      for (const k of keysToCheck) {
        if (data.bans[k]) {
          const rec = data.bans[k];
          // Cek masa berlaku untuk ban 1 hari
          if (rec.banType === 'temporary_1day' && rec.expiresAt) {
            const exp = new Date(rec.expiresAt).getTime();
            if (now > exp) {
              // Sudah melewati 24 jam -> hapus ban otomatis
              delete data.bans[k];
              if (data.strikes[k]) {
                delete data.strikes[k];
              }
              writeSecurityData(data);
              continue;
            }
          }
          activeBan = rec;
          break;
        }
      }

      if (activeBan) {
        return res.json({
          isBanned: true,
          banType: activeBan.banType,
          bannedAt: activeBan.bannedAt,
          expiresAt: activeBan.expiresAt,
          reason: activeBan.reason,
          strikeCount: activeBan.strikeCount || 3,
          ip,
        });
      }

      // Hitung akumulasi strike
      let strikeCount = 0;
      for (const k of keysToCheck) {
        if (data.strikes[k] && data.strikes[k].count > strikeCount) {
          strikeCount = data.strikes[k].count;
        }
      }

      return res.json({
        isBanned: false,
        strikeCount,
        ip,
      });
    } catch (e: any) {
      console.error('Security status check error:', e?.message);
      res.status(500).json({ error: 'Gagal memeriksa status keamanan.' });
    }
  });

  app.post('/api/security/report', (req, res) => {
    try {
      const ip = getRequestIp(req);
      const { type, excerpt, deviceFingerprint, userId } = req.body || {};
      const data = readSecurityData();
      const nowIso = new Date().toISOString();

      const ipKey = `ip_${ip}`;
      const devKey = deviceFingerprint ? `dev_${deviceFingerprint}` : null;
      const userKey = userId && userId !== 'guest' ? `user_${userId}` : null;
      const allKeys = [ipKey, devKey, userKey].filter(Boolean) as string[];

      if (type === 'malicious_script') {
        // BANNED SELAMANYA untuk IP & Device & Akun
        const banRec: SecurityBanRecord = {
          banType: 'permanent',
          bannedAt: nowIso,
          expiresAt: null,
          reason: 'Percobaan injeksi skrip atau kode berbahaya (Malicious Script / Exploit Injection) yang membahayakan website.',
          strikeCount: 99,
          ip,
          deviceFingerprint,
          userId,
        };

        for (const k of allKeys) {
          data.bans[k] = banRec;
        }
        writeSecurityData(data);

        console.warn(`[SECURITY PERMANENT BAN] IP: ${ip}, Device: ${deviceFingerprint}, Reason: Malicious Script (${excerpt})`);
        return res.json({
          success: true,
          banned: true,
          banType: 'permanent',
          reason: banRec.reason,
          ip,
        });
      }

      if (type === 'toxic') {
        let maxCount = 0;
        for (const k of allKeys) {
          if (data.strikes[k] && data.strikes[k].count > maxCount) {
            maxCount = data.strikes[k].count;
          }
        }
        const newCount = maxCount + 1;

        for (const k of allKeys) {
          data.strikes[k] = {
            count: newCount,
            lastViolationAt: nowIso,
          };
        }

        if (newCount >= 3) {
          // BANNED 1 HARI (24 Jam)
          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
          const banRec: SecurityBanRecord = {
            banType: 'temporary_1day',
            bannedAt: nowIso,
            expiresAt,
            reason: 'Melanggar aturan bahasa sebanyak 3 kali berturut-turut (penggunaan kata kasar/toxic/vulgar).',
            strikeCount: newCount,
            ip,
            deviceFingerprint,
            userId,
          };

          for (const k of allKeys) {
            data.bans[k] = banRec;
          }
          writeSecurityData(data);

          console.warn(`[SECURITY 1-DAY BAN] IP: ${ip}, Device: ${deviceFingerprint}, Strikes: ${newCount}`);
          return res.json({
            success: true,
            banned: true,
            banType: 'temporary_1day',
            expiresAt,
            reason: banRec.reason,
            strikeCount: newCount,
            ip,
          });
        }

        writeSecurityData(data);
        console.log(`[SECURITY STRIKE] IP: ${ip}, Device: ${deviceFingerprint}, Strike: ${newCount}/3`);
        return res.json({
          success: true,
          banned: false,
          strikeCount: newCount,
          maxStrikes: 3,
          ip,
        });
      }

      return res.status(400).json({ error: 'Tipe pelanggaran tidak dikenali.' });
    } catch (e: any) {
      console.error('Security report error:', e?.message);
      res.status(500).json({ error: 'Gagal memproses laporan keamanan.' });
    }
  });

  // API Routes
  app.post('/api/feedback/writing', async (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Text is required' });

    try {
      if (geminiAi) {
        const response = await geminiAi.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `You are an Academic English Writing Tutor. Provide feedback on the following essay.
                  Proper nouns (names of people like Budi, places, cultural terms) are valid and must NOT be marked as errors.
                  Output must be in valid JSON format:
                  {
                    "score": number (0-100),
                    "grammar": string,
                    "coherence": string,
                    "vocabulary": string,
                    "suggestions": string[],
                    "revisedText": string
                  }
                  Respond ONLY with JSON.

                  Essay: ${text}`,
                },
              ],
            },
          ],
          config: { responseMimeType: 'application/json' },
        });
        const content = response.text || '{}';
        return res.json(JSON.parse(content));
      }

      const completion = await groq.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: `You are an Academic English Writing Tutor. Respond only with JSON.`
          },
          { role: 'user', content: text }
        ],
        model: 'qwen/qwen3.8-27b',
        response_format: { type: 'json_object' }
      });
      res.json(JSON.parse(completion.choices[0].message.content || '{}'));
    } catch (error: any) {
      console.error('Writing Feedback Error:', error?.message);
      res.status(500).json({ error: 'Gagal memperoleh umpan balik AI.' });
    }
  });

  app.post('/api/feedback/speaking', async (req, res) => {
    const { transcript } = req.body;
    if (!transcript) return res.status(400).json({ error: 'Transcript is required' });

    try {
      if (geminiAi) {
        const response = await geminiAi.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `You are an Academic English Speaking Tutor. Analyze the transcript.
                  Proper nouns (names of people like Budi, places, local cultural terms) are valid and must NOT be marked as errors or fillers.
                  Output must be in valid JSON format:
                  {
                    "pronunciationScore": number (0-100),
                    "fluencyScore": number (0-100),
                    "feedback": string,
                    "fillerWords": string[],
                    "improvements": string[]
                  }
                  Respond ONLY with JSON.

                  Transcript: ${transcript}`,
                },
              ],
            },
          ],
          config: { responseMimeType: 'application/json' },
        });
        const content = response.text || '{}';
        return res.json(JSON.parse(content));
      }

      const completion = await groq.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: `You are an Academic English Speaking Tutor. Respond only with JSON.`
          },
          { role: 'user', content: transcript }
        ],
        model: 'qwen/qwen3.8-27b',
        response_format: { type: 'json_object' }
      });
      res.json(JSON.parse(completion.choices[0].message.content || '{}'));
    } catch (error: any) {
      console.error('Speaking Feedback Error:', error?.message);
      res.status(500).json({ error: 'Gagal memperoleh umpan balik AI.' });
    }
  });

  // Rekomendasi YouTube berbasis topic hasil analisis Gemini.
  // Frontend mengirim { query, maxResults, topic, subtopic } — API key tetap di server.
  app.post('/api/youtube-recommendations', async (req, res) => {
    const { query, maxResults } = req.body ?? {};
    if (typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({ error: 'Query diperlukan.' });
    }
    try {
      const videos = await youtubeSearch(query.trim(), numOr(maxResults, 6));
      if (videos.length === 0) {
        return res.status(404).json({ error: 'Belum ditemukan video yang sesuai untuk materi ini.' });
      }
      res.json({ videos });
    } catch (error: any) {
      console.error('YouTube recommendation error:', error?.message);
      res.status(error?.status ?? 502).json({ error: 'Rekomendasi video belum dapat dimuat. Silakan coba lagi.' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
