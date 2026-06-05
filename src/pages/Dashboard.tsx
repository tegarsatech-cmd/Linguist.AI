import React, { useEffect, useState, useMemo, useRef } from 'react';
import { motion } from 'motion/react';
import { BookOpen, Mic, LogOut, ChevronRight, BarChart3, Clock, TrendingUp, Filter, ArrowUpDown } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { collection, query, where, orderBy, getDocs, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/error-handler';

interface Submission {
  id: string;
  type: 'writing' | 'speaking';
  score: number;
  timestamp: any;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const historyRef = useRef<HTMLDivElement | null>(null);
  const { user } = useAuth();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [typeFilter, setTypeFilter] = useState<'all' | 'writing' | 'speaking'>('all');
  const [sortBy, setSortBy] = useState<'date' | 'score'>('date');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  useEffect(() => {
    if (user) {
      const fetchHistory = async () => {
        try {
          const q = query(
            collection(db, 'submissions'),
            where('userId', '==', user.uid),
            orderBy('timestamp', 'desc'),
            limit(20)
          );
          const querySnapshot = await getDocs(q);
          const docs = querySnapshot.docs.map((docSnap) => {
            const data = docSnap.data() as any;

            // Normalize timestamp: prefer stored timestamp, then null
            let timestamp = data.timestamp ?? null;

            // If timestamp is a plain JS Date or number, wrap to provide toMillis/toDate used elsewhere
            if (timestamp && typeof timestamp.toDate !== 'function') {
              if (timestamp instanceof Date) {
                const d = timestamp as Date;
                timestamp = {
                  toDate: () => d,
                  toMillis: () => d.getTime()
                };
              } else if (typeof timestamp === 'number') {
                const d = new Date(timestamp);
                timestamp = {
                  toDate: () => d,
                  toMillis: () => d.getTime()
                };
              }
            }

            const rawScore = typeof data.score === 'number' ? data.score : (data.feedback?.score ?? 0);

            const normalized: Submission = {
              id: docSnap.id,
              type: data.type || (data.feedback ? 'speaking' : 'writing') || 'writing',
              score: Number.isFinite(rawScore) ? rawScore : 0,
              timestamp,
            } as Submission;

            // attach other fields if needed
            return { ...normalized, ...data } as Submission;
          });
          setSubmissions(docs);
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, 'submissions');
        }
      };
      fetchHistory();
    }
  }, [user]);

  useEffect(() => {
    if (location.hash === '#history' && historyRef.current) {
      historyRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [location.hash]);

  const scrollToHistory = () => {
    if (historyRef.current) {
      historyRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const filteredSubmissions = useMemo(() => {
    let result = [...submissions];

    if (typeFilter !== 'all') {
      result = result.filter(s => s.type === typeFilter);
    }

    result.sort((a, b) => {
      if (sortBy === 'date') {
        const timeA = a.timestamp?.toMillis() || 0;
        const timeB = b.timestamp?.toMillis() || 0;
        return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
      } else {
        const scoreA = a.score || 0;
        const scoreB = b.score || 0;
        return sortOrder === 'desc' ? scoreB - scoreA : scoreA - scoreB;
      }
    });

    return result;
  }, [submissions, typeFilter, sortBy, sortOrder]);

  const chartSubmissions = useMemo(() => {
    return filteredSubmissions.length > 0 ? filteredSubmissions : submissions;
  }, [filteredSubmissions, submissions]);

  return (
    <div className="p-8 pb-24 max-w-7xl mx-auto space-y-10 min-h-full">
      <header>
        <h2 className="academic-label mb-1">Ikhtisar Sesi</h2>
        <h1 className="text-3xl font-serif italic text-white/90">Wawasan Portofolio</h1>
      </header>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="grid md:grid-cols-2 gap-6 h-fit">
            {/* Writing Card */}
            <motion.div
              whileHover={{ scale: 1.01 }}
              className="sophisticated-card p-8 group cursor-pointer relative overflow-hidden"
              onClick={() => navigate('/exercise/writing')}
            >
              <div className="w-10 h-10 bg-white/5 rounded flex items-center justify-center mb-6 border border-border-main group-hover:border-brand-blue/30 transition-all">
                <BookOpen className="w-5 h-5 text-brand-blue" />
              </div>
              <h3 className="text-xl font-serif italic mb-2 tracking-tight">Tes Kalimat Inggris</h3>
              <p className="text-text-dim text-xs leading-relaxed mb-6 font-light">
                Uji kemampuan struktur dan pilihan kata dalam kalimat bahasa Inggris dengan feedback ringkas.
              </p>
              <div className="flex gap-2">
                 <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 bg-white/5 border border-white/5 rounded text-text-muted">Kalimat Akademik</span>
              </div>
            </motion.div>

            {/* Speaking Card */}
            <motion.div
              whileHover={{ scale: 1.01 }}
              className="sophisticated-card p-8 group cursor-pointer relative overflow-hidden"
              onClick={() => navigate('/exercise/speaking')}
            >
              <div className="w-10 h-10 bg-white/5 rounded flex items-center justify-center mb-6 border border-border-main group-hover:border-brand-purple/30 transition-all">
                <Mic className="w-5 h-5 text-brand-purple" />
              </div>
              <h3 className="text-xl font-serif italic mb-2 tracking-tight">Tes Berbicara Inggris</h3>
              <p className="text-text-dim text-xs leading-relaxed mb-6 font-light">
                Cek kefasihan dan intonasi bicara Inggris dengan insight singkat demi tampil percaya diri.
              </p>
              <div className="flex gap-2">
                 <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 bg-white/5 border border-white/5 rounded text-text-muted">Kefasihan Lisan</span>
              </div>
            </motion.div>
          </div>

          {/* Performance Summary */}
          <div className="sophisticated-card p-8 cursor-pointer" onClick={scrollToHistory}>
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-brand-blue" /> Riwayat Hasil Latihan
                </h3>
                <p className="text-[10px] uppercase tracking-[0.2em] text-text-muted mt-0.5">Menampilkan hasil sesi latihan terbaru Anda</p>
              </div>
              <BarChart3 className="w-5 h-5 text-white/10" />
            </div>
            <p className="text-[10px] text-text-muted mb-6">{chartSubmissions.length > 0 ? `Menampilkan ${chartSubmissions.length} hasil terakhir` : 'Belum ada riwayat latihan untuk ditampilkan.'}</p>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); scrollToHistory(); }}
              className="text-[10px] uppercase tracking-widest px-3 py-2 border border-white/10 rounded-md hover:border-brand-blue hover:text-brand-blue transition-colors"
            >
              Lihat Riwayat
            </button>
            <div className="h-40 flex items-end gap-3 px-4 border-b border-border-main pb-1">
               {chartSubmissions.length === 0 ? (
                 <div className="w-full h-full flex items-center justify-center text-text-muted/30 text-xs uppercase tracking-widest font-mono">Data tidak mencukupi untuk visualisasi</div>
               ) : (
                 chartSubmissions.slice().reverse().map((sub, i) => (
                   <motion.div 
                    key={sub.id ?? i}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: `${Math.min(Math.max(sub.score, 0), 100)}%`, opacity: 1 }}
                    transition={{ delay: i * 0.05 }}
                    className={`flex-1 rounded-t-[2px] ${sub.type === 'writing' ? 'bg-brand-blue' : 'bg-brand-purple'}`}
                    title={`${sub.type === 'writing' ? 'Menulis' : 'Bicara'}: ${Math.round(sub.score)}%`}
                   />
                 ))
               )}
            </div>
            <div className="flex justify-between mt-4 text-[9px] uppercase tracking-widest font-mono text-text-muted">
               <span>Penilaian Garis Dasar</span>
               <span>Standar Saat Ini</span>
            </div>
          </div>
        </div>

        {/* History Sidebar */}
        <aside className="space-y-6" ref={historyRef} id="history">
          <div className="sophisticated-card p-8 h-full flex flex-col">
            <h3 className="academic-label mb-8 flex items-center gap-2">
              <Clock className="w-3 h-3" /> Penilaian Terbaru
            </h3>

            {/* Filters Row */}
            <div className="flex flex-col gap-4 mb-8 bg-white/5 p-4 rounded border border-white/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Filter className="w-3 h-3 text-text-muted" />
                  <span className="text-[10px] uppercase font-mono tracking-widest text-text-muted">Tipe</span>
                </div>
                <div className="flex gap-2">
                  {['all', 'writing', 'speaking'].map((t) => (
                    <button
                      key={t}
                      onClick={() => setTypeFilter(t as any)}
                      className={`text-[9px] px-2 py-0.5 rounded border transition-all uppercase tracking-tighter ${
                        typeFilter === t 
                        ? 'bg-brand-blue/20 border-brand-blue text-brand-blue' 
                        : 'bg-transparent border-white/10 text-text-muted hover:border-white/30'
                      }`}
                    >
                      {t === 'all' ? 'Semua' : t === 'writing' ? 'Menulis' : 'Bicara'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowUpDown className="w-3 h-3 text-text-muted" />
                  <span className="text-[10px] uppercase font-mono tracking-widest text-text-muted">Urutkan</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (sortBy === 'date') setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
                      else { setSortBy('date'); setSortOrder('desc'); }
                    }}
                    className={`text-[9px] px-2 py-0.5 rounded border transition-all flex items-center gap-1 uppercase tracking-tighter ${
                      sortBy === 'date' 
                      ? 'bg-brand-purple/20 border-brand-purple text-brand-purple' 
                      : 'bg-transparent border-white/10 text-text-muted hover:border-white/30'
                    }`}
                  >
                    Tanggal {sortBy === 'date' && (sortOrder === 'desc' ? '↓' : '↑')}
                  </button>
                  <button
                    onClick={() => {
                      if (sortBy === 'score') setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
                      else { setSortBy('score'); setSortOrder('desc'); }
                    }}
                    className={`text-[9px] px-2 py-0.5 rounded border transition-all flex items-center gap-1 uppercase tracking-tighter ${
                      sortBy === 'score' 
                      ? 'bg-brand-purple/20 border-brand-purple text-brand-purple' 
                      : 'bg-transparent border-white/10 text-text-muted hover:border-white/30'
                    }`}
                  >
                    Skor {sortBy === 'score' && (sortOrder === 'desc' ? '↓' : '↑')}
                  </button>
                </div>
              </div>
            </div>
            
            <div className="space-y-8 flex-1 overflow-y-auto pr-1">
              {filteredSubmissions.map((sub) => (
                <div key={sub.id} className="relative pl-6 border-l border-border-main pb-2 group">
                   <div className="absolute left-[-2.5px] top-0 w-1 h-1 rounded-full bg-border-main group-hover:bg-brand-blue transition-colors" />
                   <p className="text-[9px] font-mono text-text-muted uppercase tracking-widest">
                     {sub.timestamp?.toDate().toLocaleDateString('id-ID', { month: 'short', day: 'numeric', year: 'numeric' })}
                   </p>
                   <h4 className="text-xs font-medium mt-1 uppercase tracking-wider text-white/80">
                     {sub.type === 'writing' ? 'Evaluasi Menulis' : 'Umpan Balik Suara'}
                   </h4>
                   <div className="mt-2 flex items-center gap-3">
                     <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden">
                       <div 
                         className={`${sub.type === 'writing' ? 'bg-brand-blue' : 'bg-brand-purple'} h-full`} 
                         style={{ width: `${sub.score}%` }} 
                       />
                     </div>
                     <span className="text-[10px] font-mono text-white/50">{Math.round(sub.score)}</span>
                   </div>
                </div>
              ))}
              {filteredSubmissions.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 opacity-30">
                  <Filter className="w-8 h-8 mb-4" />
                  <p className="text-[10px] text-text-muted italic tracking-widest uppercase text-center">Hasil Tidak Ditemukan</p>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
