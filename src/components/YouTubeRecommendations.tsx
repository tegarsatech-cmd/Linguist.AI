import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { fetchRecommendations, saveRecommendations, type YouTubeRecommendationRow } from '../lib/submissions';

/**
 * Rekomendasi YouTube berbasis hasil analisis (weakness/topic dari Gemini).
 * - Cek dulu apakah rekomendasi untuk submission ini sudah tersimpan (hemat quota YouTube).
 * - Jika belum, panggil endpoint server /api/youtube-recommendations (API key di server).
 * - Simpan hasilnya ke tabel youtube_recommendations (RLS: user_id = auth.uid()).
 */

interface Video {
  video_id: string;
  title: string;
  channel_title: string;
  thumbnail_url: string;
  description: string;
  published_at: string;
}

interface Props {
  submissionId: string | null;
  topic: string;
  subtopic: string;
  query: string;
  userId: string;
}

export default function YouTubeRecommendations({ submissionId, topic, subtopic, query, userId }: Props) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!query.trim()) return;
      setLoading(true);
      setError('');
      setVideos([]);

      try {
        // 1. Pakai rekomendasi tersimpan jika ada (efisiensi quota)
        if (submissionId) {
          const saved = await fetchRecommendations(submissionId);
          if (cancelled) return;
          if (saved.length > 0) {
            setVideos(saved.map(r => ({
              video_id: r.video_id,
              title: r.title,
              channel_title: r.channel_title,
              thumbnail_url: r.thumbnail_url,
              description: r.description,
              published_at: r.published_at,
            })));
            setLoading(false);
            return;
          }
        }

        // 2. Belum ada -> cari via server (YouTube Data API v3)
        const res = await fetch('/api/youtube-recommendations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, maxResults: 6 }),
        });
        const json = await res.json();
        if (cancelled) return;

        if (!res.ok || !Array.isArray(json.videos)) {
          setError(json?.error || 'Rekomendasi video belum dapat dimuat. Silakan coba lagi.');
          return;
        }

        setVideos(json.videos as Video[]);

        // 3. Simpan ke Supabase untuk pemakaian berikutnya
        if (submissionId && userId) {
          try {
            await saveRecommendations(
              (json.videos as Video[]).map(v => ({
                submission_id: submissionId,
                topic,
                subtopic,
                query,
                video_id: v.video_id,
                title: v.title,
                channel_title: v.channel_title,
                thumbnail_url: v.thumbnail_url,
                description: v.description,
                published_at: v.published_at,
                user_id: userId,
              }))
            );
          } catch (e) {
            console.error('Gagal menyimpan rekomendasi:', e);
          }
        }
      } catch (e) {
        if (!cancelled) setError('Rekomendasi video belum dapat dimuat. Silakan coba lagi.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [submissionId, query]);

  return (
    <section className="bg-white border border-gray-200 rounded-lg p-6">
      <h3 className="text-sm font-semibold text-gray-900">Materi yang Perlu Kamu Pelajari</h3>
      <p className="mt-1 text-xs text-gray-500">
        {topic || 'Topik'}
        {subtopic ? ` — ${subtopic}` : ''}
      </p>
      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">Video yang Direkomendasikan</p>

      {loading && <p className="mt-3 text-sm text-gray-500">Mencari video pembelajaran yang relevan…</p>}
      {!loading && error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {!loading && !error && videos.length === 0 && (
        <p className="mt-3 text-sm text-gray-500">Belum ditemukan video yang sesuai untuk materi ini.</p>
      )}

      {!loading && !error && videos.length > 0 && (
        <ul className="mt-3 space-y-4">
          {videos.map(v => (
            <li key={v.video_id} className="flex gap-4">
              <a
                href={`https://www.youtube.com/watch?v=${v.video_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0"
              >
                <img
                  src={v.thumbnail_url}
                  alt={v.title}
                  className="w-40 h-[90px] object-cover rounded border border-gray-200"
                  loading="lazy"
                />
              </a>
              <div className="min-w-0">
                <a
                  href={`https://www.youtube.com/watch?v=${v.video_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-gray-900 hover:underline line-clamp-2"
                >
                  {v.title}
                </a>
                <p className="mt-0.5 text-xs text-gray-500">{v.channel_title}</p>
                <p className="mt-1 text-xs text-gray-500 line-clamp-2">{v.description}</p>
                <a
                  href={`https://www.youtube.com/watch?v=${v.video_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
                >
                  Tonton di YouTube <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
