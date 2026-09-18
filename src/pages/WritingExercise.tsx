import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Save,
  Trash2,
  ArrowRight,
  BookmarkCheck,
  RotateCcw,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { evaluateWriting, RUBRIC, type WritingFeedback } from '../lib/gemini';
import { saveWritingSubmission, deleteSubmission, type SubmissionRow } from '../lib/submissions';
import YouTubeRecommendations from '../components/YouTubeRecommendations';
import { checkInputSecurity } from '../lib/securityGuard';
import {
  getLocalBanState,
  syncSecurityStatus,
  recordSecurityViolation,
  type BanState,
  type WarningNotice,
} from '../lib/securityStore';
import SecurityWarningModal from '../components/SecurityWarningModal';
import BanScreenOverlay from '../components/BanScreenOverlay';

/**
 * Writing: input teks → Gemini (rubrik 30/20/20/15/15, temperature 0)
 * → kategori error + koreksi + penjelasan + saran + corrected text
 * → Pilihan aksi pengguna: SIMPAN, HAPUS, LANJUT.
 * → Jika SIMPAN: masuk ke database & Riwayat / Progres Belajar.
 */

export default function WritingExercise() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [feedback, setFeedback] = useState<WritingFeedback | null>(null);
  const [analysisError, setAnalysisError] = useState('');

  // Security & Ban State
  const [banState, setBanState] = useState<BanState>(() => getLocalBanState());
  const [warningNotice, setWarningNotice] = useState<WarningNotice | null>(null);

  useEffect(() => {
    syncSecurityStatus(user?.id).then(setBanState);
  }, [user?.id]);

  // Saving states
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [savedRow, setSavedRow] = useState<SubmissionRow | null>(null);
  const [saveMessage, setSaveMessage] = useState('');

  const handleAnalyze = async () => {
    if (!text.trim() || !user || isAnalyzing) return;

    // 1. Cek jika perangkat / IP sedang diblokir
    const currentBan = getLocalBanState();
    if (currentBan.isBanned) {
      setBanState(currentBan);
      return;
    }

    // 2. Pemeriksaan Keamanan Konten: Toxic / Vulgar & Script Berbahaya
    const secResult = checkInputSecurity(text);
    if (!secResult.safe && secResult.violationType) {
      const isGuest = Boolean(user?.user_metadata?.is_guest);
      const notice = await recordSecurityViolation({
        type: secResult.violationType,
        excerpt: secResult.matchedContent || text.slice(0, 50),
        isGuest,
        userId: user?.id,
      });

      if (notice.isBannedNow) {
        const updatedBan = getLocalBanState();
        setBanState(updatedBan);
      } else {
        setWarningNotice(notice);
      }
      return;
    }

    setIsAnalyzing(true);
    setFeedback(null);
    setAnalysisError('');
    setIsSaved(false);
    setSavedRow(null);
    setSaveMessage('');

    try {
      const data = await evaluateWriting(text);
      setFeedback(data);
    } catch (e: any) {
      console.error('Analysis error:', e?.message);
      setAnalysisError(e?.message || 'Analisis gagal. Periksa koneksi lalu coba lagi.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Aksi 1: SIMPAN ke Progres & Riwayat
  const handleSave = async () => {
    if (!feedback || isSaving || isSaved) return;
    setIsSaving(true);
    setSaveMessage('');

    try {
      const activeUserId = user?.id || 'user_active';
      const row = await saveWritingSubmission(activeUserId, text, feedback);
      setSavedRow(row);
      setIsSaved(true);
      setSaveMessage('Hasil berhasil disimpan ke Database & Progres Latihan!');
    } catch (e: any) {
      console.error('Save error:', e?.message);
      setSaveMessage('Gagal menyimpan hasil. Coba lagi.');
    } finally {
      setIsSaving(false);
    }
  };

  // Aksi 2: HAPUS hasil analisis
  const handleDelete = async () => {
    if (savedRow) {
      try {
        await deleteSubmission(savedRow.id);
      } catch (e) {
        // ignore
      }
    }
    setFeedback(null);
    setIsSaved(false);
    setSavedRow(null);
    setSaveMessage('');
  };

  // Aksi 3: LANJUT latihan baru (reset)
  const handleNext = () => {
    setText('');
    setFeedback(null);
    setIsSaved(false);
    setSavedRow(null);
    setAnalysisError('');
    setSaveMessage('');
  };

  return (
    <div className="p-4 sm:p-6 md:p-10 pb-32 max-w-6xl mx-auto space-y-6 min-h-full">
      <header className="flex flex-wrap justify-between items-end gap-4 border-b border-border-main pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-white/95">Tes Kalimat Inggris</h1>
          <p className="mt-1 text-xs sm:text-sm text-text-muted">
            Analisis kesalahan tata bahasa, kosakata, dan struktur kalimat dengan rubrik penilaian akademik.
          </p>
        </div>
        <button
          onClick={handleAnalyze}
          disabled={isAnalyzing || !text.trim()}
          className="px-5 py-2.5 bg-brand-blue hover:bg-brand-blue/90 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-brand-blue/10 active:scale-95"
        >
          {isAnalyzing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
          {isAnalyzing ? 'Menganalisis…' : 'Analisis Naskah'}
        </button>
      </header>

      {/* Input Area */}
      <div className="space-y-2">
        <label className="text-[11px] font-mono uppercase tracking-wider text-text-muted block">
          Naskah Kalimat / Esai Anda:
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={isAnalyzing}
          rows={6}
          className="w-full bg-bg-panel/90 border border-border-main rounded-xl p-5 outline-none resize-y text-sm text-[#E4E4E7] leading-relaxed focus:border-brand-blue/60 transition-all placeholder:text-text-muted/50"
          placeholder="Tulis atau tempel teks bahasa Inggris di sini. Contoh: I goes to school every day with my friend Budi."
        />
      </div>

      {analysisError && (
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/25 rounded-xl p-4">
          <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs sm:text-sm text-red-300">Analisis gagal: {analysisError}</p>
            <button onClick={handleAnalyze} className="mt-1 text-xs underline text-red-200 hover:text-white">
              Coba lagi
            </button>
          </div>
        </div>
      )}

      {/* FEEDBACK RESULTS & ACTION BUTTONS (SIMPAN, HAPUS, LANJUT) */}
      {feedback && (
        <div className="space-y-6 animate-fadeIn">
          {/* Action Choice Bar (Simpan, Hapus, Lanjut) */}
          <div className="bg-bg-panel border border-brand-blue/30 rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 shadow-xl">
            <div>
              <h3 className="text-sm font-semibold text-white">Tindakan untuk Hasil Evaluasi Ini:</h3>
              <p className="text-xs text-text-muted mt-0.5">
                Pilih apakah ingin menyimpan ke progres, menghapus, atau lanjut ke naskah berikutnya.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Tombol SIMPAN */}
              <button
                onClick={handleSave}
                disabled={isSaving || isSaved}
                className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
                  isSaved
                    ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 cursor-default'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 active:scale-95'
                }`}
              >
                {isSaved ? <BookmarkCheck className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                {isSaving ? 'Menyimpan…' : isSaved ? 'Tersimpan di Progres' : 'Simpan'}
              </button>

              {/* Tombol HAPUS */}
              <button
                onClick={handleDelete}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 hover:text-red-200 flex items-center gap-2 transition-all active:scale-95"
              >
                <Trash2 className="w-4 h-4" />
                Hapus
              </button>

              {/* Tombol LANJUT */}
              <button
                onClick={handleNext}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-brand-blue hover:bg-brand-blue/90 text-white flex items-center gap-2 transition-all shadow-lg shadow-brand-blue/20 active:scale-95"
              >
                Lanjut <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Notifikasi Simpan */}
          {saveMessage && (
            <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 shadow-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="font-medium">{saveMessage}</span>
              </div>
              <button
                onClick={() => navigate('/#history')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 rounded-lg text-emerald-200 font-semibold transition-all hover:translate-x-0.5"
              >
                Lihat di Progres & Riwayat <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Score + Rubrik */}
          <section className="bg-bg-panel/90 border border-border-main rounded-2xl p-6 sm:p-7 shadow-sm">
            <div className="flex items-baseline gap-3">
              <span className="text-4xl sm:text-5xl font-bold text-white">{feedback.score}</span>
              <span className="text-sm text-text-muted font-mono">/ 100</span>
            </div>
            <p className="mt-1 text-xs text-text-muted">Skor total berdasarkan 5 kriteria rubrik akademik.</p>

            <div className="mt-5 space-y-2.5">
              {feedback.categories.map((cat) => {
                const max = RUBRIC.find((r) => r.key === cat.name)?.weight ?? 0;
                const pct = max > 0 ? (cat.score / max) * 100 : 0;
                return (
                  <div key={cat.name} className="flex items-center gap-3">
                    <span className="w-36 sm:w-44 shrink-0 text-xs text-text-dim">{cat.name}</span>
                    <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden border border-border-main/50">
                      <div
                        className={`h-full transition-all duration-500 ${
                          pct >= 80 ? 'bg-emerald-400' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-14 text-right text-xs font-mono text-text-muted">
                      {cat.score}/{max}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Kategori error + koreksi + penjelasan + saran */}
          {feedback.categories
            .filter((c) => c.errors.length > 0 || c.suggestions.length > 0)
            .map((cat) => (
              <section key={cat.name} className="bg-bg-panel/90 border border-border-main rounded-2xl p-5 sm:p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-white/95">{cat.name}</h3>
                {cat.errors.length > 0 && (
                  <ul className="mt-3.5 space-y-3">
                    {cat.errors.map((err, i) => (
                      <li key={i} className="border-l-2 border-brand-blue/60 pl-3.5 bg-white/[0.01] py-1">
                        <p className="text-xs sm:text-sm">
                          <span className="text-red-400 line-through mr-2">{err.original}</span>
                          {' → '}
                          <span className="text-emerald-400 font-semibold ml-2">{err.correction}</span>
                        </p>
                        {err.explanation && <p className="mt-1 text-xs text-text-dim leading-relaxed">{err.explanation}</p>}
                      </li>
                    ))}
                  </ul>
                )}
                {cat.suggestions.length > 0 && (
                  <ul className="mt-3 space-y-1.5 pt-2 border-t border-border-main/40">
                    {cat.suggestions.map((s, i) => (
                      <li key={i} className="text-xs text-text-dim flex items-start gap-2">
                        <span className="text-brand-blue font-bold">•</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}

          {/* Before / After */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-bg-panel/80 border border-border-main rounded-2xl p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2 font-mono">
                Teks Asli (Before)
              </p>
              <p className="text-xs sm:text-sm text-text-dim whitespace-pre-wrap leading-relaxed">{text}</p>
            </div>
            <div className="bg-bg-panel/80 border border-emerald-500/30 rounded-2xl p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-2 font-mono flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> Kalimat Diperbaiki (After)
              </p>
              <p className="text-xs sm:text-sm text-white/95 whitespace-pre-wrap leading-relaxed font-mono">
                {feedback.corrected_text}
              </p>
            </div>
          </section>

          {/* Overall feedback + learning suggestion */}
          {feedback.overall_feedback && (
            <section className="bg-bg-panel/90 border border-border-main rounded-2xl p-5 sm:p-6">
              <h3 className="text-sm font-semibold text-white/95">Umpan Balik Keseluruhan</h3>
              <p className="mt-2 text-xs sm:text-sm text-text-dim leading-relaxed">{feedback.overall_feedback}</p>
              {feedback.learning_suggestion && (
                <p className="mt-3 text-xs sm:text-sm text-brand-blue font-medium bg-brand-blue/10 border border-brand-blue/20 rounded-xl p-3">
                  💡 Saran belajar: {feedback.learning_suggestion}
                </p>
              )}
            </section>
          )}

          {/* YouTube Recommendations with Shuffle */}
          {feedback.youtube_query && (
            <YouTubeRecommendations
              submissionId={savedRow?.id ?? null}
              topic={feedback.topic || feedback.weakness}
              subtopic={feedback.subtopic}
              query={feedback.youtube_query}
              userId={user!.id}
            />
          )}
        </div>
      )}

      {!feedback && !isAnalyzing && !analysisError && (
        <div className="border border-dashed border-border-main rounded-2xl p-10 text-center bg-white/[0.01]">
          <p className="text-xs sm:text-sm text-text-muted">
            Hasil analisis akan muncul di sini setelah kamu mengklik tombol "Analisis Naskah".
          </p>
        </div>
      )}

      {/* Surat Peringatan Pelanggaran Kata Toxic / Script */}
      <SecurityWarningModal
        notice={warningNotice}
        onClose={() => setWarningNotice(null)}
      />

      {/* Layar Blokir Banned 1 Hari / Banned Selamanya */}
      {banState.isBanned && (
        <BanScreenOverlay
          banState={banState}
          onStatusUpdate={setBanState}
        />
      )}
    </div>
  );
}
