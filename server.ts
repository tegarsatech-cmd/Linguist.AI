import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import Groq from 'groq-sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    q: query,
    maxResults: String(Math.min(Math.max(maxResults, 1), 12)),
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

  return (json.items ?? [])
    .filter(it => it.id?.videoId && it.snippet?.title)
    .map(it => ({
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
  const PORT = 3000;

  app.use(express.json());

  // Initialize Groq
  const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
  });

  // API Routes
  app.post('/api/feedback/writing', async (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Text is required' });

    try {
      const completion = await groq.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: `You are an Academic English Writing Tutor.
            Provide feedback on the following essay.
            Output must be in JSON format with the following keys:
            - score: number (0-100)
            - grammar: string (feedback on grammar)
            - coherence: string (feedback on coherence)
            - vocabulary: string (feedback on vocabulary)
            - suggestions: string[] (list of specific improvements)
            - revisedText: string (a slightly improved version of the text)
            Respond ONLY with the JSON object.`
          },
          { role: 'user', content: text }
        ],
        model: 'llama-3.3-70b-versatile',
        response_format: { type: 'json_object' }
      });

      res.json(JSON.parse(completion.choices[0].message.content || '{}'));
    } catch (error: any) {
      console.error('Groq Error:', error);
      res.status(500).json({ error: 'Failed to get AI feedback' });
    }
  });

  app.post('/api/feedback/speaking', async (req, res) => {
    const { transcript } = req.body;
    if (!transcript) return res.status(400).json({ error: 'Transcript is required' });

    try {
      const completion = await groq.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: `You are an Academic English Speaking Tutor.
            Analyze the following transcript from a spoken recording.
            Output must be in JSON format with the following keys:
            - pronunciationScore: number (0-100)
            - fluencyScore: number (0-100)
            - feedback: string (overall feedback)
            - fillerWords: string[] (detected filler words like um, ah, etc)
            - improvements: string[] (specific tips for better delivery)
            Respond ONLY with the JSON object.`
          },
          { role: 'user', content: transcript }
        ],
        model: 'llama-3.3-70b-versatile',
        response_format: { type: 'json_object' }
      });

      res.json(JSON.parse(completion.choices[0].message.content || '{}'));
    } catch (error: any) {
      console.error('Groq Error:', error);
      res.status(500).json({ error: 'Failed to get AI feedback' });
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
