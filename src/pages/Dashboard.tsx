import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Mic,
  BarChart3,
  Clock,
  Trash2,
  RefreshCw,
  Eye,
  X,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { fetchSubmissions, deleteSubmission, getLocalSubmissions, type SubmissionRow } from '../lib/submissions';
import YouTubeRecommendations from '../components/YouTubeRecommendations';
import { FORMATTED_VOCABULARY_COUNT } from '../data/vocabularyMeta';

/**
 * Dashboard: Riwayat Latihan + Statistik Progress + Detail Modal Interaktif
 */
export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [submissions, setSubmissions] = useState<SubmissionRow[]>(() => {
    return getLocalSubmissions(user?.id || 'all');
  });
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState<'all' | 'writing' | 'speaking'>('all');

  // Detail Modal State
  const [selectedSubmission, setSelectedSubmission] = useState<SubmissionRow | null>(null);

  const greetingName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split('@')[0] ||
    user?.email ||
    'Pelajar';

  const load = async () => {
    const activeId = user?.id || 'all';
    // 1. Tampilkan data dari cache lokal seketika (0ms - bebas lag)
    const cached = getLocalSubmissions(activeId);
    if (cached.length > 0) {
      setSubmissions(cached);
    } else {
      setLoading(true);
    }
    setLoadError('');

    // Batas waktu pengaman: spinner tidak boleh berjalan lebih dari 1.2 detik
    const safetyTimer = setTimeout(() => {
      setLoading(false);
    }, 1200);

    try {
      const subs = await fetchSubmissions(activeId);
      setSubmissions(subs);
    } catch (e: any) {
      console.warn('Dashboard fetch notice:', e?.message);
    } finally {
      clearTimeout(safetyTimer);
      setLoading(false);
    }
  };

  useEffect(() => {
    load();

    const handleSubmissionsChanged = () => {
      load();
    };

    window.addEventListener('linguist_submissions_changed', handleSubmissionsChanged);
    window.addEventListener('focus', handleSubmissionsChanged);
    window.addEventListener('storage', handleSubmissionsChanged);

    return () => {
      window.removeEventListener('linguist_submissions_changed', handleSubmissionsChanged);
      window.removeEventListener('focus', handleSubmissionsChanged);
      window.removeEventListener('storage', handleSubmissionsChanged);
    };
  }, [user?.id]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Hapus hasil latihan ini dari riwayat?')) return;
    try {
      await deleteSubmission(id);
      setSubmissions((prev) => prev.filter((s) => s.id !== id));
      if (selectedSubmission?.id === id) {
        setSelectedSubmission(null);
      }
    } catch (e: any) {
      console.error(e?.message);
      alert('Gagal menghapus. Coba lagi.');
    }
  };

  const filtered = useMemo(
    () => (filter === 'all' ? submissions : submissions.filter((s) => s.type === filter)),
    [submissions, filter]
  );

  // Progress: statistik dari data nyata
  const stats = useMemo(() => {
    const scores = submissions
      .map((s) => s.score)
      .filter((n) => typeof n === 'number' && Number.isFinite(n));
    if (scores.length === 0) return null;

    const oldest = scores[scores.length - 1];
    const newest = scores[0];
    const frequentCats = new Map<string, number>();
    for (const s of submissions) {
      for (const c of s.error_categories ?? []) {
        frequentCats.set(c, (frequentCats.get(c) ?? 0) + 1);
      }
    }
    const topCategories = [...frequentCats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

    return {
      count: submissions.length,
      average: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
      latest: Math.round(newest),
      best: Math.round(Math.max(...scores)),
      change: Math.round(newest - oldest),
      topCategories,
    };
  }, [submissions]);

  return (
    <div className="p-4 sm:p-6 md:p-10 pb-32 max-w-6xl mx-auto space-y-8 min-h-full">
      {/* Top Banner */}
      <header className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-white/95">Dashboard Latihan</h1>
          <p className="mt-1 text-xs sm:text-sm text-text-muted">
            Halo, <span className="text-white font-medium">{greetingName}</span> — pantau riwayat dan perkembangan belajarmu.
          </p>
        </div>
      </header>

      {/* Quick Launch Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button
          onClick={() => navigate('/exercise/writing')}
          className="bg-bg-panel/80 border border-border-main rounded-xl p-5 sm:p-6 text-left hover:border-brand-blue/50 transition-all group shadow-sm"
        >
          <div className="w-10 h-10 rounded-lg bg-brand-blue/15 border border-brand-blue/30 flex items-center justify-center text-brand-blue mb-3 group-hover:scale-105 transition-transform">
            <BookOpen className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-semibold text-white/95 group-hover:text-brand-blue transition-colors">
            Tes Kalimat Inggris (Writing)
          </h3>
          <p className="mt-1 text-xs text-text-muted leading-relaxed">
            Evaluasi tata bahasa, struktur kalimat, dan ejaan dengan rubrik akademik 5 kriteria.
          </p>
        </button>

        <button
          onClick={() => navigate('/exercise/speaking')}
          className="bg-bg-panel/80 border border-border-main rounded-xl p-5 sm:p-6 text-left hover:border-brand-purple/50 transition-all group shadow-sm"
        >
          <div className="w-10 h-10 rounded-lg bg-brand-purple/15 border border-brand-purple/30 flex items-center justify-center text-brand-purple mb-3 group-hover:scale-105 transition-transform">
            <Mic className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-semibold text-white/95 group-hover:text-brand-purple transition-colors">
            Tes Berbicara Inggris (Speaking)
          </h3>
          <p className="mt-1 text-xs text-text-muted leading-relaxed">
            Rekam suaramu dan peroleh analisis kelancaran, struktur, dan kosakata secara instan.
          </p>
        </button>

        <button
          onClick={() => navigate('/vocabulary')}
          className="bg-bg-panel/80 border border-border-main rounded-xl p-5 sm:p-6 text-left hover:border-emerald-500/50 transition-all group shadow-sm"
        >
          <div className="w-10 h-10 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-3 group-hover:scale-105 transition-transform">
            <Sparkles className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-semibold text-white/95 group-hover:text-emerald-400 transition-colors">
            Lab Kosakata ({FORMATTED_VOCABULARY_COUNT} Kata)
          </h3>
          <p className="mt-1 text-xs text-text-muted leading-relaxed">
            Koleksi {FORMATTED_VOCABULARY_COUNT} kosakata bahasa Inggris level A1–C1 dilengkapi audio, flashcard & kuis.
          </p>
        </button>
      </div>

      {/* Progress & Statistik */}
      <section className="bg-bg-panel/80 border border-border-main rounded-2xl p-5 sm:p-7 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white/95 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-brand-blue" /> Progres & Perkembangan Belajar
          </h2>
          <button
            onClick={load}
            className="p-1.5 rounded-lg text-text-muted hover:text-white hover:bg-white/5 transition-colors"
            title="Muat Ulang Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {!stats && !loading && (
          <div className="text-center py-8">
            <p className="text-xs sm:text-sm text-text-muted">
              Belum ada data latihan. Mulai tes menulis atau berbicara pertamamu di atas!
            </p>
          </div>
        )}

        {stats && (
          <div className="space-y-6 mt-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              <div className="border border-border-main/60 bg-white/[0.02] rounded-xl p-3.5">
                <p className="text-[10px] uppercase tracking-wide text-text-muted">Jumlah Latihan</p>
                <p className="text-xl font-bold text-white mt-1">{stats.count}</p>
              </div>
              <div className="border border-border-main/60 bg-white/[0.02] rounded-xl p-3.5">
                <p className="text-[10px] uppercase tracking-wide text-text-muted">Rata-rata Skor</p>
                <p className="text-xl font-bold text-brand-blue mt-1">{stats.average}</p>
              </div>
              <div className="border border-border-main/60 bg-white/[0.02] rounded-xl p-3.5">
                <p className="text-[10px] uppercase tracking-wide text-text-muted">Skor Terbaru</p>
                <p className="text-xl font-bold text-white mt-1">{stats.latest}</p>
              </div>
              <div className="border border-border-main/60 bg-white/[0.02] rounded-xl p-3.5">
                <p className="text-[10px] uppercase tracking-wide text-text-muted">Skor Tertinggi</p>
                <p className="text-xl font-bold text-emerald-400 mt-1">{stats.best}</p>
              </div>
              <div className="border border-border-main/60 bg-white/[0.02] rounded-xl p-3.5 col-span-2 sm:col-span-1">
                <p className="text-[10px] uppercase tracking-wide text-text-muted">Tren Skor</p>
                <p
                  className={`text-xl font-bold mt-1 ${
                    stats.change >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {stats.change >= 0 ? '+' : ''}
                  {stats.change} pts
                </p>
              </div>
            </div>

            {/* Visual Bar Chart */}
            <div>
              <div className="flex items-center justify-between text-[11px] text-text-muted mb-2">
                <span className="uppercase tracking-wider">Perkembangan Skor Riwayat</span>
                <span>{submissions.length} Latihan Terakhir</span>
              </div>
              <div className="h-28 flex items-end gap-1.5 sm:gap-2 border-b border-border-main/80 pb-1.5 px-1">
                {submissions
                  .slice()
                  .reverse()
                  .map((s) => (
                    <div
                      key={s.id}
                      onClick={() => setSelectedSubmission(s)}
                      title={`${s.type.toUpperCase()}: ${Math.round(s.score)} (Klik untuk melihat detail)`}
                      style={{ height: `${Math.max(8, Math.min(100, s.score))}%` }}
                      className={`flex-1 min-w-[6px] rounded-t cursor-pointer hover:opacity-100 transition-all ${
                        s.type === 'writing'
                          ? 'bg-brand-blue/70 hover:bg-brand-blue'
                          : 'bg-brand-purple/70 hover:bg-brand-purple'
                      }`}
                    />
                  ))}
              </div>
            </div>

            {/* Frequent Error Categories */}
            {stats.topCategories.length > 0 && (
              <div className="pt-2">
                <p className="text-[11px] uppercase tracking-wide text-text-muted mb-2 font-mono">
                  Kategori yang Paling Sering Perlu Peningkatan:
                </p>
                <div className="flex flex-wrap gap-2">
                  {stats.topCategories.map(([name, count]) => (
                    <span
                      key={name}
                      className="text-xs bg-amber-500/10 border border-amber-500/25 text-amber-300 rounded-lg px-2.5 py-1"
                    >
                      {name} ({count}×)
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Riwayat Hasil Latihan (with #history anchor) */}
      <section id="history" className="bg-bg-panel/80 border border-border-main rounded-2xl p-5 sm:p-7 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-border-main/60">
          <h2 className="text-sm font-semibold text-white/95 flex items-center gap-2">
            <Clock className="w-4 h-4 text-brand-blue" /> Riwayat Hasil Latihan ({filtered.length})
          </h2>
          <div className="flex gap-1.5 bg-bg-nav p-1 rounded-xl border border-border-main">
            {(['all', 'writing', 'speaking'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={`text-xs px-3 py-1 rounded-lg transition-all font-medium ${
                  filter === t
                    ? 'bg-brand-blue text-white shadow-sm'
                    : 'text-text-muted hover:text-white'
                }`}
              >
                {t === 'all' ? 'Semua' : t === 'writing' ? 'Writing' : 'Speaking'}
              </button>
            ))}
          </div>
        </div>

        {loadError && <p className="mt-4 text-sm text-red-400">{loadError}</p>}
        {loading && <p className="mt-4 text-xs text-text-muted">Memuat riwayat latihan...</p>}
        {!loading && !loadError && filtered.length === 0 && (
          <p className="mt-6 text-center text-xs text-text-muted py-8">
            Belum ada data latihan{filter !== 'all' ? ` untuk kategori ${filter}` : ''}.
          </p>
        )}

        {/* History List */}
        <div className="mt-4 space-y-2.5">
          {filtered.map((s) => {
            const scoreNum = Math.round(s.score);
            return (
              <div
                key={s.id}
                onClick={() => setSelectedSubmission(s)}
                className="flex items-center gap-4 p-3.5 rounded-xl border border-border-main/50 bg-white/[0.01] hover:bg-white/[0.04] hover:border-brand-blue/30 transition-all cursor-pointer group"
              >
                <div className="w-12 text-center shrink-0">
                  <span
                    className={`text-xl font-bold ${
                      scoreNum >= 80
                        ? 'text-emerald-400'
                        : scoreNum >= 60
                        ? 'text-amber-400'
                        : 'text-red-400'
                    }`}
                  >
                    {scoreNum}
                  </span>
                  <p className="text-[9px] uppercase tracking-wider text-text-muted font-mono">Skor</p>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded ${
                        s.type === 'writing'
                          ? 'bg-brand-blue/15 text-brand-blue border border-brand-blue/25'
                          : 'bg-brand-purple/15 text-brand-purple border border-brand-purple/25'
                      }`}
                    >
                      {s.type}
                    </span>
                    <span className="text-[11px] text-text-muted">
                      {new Date(s.created_at).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-white/90 truncate mt-1 group-hover:text-brand-blue transition-colors">
                    {s.original_text}
                  </p>
                  {s.error_categories?.length > 0 && (
                    <p className="mt-0.5 text-[10px] text-text-muted truncate">
                      Fokus: {s.error_categories.join(' · ')}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedSubmission(s);
                    }}
                    title="Lihat Evaluasi Lengkap"
                    className="p-1.5 text-text-muted hover:text-white rounded-lg transition-colors hidden sm:inline-flex"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => handleDelete(e, s.id)}
                    title="Hapus riwayat ini"
                    className="p-1.5 text-text-muted hover:text-red-400 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* DETAIL MODAL: Detailed Review of Selected Submission */}
      {selectedSubmission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-2xl max-h-[90vh] bg-bg-panel border border-border-main rounded-2xl flex flex-col shadow-2xl overflow-hidden animate-fadeIn">
            {/* Modal Header */}
            <div className="p-5 border-b border-border-main flex items-center justify-between shrink-0 bg-bg-nav">
              <div className="flex items-center gap-3">
                <span
                  className={`text-xl font-bold px-2.5 py-1 rounded-lg ${
                    selectedSubmission.score >= 80
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                      : selectedSubmission.score >= 60
                      ? 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
                      : 'bg-red-500/15 text-red-400 border border-red-500/25'
                  }`}
                >
                  {Math.round(selectedSubmission.score)}
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-white capitalize">
                    Detail Evaluasi {selectedSubmission.type}
                  </h3>
                  <p className="text-[11px] text-text-muted">
                    {new Date(selectedSubmission.created_at).toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedSubmission(null)}
                className="p-1.5 rounded-lg text-text-muted hover:text-white hover:bg-white/5 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6 custom-scrollbar">
              {/* Original Input */}
              <div className="space-y-1.5">
                <span className="text-[11px] uppercase tracking-wider text-text-muted font-mono">
                  {selectedSubmission.type === 'writing' ? 'Teks Asli Input Anda' : 'Transkripsi Rekaman Suara'}
                </span>
                <div className="p-3.5 rounded-xl bg-bg-nav border border-border-main text-xs sm:text-sm text-white leading-relaxed">
                  {selectedSubmission.original_text}
                </div>
              </div>

              {/* Corrected Text (Writing only) */}
              {selectedSubmission.corrected_text && (
                <div className="space-y-1.5">
                  <span className="text-[11px] uppercase tracking-wider text-emerald-400 font-mono flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Kalimat yang Diperbaiki (Corrected Version)
                  </span>
                  <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs sm:text-sm text-emerald-200 leading-relaxed font-mono">
                    {selectedSubmission.corrected_text}
                  </div>
                </div>
              )}

              {/* Overall Feedback */}
              {selectedSubmission.feedback && (
                <div className="space-y-1.5">
                  <span className="text-[11px] uppercase tracking-wider text-text-muted font-mono">
                    Umpan Balik AI
                  </span>
                  <p className="text-xs sm:text-sm text-text-dim leading-relaxed p-3.5 rounded-xl bg-white/[0.02] border border-border-main">
                    {'overall_feedback' in selectedSubmission.feedback
                      ? selectedSubmission.feedback.overall_feedback
                      : 'feedback' in selectedSubmission.feedback
                      ? (selectedSubmission.feedback as any).feedback
                      : 'Evaluasi telah selesai.'}
                  </p>
                </div>
              )}

              {/* Suggestions List */}
              {selectedSubmission.suggestions?.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[11px] uppercase tracking-wider text-text-muted font-mono">
                    Saran Perbaikan:
                  </span>
                  <ul className="space-y-1.5">
                    {selectedSubmission.suggestions.map((sug, i) => (
                      <li
                        key={i}
                        className="text-xs text-text-dim flex items-start gap-2 bg-white/[0.01] p-2 rounded-lg border border-border-main/50"
                      >
                        <span className="text-brand-blue font-bold">•</span>
                        <span>{sug}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* YouTube Recommendation Section */}
              {user && selectedSubmission.feedback && 'youtube_query' in selectedSubmission.feedback && (
                <div className="pt-3 border-t border-border-main">
                  <YouTubeRecommendations
                    submissionId={selectedSubmission.id}
                    topic={(selectedSubmission.feedback as any).topic || 'English'}
                    subtopic={(selectedSubmission.feedback as any).subtopic || 'Grammar'}
                    query={(selectedSubmission.feedback as any).youtube_query || 'English speaking practice'}
                    userId={user.id}
                  />
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-border-main bg-bg-nav flex justify-end shrink-0">
              <button
                onClick={() => setSelectedSubmission(null)}
                className="px-4 py-2 bg-white/10 hover:bg-white/15 text-xs text-white rounded-xl transition-colors font-medium"
              >
                Tutup Detail
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
