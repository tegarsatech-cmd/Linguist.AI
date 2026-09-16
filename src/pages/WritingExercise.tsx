import { useState } from 'react';
import { RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { evaluateWriting, RUBRIC, type WritingFeedback } from '../lib/gemini';
import { saveWritingSubmission, type SubmissionRow } from '../lib/submissions';
import YouTubeRecommendations from '../components/YouTubeRecommendations';

/**
 * Writing: input teks → Gemini (rubrik 30/20/20/15/15, temperature 0)
 * → kategori error + koreksi + penjelasan + saran + corrected text
 * → simpan ke Supabase → Riwayat/Progress → rekomendasi YouTube.
 */

export default function WritingExercise() {
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [feedback, setFeedback] = useState<WritingFeedback | null>(null);
  const [analysisError, setAnalysisError] = useState('');
  const [savedRow, setSavedRow] = useState<SubmissionRow | null>(null);
  const [saveError, setSaveError] = useState('');

  const handleAnalyze = async () => {
    if (!text.trim() || !user || isAnalyzing) return;
    setIsAnalyzing(true);
    setFeedback(null);
    setAnalysisError('');
    setSaveError('');
    setSavedRow(null);

    try {
      const data = await evaluateWriting(text); // panggilan Gemini nyata
      setFeedback(data);

      try {
        const row = await saveWritingSubmission(user.id, text, data);
        setSavedRow(row);
      } catch (e: any) {
        console.error('Save error:', e?.message);
        setSaveError('Hasil analisis tidak dapat disimpan ke database. Coba lagi.');
      }
    } catch (e: any) {
      console.error('Analysis error:', e?.message);
      setAnalysisError(e?.message || 'Analisis gagal. Periksa koneksi lalu coba lagi.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="p-6 md:p-10 pb-28 max-w-6xl mx-auto space-y-6 min-h-full">
      <header className="flex flex-wrap justify-between items-end gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white/95">Tes Kalimat Inggris</h1>
          <p className="mt-1 text-sm text-text-muted">Analisis kesalahan tata bahasa, kosakata, dan struktur dengan rubrik penilaian.</p>
        </div>
        <button
          onClick={handleAnalyze}
          disabled={isAnalyzing || !text.trim()}
          className="btn-action flex items-center gap-2 disabled:opacity-40"
        >
          {isAnalyzing ? <RefreshCw className="w-3 h-3 animate-spin" /> : null}
          {isAnalyzing ? 'Menganalisis…' : 'Analisis Naskah'}
        </button>
      </header>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={isAnalyzing}
        className="w-full min-h-[220px] bg-white/[0.03] border-border-main rounded-lg p-6 outline-none resize-y text-sm text-[#E4E4E7] leading-relaxed focus:border-brand-blue/50 transition-colors"
        placeholder="Tulis atau tempel teks bahasa Inggris di sini. Contoh: I goes to school every day."
      />

      {analysisError && (
        <div className="flex items-start gap-2 bg-red-500/10 border-red-500/30 rounded-lg p-4">
          <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm text-red-300">Analisis gagal: {analysisError}</p>
            <button onClick={handleAnalyze} className="mt-1 text-xs underline text-red-200 hover:text-white">Coba lagi</button>
          </div>
        </div>
      )}

      {feedback && (
        <div className="space-y-6">
          {/* Score + Rubrik */}
          <section className="bg-white/[0.03] border-border-main rounded-lg p-6">
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-semibold text-white">{feedback.score}</span>
              <span className="text-sm text-text-muted">/ 100</span>
            </div>
            <p className="mt-1 text-xs text-text-muted">Skor total berdasarkan rubrik penilaian.</p>
            <div className="mt-4 space-y-2">
              {feedback.categories.map(cat => {
                const max = RUBRIC.find(r => r.key === cat.name)?.weight ?? 0;
                const pct = max > 0 ? (cat.score / max) * 100 : 0;
                return (
                  <div key={cat.name} className="flex items-center gap-3">
                    <span className="w-40 shrink-0 text-xs text-text-dim">{cat.name}</span>
                    <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div className={`h-full ${pct >= 80 ? 'bg-emerald-400' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-14 text-right text-xs font-mono text-text-muted">{cat.score}/{max}</span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Kategori error + koreksi + penjelasan + saran */}
          {feedback.categories.filter(c => c.errors.length > 0 || c.suggestions.length > 0).map(cat => (
            <section key={cat.name} className="bg-white/[0.03] border-border-main rounded-lg p-6">
              <h3 className="text-sm font-semibold text-white/90">{cat.name}</h3>
              {cat.errors.length > 0 && (
                <ul className="mt-3 space-y-3">
                  {cat.errors.map((err, i) => (
                    <li key={i} className="border-l-2 border-brand-blue/50 pl-3">
                      <p className="text-sm">
                        <span className="text-red-400 line-through">{err.original}</span>
                        {' → '}
                        <span className="text-emerald-400 font-medium">{err.correction}</span>
                      </p>
                      {err.explanation && <p className="mt-0.5 text-xs text-text-dim">{err.explanation}</p>}
                    </li>
                  ))}
                </ul>
              )}
              {cat.suggestions.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {cat.suggestions.map((s, i) => (
                    <li key={i} className="text-xs text-text-dim">• {s}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          {/* Before / After */}
          <section className="grid md:grid-cols-2 gap-4">
            <div className="bg-white/[0.03] border-border-main rounded-lg p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">Before</p>
              <p className="text-sm text-text-dim whitespace-pre-wrap">{text}</p>
            </div>
            <div className="bg-white/[0.03] border-emerald-500/30 rounded-lg p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400 mb-2">After</p>
              <p className="text-sm text-white/90 whitespace-pre-wrap">{feedback.corrected_text}</p>
            </div>
          </section>

          {/* Overall feedback + learning suggestion */}
          {feedback.overall_feedback && (
            <section className="bg-white/[0.03] border-border-main rounded-lg p-6">
              <h3 className="text-sm font-semibold text-white/90">Umpan Balik Keseluruhan</h3>
              <p className="mt-2 text-sm text-text-dim">{feedback.overall_feedback}</p>
              {feedback.learning_suggestion && (
                <p className="mt-3 text-sm text-brand-blue">Saran belajar: {feedback.learning_suggestion}</p>
              )}
            </section>
          )}

          {saveError && (
            <div className="flex items-start gap-2 bg-amber-500/10 border-amber-500/30 rounded-lg p-4">
              <CheckCircle2 className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-300">{saveError}</p>
            </div>
          )}

          {/* YouTube: topik dari Gemini, video dari YouTube Data API */}
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
        <div className="border border-dashed border-border-main rounded-lg p-10 text-center">
          <p className="text-sm text-text-muted">Hasil analisis akan muncul di sini setelah kamu mengklik "Analisis Naskah".</p>
        </div>
      )}
    </div>
  );
}
