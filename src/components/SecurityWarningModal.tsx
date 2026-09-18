import React from 'react';
import { AlertTriangle, ShieldAlert, CheckCircle2, Clock, Globe, Smartphone, XCircle } from 'lucide-react';
import type { WarningNotice } from '../lib/securityStore';

interface SecurityWarningModalProps {
  notice: WarningNotice | null;
  onClose: () => void;
}

export default function SecurityWarningModal({ notice, onClose }: SecurityWarningModalProps) {
  if (!notice) return null;

  const isLastWarning = notice.noticeNumber === 2;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-xl bg-bg-surface border-2 border-red-500/40 rounded-2xl shadow-2xl shadow-red-950/50 overflow-hidden text-text-primary">
        {/* Header Pita Resmi */}
        <div className="bg-gradient-to-r from-red-600 via-rose-600 to-red-700 px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/20">
              <ShieldAlert className="w-6 h-6 text-white animate-pulse" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold tracking-wide uppercase">
                Surat Peringatan Resmi (SP {notice.noticeNumber})
              </h2>
              <p className="text-xs text-white/80">Linguist.AI Automated Community & Security Protection</p>
            </div>
          </div>
          <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-black/30 border border-white/20 font-semibold">
            Peringatan {notice.noticeNumber}/3
          </span>
        </div>

        {/* Isi Surat Peringatan */}
        <div className="p-6 space-y-5 text-sm">
          {/* Metadata Audit Klien */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 bg-red-950/20 border border-red-900/30 rounded-xl text-xs text-text-muted">
            <div className="flex items-center gap-2">
              <Globe className="w-3.5 h-3.5 text-red-400" />
              <span>IP Terlacak: <strong className="text-red-300 font-mono">{notice.clientIp}</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <Smartphone className="w-3.5 h-3.5 text-red-400" />
              <span>Status: <strong className="text-white">{notice.isGuest ? 'Mode Pengunjung (Tamu)' : 'Pengguna Terdaftar'}</strong></span>
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Clock className="w-3.5 h-3.5 text-red-400" />
              <span>Waktu Pelanggaran: <span className="text-white font-mono">{new Date(notice.timestamp).toLocaleString('id-ID')}</span></span>
            </div>
          </div>

          {/* Rincian Pelanggaran */}
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl space-y-2">
            <div className="flex items-center gap-2 text-red-400 font-semibold text-xs uppercase tracking-wider">
              <XCircle className="w-4 h-4" />
              <span>Pelanggaran Terdeteksi:</span>
            </div>
            <p className="text-sm font-medium text-white/90">{notice.reason}</p>
            <div className="pt-2 border-t border-red-500/20 flex items-center justify-between text-xs">
              <span className="text-text-muted">Kata / Frasa Terdeteksi:</span>
              <span className="font-mono font-bold px-2 py-0.5 rounded bg-red-950/60 text-red-300 border border-red-800/50">
                "{notice.detectedWord}"
              </span>
            </div>
          </div>

          {/* Konsekuensi & Aturan Tegas */}
          <div className="p-4 bg-bg-deep/80 border border-border-main rounded-xl space-y-2">
            <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              Ketentuan Pelanggaran & Sanksi Banned:
            </h4>
            <ul className="space-y-1.5 text-xs text-text-muted list-disc list-inside leading-relaxed">
              <li>
                Toleransi kata kasar/toxic/vulgar adalah <strong className="text-white">maksimal 3 kali</strong>.
              </li>
              <li>
                {isLastWarning ? (
                  <span className="text-rose-400 font-bold">
                    PERINGATAN TERAKHIR: Jika Anda melanggar 1 kali lagi, alamat IP ponsel dan akun Anda akan langsung DIBANNED SELAMA 1 HARI (24 JAM).
                  </span>
                ) : (
                  <span>
                    Saat ini Anda berada pada <strong className="text-amber-400">Peringatan ke-{notice.noticeNumber} dari 3</strong>. Jika mencapai 3 kali, akun dan IP perangkat akan <strong className="text-red-400">DIBANNED 1 HARI (24 Jam)</strong>.
                  </span>
                )}
              </li>
              <li>
                <strong className="text-red-400">Perhatian Khusus Script:</strong> Memasukkan script berbahaya (XSS/SQLi/eksploit) akan mengakibatkan <strong className="text-red-400 font-bold underline">BANNED SELAMANYA (Permanen)</strong> tanpa surat peringatan.
              </li>
              <li>
                Sanksi berlaku mengikat pada <strong className="text-white">alamat IP perangkat ponsel</strong>, sehingga berganti ke Mode Pengunjung atau membuat akun baru tidak akan membuka blokir.
              </li>
            </ul>
          </div>

          {/* Tombol Konfirmasi */}
          <div className="pt-2">
            <button
              onClick={onClose}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 active:scale-[0.99] text-white font-semibold text-sm transition-all shadow-lg shadow-red-600/30 flex items-center justify-center gap-2 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Saya Mengerti &amp; Tidak Akan Mengulangi</span>
            </button>
            <p className="mt-2 text-center text-[11px] text-text-muted">
              Peringatan ini telah dicatat dalam database keamanan server secara permanen.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
