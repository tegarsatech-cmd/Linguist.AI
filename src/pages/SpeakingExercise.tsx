import { useState, useRef, useEffect } from 'react';
import { Mic, Square, RefreshCw, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { evaluateSpeaking, type SpeakingFeedback } from '../lib/gemini';
import { saveSpeakingSubmission, type SubmissionRow } from '../lib/submissions';
import YouTubeRecommendations from '../components/YouTubeRecommendations';

/**
 * Speaking: rekam (Web Speech API) → transkrip nyata → Gemini (temperature 0)
 * → score + feedback + saran → simpan ke Supabase → Riwayat/Progress → YouTube.
 *
 * Catatan penelitian: Web Speech API hanya menyediakan transkrip (bukan data audio
 * yang dapat dihitung), jadi skor berbasis KEBAHASAAN transkrip — bukan pelafalan fonetis.
 */

declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

export default function SpeakingExercise() {
  const { user } = useAuth();
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [feedback, setFeedback] = useState<SpeakingFeedback | null>(null);
  const [analysisError, setAnalysisError] = useState('');
  const [savedRow, setSavedRow] = useState<SubmissionRow | null>(null);
  const [saveError, setSaveError] = useState('');

  const transcriptRef = useRef('');
  const recognitionRef = useRef<any>(null);

  // Bersihkan recognizer saat unmount
  useEffect(() => {
    return () => {
      try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    };
  }, []);

  const startRecording = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setAnalysisError('Browser ini tidak mendukung pengenalan suara. Gunakan Chrome atau Edge.');
      return;
    }

    try { recognitionRef.current?.stop(); } catch { /* ignore */ }

    setTranscript('');
    transcriptRef.current = '';
    setFeedback(null);
    setAnalysisError('');
    setSaveError('');
    setSavedRow(null);
    setIsRecording(true);

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const chunk = event.results[i][0]?.transcript || '';
        if (event.results[i].isFinal) final += chunk + ' ';
        else interim += chunk;
      }
      const current = (transcriptRef.current ? transcriptRef.current + ' ' : '') + (final + interim).trim();
      transcriptRef.current = final ? transcriptRef.current + ' ' + final.trim() : transcriptRef.current;
      setTranscript(current.trim());
    };

    recognition.onerror = (event: any) => {
      setIsRecording(false);
      if (event.error !== 'aborted') {
        setAnalysisError('Pengenalan suara gagal. Silakan coba lagi.');
      }
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognition.start();
  };

  const stopRecording = () => {
    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    setIsRecording(false);
  };

  const handleAnalyze = async () => {
    const text = transcriptRef.current.trim() || transcript.trim();
    if (!text || !user || isAnalyzing || isRecording) return;
    setIsAnalyzing(true);
    setFeedback(null);
    setAnalysisError('');
    setSaveError('');
    setSavedRow(null);

    try {
      const data = await evaluateSpeaking(text); // panggilan Gemini nyata (transkrip)
      setFeedback(data);

      try {
        const row = await saveSpeakingSubmission(user.id, text, data);
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
          <h1 className="text-2xl font-semibold text-white/95">Tes Berbicara Inggris</h1>
          <p className="mt-1 text-sm text-text-muted">Rekam suaramu, sistem mentranskripsi lalu menganalisis kebahasaan transkripnya.</p>
        </div>
        <button
          onClick={handleAnalyze}
          disabled={isAnalyzing || isRecording || !transcript.trim()}
          className="btn-action flex items-center gap-2 disabled:opacity-40"
        >
          {isAnalyzing ? <RefreshCw className="w-3 h-3 animate-spin" /> : null}
          {isAnalyzing ? 'Menganalisis…' : 'Analisis Transkrip'}
        </button>
      </header>

      <div className="flex flex-col items-center gap-4">
        <button
          onClick={isRecording ? stopRecording : startRecording}
          className={`w-24 h-24 rounded-full border flex items-center justify-center transition-colors ${isRecording ? 'bg-red-500/20 border-red-500/50' : 'border-border-main hover:bg-white/5'
            }`}
          aria-label={isRecording ? 'Berhenti merekam' : 'Mulai merekam'}
        >
          {isRecording ? <Square className="w-7 h-7 text-red-400" /> : <Mic className="w-8 h-8 text-white/80" />}
        </button>
        <p className="text-xs text-text-muted">{isRecording ? 'Merekam… klik untuk berhenti.' : 'Klik mikrofon lalu bicara dalam bahasa Inggris.'}</p>

        <div className="w-full bg-white/[0.03] border-border-main rounded-lg p-6 min-h-[100px]">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">Transkrip</p>
          {transcript ? (
            <p className="text-sm text-white/90 italic">"{transcript}"</p>
          ) : (
            <p className="text-sm text-text-muted">Transkrip akan muncul di sini saat kamu berbicara.</p>
          )}
        </div>
      </div>

      {analysisError && (
        <div className="flex items-start gap-2 bg-red-500/10 border-red-500/30 rounded-lg p-4">
          <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          <p className="text-sm text-red-300">{analysisError}</p>
        </div>
      )}

      {feedback && (
        <div className="space-y-6">
          <section className="bg-white/[0.03] border-border-main rounded-lg p-6">
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-semibold text-white">{feedback.score}</span>
              <span className="text-sm text-text-muted">/ 100</span>
            </div>
            <p className="mt-1 text-xs text-text-muted">Skor kebahasaan transkrip (kelancaran, struktur, kosakata, kejelasan).</p>
          </section>

          <section className="bg-white/[0.03] border-border-main rounded-lg p-6">
            <h3 className="text-sm font-semibold text-white/90">Umpan Balik</h3>
            <p className="mt-2 text-sm text-text-dim">{feedback.feedback}</p>
            {feedback.fluency_notes && <p className="mt-2 text-sm text-text-dim">Kelancaran: {feedback.fluency_notes}</p>}
            {feedback.filler_words.length > 0 && (
              <p className="mt-2 text-xs text-amber-300">Kata pengisi terdeteksi: {feedback.filler_words.join(', ')}</p>
            )}
            {feedback.improvements.length > 0 && (
              <ul className="mt-3 space-y-1">
                {feedback.improvements.map((s, i) => (
                  <li key={i} className="text-xs text-text-dim">• {s}</li>
                ))}
              </ul>
            )}
          </section>

          {saveError && (
            <div className="flex items-start gap-2 bg-amber-500/10 border-amber-500/30 rounded-lg p-4">
              <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-300">{saveError}</p>
            </div>
          )}

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
    </div>
  );
}
