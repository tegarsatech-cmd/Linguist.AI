import { useEffect, useState } from 'react';
import { ExternalLink, Shuffle, Video as VideoIcon } from 'lucide-react';
import { fetchRecommendations, saveRecommendations } from '../lib/submissions';

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
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchVideos = async (forceShuffle = false) => {
    if (!query.trim()) return;
    setLoading(true);
    setError('');

    try {
      // 1. Cek rekomendasi tersimpan jika bukan shuffle manual
      if (submissionId && !forceShuffle) {
        const saved = await fetchRecommendations(submissionId);
        if (saved && saved.length > 0) {
          setVideos(
            saved.map((r) => ({
              video_id: r.video_id,
              title: r.title,
              channel_title: r.channel_title,
              thumbnail_url: r.thumbnail_url,
              description: r.description,
              published_at: r.published_at,
            }))
          );
          setLoading(false);
          return;
        }
      }

      // 2. Cari via server (YouTube Data API v3 dengan query acak AI)
      const res = await fetch('/api/youtube-recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, maxResults: 6 }),
      });
      const json = await res.json();

      if (!res.ok || !Array.isArray(json.videos)) {
        setError(json?.error || 'Rekomendasi video belum dapat dimuat.');
        return;
      }

      setVideos(json.videos as Video[]);

      // 3. Simpan ke database jika ada submissionId
      if (submissionId && userId) {
        try {
          await saveRecommendations(
            (json.videos as Video[]).map((v) => ({
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
          // ignore
        }
      }
    } catch (e) {
      setError('Rekomendasi video belum dapat dimuat. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVideos(false);
  }, [submissionId, query, refreshKey]);

  return (
    <section className="bg-bg-panel/90 border border-border-main rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-main/50 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <VideoIcon className="w-4 h-4 text-brand-blue" />
            <h3 className="text-sm font-semibold text-white">Video Pembelajaran Terkait (Rekomendasi AI)</h3>
          </div>
          <p className="mt-0.5 text-xs text-text-muted">
            Fokus: <span className="text-brand-blue font-medium">{topic || 'English Practice'}</span>
            {subtopic ? ` — ${subtopic}` : ''}
          </p>
        </div>

        {/* Tombol Acak Video Rekomendasi */}
        <button
          onClick={() => {
            setRefreshKey((k) => k + 1);
            fetchVideos(true);
          }}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-border-main text-xs font-medium text-text-dim hover:text-white transition-all disabled:opacity-50"
        >
          <Shuffle className={`w-3.5 h-3.5 text-brand-blue ${loading ? 'animate-spin' : ''}`} />
          <span>Acak Video</span>
        </button>
      </div>

      {loading && <p className="text-xs text-text-muted py-4">Mencari dan mengacak rekomendasi video yang relevan…</p>}
      {!loading && error && <p className="text-xs text-amber-400 py-2">{error}</p>}
      {!loading && !error && videos.length === 0 && (
        <p className="text-xs text-text-muted py-4">Belum ada video yang sesuai untuk topik ini.</p>
      )}

      {!loading && !error && videos.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-1">
          {videos.map((v) => (
            <a
              key={v.video_id}
              href={`https://www.youtube.com/watch?v=${v.video_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col bg-bg-nav/80 hover:bg-white/[0.04] border border-border-main rounded-xl overflow-hidden group transition-all"
            >
              <div className="relative aspect-video w-full bg-black/40 overflow-hidden">
                <img
                  src={v.thumbnail_url}
                  alt={v.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
              </div>
              <div className="p-3 flex-1 flex flex-col justify-between">
                <div>
                  <h4 className="text-xs font-medium text-white group-hover:text-brand-blue transition-colors line-clamp-2 leading-relaxed">
                    {v.title}
                  </h4>
                  <p className="mt-1 text-[11px] text-text-muted truncate">{v.channel_title}</p>
                </div>
                <div className="mt-3 pt-2 border-t border-border-main/40 flex items-center justify-between text-[10px] text-brand-blue font-medium">
                  <span>Tonton di YouTube</span>
                  <ExternalLink className="w-3 h-3" />
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
