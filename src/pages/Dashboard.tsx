import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Mic, LogOut, BarChart3, Clock, Trash2, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { fetchSubmissions, deleteSubmission, type SubmissionRow } from '../lib/submissions';

/**
 * Dashboard: Riwayat + Progress.
 * Semua data diambil dari tabel `submissions` (Supabase, RLS user_id = auth.uid()).
 * Tidak ada angka dummy. Empty state jika belum ada data.
 */
export default function Dashboard() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState<'all' | 'writing' | 'speaking'>('all');

  const load = async () => {
    if (!user) return;
    setLoading(true);
    setLoadError('');
    try {
      setSubmissions(await fetchSubmissions(user.id));
    } catch (e: any) {
      console.error(e?.message);
      setLoadError('Gagal memuat riwayat. Coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.id]);

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus hasil latihan ini?')) return;
    try {
      await deleteSubmission(id);
      setSubmissions(prev => prev.filter(s => s.id !== id));
    } catch (e: any) {
      console.error(e?.message);
      alert('Gagal menghapus. Coba lagi.');
    }
  };

  const filtered = useMemo(
    () => (filter === 'all' ? submissions : submissions.filter(s => s.type === filter)),
    [submissions, filter]
  );

  // Progress: statistik dari data nyata
  const stats = useMemo(() => {
    const scores = submissions.map(s => s.score).filter(n => typeof n === 'number' && Number.isFinite(n));
    if (scores.length === 0) return null;

    const oldest = scores[scores.length - 1];
    const newest = scores[0]; // urutan created_at DESC
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
      latest: newest,
      best: Math.max(...scores),
      change: newest - oldest,
      topCategories,
    };
  }, [submissions]);

  return (
    <div className="p-6 md:p-10 pb-28 max-w-6xl mx-auto space-y-8 min-h-full">
      <header className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white/95">Dashboard Latihan</h1>
          <p className="mt-1 text-sm text-text-muted">
            Halo{user?.email ? `, ${user.email}` : ''} — pantau riwayat dan perkembangan belajarmu.
          </p>
        </div>
        <button onClick={logout} className="flex items-center gap-2 text-xs text-text-muted hover:text-white transition-colors">
          <LogOut className="w-4 h-4" /> Keluar
        </button>
      </header>

      {/* Modul */}
      <div className="grid md:grid-cols-2 gap-4">
        <button
          onClick={() => navigate('/exercise/writing')}
          className="bg-white/[0.03] border-border-main rounded-lg p-6 text-left hover:border-brand-blue/40 transition-colors"
        >
          <BookOpen className="w-5 h-5 text-brand-blue mb-3" />
          <h3 className="text-sm font-semibold text-white/90">Tes Kalimat Inggris</h3>
          <p className="mt-1 text-xs text-text-muted">Analisis kesalahan tata bahasa, kosakata, dan struktur dengan rubrik penilaian.</p>
        </button>
        <button
          onClick={() => navigate('/exercise/speaking')}
          className="bg-white/[0.03] border-border-main rounded-lg p-6 text-left hover:border-brand-purple/40 transition-colors"
        >
          <Mic className="w-5 h-5 text-brand-purple mb-3" />
          <h3 className="text-sm font-semibold text-white/90">Tes Berbicara Inggris</h3>
          <p className="mt-1 text-xs text-text-muted">Rekam suaramu dan dapatkan umpan balik kebahasaan dari transkrip.</p>
        </button>
      </div>

      {/* Progress */}
      <section className="bg-white/[0.03] border-border-main rounded-lg p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white/90 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-brand-blue" /> Progress
          </h2>
          <button onClick={load} className="text-text-muted hover:text-white" aria-label="Muat ulang">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {!stats && !loading && (
          <p className="mt-4 text-sm text-text-muted">Belum ada data latihan. Selesaikan latihan pertamamu untuk mulai melihat progress.</p>
        )}

        {stats && (
          <>
            <div className="mt-4 grid-cols-2 md:grid-cols-5 gap-3">
              <div className="border-border-main/60 rounded-md p-3">
                <p className="text-[10px] uppercase tracking-wide text-text-muted">Jumlah Latihan</p>
                <p className="text-lg font-semibold text-white">{stats.count}</p>
              </div>
              <div className="border-border-main/60 rounded-md p-3">
                <p className="text-[10px] uppercase tracking-wide text-text-muted">Rata-rata Skor</p>
                <p className="text-lg font-semibold text-white">{stats.average}</p>
              </div>
              <div className="border-border-main/60 rounded-md p-3">
                <p className="text-[10px] uppercase tracking-wide text-text-muted">Skor Terbaru</p>
                <p className="text-lg font-semibold text-white">{stats.latest}</p>
              </div>
              <div className="border-border-main/60 rounded-md p-3">
                <p className="text-[10px] uppercase tracking-wide text-text-muted">Skor Tertinggi</p>
                <p className="text-lg font-semibold text-white">{stats.best}</p>
              </div>
              <div className="border-border-main/60 rounded-md p-3">
                <p className="text-[10px] uppercase tracking-wide text-text-muted">Perkembangan</p>
                <p className={`text-lg font-semibold ${stats.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {stats.change >= 0 ? '+' : ''}{stats.change}
                </p>
              </div>
            </div>

            {/* Grafik skor (dari data nyata, terlama → terbaru) */}
            <div className="mt-6">
              <p className="text-[10px] uppercase tracking-wide text-text-muted mb-2">Perkembangan Skor</p>
              <div className="h-32 flex items-end gap-2 border-b border-border-main pb-1">
                {submissions.slice().reverse().map((s) => (
                  <div
                    key={s.id}
                    title={`${s.type}: ${Math.round(s.score)}`}
                    style={{ height: `${Math.max(4, Math.min(100, s.score))}%` }}
                    className={`flex-1 min-w-[8px] rounded-t ${s.type === 'writing' ? 'bg-brand-blue/70' : 'bg-brand-purple/70'}`}
                  />
                ))}
              </div>
              <p className="mt-1 text-[10px] text-text-muted text-right">{submissions.length} latihan terakhir</p>
            </div>

            {stats.topCategories.length > 0 && (
              <div className="mt-4">
                <p className="text-[10px] uppercase tracking-wide text-text-muted mb-2">Kategori yang Sering Keliru</p>
                <div className="flex flex-wrap gap-2">
                  {stats.topCategories.map(([name, count]) => (
                    <span key={name} className="text-xs bg-red-500/10 border-red-500/20 text-red-300 rounded px-2 py-0.5">
                      {name} ({count}×)
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* Riwayat */}
      <section className="bg-white/[0.03] border-border-main rounded-lg p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white/90 flex items-center gap-2">
            <Clock className="w-4 h-4 text-brand-blue" /> Riwayat Hasil Latihan
          </h2>
          <div className="flex gap-1">
            {(['all', 'writing', 'speaking'] as const).map(t => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={`text-[10px] px-2 py-1 rounded transition-colors ${filter === t ? 'bg-brand-blue/20 text-brand-blue' : 'text-text-muted hover:text-white'
                  }`}
              >
                {t === 'all' ? 'Semua' : t === 'writing' ? 'Writing' : 'Speaking'}
              </button>
            ))}
          </div>
        </div>

        {loadError && <p className="mt-3 text-sm text-red-400">{loadError}</p>}
        {loading && <p className="mt-3 text-sm text-text-muted">Memuat…</p>}
        {!loading && !loadError && filtered.length === 0 && (
          <p className="mt-3 text-sm text-text-muted">Belum ada hasil latihan{filter !== 'all' ? ' untuk kategori ini' : ''}.</p>
        )}

        <ul className="mt-4 space-y-3">
          {filtered.map(s => (
            <li key={s.id} className="flex items-center gap-4 border-b border-border-main/50 pb-3 last:border-0">
              <div className="w-12 text-center shrink-0">
                <p className={`text-lg font-semibold ${s.score >= 80 ? 'text-emerald-400' : s.score >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                  {Math.round(s.score)}
                </p>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white/90 capitalize">{s.type}</p>
                <p className="text-xs text-text-muted truncate">{s.original_text}</p>
                {s.error_categories?.length > 0 && (
                  <p className="mt-0.5 text-[10px] text-text-muted">{s.error_categories.join(' · ')}</p>
                )}
              </div>
              <div className="text-right shrink-0 space-y-1">
                <p className="text-[10px] text-text-muted">
                  {new Date(s.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
                <button
                  onClick={() => handleDelete(s.id)}
                  className="text-text-muted hover:text-red-400 transition-colors"
                  aria-label="Hapus hasil"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
