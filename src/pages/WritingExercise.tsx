import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, ArrowLeft, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { GoogleGenAI } from '@google/genai';
import { handleFirestoreError, OperationType } from '../lib/error-handler';

interface FeedbackData {
  score: number;
  grammar: string;
  coherence: string;
  vocabulary: string;
  suggestions: {
    sentenceStructure: string[];
    wordChoice: string[];
    academicTone: string[];
  };
  revisedText: string;
}

export default function WritingExercise() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackData | null>(null);

  const handleAnalyze = async () => {
    if (!text.trim() || !user) return;
    setIsAnalyzing(true);
    setFeedback(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      const prompt = `
        Analisis teks esai akademik berikut dalam bahasa Indonesia:
        "${text}"
        
        Berikan laporan umpan balik mendalam dalam format JSON (Gunakan bahasa Indonesia untuk semua teks umpan balik):
        {
          "score": number (0-100),
          "grammar": "umpan balik spesifik tentang tata bahasa",
          "coherence": "seberapa baik aliran ide-idenya",
          "vocabulary": "umpan balik tentang pilihan kata",
          "suggestions": {
            "sentenceStructure": ["daftar 2 perbaikan spesifik untuk kompleksitas kalimat"],
            "wordChoice": ["daftar 2 sinonim akademik atau perbaikan frasa"],
            "academicTone": ["1-2 tips tentang nada formal"]
          },
          "revisedText": "versi teks dengan perbaikan"
        }
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      });

      const textResponse = response.text || '';
      const data = JSON.parse(textResponse.replace(/```json|```/g, '')) as FeedbackData;
      setFeedback(data);

      // Save to Firestore
      try {
        await addDoc(collection(db, 'submissions'), {
          userId: user.uid,
          type: 'writing',
          content: text,
          score: data.score,
          feedback: data,
          timestamp: serverTimestamp()
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, 'submissions');
      }

    } catch (error) {
      console.error('Failed to analyze:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="p-8 pb-24 max-w-7xl mx-auto space-y-8 min-h-full">
      <header className="flex justify-between items-end">
        <div>
           <h2 className="academic-label mb-1">Modul Akademik</h2>
           <h1 className="text-3xl font-serif italic text-white/90">Tes Kalimat Inggris</h1>
        </div>
        <div className="flex gap-3">
           <button
            onClick={handleAnalyze}
            disabled={isAnalyzing || !text.trim()}
            className="btn-action flex items-center gap-2"
          >
            {isAnalyzing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            Analisis Naskah
          </button>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* Input Panel */}
        <section className="flex-[1.5] w-full flex flex-col gap-4">
          <div className="sophisticated-card flex-1 min-h-[500px] relative">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full h-full bg-transparent p-8 outline-none resize-none text-[#A1A1AA] text-sm leading-relaxed scrollbar-hide font-light"
              placeholder="Thesis statement goes here... In this essay, I will investigate the implications of..."
            />
            <div className="absolute bottom-4 left-8 text-[10px] text-text-muted font-mono italic">
              Protokol Akademik: Logika GROQ Llama-3-70B Aktif
            </div>
          </div>
        </section>

        {/* AI Feedback Panel */}
        <section className="flex-1 w-full space-y-6">
          <AnimatePresence mode="wait">
            {!feedback && !isAnalyzing ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="sophisticated-card p-10 flex flex-col items-center justify-center text-center opacity-40 border-dashed"
              >
                <div className="w-12 h-12 rounded-full border border-border-main flex items-center justify-center mb-4">
                  <div className="w-2 h-2 bg-text-muted rounded-full animate-pulse" />
                </div>
                <p className="text-[10px] uppercase tracking-widest text-text-muted">Menunggu Masukan</p>
              </motion.div>
            ) : isAnalyzing ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="sophisticated-card p-10 flex flex-col items-center justify-center text-center"
              >
                <div className="w-16 h-16 border border-border-main border-t-brand-blue rounded-full animate-spin mb-6" />
                <p className="text-sm font-medium">Memindai Integritas Struktural</p>
                <p className="text-[10px] text-text-muted mt-2 font-mono uppercase tracking-widest">Pemetaan Wawasan Kritis AI</p>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-6"
              >
                {/* Score Card */}
                <div className="sophisticated-card p-6 bg-brand-blue/5 border-brand-blue/20">
                   <h3 className="academic-label text-brand-blue mb-4">Skor Kohesi Akademik</h3>
                   <div className="flex items-end gap-2">
                      <span className="text-4xl font-serif italic">{feedback?.score}</span>
                      <span className="text-xs text-text-muted mb-1 uppercase tracking-widest">/ benchmark 100</span>
                   </div>
                </div>

                {/* Critical Insights */}
                <div className="sophisticated-card p-6">
                  <h3 className="academic-label text-brand-purple mb-6">Wawasan Kritis AI</h3>
                  <div className="space-y-6">
                    <div className="border-l-2 border-brand-blue pl-4 py-1">
                      <p className="text-xs font-medium text-white/90">Fondasi Tata Bahasa</p>
                      <p className="text-[10px] text-text-dim mt-1 leading-relaxed">{feedback?.grammar}</p>
                    </div>
                    <div className="border-l-2 border-brand-purple pl-4 py-1">
                      <p className="text-xs font-medium text-white/90">Variasi Leksikal</p>
                      <p className="text-[10px] text-text-dim mt-1 leading-relaxed">{feedback?.vocabulary}</p>
                    </div>
                  </div>
                </div>

                {/* Suggestions */}
                <div className="sophisticated-card p-6">
                   <h3 className="academic-label mb-6">Penyempurnaan Taktis</h3>
                   <div className="space-y-6">
                     {feedback?.suggestions && Object.entries(feedback.suggestions).map(([category, tips]) => (
                        <div key={category} className="space-y-2">
                          <p className="text-[9px] uppercase tracking-widest text-text-muted font-mono flex items-center gap-2">
                            <div className="w-1 h-1 rounded-full bg-brand-blue" />
                            {category === 'sentenceStructure' ? 'Struktur Kalimat' : category === 'wordChoice' ? 'Pilihan Kata' : 'Nada Akademik'}
                          </p>
                          <div className="space-y-2">
                            {Array.isArray(tips) && tips.map((suggestion: string, idx: number) => (
                              <div key={idx} className="flex gap-3 text-[11px] text-text-dim border-b border-white/5 pb-2 last:border-0 last:pb-0">
                                <span className="text-brand-blue font-mono">{idx + 1}</span>
                                {suggestion}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                   </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>
    </div>
  );
}
