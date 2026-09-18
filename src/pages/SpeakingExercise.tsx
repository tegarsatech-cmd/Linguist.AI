import React, { useState, useRef, useEffect } from 'react';
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
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  Volume2,
  Check,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { evaluateSpeaking, transcribeAudio, type SpeakingFeedback } from '../lib/gemini';
import { saveSpeakingSubmission, deleteSubmission, type SubmissionRow } from '../lib/submissions';
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
 * Format detik menjadi mm:ss
 */
function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function SpeakingExercise() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Security & Ban State
  const [banState, setBanState] = useState<BanState>(() => getLocalBanState());
  const [warningNotice, setWarningNotice] = useState<WarningNotice | null>(null);

  useEffect(() => {
    syncSecurityStatus(user?.id).then(setBanState);
  }, [user?.id]);

  // Recording & VN Audio States
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [waveBars, setWaveBars] = useState<number[]>(new Array(24).fill(12));
  const [audioVolume, setAudioVolume] = useState<number>(0);

  // Audio Playback States (VN Player)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [totalAudioDuration, setTotalAudioDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);

  // Transcription & Analysis States
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [feedback, setFeedback] = useState<SpeakingFeedback | null>(null);
  const [analysisError, setAnalysisError] = useState('');

  // Saving states
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [savedRow, setSavedRow] = useState<SubmissionRow | null>(null);
  const [saveMessage, setSaveMessage] = useState('');

  // Refs
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<any>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const transcriptRef = useRef('');

  // Bersihkan audio stream, visualizer & player saat unmount
  useEffect(() => {
    return () => {
      cleanupRecording();
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, []);

  const cleanupRecording = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
      mediaRecorderRef.current = null;
    }
    if (microphoneStreamRef.current) {
      microphoneStreamRef.current.getTracks().forEach((track) => track.stop());
      microphoneStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setAudioVolume(0);
    setWaveBars(new Array(24).fill(12));
  };

  const startRecording = async () => {
    // Hentikan audio yang sedang berputar jika ada
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      setIsPlaying(false);
    }

    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }

    setAudioBlob(null);
    setTranscript('');
    transcriptRef.current = '';
    setFeedback(null);
    setAnalysisError('');
    setIsSaved(false);
    setSavedRow(null);
    setSaveMessage('');
    setRecordingDuration(0);

    // Cek apakah perangkat sedang dibanned sebelum memulai rekaman
    const currentBan = getLocalBanState();
    if (currentBan.isBanned) {
      setBanState(currentBan);
      return;
    }

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setAnalysisError('Browser Anda tidak mendukung perekaman audio.');
        return;
      }

      // 1. Ambil stream audio murni dengan pembersihan noise & echo (seperti WhatsApp)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      microphoneStreamRef.current = stream;

      // 2. Setup AudioContext HANYA untuk Visualizer Waveform WhatsApp (JANGAN sambungkan ke destination!)
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const audioCtx = new AudioCtx();
        audioContextRef.current = audioCtx;
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.5;
        analyserRef.current = analyser;

        const source = audioCtx.createMediaStreamSource(stream);
        // PENTING: Sambungkan ke analyser SAJA, BUKAN ke audioCtx.destination agar TIDAK ADA dering/loopback feedback!
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const updateWaveform = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);

          let sum = 0;
          const barCount = 24;
          const newBars: number[] = [];
          const step = Math.max(1, Math.floor(dataArray.length / barCount));

          for (let i = 0; i < barCount; i++) {
            const val = dataArray[i * step] || 0;
            sum += val;
            // Map 0..255 ke tinggi persentase 12%..98%
            const heightPct = Math.min(100, Math.max(14, Math.round((val / 255) * 100)));
            newBars.push(heightPct);
          }

          const avg = sum / (dataArray.length || 1);
          setAudioVolume(Math.round(avg));
          setWaveBars(newBars);

          animFrameRef.current = requestAnimationFrame(updateWaveform);
        };

        updateWaveform();
      }

      // 3. Setup MediaRecorder standar browser
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
          mimeType = 'audio/ogg;codecs=opus';
        } else {
          mimeType = '';
        }
      }

      const mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const recordedBlob = new Blob(audioChunksRef.current, {
          type: mimeType || 'audio/webm',
        });
        const url = URL.createObjectURL(recordedBlob);
        setAudioBlob(recordedBlob);
        setAudioUrl(url);

        // Langsung transkripsi suara dengan Whisper AI (akurasi 99% seperti VN WhatsApp)
        await handleTranscribeBlob(recordedBlob);
      };

      mediaRecorder.start(200);
      setIsRecording(true);

      // Timer durasi rekaman VN (00:01, 00:02...)
      timerIntervalRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (e: any) {
      cleanupRecording();
      setIsRecording(false);
      console.error('Mic access error:', e);
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        setAnalysisError('Izin mikrofon tidak diberikan. Silakan aktifkan izin mikrofon di browser Anda lalu coba lagi.');
      } else {
        setAnalysisError('Gagal mengakses mikrofon: ' + (e?.message || 'Error tidak diketahui'));
      }
    }
  };

  const stopRecording = () => {
    if (!isRecording) return;
    setIsRecording(false);

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (err) {
        console.warn('Error stopping media recorder:', err);
      }
    }

    if (microphoneStreamRef.current) {
      microphoneStreamRef.current.getTracks().forEach((track) => track.stop());
      microphoneStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  };

  // Transkripsi audio rekaman menggunakan Groq Whisper AI (Akurat tinggi)
  const handleTranscribeBlob = async (blob: Blob) => {
    if (!blob || blob.size < 200) {
      setAnalysisError('Rekaman suara kosong atau terlalu pendek. Silakan rekam ulang.');
      return;
    }

    setIsTranscribing(true);
    setAnalysisError('');

    try {
      const text = await transcribeAudio(blob);
      if (!text || !text.trim()) {
        transcriptRef.current = '';
        setTranscript('');
        setAnalysisError('Tidak ada suara atau percakapan yang terdeteksi. Silakan rekam kembali sambil berbicara dalam bahasa Inggris.');
      } else {
        // Pemeriksaan Keamanan Audio yang Ditranskripsi
        const secResult = checkInputSecurity(text);
        if (!secResult.safe && secResult.violationType) {
          transcriptRef.current = '';
          setTranscript('');
          const isGuest = Boolean(user?.user_metadata?.is_guest);
          const notice = await recordSecurityViolation({
            type: secResult.violationType,
            excerpt: secResult.matchedContent || text.slice(0, 50),
            isGuest,
            userId: user?.id,
          });

          if (notice.isBannedNow) {
            setBanState(getLocalBanState());
          } else {
            setWarningNotice(notice);
          }
          return;
        }

        transcriptRef.current = text.trim();
        setTranscript(text.trim());
      }
    } catch (err: any) {
      console.error('Transcription error:', err);
      setAnalysisError(err?.message || 'Gagal mentranskripsi rekaman. Coba rekam ulang atau ketik langsung.');
    } finally {
      setIsTranscribing(false);
    }
  };

  // Audio Playback Handlers (VN Player)
  const togglePlayPause = () => {
    if (!audioElementRef.current || !audioUrl) return;

    if (isPlaying) {
      audioElementRef.current.pause();
      setIsPlaying(false);
    } else {
      audioElementRef.current.play().catch((e) => console.warn('Play error:', e));
      setIsPlaying(true);
    }
  };

  const handleAudioTimeUpdate = () => {
    if (audioElementRef.current) {
      setPlaybackTime(audioElementRef.current.currentTime);
    }
  };

  const handleAudioLoadedMetadata = () => {
    if (audioElementRef.current) {
      setTotalAudioDuration(audioElementRef.current.duration || recordingDuration || 0);
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
    setPlaybackTime(0);
    if (audioElementRef.current) {
      audioElementRef.current.currentTime = 0;
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioElementRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const dur = audioElementRef.current.duration || totalAudioDuration || recordingDuration;
    if (dur > 0) {
      const newTime = Math.max(0, Math.min(dur, (clickX / width) * dur));
      audioElementRef.current.currentTime = newTime;
      setPlaybackTime(newTime);
    }
  };

  const cyclePlaybackRate = () => {
    if (!audioElementRef.current) return;
    const rates = [1, 1.5, 2];
    const nextIdx = (rates.indexOf(playbackRate) + 1) % rates.length;
    const nextRate = rates[nextIdx];
    audioElementRef.current.playbackRate = nextRate;
    setPlaybackRate(nextRate);
  };

  const handleReRecord = () => {
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      setIsPlaying(false);
    }
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setAudioBlob(null);
    setTranscript('');
    transcriptRef.current = '';
    setFeedback(null);
    setAnalysisError('');
    setRecordingDuration(0);
    setIsSaved(false);
    setSavedRow(null);
    setSaveMessage('');
  };

  const handleAnalyze = async () => {
    const rawText = transcriptRef.current.trim() || transcript.trim();
    if (!rawText || !user || isAnalyzing || isRecording || isTranscribing) return;

    // 1. Cek jika perangkat / IP sedang diblokir
    const currentBan = getLocalBanState();
    if (currentBan.isBanned) {
      setBanState(currentBan);
      return;
    }

    // 2. Pemeriksaan Keamanan Konten: Toxic / Vulgar & Script Berbahaya
    const secResult = checkInputSecurity(rawText);
    if (!secResult.safe && secResult.violationType) {
      const isGuest = Boolean(user?.user_metadata?.is_guest);
      const notice = await recordSecurityViolation({
        type: secResult.violationType,
        excerpt: secResult.matchedContent || rawText.slice(0, 50),
        isGuest,
        userId: user?.id,
      });

      if (notice.isBannedNow) {
        setBanState(getLocalBanState());
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
      const data = await evaluateSpeaking(rawText);
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
    handleReRecord();
  };

  return (
    <div className="p-4 sm:p-6 md:p-10 pb-32 max-w-6xl mx-auto space-y-6 min-h-full">
      {/* Hidden native audio element for VN playback */}
      {audioUrl && (
        <audio
          ref={audioElementRef}
          src={audioUrl}
          onTimeUpdate={handleAudioTimeUpdate}
          onLoadedMetadata={handleAudioLoadedMetadata}
          onEnded={handleAudioEnded}
          preload="auto"
        />
      )}

      <header className="flex flex-wrap justify-between items-end gap-4 border-b border-border-main pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-white/95">Tes Berbicara Inggris</h1>
          <p className="mt-1 text-xs sm:text-sm text-text-muted">
            Rekam suaramu, sistem mentranskripsi lalu menganalisis kebahasaan dan kelancaran transkripnya.
          </p>
        </div>
        <button
          onClick={handleAnalyze}
          disabled={isAnalyzing || isRecording || isTranscribing || !transcript.trim()}
          className="px-5 py-2.5 bg-brand-purple hover:bg-brand-purple/90 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-brand-purple/10 active:scale-95"
        >
          {isAnalyzing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
          {isAnalyzing ? 'Menganalisis…' : 'Analisis Transkrip'}
        </button>
      </header>

      {/* Microphone Recording Section */}
      <div className="bg-bg-panel/90 border border-border-main rounded-2xl p-6 sm:p-8 shadow-sm relative overflow-hidden">
        <div className="flex flex-col items-center gap-5 max-w-xl mx-auto">
          {/* MODE 1: STATE MEREKAM */}
          {isRecording ? (
            <div className="w-full flex flex-col items-center gap-4 animate-fadeIn">
              {/* Pulsing Recording Mic Button */}
              <button
                onClick={stopRecording}
                className="w-24 h-24 rounded-full bg-red-500/20 border-2 border-red-500 flex items-center justify-center transition-all shadow-xl shadow-red-500/30 hover:scale-105 active:scale-95 group relative"
                aria-label="Berhenti Merekam"
              >
                <span className="absolute inset-0 rounded-full border-2 border-red-500 animate-ping opacity-40" />
                <Square className="w-8 h-8 text-red-400 group-hover:text-red-300 fill-current" />
              </button>

              <p className="text-xs text-text-muted text-center">
                Merekam… klik tombol kotak untuk selesai. ({formatDuration(recordingDuration)})
              </p>

              {/* Dynamic Waveform Bars */}
              <div className="w-full bg-bg-nav/95 border border-border-main rounded-2xl p-4 flex items-center justify-center gap-1.5 h-20 shadow-inner">
                {waveBars.map((height, idx) => (
                  <div
                    key={idx}
                    className="w-2 rounded-full transition-all duration-75 bg-gradient-to-t from-emerald-500 via-teal-400 to-emerald-300 shadow-sm"
                    style={{
                      height: `${height}%`,
                      opacity: Math.max(0.35, height / 100),
                    }}
                  />
                ))}
              </div>
            </div>
          ) : audioUrl ? (
            /* MODE 2: HASIL REKAMAN TERSEDIA */
            <div className="w-full space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                    <Volume2 className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-white">Hasil Rekaman Suara</h3>
                    <p className="text-[11px] text-text-muted">Dengarkan kembali rekaman ucapanmu</p>
                  </div>
                </div>

                <button
                  onClick={handleReRecord}
                  className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-border-main text-xs text-text-muted hover:text-white flex items-center gap-1.5 transition-all"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Rekam Ulang
                </button>
              </div>

              {/* Audio Player Card */}
              <div className="w-full bg-gradient-to-r from-bg-nav/95 via-bg-nav to-emerald-950/20 border border-border-main rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-center gap-4 shadow-sm">
                {/* Play / Pause Circular Button */}
                <button
                  onClick={togglePlayPause}
                  className="w-12 h-12 rounded-full bg-emerald-500 hover:bg-emerald-400 text-bg-main flex items-center justify-center transition-all shadow-lg shadow-emerald-500/20 hover:scale-105 active:scale-95 shrink-0"
                  aria-label={isPlaying ? 'Jeda' : 'Putar'}
                >
                  {isPlaying ? (
                    <Pause className="w-5 h-5 fill-current text-gray-950" />
                  ) : (
                    <Play className="w-5 h-5 fill-current ml-0.5 text-gray-950" />
                  )}
                </button>

                {/* Scrubber & Waveform Slider */}
                <div className="w-full space-y-2">
                  <div
                    onClick={handleSeek}
                    className="w-full h-8 flex items-center gap-1 cursor-pointer group px-1"
                    title="Klik untuk geser durasi rekaman"
                  >
                    {Array.from({ length: 32 }).map((_, i) => {
                      const dur = totalAudioDuration || recordingDuration || 1;
                      const barPercent = (i / 32) * 100;
                      const playedPercent = (playbackTime / dur) * 100;
                      const isPlayed = barPercent <= playedPercent;
                      const barHeights = [24, 45, 75, 90, 60, 35, 80, 100, 45, 65, 85, 30, 50, 95, 70, 40, 80, 60, 30, 90, 100, 50, 70, 35, 85, 60, 40, 75, 95, 55, 35, 60];
                      const height = barHeights[i % barHeights.length];

                      return (
                        <div
                          key={i}
                          className={`flex-1 rounded-full transition-all group-hover:opacity-100 ${
                            isPlayed
                              ? 'bg-emerald-400 opacity-95'
                              : 'bg-white/20 group-hover:bg-white/30 opacity-60'
                          }`}
                          style={{ height: `${height}%` }}
                        />
                      );
                    })}
                  </div>

                  {/* Audio Time & Speed Control */}
                  <div className="flex items-center justify-between text-[11px] font-mono text-text-muted">
                    <span>
                      {formatDuration(playbackTime)} / {formatDuration(totalAudioDuration || recordingDuration)}
                    </span>
                    <button
                      onClick={cyclePlaybackRate}
                      className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-emerald-300 font-semibold transition-all"
                      title="Ubah kecepatan putar"
                    >
                      {playbackRate}x
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* MODE 3: STANDBY / SIAP MEREKAM */
            <div className="flex flex-col items-center gap-3 text-center animate-fadeIn">
              <button
                onClick={startRecording}
                className="w-24 h-24 rounded-full border-2 border-border-main hover:border-brand-purple/60 hover:bg-white/5 flex items-center justify-center transition-all hover:scale-105 active:scale-95 group"
                aria-label="Mulai Merekam"
              >
                <Mic className="w-9 h-9 text-white/90 group-hover:text-white transition-colors" />
              </button>
              <p className="text-xs text-text-muted text-center">
                Klik mikrofon lalu bicara dalam bahasa Inggris.
              </p>
            </div>
          )}

          {/* Transcribing Indicator */}
          {isTranscribing && (
            <div className="w-full flex items-center justify-center gap-2.5 p-3 rounded-xl bg-brand-purple/10 border border-brand-purple/30 text-brand-purple text-xs animate-pulse">
              <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
              <span>Mentranskripsi ucapan...</span>
            </div>
          )}

          {/* Live Transcription Box */}
          <div className="w-full bg-bg-nav/90 border border-border-main rounded-xl p-5 min-h-[110px] mt-2 space-y-2">
            <p className="text-[11px] font-mono uppercase tracking-wider text-text-muted">Hasil Transkripsi Suara:</p>

            {transcript ? (
              <textarea
                value={transcript}
                onChange={(e) => {
                  setTranscript(e.target.value);
                  transcriptRef.current = e.target.value;
                }}
                rows={3}
                className="w-full bg-transparent border-0 p-0 text-sm text-white/95 italic leading-relaxed focus:outline-none resize-y"
                placeholder="Transkrip ucapan bahasa Inggrismu..."
              />
            ) : (
              <p className="text-xs text-text-muted">
                Transkrip ucapan akan otomatis tertulis di sini saat kamu berbicara.
              </p>
            )}
          </div>
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
