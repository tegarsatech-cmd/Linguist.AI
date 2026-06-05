import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, Square, ArrowLeft, RefreshCw, Volume2, Activity, MessageSquareQuote, TrendingUp, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { GoogleGenAI } from '@google/genai';
import { handleFirestoreError, OperationType } from '../lib/error-handler';

interface SpeakingFeedbackData {
  pronunciationScore: number;
  fluencyScore: number;
  feedback: string;
  fillerWords: string[];
  phoneticGuidance: string[];
  intonationInsights: string;
  improvements: string[];
}

// Extend Window interface for speech recognition APIs
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
  const [feedback, setFeedback] = useState<SpeakingFeedbackData | null>(null);
  const [analysisError, setAnalysisError] = useState("");
  const [liveInsights, setLiveInsights] = useState<string[]>([]);
  const [pacing, setPacing] = useState(0);
  const transcriptRef = useRef('');
  const finalTranscriptRef = useRef('');
  const startTimeRef = useRef<number | null>(null);
  const recognitionRef = useRef<any>(null);

  const analyzeLive = (text: string) => {
    const insights: string[] = [];
    const fillers = ['anu', 'apa', 'eh', 'kayak', 'sebenarnya', 'dasarnya', 'tau gak'];
    const words = text.toLowerCase().split(/\s+/);
    
    // 1. Filler detection
    const lastWord = words[words.length - 1];
    if (fillers.includes(lastWord)) {
      insights.push(`Halus: Terdeteksi pengisi "${lastWord}"`);
    }

    // 2. Pacing calculation
    if (startTimeRef.current) {
      const durationMin = (Date.now() - startTimeRef.current) / 60000;
      if (durationMin > 0.05) { // at least 3 seconds
        const wpm = Math.round(words.length / durationMin);
        setPacing(wpm);
        if (wpm > 160) insights.push('Tempo: Sedikit cepat untuk kejelasan akademik');
        if (wpm < 100 && words.length > 5) insights.push('Tempo: Pertimbangkan untuk meningkatkan alur');
      }
    }

    setLiveInsights(prev => [...new Set([...prev, ...insights])].slice(-2));
  };

  const startRecording = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition not supported in this browser. Coba gunakan Chrome atau Edge.');
      return;
    }

    setTranscript('');
    transcriptRef.current = '';
    finalTranscriptRef.current = '';
    setFeedback(null);
    setAnalysisError('');
    setLiveInsights([]);
    setPacing(0);
    setIsRecording(true);
    startTimeRef.current = Date.now();

    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = true;
    recognitionRef.current.interimResults = true;
    recognitionRef.current.maxAlternatives = 3;
    recognitionRef.current.lang = 'en-US';

    recognitionRef.current.onresult = (event: any) => {
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const bestAlternative = Array.from(result)
          .reduce((best: any, alt: any) => {
            if (!best || alt.confidence > best.confidence) return alt;
            return best;
          }, null) as any;
        const transcriptChunk = bestAlternative?.transcript || '';

        if (result.isFinal) {
          finalTranscriptRef.current += transcriptChunk + ' ';
        } else {
          interimTranscript += transcriptChunk;
        }
      }

      const currentTranscript = (finalTranscriptRef.current + interimTranscript).trim();
      setTranscript(currentTranscript);
      transcriptRef.current = currentTranscript;
      analyzeLive(currentTranscript);
    };

    recognitionRef.current.onerror = (event: any) => {
      console.error('Speech recognition error', event.error);
      setIsRecording(false);
      setAnalysisError('Pengakuan suara gagal. Silakan coba lagi.');
    };

    recognitionRef.current.onend = () => {
      setIsRecording(false);
      const finalText = finalTranscriptRef.current.trim();
      if (finalText) {
        handleAnalyze(finalText);
      } else if (transcriptRef.current.trim()) {
        handleAnalyze(transcriptRef.current);
      }
    };

    recognitionRef.current.start();
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsRecording(false);
  };

  const handleAnalyze = async (text: string) => {
    if (!user) return;
    setIsAnalyzing(true);
    setAnalysisError("");
    setFeedback(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      const prompt = `
        Analisis transkrip ucapan berikut untuk kualitas berbicara akademik dalam bahasa Indonesia:
        "${text}"
        
        Berikan umpan balik dalam format JSON (Gunakan bahasa Indonesia):
        {
          "pronunciationScore": number (0-100),
          "fluencyScore": number (0-100),
          "feedback": "umpan balik kualitatif umum",
          "fillerWords": ["daftar kata pengisi/filler yang diidentifikasi"],
          "phoneticGuidance": ["tips spesifik tentang fonem atau penekanan kata yang menargetkan kata-kata tertentu dari teks"],
          "intonationInsights": "umpan balik tentang nada dan penekanan",
          "improvements": ["daftar 3 tips konkret untuk penyampaian lisan"]
        }
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      });
      const anyResponse = response as any;

      const textResponse =
        anyResponse.text ||
        anyResponse.output?.[0]?.content?.[0]?.text ||
        anyResponse.candidates?.[0]?.content?.[0]?.text ||
        '';

      if (!textResponse.trim()) {
        throw new Error('Tidak ada respons teks dari AI.');
      }

      const cleanedResponse = textResponse.replace(/```json|```/g, '').trim();
      const data = JSON.parse(cleanedResponse) as SpeakingFeedbackData;
      if (!data || typeof data.feedback !== 'string') {
        throw new Error('Format respons AI tidak valid.');
      }

      setFeedback(data);

      // Save to Firestore
      try {
        await addDoc(collection(db, 'submissions'), {
          userId: user.uid,
          type: 'speaking',
          content: text,
          score: (data.pronunciationScore + data.fluencyScore) / 2,
          feedback: data,
          timestamp: serverTimestamp()
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, 'submissions');
      }

    } catch (error: any) {
      console.error('Failed to analyze speech:', error);
      setAnalysisError('Analisis suara gagal. Periksa koneksi atau coba lagi.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="p-8 pb-24 max-w-7xl mx-auto space-y-8 min-h-full">
       <header className="flex justify-between items-end">
        <div>
           <h2 className="academic-label mb-1">Modul Akademik</h2>
           <h1 className="text-3xl font-serif italic text-white/90">Tes Berbicara Inggris</h1>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 items-end">
           <div className="flex items-center gap-2 px-3 py-1 bg-border-main rounded-md">
              <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              <span className="text-[10px] text-text-muted font-mono">Mesin Akustik Siap</span>
           </div>
           <button
             onClick={() => handleAnalyze(transcriptRef.current)}
             disabled={!transcript.trim() || isAnalyzing || isRecording}
             className="btn-secondary px-4 py-2 rounded-full border border-white/10 bg-white/5 text-[11px] uppercase tracking-[0.3em] text-text-muted disabled:opacity-40 disabled:cursor-not-allowed"
           >
             {isAnalyzing ? 'Menganalisis...' : 'Analisis Naskah'}
           </button>
        </div>
      </header>

      <div className="grid lg:grid-cols-2 gap-12 items-start">
        {/* Interaction Area */}
        <section className="flex flex-col items-center">
          <div className="relative flex items-center justify-center mb-16 mt-12">
            <AnimatePresence>
               {isRecording && (
                <>
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1.8, opacity: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="absolute inset-0 bg-brand-blue/10 rounded-full blur-3xl pointer-events-none"
                  />
                  <div className="absolute inset-0 flex items-center justify-center gap-1.5 pointer-events-none">
                     {[...Array(6)].map((_, i) => (
                       <motion.div
                        key={i}
                        animate={{ height: [8, 30, 8] }}
                        transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.1 }}
                        className="w-1 bg-brand-blue/30 rounded-full"
                       />
                     ))}
                  </div>
                </>
              )}
            </AnimatePresence>

            <button
              onClick={isRecording ? stopRecording : startRecording}
              className={`relative z-10 w-32 h-32 rounded-full flex items-center justify-center transition-all ${
                isRecording 
                ? 'bg-red-500/10 border-red-500/30 shadow-[0_0_40px_rgba(239,68,68,0.1)]' 
                : 'nav-rail border-border-main hover:bg-white/[0.03]'
              } border`}
            >
               {isRecording ? <Square className="w-8 h-8 text-red-500" fill="currentColor" /> : <Mic className="w-10 h-10 text-white/80" />}
            </button>

            {/* Live Visual Cues */}
            <div className="absolute -bottom-12 flex flex-col items-center gap-2 pointer-events-none">
              <AnimatePresence>
                {liveInsights.map((insight, idx) => (
                  <motion.div
                    key={insight + idx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="px-3 py-1 bg-brand-blue/10 border border-brand-blue/20 rounded-full"
                  >
                    <p className="text-[9px] font-mono whitespace-nowrap text-brand-blue uppercase tracking-widest leading-none">
                      {insight}
                    </p>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            
            {/* Pacing Indicator */}
            {isRecording && pacing > 0 && (
              <div className="absolute -top-12 px-4 py-1.5 border border-border-main rounded text-center min-w-[80px]">
                <p className="text-[14px] font-serif italic text-white/80 leading-none">{pacing}</p>
                <p className="text-[8px] font-mono text-text-muted uppercase mt-1 tracking-widest">WPM / Tempo</p>
              </div>
            )}
          </div>

          <div className="w-full sophisticated-card p-8 min-h-[120px] flex items-center justify-center text-center">
             {transcript ? (
               <p className="text-text-dim italic font-serif leading-relaxed text-sm">"{transcript}"</p>
             ) : (
               <p className="academic-label text-text-muted opacity-30">Menunggu Denyut Vokal</p>
             )}
          </div>

          <div className="w-full flex flex-col items-center gap-4">
            <button
              onClick={() => handleAnalyze(transcriptRef.current)}
              disabled={!transcript.trim() || isAnalyzing || isRecording}
              className="btn-secondary px-5 py-3 rounded-full border border-white/10 bg-white/5 text-[12px] uppercase tracking-[0.3em] text-text-muted disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isAnalyzing ? 'Menganalisis...' : 'Analisis Naskah'}
            </button>
            <p className="text-[10px] text-text-muted italic text-center">Hentikan rekaman lalu klik Analisis Naskah untuk menampilkan feedback AI.</p>
          </div>

          <div className="w-full sophisticated-card p-6 mt-6 border border-white/10 bg-white/5">
            <div className="flex items-center justify-between mb-4">
              <p className="academic-label text-text-muted uppercase tracking-[0.35em]">Ringkasan Analisis</p>
              <span className="text-[10px] uppercase tracking-[0.3em] text-text-muted">Umpan Balik</span>
            </div>
            <div className="min-h-[120px] space-y-3">
              {feedback ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-md border border-white/10 p-3">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-text-muted">Pengucapan</p>
                      <p className="text-2xl font-serif italic">{feedback.pronunciationScore}%</p>
                    </div>
                    <div className="rounded-md border border-white/10 p-3">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-text-muted">Kefasihan</p>
                      <p className="text-2xl font-serif italic">{feedback.fluencyScore}%</p>
                    </div>
                  </div>
                  <p className="text-sm text-text-dim leading-relaxed">{feedback.feedback}</p>
                  <p className="text-sm text-text-muted">Kata pengisi: {feedback.fillerWords.length > 0 ? feedback.fillerWords.join(', ') : 'Tidak terdeteksi'}</p>
                </>
              ) : transcript ? (
                <p className="text-sm text-text-muted leading-relaxed">Transkrip sudah terekam. Tekan Analisis Transkrip untuk melihat hasil lengkap.</p>
              ) : (
                <p className="text-sm text-text-muted italic leading-relaxed">Analisis cepat akan muncul setelah Anda merekam dan menganalisis suara.</p>
              )}
            </div>
          </div>

          <div className="w-full sophisticated-card p-6 mt-6 border border-white/10 bg-white/5">
            <div className="flex items-center justify-between mb-4">
              <p className="academic-label text-text-muted uppercase tracking-[0.35em]">Umpan Balik Langsung</p>
              <span className="text-[10px] uppercase tracking-[0.3em] text-text-muted">Rekaman</span>
            </div>
            <div className="min-h-[80px] space-y-3">
              {liveInsights.length > 0 ? (
                liveInsights.map((insight, idx) => (
                  <p key={idx} className="text-sm text-text-dim leading-relaxed">• {insight}</p>
                ))
              ) : (
                <p className="text-sm text-text-muted italic leading-relaxed">Umpan balik langsung akan muncul saat bicara.</p>
              )}

              {pacing > 0 && (
                <p className="text-sm text-text-dim leading-relaxed">Kecepatan: {pacing} kata per menit.</p>
              )}
            </div>
          </div>

          <div className="w-full sophisticated-card p-6 mt-6 border border-white/10 bg-white/5">
            <div className="flex items-center justify-between mb-4">
              <p className="academic-label text-text-muted uppercase tracking-[0.35em]">Umpan Balik Akhir</p>
              {isAnalyzing && <span className="text-[10px] uppercase tracking-[0.3em] text-brand-blue">Analisis...</span>}
            </div>
            <div className="min-h-[80px]">
              {feedback ? (
                <p className="text-sm text-text-dim leading-relaxed">{feedback.feedback}</p>
              ) : transcript ? (
                <p className="text-sm text-text-muted leading-relaxed">Transkrip sudah terekam. Hentikan rekaman untuk melihat umpan balik lengkap.</p>
              ) : (
                <p className="text-sm text-text-muted italic leading-relaxed">Suara akan ditranskrip dan umpan balik akhir akan ditampilkan di sini.</p>
              )}
            </div>
          </div>
        </section>

        {/* Feedback Area */}
        <section className="w-full">
          <div className="mb-6 flex flex-col items-start gap-3">
            <div className="flex items-center justify-between w-full gap-3">
              <div>
                <p className="academic-label text-text-muted uppercase tracking-[0.35em]">Analisis Naskah</p>
                <p className="text-[10px] text-text-muted">Dapatkan umpan balik AI berdasarkan transkrip suara.</p>
              </div>
              <button
                onClick={() => handleAnalyze(transcriptRef.current)}
                disabled={!transcript.trim() || isAnalyzing || isRecording}
                className="btn-secondary px-5 py-3 rounded-full border border-white/10 bg-white/5 text-[12px] uppercase tracking-[0.3em] text-text-muted disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isAnalyzing ? 'Menganalisis...' : 'Analisis Naskah'}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <p className="text-[10px] text-text-muted italic">Klik untuk melihat hasil feedback dari AI.</p>
              {feedback && !isAnalyzing && (
                <span className="rounded-full bg-emerald-500/10 text-emerald-200 px-2 py-1 text-[10px] uppercase tracking-[0.3em]">
                  Analisis Selesai
                </span>
              )}
            </div>
          </div>
          <AnimatePresence mode="wait">
             {isAnalyzing ? (
               <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="sophisticated-card p-16 text-center flex flex-col items-center justify-center"
               >
                 <Activity className="w-10 h-10 text-brand-blue animate-pulse mb-6 opacity-50" />
                 <p className="text-sm font-medium tracking-wide">Memprofilkan Resonansi Akustik</p>
                 <p className="text-[10px] text-text-muted mt-2 font-mono uppercase tracking-widest">Menjalankan Analisis Fonem</p>
               </motion.div>
             ) : analysisError ? (
               <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="sophisticated-card p-16 text-center bg-red-500/10 border border-red-500/20 rounded"
               >
                 <AlertCircle className="w-10 h-10 text-red-400 mb-4" />
                 <p className="text-sm font-medium text-red-200">{analysisError}</p>
                 <p className="text-[10px] text-red-300 mt-2 font-mono uppercase tracking-widest">Tekan lagi untuk merekam ulang</p>
               </motion.div>
             ) : feedback ? (
               <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-6"
               >
                  <div className="sophisticated-card p-8 bg-brand-purple/5 border-brand-purple/10">
                     <h3 className="academic-label text-brand-purple mb-8">Metrik Resonansi Ucapan</h3>
                     <div className="grid grid-cols-2 gap-8">
                        <div className="p-4 bg-white/5 border border-white/5 rounded">
                           <p className="text-3xl font-serif italic">{feedback.pronunciationScore}<span className="text-[10px] text-text-muted ml-1 non-italic font-sans">%</span></p>
                           <p className="text-[9px] font-mono text-text-muted uppercase mt-2 tracking-widest">Pengucapan</p>
                        </div>
                        <div className="p-4 bg-white/5 border border-white/5 rounded">
                           <p className="text-3xl font-serif italic">{feedback.fluencyScore}<span className="text-[10px] text-text-muted ml-1 non-italic font-sans">%</span></p>
                           <p className="text-[9px] font-mono text-text-muted uppercase mt-2 tracking-widest">Faktor Kefasihan</p>
                        </div>
                     </div>
                     
                     <div className="mt-8 pt-6 border-t border-white/5">
                        <p className="text-xs text-text-dim leading-relaxed italic opacity-80">
                          {feedback.feedback}
                        </p>
                     </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                     <div className="sophisticated-card p-6">
                        <h3 className="academic-label mb-4 flex items-center gap-2">
                           <MessageSquareQuote className="w-3 h-3" /> Kata Pengisi Vokal
                        </h3>
                        <div className="flex flex-wrap gap-2">
                           {feedback.fillerWords.map((word, i) => (
                             <span key={i} className="text-[9px] px-2 py-0.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded uppercase font-mono tracking-widest">
                               {word}
                             </span>
                           ))}
                           {feedback.fillerWords.length === 0 && <span className="text-[10px] text-text-muted opacity-40 uppercase font-mono">Tidak Terdeteksi</span>}
                        </div>
                     </div>

                     <div className="sophisticated-card p-6">
                        <h3 className="academic-label mb-4 flex items-center gap-2 text-brand-blue">
                           <Volume2 className="w-3 h-3" /> Panduan Fonetik
                        </h3>
                        <ul className="space-y-2">
                           {feedback.phoneticGuidance.map((tip, i) => (
                             <li key={i} className="text-[10px] text-text-dim leading-tight flex gap-2">
                               <span className="text-brand-blue">•</span>
                               {tip}
                             </li>
                           ))}
                        </ul>
                     </div>

                     <div className="sophisticated-card p-6 col-span-full">
                        <h3 className="academic-label mb-2 flex items-center gap-2 text-brand-purple">
                           <Activity className="w-3 h-3" /> Wawasan Intonasi
                        </h3>
                        <p className="text-[11px] text-text-dim leading-relaxed italic border-l border-brand-purple/30 pl-3">
                          {feedback.intonationInsights}
                        </p>
                     </div>

                     <div className="sophisticated-card p-6 col-span-full">
                        <h3 className="academic-label mb-4 flex items-center gap-2">
                           <TrendingUp className="w-3 h-3" /> Penyempurnaan Strategis
                        </h3>
                        <ul className="space-y-2">
                           {feedback.improvements.map((imp, i) => (
                             <li key={i} className="text-[10px] text-text-dim leading-tight flex gap-2">
                               <span className="text-white/20">•</span>
                               {imp}
                             </li>
                           ))}
                        </ul>
                     </div>
                  </div>
               </motion.div>
             ) : (
               <div className="sophisticated-card p-16 text-center opacity-30 border-dashed h-[400px] flex flex-col items-center justify-center">
                  <Activity className="w-10 h-10 mb-6 text-text-muted" />
                  <p className="text-[10px] font-mono uppercase tracking-[0.3em]">Studio Siaga</p>
                  <p className="text-[10px] mt-2 max-w-[260px]">Rekam suara dan gunakan tombol Analisis Naskah untuk melihat hasil feedback Groq AI.</p>
               </div>
             )}
          </AnimatePresence>
        </section>
      </div>
    </div>
  );
}
