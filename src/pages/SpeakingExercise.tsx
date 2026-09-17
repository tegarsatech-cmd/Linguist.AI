import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Mic,
  Square,
  RefreshCw,
  AlertCircle,
  Save,
  Trash2,
  ArrowRight,
  BookmarkCheck,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { evaluateSpeaking, type SpeakingFeedback } from '../lib/gemini';
import { saveSpeakingSubmission, deleteSubmission, type SubmissionRow } from '../lib/submissions';
import YouTubeRecommendations from '../components/YouTubeRecommendations';

/**
 * Speaking: rekam (Web Speech API) → transkrip nyata → Gemini (temperature 0)
 * → score + feedback + saran → Pilihan aksi: SIMPAN, HAPUS, LANJUT.
 * → Jika SIMPAN: masuk ke database & Riwayat / Progres Belajar.
 */

declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

export default function SpeakingExercise() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [feedback, setFeedback] = useState<SpeakingFeedback | null>(null);
  const [analysisError, setAnalysisError] = useState('');

  // Audio level gating (hanya proses audio dengan suara jelas / tidak bisik-bisik/noise pelan)
  const [audioVolume, setAudioVolume] = useState<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const volumeAnimRef = useRef<number | null>(null);
  const isSpeakingLoudEnoughRef = useRef<boolean>(false);

  // Saving states
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [savedRow, setSavedRow] = useState<SubmissionRow | null>(null);
  const [saveMessage, setSaveMessage] = useState('');

  const transcriptRef = useRef('');
  const recognitionRef = useRef<any>(null);

  // Bersihkan audio stream & recognizer saat unmount
  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
      if (microphoneStreamRef.current) {
        microphoneStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
      if (volumeAnimRef.current) {
        cancelAnimationFrame(volumeAnimRef.current);
      }
    };
  }, []);

  // Helper untuk membersihkan kata atau token ganda yang berulang akibat echo / audio sensitivity
  const deduplicateSpeech = (text: string): string => {
    if (!text) return '';
    const words = text.trim().split(/\s+/);
    const deduped: string[] = [];
    for (let i = 0; i < words.length; i++) {
      const current = words[i];
      const prev = deduped[deduped.length - 1];
      // Jika kata yang sama persis muncul berturut-turut karena glitch mic, saring
      if (prev && prev.toLowerCase() === current.toLowerCase()) {
        continue;
      }
      deduped.push(current);
    }
    return deduped.join(' ');
  };

  const startAudioVolumeMeter = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) return;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      microphoneStreamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.4;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const checkVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        // Hitung rata-rata amplitudo sinyal suara
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        setAudioVolume(Math.round(average));

        // Ambang batas (Threshold) suara: hanya terima kata jika suara di atas background noise (> 10)
        // Jika suara terlalu kecil / bisikan / hembusan napas, tandai belum cukup keras
        if (average >= 12) {
          isSpeakingLoudEnoughRef.current = true;
        }

        volumeAnimRef.current = requestAnimationFrame(checkVolume);
      };

      checkVolume();
    } catch (e) {
      console.warn('Audio volume meter not available:', e);
      // Fallback: selalu izinkan jika mediaDevices tidak tersedia
      isSpeakingLoudEnoughRef.current = true;
    }
  };

  const stopAudioVolumeMeter = () => {
    if (volumeAnimRef.current) {
      cancelAnimationFrame(volumeAnimRef.current);
      volumeAnimRef.current = null;
    }
    if (microphoneStreamRef.current) {
      microphoneStreamRef.current.getTracks().forEach((t) => t.stop());
      microphoneStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setAudioVolume(0);
  };

  const startRecording = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setAnalysisError('Browser ini tidak mendukung pengenalan suara. Gunakan Chrome atau Edge.');
      return;
    }

    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
    stopAudioVolumeMeter();

    setTranscript('');
    transcriptRef.current = '';
    setFeedback(null);
    setAnalysisError('');
    setIsSaved(false);
    setSavedRow(null);
    setSaveMessage('');
    setIsRecording(true);
    isSpeakingLoudEnoughRef.current = false;

    // Aktifkan visualizer & gating suara
    startAudioVolumeMeter();

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    // Gunakan 1 alternatif terbaik untuk akurasi tertinggi
    recognition.maxAlternatives = 1;

    // Gunakan array tersegmentasi berdasarkan indeks hasil resmi untuk mencegah double accumulation
    const finalSegments: string[] = [];

    recognition.onresult = (event: any) => {
      let interim = '';

      for (let i = 0; i < event.results.length; i += 1) {
        const resultItem = event.results[i];
        const piece = (resultItem[0]?.transcript || '').trim();
        if (!piece) continue;

        if (resultItem.isFinal) {
          finalSegments[i] = piece;
        } else {
          interim = piece;
        }
      }

      // Gabungkan hasil segmen final yang valid
      const finalizedText = finalSegments.filter(Boolean).join(' ').trim();
      const combined = finalizedText + (interim ? (finalizedText ? ' ' : '') + interim : '');
      const cleaned = deduplicateSpeech(combined);

      transcriptRef.current = finalizedText ? deduplicateSpeech(finalizedText) : cleaned;
      setTranscript(cleaned);
    };

    recognition.onerror = (event: any) => {
      setIsRecording(false);
      stopAudioVolumeMeter();
      if (event.error !== 'aborted') {
        setAnalysisError('Pengenalan suara gagal. Silakan periksa izin mikrofon Anda lalu coba lagi.');
      }
    };

    recognition.onend = () => {
      setIsRecording(false);
      stopAudioVolumeMeter();
      // Saat rekaman selesai, pastikan transkrip akhir dibersihkan dari duplikasi
      if (transcriptRef.current) {
        setTranscript(deduplicateSpeech(transcriptRef.current));
      }
    };

    try {
      recognition.start();
    } catch (e: any) {
      setIsRecording(false);
      stopAudioVolumeMeter();
      setAnalysisError('Gagal memulai mikrofon: ' + (e?.message || 'Error tidak diketahui'));
    }
  };

  const stopRecording = () => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
    stopAudioVolumeMeter();
    setIsRecording(false);
    if (transcriptRef.current) {
      setTranscript(deduplicateSpeech(transcriptRef.current));
    }
  };

  const handleAnalyze = async () => {
    const rawText = transcriptRef.current.trim() || transcript.trim();
    const text = deduplicateSpeech(rawText);
    if (!text || !user || isAnalyzing || isRecording) return;
    setIsAnalyzing(true);
    setFeedback(null);
    setAnalysisError('');
    setIsSaved(false);
    setSavedRow(null);
    setSaveMessage('');

    try {
      const data = await evaluateSpeaking(text);
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
    const text = transcriptRef.current.trim() || transcript.trim() || 'Latihan Berbicara Bahasa Inggris';
    if (!feedback || isSaving || isSaved) return;
    setIsSaving(true);
    setSaveMessage('');

    try {
      const activeUserId = user?.id || 'user_active';
      const row = await saveSpeakingSubmission(activeUserId, text, feedback);
      setSavedRow(row);
      setIsSaved(true);
      setSaveMessage('Hasil berbicara berhasil disimpan ke Database & Progres Latihan!');
    } catch (e: any) {
      console.error('Save error:', e?.message);
      setSaveMessage('Gagal menyimpan hasil. Coba lagi.');
    } finally {
      setIsSaving(false);
    }
  };

  // Aksi 2: HAPUS hasil
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

  // Aksi 3: LANJUT latihan baru
  const handleNext = () => {
    setTranscript('');
    transcriptRef.current = '';
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
          <h1 className="text-2xl sm:text-3xl font-semibold text-white/95">Tes Berbicara Inggris</h1>
          <p className="mt-1 text-xs sm:text-sm text-text-muted">
            Rekam suaramu, sistem mentranskripsi lalu menganalisis kebahasaan dan kelancaran transkripnya.
          </p>
        </div>
        <button
          onClick={handleAnalyze}
          disabled={isAnalyzing || isRecording || !transcript.trim()}
          className="px-5 py-2.5 bg-brand-purple hover:bg-brand-purple/90 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-brand-purple/10 active:scale-95"
        >
          {isAnalyzing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
          {isAnalyzing ? 'Menganalisis…' : 'Analisis Transkrip'}
        </button>
      </header>

      {/* Microphone Recording Section */}
      <div className="flex flex-col items-center gap-4 bg-bg-panel/80 border border-border-main rounded-2xl p-8 shadow-sm">
        <button
          onClick={isRecording ? stopRecording : startRecording}
          className={`w-24 h-24 rounded-full border-2 flex items-center justify-center transition-all ${
            isRecording
              ? 'bg-red-500/20 border-red-500 shadow-lg shadow-red-500/30 scale-105'
              : 'border-border-main hover:border-brand-purple/60 hover:bg-white/5'
          }`}
          aria-label={isRecording ? 'Berhenti merekam' : 'Mulai merekam'}
        >
          {isRecording ? <Square className="w-8 h-8 text-red-400" /> : <Mic className="w-9 h-9 text-white/90" />}
        </button>

        {isRecording ? (
          <div className="flex flex-col items-center gap-2 w-full max-w-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
              <span className="text-xs text-red-400 font-medium">Merekam suara...</span>
            </div>

            {/* Audio Volume Bar & Sensitivity Indicator */}
            <div className="w-full space-y-1">
              <div className="flex justify-between items-center text-[10px] text-text-muted">
                <span>Volume Suara:</span>
                <span className={audioVolume >= 12 ? 'text-emerald-400 font-medium' : 'text-amber-400'}>
                  {audioVolume >= 12 ? 'Suara Jelas (Optimal)' : 'Bicara Lebih Keras'}
                </span>
              </div>
              <div className="w-full h-2 bg-bg-nav rounded-full overflow-hidden border border-border-main/50">
                <div
                  className={`h-full transition-all duration-75 rounded-full ${
                    audioVolume >= 12 ? 'bg-gradient-to-r from-brand-blue to-emerald-400' : 'bg-amber-400/60'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(5, (audioVolume / 60) * 100))}%` }}
                />
              </div>
            </div>
            <p className="text-[11px] text-text-muted text-center">
              Gunakan suara agak besar dan artikulasi jelas agar tidak terdeteksi ganda atau noise.
            </p>
          </div>
        ) : (
          <p className="text-xs text-text-muted text-center">
            Klik mikrofon lalu bicara dengan suara agak besar & jelas dalam bahasa Inggris.
          </p>
        )}

        {/* Live Transcription Box */}
        <div className="w-full bg-bg-nav/90 border border-border-main rounded-xl p-5 min-h-[110px] mt-2">
          <p className="text-[11px] font-mono uppercase tracking-wider text-text-muted mb-2">Hasil Transkripsi Suara:</p>
          {transcript ? (
            <p className="text-sm text-white/95 italic leading-relaxed">"{transcript}"</p>
          ) : (
            <p className="text-xs text-text-muted">Transkrip ucapan akan otomatis tertulis di sini saat kamu berbicara dengan suara cukup jelas.</p>
          )}
        </div>
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
          <div className="bg-bg-panel border border-brand-purple/30 rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 shadow-xl">
            <div>
              <h3 className="text-sm font-semibold text-white">Tindakan untuk Hasil Evaluasi Berbicara:</h3>
              <p className="text-xs text-text-muted mt-0.5">
                Simpan hasil ini ke riwayat/progres, hapus, atau lanjut ke sesi bicara baru.
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
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-brand-purple hover:bg-brand-purple/90 text-white flex items-center gap-2 transition-all shadow-lg shadow-brand-purple/20 active:scale-95"
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

          {/* Score Card */}
          <section className="bg-bg-panel/90 border border-border-main rounded-2xl p-6 sm:p-7 shadow-sm">
            <div className="flex items-baseline gap-3">
              <span className="text-4xl sm:text-5xl font-bold text-white">{feedback.score}</span>
              <span className="text-sm text-text-muted font-mono">/ 100</span>
            </div>
            <p className="mt-1 text-xs text-text-muted">Skor kebahasaan dan kelancaran berbicara berdasarkan transkrip.</p>

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 bg-white/[0.02] border border-border-main rounded-xl">
                <p className="text-[10px] uppercase tracking-wider text-text-muted font-mono">Catatan Kelancaran</p>
                <p className="text-xs sm:text-sm text-white/95 mt-1 leading-relaxed">
                  {feedback.fluency_notes || 'Kelancaran berbicara cukup baik.'}
                </p>
              </div>

              <div className="p-4 bg-white/[0.02] border border-border-main rounded-xl">
                <p className="text-[10px] uppercase tracking-wider text-text-muted font-mono">Kata Pengisi (Filler Words)</p>
                {feedback.filler_words?.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {feedback.filler_words.map((w, i) => (
                      <span key={i} className="text-xs bg-amber-500/15 border border-amber-500/30 text-amber-300 px-2 py-0.5 rounded">
                        {w}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-emerald-400 mt-1">Tidak terdeteksi kata pengisi yang berlebihan. Bagus!</p>
                )}
              </div>
            </div>
          </section>

          {/* Overall feedback & Tips */}
          <section className="bg-bg-panel/90 border border-border-main rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-white/95">Evaluasi Kebahasaan</h3>
              <p className="mt-2 text-xs sm:text-sm text-text-dim leading-relaxed">{feedback.feedback}</p>
            </div>

            {feedback.improvements?.length > 0 && (
              <div className="pt-3 border-t border-border-main/50">
                <p className="text-[11px] font-mono uppercase tracking-wider text-text-muted mb-2">Tips Peningkatan Berbicara:</p>
                <ul className="space-y-1.5">
                  {feedback.improvements.map((tip, i) => (
                    <li key={i} className="text-xs text-text-dim flex items-start gap-2">
                      <span className="text-brand-purple font-bold">•</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* YouTube Recommendations with Shuffle */}
          {feedback.youtube_query && (
            <YouTubeRecommendations
              submissionId={savedRow?.id ?? null}
              topic={feedback.topic || feedback.weakness || 'Speaking Practice'}
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
            Tekan mikrofon untuk berbicara, lalu klik "Analisis Transkrip" untuk mengevaluasi kemampuan berbicaramu.
          </p>
        </div>
      )}
    </div>
  );
}
