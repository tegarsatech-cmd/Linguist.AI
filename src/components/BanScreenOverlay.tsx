import React, { useEffect, useState } from 'react';
import { ShieldX, Lock, Clock, Globe, AlertOctagon, RefreshCw } from 'lucide-react';
import { getRemainingBanTime, type BanState, syncSecurityStatus } from '../lib/securityStore';

interface BanScreenOverlayProps {
  banState: BanState;
  onStatusUpdate?: (updatedState: BanState) => void;
}

export default function BanScreenOverlay({ banState, onStatusUpdate }: BanScreenOverlayProps) {
  const [timeLeft, setTimeLeft] = useState(() => getRemainingBanTime(banState.expiresAt));
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    if (banState.banType !== 'temporary_1day' || !banState.expiresAt) return;

    const timer = setInterval(() => {
      const remaining = getRemainingBanTime(banState.expiresAt);
      setTimeLeft(remaining);

      if (remaining.isExpired && onStatusUpdate) {
        // Otomatis sinkronisasi ulang jika 24 jam telah lewat
        syncSecurityStatus().then(onStatusUpdate);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [banState.banType, banState.expiresAt, onStatusUpdate]);

  const handleManualRefresh = async () => {
    setIsChecking(true);
    try {
      const updated = await syncSecurityStatus();
      if (onStatusUpdate) onStatusUpdate(updated);
    } finally {
      setIsChecking(false);
    }
  };

  const isPermanent = banState.banType === 'permanent';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-fade-in">
      <div className="relative w-full max-w-lg bg-bg-surface border-2 border-red-600/70 rounded-3xl shadow-2xl shadow-red-950/80 overflow-hidden text-text-primary p-6 sm:p-8 space-y-6 text-center">
        {/* Latar Ambient Merah Berdenyut */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-72 h-72 bg-red-600/20 rounded-full blur-3xl pointer-events-none" />

        {/* Icon Header */}
        <div className="flex justify-center relative">
          <div className="relative">
            <div className="w-20 h-20 rounded-3xl bg-red-950/80 border-2 border-red-500/60 flex items-center justify-center shadow-lg shadow-red-600/30">
              {isPermanent ? (
                <ShieldX className="w-10 h-10 text-red-500 animate-pulse" />
              ) : (
                <Lock className="w-10 h-10 text-amber-500 animate-bounce" />
              )}
            </div>
            <div className="absolute -bottom-2 -right-2 p-1.5 rounded-full bg-red-600 text-white border-2 border-bg-surface">
              <AlertOctagon className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Judul & Status Ban */}
        <div className="space-y-2 relative">
          <div className="inline-block px-3 py-1 rounded-full bg-red-950/80 border border-red-500/50 text-red-400 text-xs font-mono font-bold uppercase tracking-widest">
            {isPermanent ? 'AKSES DITOLAK PERMANEN' : 'DIBANNED 1 HARI (24 JAM)'}
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white uppercase">
            {isPermanent ? 'Akun & Perangkat Diblokir Selamanya' : 'Akses Tes Ditangguhkan Sementara'}
          </h2>
          <p className="text-xs sm:text-sm text-text-muted max-w-md mx-auto leading-relaxed">
            {isPermanent
              ? 'Terdeteksi percobaan injeksi skrip atau kode berbahaya (XSS / SQLi / Exploit) yang berpotensi merusak keamanan website. Perangkat ponsel dan IP Anda telah diblokir secara permanen.'
              : 'Anda telah mencapai batas 3 kali pelanggaran aturan penggunaan bahasa (kata kasar, toxic, atau vulgar). Akses ke menu tes diblokir selama 24 jam.'}
          </p>
        </div>

        {/* Live Countdown Timer untuk Ban 1 Hari */}
        {!isPermanent && (
          <div className="p-5 bg-gradient-to-b from-red-950/40 to-bg-deep border border-red-500/30 rounded-2xl space-y-2">
            <div className="flex items-center justify-center gap-1.5 text-xs text-amber-400 font-semibold uppercase tracking-wider">
              <Clock className="w-4 h-4" />
              <span>Sisa Waktu Pemblokiran:</span>
            </div>
            <div className="text-3xl sm:text-4xl font-mono font-black tracking-widest text-red-400 drop-shadow-md">
              {timeLeft.formatted}
            </div>
            <p className="text-[11px] text-text-muted">
              Berakhir otomatis pada:{' '}
              <strong className="text-white">
                {banState.expiresAt ? new Date(banState.expiresAt).toLocaleString('id-ID') : '-'}
              </strong>
            </p>
          </div>
        )}

        {/* Informasi Audit IP & Ponsel */}
        <div className="p-4 bg-bg-deep/90 border border-border-main rounded-xl space-y-2 text-left text-xs">
          <div className="flex items-center justify-between pb-2 border-b border-border-main">
            <span className="text-text-muted flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-red-400" />
              Alamat IP Ponsel:
            </span>
            <span className="font-mono font-bold text-red-300">{banState.clientIp}</span>
          </div>
          <div className="flex items-center justify-between text-text-muted">
            <span>Status Larangan:</span>
            <span className="text-white font-semibold">Mengikat Seluruh Mode Termasuk Pengunjung (Tamu)</span>
          </div>
          <div className="text-[11px] text-text-muted pt-1 text-center sm:text-left italic">
            *Mengganti akun atau beralih ke Mode Pengunjung pada ponsel ini tetap tidak dapat membuka akses karena alamat IP dan ID perangkat telah dikunci oleh server.
          </div>
        </div>

        {/* Tombol Periksa Status */}
        <div className="pt-2">
          <button
            onClick={handleManualRefresh}
            disabled={isChecking}
            className="w-full py-3 px-4 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 active:scale-[0.99] text-white font-semibold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
            <span>{isChecking ? 'Memeriksa ke Server…' : 'Periksa Status Pemblokiran'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
