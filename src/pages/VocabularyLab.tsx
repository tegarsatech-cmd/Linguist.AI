import React, { useState, useMemo, useEffect, useRef, useDeferredValue } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  Volume2,
  BookOpen,
  Layers,
  Sparkles,
  HelpCircle,
  RotateCw,
  CheckCircle2,
  XCircle,
  ArrowRight,
  ArrowLeft,
  Filter,
  Shuffle,
  ChevronDown,
  Bookmark,
  BookmarkCheck,
  RotateCcw,
  Flame,
  Eye,
  Award,
  ChevronRight,
  X,
} from 'lucide-react';
import { VOCABULARY_LIST, type VocabularyItem } from '../data/vocabularyData';

/** Helper untuk mengacak urutan array (Fisher-Yates) */
function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function VocabularyLab() {
  const [viewMode, setViewMode] = useState<'list' | 'flashcard' | 'quiz'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const deferredQuery = useDeferredValue(searchQuery);
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Progressive rendering: load 30 cards initially agar perpindahan menu instan (< 15ms)
  const [displayedCount, setDisplayedCount] = useState<number>(30);
  const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null);

  // Flashcard states
  const [flashcardIndex, setFlashcardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [masteredIds, setMasteredIds] = useState<Set<number>>(new Set());

  // Quiz states (Soal diacak secara otomatis, bukan monoton dari nomor 1)
  const [quizIndex, setQuizIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState(false);
  const [quizScore, setQuizScore] = useState(0);

  // Inisialisasi antrean soal kuis teracak dari 1.000 kata
  const [quizOrder, setQuizOrder] = useState<number[]>(() => {
    return shuffleArray(Array.from({ length: VOCABULARY_LIST.length }, (_, i) => i));
  });

  // Audio Pronunciation using Web Speech API
  const playAudio = (word: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(word);
      utterance.lang = 'en-US';
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  };

  // Reset displayed count saat filter atau pencarian berubah
  useEffect(() => {
    setDisplayedCount(30);
  }, [deferredQuery, selectedLevel, selectedCategory]);

  // Filtered list menggunakan deferredQuery agar ketikan instan tanpa lag
  const filteredWords = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return VOCABULARY_LIST.filter((item) => {
      const matchQuery =
        q === '' ||
        item.word.toLowerCase().includes(q) ||
        item.translation.toLowerCase().includes(q) ||
        item.example.toLowerCase().includes(q);

      const matchLevel = selectedLevel === 'all' || item.level === selectedLevel;
      const matchCategory = selectedCategory === 'all' || item.category === selectedCategory;

      return matchQuery && matchLevel && matchCategory;
    });
  }, [deferredQuery, selectedLevel, selectedCategory]);

  // Daftar kata yang dirender secara bertahap untuk kecepatan maksimal
  const visibleWords = useMemo(() => {
    return filteredWords.slice(0, displayedCount);
  }, [filteredWords, displayedCount]);

  // Infinite scroll observer: otomatis muat lebih banyak saat pengguna scroll ke bawah
  useEffect(() => {
    if (!loadMoreTriggerRef.current || viewMode !== 'list') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setDisplayedCount((prev) => Math.min(filteredWords.length, prev + 30));
        }
      },
      { rootMargin: '250px' }
    );

    observer.observe(loadMoreTriggerRef.current);
    return () => observer.disconnect();
  }, [viewMode, filteredWords.length, displayedCount]);

  const currentFlashcard = filteredWords[flashcardIndex] || filteredWords[0] || VOCABULARY_LIST[0];

  // Acak ulang urutan kuis
  const handleShuffleQuiz = () => {
    setQuizOrder(shuffleArray(Array.from({ length: VOCABULARY_LIST.length }, (_, i) => i)));
    setQuizIndex(0);
    setSelectedOption(null);
    setIsAnswerSubmitted(false);
    setQuizScore(0);
  };

  // Generate soal kuis & pilihan jawaban Bahasa Indonesia acak (tanpa embel-embel level B1 dsb)
  const currentQuizItem = useMemo(() => {
    // Ambil soal berdasarkan antrean yang sudah diacak
    const pool = VOCABULARY_LIST;
    const targetIndex = quizOrder[quizIndex % quizOrder.length] ?? (quizIndex % pool.length);
    const correct = pool[targetIndex] || pool[0];

    // Ambil 3 pilihan terjemahan Bahasa Indonesia yang salah secara acak dan instan
    const wrongTranslations: string[] = [];
    const seen = new Set<string>([correct.translation.trim().toLowerCase()]);
    let attempts = 0;

    while (wrongTranslations.length < 3 && attempts < 60) {
      attempts++;
      const randIdx = Math.floor(Math.random() * pool.length);
      const candidate = pool[randIdx];
      if (!candidate) continue;
      const trans = candidate.translation.trim();
      const norm = trans.toLowerCase();
      if (!seen.has(norm) && candidate.id !== correct.id) {
        seen.add(norm);
        wrongTranslations.push(trans);
      }
    }

    // Gabungkan 1 jawaban benar (Bahasa Indonesia) + 3 jawaban salah (Bahasa Indonesia) lalu diacak posisinya
    const allOptions = shuffleArray([correct.translation, ...wrongTranslations]);

    return { correct, options: allOptions };
  }, [quizIndex, quizOrder]);

  const handleNextFlashcard = () => {
    setIsFlipped(false);
    setFlashcardIndex((prev) => (prev + 1) % (filteredWords.length || 1));
  };

  const handlePrevFlashcard = () => {
    setIsFlipped(false);
    setFlashcardIndex((prev) => (prev - 1 + (filteredWords.length || 1)) % (filteredWords.length || 1));
  };

  const handleShuffleFlashcards = () => {
    setIsFlipped(false);
    const rand = Math.floor(Math.random() * (filteredWords.length || 1));
    setFlashcardIndex(rand);
  };

  const toggleMastered = (id: number) => {
    setMasteredIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleQuizSubmit = (option: string) => {
    if (isAnswerSubmitted) return;
    setSelectedOption(option);
    setIsAnswerSubmitted(true);
    if (option === currentQuizItem.correct.translation) {
      setQuizScore((prev) => prev + 1);
    }
  };

  const handleNextQuiz = () => {
    setSelectedOption(null);
    setIsAnswerSubmitted(false);
    setQuizIndex((prev) => prev + 1);
  };


  return (
    <div className="p-4 sm:p-6 md:p-10 pb-32 max-w-6xl mx-auto space-y-6 min-h-full">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border-main pb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-blue/10 border border-brand-blue/20 text-brand-blue text-[11px] font-mono mb-2">
            <Sparkles className="w-3 h-3" />
            <span>{VOCABULARY_LIST.length} Kosakata Bahasa Inggris Aktif (A1–C1)</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-serif italic text-white tracking-tight">
            Lab Kosakata & Leksikal (10.000 Kata)
          </h1>
          <p className="text-xs sm:text-sm text-text-muted mt-1">
            Kuasai kosakata akademik, bisnis, dan sehari-hari dari tingkat dasar (A1) hingga mahir (C1) dilengkapi audio dan mode kuis.
          </p>
        </div>

        {/* Mode Switcher */}
        <div className="flex bg-bg-nav p-1 rounded-xl border border-border-main shrink-0 w-full sm:w-auto overflow-x-auto justify-between sm:justify-start">
          <button
            onClick={() => setViewMode('list')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              viewMode === 'list' ? 'bg-white text-bg-deep shadow-md font-semibold' : 'text-text-muted hover:text-white'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Daftar ({filteredWords.length})</span>
          </button>
          <button
            onClick={() => setViewMode('flashcard')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              viewMode === 'flashcard' ? 'bg-white text-bg-deep shadow-md font-semibold' : 'text-text-muted hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Flashcard</span>
          </button>
          <button
            onClick={() => setViewMode('quiz')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              viewMode === 'quiz' ? 'bg-white text-bg-deep shadow-md font-semibold' : 'text-text-muted hover:text-white'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Kuis Latihan</span>
          </button>
        </div>
      </div>

      {/* VIEW MODE: LIST */}
      {viewMode === 'list' && (
        <div className="space-y-6">
          {/* Search and Filters Bar */}
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari kata Inggris atau arti bahasa Indonesia..."
                className="w-full bg-bg-nav border border-border-main rounded-xl py-2.5 pl-10 pr-10 text-sm text-white placeholder:text-text-muted/60 focus:outline-none focus:border-brand-blue transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Hapus teks pencarian"
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-white rounded-full hover:bg-white/10 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter by Level */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar touch-pan-x">
              <span className="text-[11px] text-text-muted uppercase tracking-wider shrink-0 flex items-center gap-1 pl-1">
                <Filter className="w-3 h-3" /> Level:
              </span>
              {['all', 'A1', 'A2', 'B1', 'B2', 'C1'].map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => setSelectedLevel(lvl)}
                  className={`text-xs px-2.5 py-1 rounded-lg transition-all shrink-0 font-medium ${
                    selectedLevel === lvl
                      ? 'bg-brand-blue text-white shadow-sm'
                      : 'bg-white/[0.03] text-text-muted hover:text-white border border-border-main'
                  }`}
                >
                  {lvl === 'all' ? 'Semua Level' : lvl}
                </button>
              ))}
            </div>
          </div>

          {/* Filter by Category */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-text-muted uppercase tracking-wider">Topik:</span>
            {['all', 'Akademik', 'Bisnis', 'Sehari-hari', 'Teknologi', 'Sains', 'Komunikasi'].map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`text-[11px] px-2.5 py-0.5 rounded-full transition-all ${
                  selectedCategory === cat
                    ? 'bg-white text-bg-deep font-semibold'
                    : 'bg-white/[0.02] text-text-dim hover:text-white border border-border-main/60'
                }`}
              >
                {cat === 'all' ? 'Semua Topik' : cat}
              </button>
            ))}
          </div>

          {/* Words Grid */}
          {filteredWords.length === 0 ? (
            <div className="text-center py-16 bg-white/[0.02] border border-border-main rounded-2xl">
              <BookOpen className="w-8 h-8 text-text-muted mx-auto mb-2 opacity-50" />
              <p className="text-sm text-text-muted">Tidak ditemukan kata yang sesuai kriteria pencarian.</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {visibleWords.map((item) => (
                  <div
                    key={item.id}
                    className="bg-bg-panel/90 border border-border-main rounded-xl p-4 sm:p-5 hover:border-brand-blue/40 transition-all flex flex-col justify-between group shadow-sm hover:shadow-md"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-semibold text-white group-hover:text-brand-blue transition-colors">
                              {item.word}
                            </h3>
                            <button
                              onClick={() => playAudio(item.word)}
                              title="Dengarkan pelafalan"
                              aria-label={`Dengarkan pelafalan ${item.word}`}
                              className="p-1 hover:bg-white/10 rounded-full text-text-muted hover:text-brand-blue transition-colors"
                            >
                              <Volume2 className="w-4 h-4" />
                            </button>
                          </div>
                          <p className="text-xs text-text-muted font-mono">{item.phonetic}</p>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-brand-blue/15 text-brand-blue border border-brand-blue/20">
                            {item.level}
                          </span>
                          <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-white/5 text-text-dim border border-border-main">
                            {item.partOfSpeech}
                          </span>
                        </div>
                      </div>

                      <div className="mt-3 pt-3 border-t border-border-main/50">
                        <p className="text-sm font-medium text-emerald-400 mb-1.5">{item.translation}</p>
                        <p className="text-xs text-text-dim italic leading-relaxed">"{item.example}"</p>
                        <p className="text-[11px] text-text-muted mt-1 leading-relaxed">{item.exampleTranslation}</p>
                      </div>
                    </div>

                    <div className="mt-4 pt-2 flex items-center justify-between text-[10px] text-text-muted border-t border-border-main/30">
                      <span className="bg-white/[0.03] px-2 py-0.5 rounded text-text-dim">{item.category}</span>
                      <button
                        onClick={() => toggleMastered(item.id)}
                        className={`flex items-center gap-1 transition-colors ${
                          masteredIds.has(item.id) ? 'text-emerald-400 font-semibold' : 'hover:text-white'
                        }`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {masteredIds.has(item.id) ? 'Hafal' : 'Tandai Hafal'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Tombol Muat Lebih Banyak & Infinite Scroll Trigger */}
              {visibleWords.length < filteredWords.length && (
                <div className="pt-4 pb-2 text-center space-y-2.5">
                  <button
                    onClick={() => setDisplayedCount((prev) => Math.min(filteredWords.length, prev + 30))}
                    className="px-6 py-2.5 rounded-xl bg-bg-panel border border-border-main hover:border-brand-blue/50 text-xs font-semibold text-white inline-flex items-center gap-2 transition-all hover:bg-white/5 active:scale-95 shadow-sm"
                  >
                    <ChevronDown className="w-4 h-4" />
                    Tampilkan Lebih Banyak ({visibleWords.length} dari {filteredWords.length} kata)
                  </button>
                  <p className="text-[11px] text-text-muted">
                    Atau gulir ke bawah untuk memuat otomatis
                  </p>
                  <div ref={loadMoreTriggerRef} className="h-6 w-full pointer-events-none" />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* VIEW MODE: FLASHCARD */}
      {viewMode === 'flashcard' && (
        <div className="max-w-md mx-auto space-y-6 pt-4">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span>
              Kartu {flashcardIndex + 1} dari {filteredWords.length}
            </span>
            <span className="text-emerald-400 font-medium">
              {masteredIds.size} kosakata dihafal
            </span>
          </div>

          <div
            onClick={() => setIsFlipped(!isFlipped)}
            className="w-full h-80 bg-bg-panel border border-border-main rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:border-brand-blue/50 transition-all shadow-xl relative select-none"
          >
            <span className="absolute top-4 right-4 text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-brand-blue/15 text-brand-blue border border-brand-blue/20">
              {currentFlashcard.level}
            </span>

            <AnimatePresence mode="wait">
              {!isFlipped ? (
                <motion.div
                  key="front"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="space-y-3"
                >
                  <span className="text-[10px] uppercase tracking-widest text-text-muted">Bahasa Inggris</span>
                  <h2 className="text-4xl font-serif italic text-white">{currentFlashcard.word}</h2>
                  <p className="text-sm font-mono text-text-muted">{currentFlashcard.phonetic}</p>
                  <p className="text-xs uppercase tracking-wider text-text-dim">{currentFlashcard.partOfSpeech}</p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      playAudio(currentFlashcard.word);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 hover:bg-white/10 text-xs text-brand-blue mt-2 transition-colors"
                  >
                    <Volume2 className="w-4 h-4" /> Dengarkan
                  </button>
                  <p className="text-[11px] text-text-muted pt-4">Klik kartu untuk melihat arti</p>
                </motion.div>
              ) : (
                <motion.div
                  key="back"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="space-y-4"
                >
                  <span className="text-[10px] uppercase tracking-widest text-emerald-400 font-semibold">
                    Terjemahan & Contoh
                  </span>
                  <h3 className="text-2xl font-semibold text-white">{currentFlashcard.translation}</h3>
                  <div className="bg-bg-nav/60 p-3 rounded-xl border border-border-main text-left space-y-1">
                    <p className="text-xs text-text-dim italic">"{currentFlashcard.example}"</p>
                    <p className="text-[11px] text-text-muted">{currentFlashcard.exampleTranslation}</p>
                  </div>
                  <p className="text-[11px] text-text-muted pt-2">Klik kartu untuk kembali</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Flashcard Controls */}
          <div className="flex items-center justify-between gap-1.5 sm:gap-3">
            <button
              onClick={handlePrevFlashcard}
              className="flex-1 py-2.5 px-2 sm:px-3 rounded-xl bg-bg-panel border border-border-main hover:bg-white/5 text-xs font-medium text-white flex items-center justify-center gap-1 sm:gap-1.5 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 shrink-0" />
              <span className="hidden xs:inline">Sebelumnya</span>
              <span className="xs:hidden">Prev</span>
            </button>
            <button
              onClick={handleShuffleFlashcards}
              title="Acak urutan flashcard"
              className="py-2.5 px-2 sm:px-3 rounded-xl bg-bg-panel border border-border-main hover:bg-white/5 text-xs font-medium text-text-muted hover:text-white flex items-center justify-center gap-1 sm:gap-1.5 transition-colors"
            >
              <Shuffle className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Acak</span>
            </button>
            <button
              onClick={() => toggleMastered(currentFlashcard.id)}
              className={`px-2.5 sm:px-3 py-2.5 rounded-xl text-xs font-medium border transition-colors flex items-center gap-1 sm:gap-1.5 ${
                masteredIds.has(currentFlashcard.id)
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                  : 'bg-bg-panel border-border-main text-text-muted hover:text-white'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{masteredIds.has(currentFlashcard.id) ? 'Hafal' : 'Tandai'}</span>
            </button>
            <button
              onClick={handleNextFlashcard}
              className="flex-1 py-2.5 px-2 sm:px-3 rounded-xl bg-brand-blue hover:bg-brand-blue/90 text-xs font-medium text-white flex items-center justify-center gap-1 sm:gap-1.5 transition-colors shadow-lg shadow-brand-blue/20"
            >
              <span className="hidden xs:inline">Selanjutnya</span>
              <span className="xs:hidden">Next</span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>
          </div>
        </div>
      )}

      {/* VIEW MODE: QUIZ */}
      {viewMode === 'quiz' && (
        <div className="max-w-lg mx-auto space-y-6 pt-4">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <div className="flex items-center gap-2">
              <span className="font-medium text-white/90">Soal #{quizIndex + 1}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-blue/15 text-brand-blue border border-brand-blue/20">
                Soal Teracak
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleShuffleQuiz}
                className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-brand-blue transition-colors px-2 py-1 rounded bg-white/5 hover:bg-white/10"
                title="Acak ulang susunan soal kuis"
              >
                <Shuffle className="w-3 h-3" /> Acak Soal Baru
              </button>
              <span className="text-brand-blue font-semibold">Skor: {quizScore}</span>
            </div>
          </div>

          <div className="bg-bg-panel border border-border-main rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl">
            <div className="text-center space-y-2">
              <span className="text-[10px] uppercase tracking-widest text-text-muted">
                Pilih arti bahasa Indonesia yang tepat
              </span>
              <div className="flex items-center justify-center gap-2">
                <h2 className="text-3xl font-serif italic text-white">{currentQuizItem.correct.word}</h2>
                <button
                  onClick={() => playAudio(currentQuizItem.correct.word)}
                  title="Dengarkan pelafalan"
                  className="p-1.5 rounded-full hover:bg-white/10 text-brand-blue transition-colors"
                >
                  <Volume2 className="w-5 h-5" />
                </button>
              </div>
              <p className="text-xs text-text-muted font-mono">{currentQuizItem.correct.phonetic}</p>
            </div>

            {/* Options */}
            <div className="space-y-3">
              {currentQuizItem.options.map((option, idx) => {
                const optionLabel = ['A', 'B', 'C', 'D'][idx] || `${idx + 1}`;
                const isSelected = selectedOption === option;
                const isCorrect = option === currentQuizItem.correct.translation;

                let btnClass = 'bg-bg-nav hover:bg-white/5 border-border-main text-white';
                if (isAnswerSubmitted) {
                  if (isCorrect) {
                    btnClass = 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-semibold';
                  } else if (isSelected) {
                    btnClass = 'bg-red-500/20 border-red-500 text-red-300';
                  } else {
                    btnClass = 'opacity-40 border-border-main text-text-muted';
                  }
                }

                return (
                  <button
                    key={idx}
                    disabled={isAnswerSubmitted}
                    onClick={() => handleQuizSubmit(option)}
                    className={`w-full p-3.5 sm:p-4 rounded-xl border text-left text-xs sm:text-sm transition-all flex items-center justify-between gap-3 ${btnClass}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center text-xs font-bold shrink-0 font-mono text-white/90">
                        {optionLabel}
                      </span>
                      <span className="font-medium text-white/95 leading-snug">{option}</span>
                    </div>
                    {isAnswerSubmitted && isCorrect && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                    {isAnswerSubmitted && isSelected && !isCorrect && (
                      <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Answer feedback & Next button */}
            {isAnswerSubmitted && (
              <div className="pt-2 border-t border-border-main space-y-4 animate-fadeIn">
                <div className="text-xs leading-relaxed text-text-dim">
                  <span className="font-semibold text-white">Contoh kalimat: </span>
                  <span className="italic">"{currentQuizItem.correct.example}"</span>
                  <p className="text-text-muted mt-0.5">{currentQuizItem.correct.exampleTranslation}</p>
                </div>

                <button
                  onClick={handleNextQuiz}
                  className="w-full py-3 bg-brand-blue hover:bg-brand-blue/90 text-white rounded-xl text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg shadow-brand-blue/20"
                >
                  Lanjut ke Soal Berikutnya <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

