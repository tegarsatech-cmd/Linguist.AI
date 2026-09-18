import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth, translateAuthError } from '../contexts/AuthContext';
import {
  LayoutDashboard,
  PenTool,
  Mic2,
  FlaskConical,
  LogOut,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  BookOpen,
  Activity,
  History,
  Sparkles,
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, updatePassword } = useAuth();

  // Desktop sidebar collapse state
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(false);
  // Mobile / iPhone drawer state
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Logout modal state
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Ubah Password Modal State
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  // Close mobile drawer on route change
  useEffect(() => {
    setIsMobileOpen(false);
  }, [location.pathname]);

  const isGuest = Boolean(user?.user_metadata?.is_guest);

  const displayName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split('@')[0] ||
    (isGuest ? 'Tamu Pengunjung' : 'Pelajar');

  const avatarUrl = user?.user_metadata?.avatar_url;

  const initials =
    displayName
      .split(' ')
      .filter(Boolean)
      .map((n: string) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'U';

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Tes Kalimat Inggris', path: '/exercise/writing', icon: PenTool },
    { name: 'Tes Berbicara Inggris', path: '/exercise/speaking', icon: Mic2 },
    { name: 'Lab Kosakata (10.000 Kata)', path: '/vocabulary', icon: BookOpen },
    { name: 'Rubrik Penilaian', path: '/rubric', icon: FlaskConical },
  ];

  const handleConfirmLogout = async () => {
    setIsLoggingOut(true);
    setShowLogoutModal(false);
    try {
      await logout();
    } finally {
      setIsLoggingOut(false);
      navigate('/login');
    }
  };

  const handleOpenPasswordModal = () => {
    setNewPassword('');
    setConfirmNewPassword('');
    setPasswordError('');
    setPasswordSuccess('');
    setShowPasswordModal(true);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (newPassword.length < 6) {
      setPasswordError('Kata sandi baru minimal harus terdiri dari 6 karakter.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError('Konfirmasi kata sandi baru tidak cocok.');
      return;
    }

    setIsUpdatingPassword(true);
    try {
      await updatePassword(newPassword);
      setPasswordSuccess('Kata sandi berhasil diperbarui dengan aman!');
      setNewPassword('');
      setConfirmNewPassword('');
      setTimeout(() => {
        setShowPasswordModal(false);
        setPasswordSuccess('');
      }, 1400);
    } catch (err: any) {
      setPasswordError(translateAuthError(err));
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-bg-deep text-[#E4E4E7] selection:bg-brand-blue/30">
      {/* Mobile Backdrop Overlay */}
      {isMobileOpen && (
        <div
          onClick={() => setIsMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm md:hidden transition-opacity"
        />
      )}

      {/* Navigation Rail / Sidebar (Desktop & Mobile Drawer) */}
      <aside
        className={`
          fixed md:static inset-y-0 left-0 z-50 flex flex-col bg-bg-nav border-r border-border-main transition-all duration-300 ease-in-out
          ${isMobileOpen ? 'translate-x-0 w-72 shadow-2xl' : '-translate-x-full md:translate-x-0'}
          ${isDesktopCollapsed ? 'md:w-20' : 'md:w-64'}
        `}
      >
        {/* Brand Header (Unclipped & perfectly visible when collapsed) */}
        <div
          className={`h-16 border-b border-border-main flex items-center shrink-0 ${
            isDesktopCollapsed && !isMobileOpen ? 'justify-center px-2' : 'justify-between px-5'
          }`}
        >
          {isDesktopCollapsed && !isMobileOpen ? (
            <button
              type="button"
              onClick={() => setIsDesktopCollapsed(false)}
              className="group relative flex items-center justify-center w-10 h-10 rounded-xl bg-brand-blue/15 border border-brand-blue/30 hover:border-brand-blue/60 hover:bg-brand-blue/25 text-brand-blue transition-all"
              title="Linguist.AI - Klik untuk membuka sidebar"
            >
              <Sparkles className="w-5 h-5 group-hover:rotate-12 transition-transform" />
              <PanelLeftOpen className="w-3 h-3 text-white/80 absolute -bottom-1 -right-1 bg-bg-panel rounded-full p-0.5 border border-border-main" />
            </button>
          ) : (
            <>
              <div
                className="flex items-center gap-3 cursor-pointer overflow-hidden"
                onClick={() => navigate('/')}
              >
                <div className="w-8 h-8 rounded-lg bg-brand-blue/15 border border-brand-blue/30 flex items-center justify-center text-brand-blue shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="overflow-hidden whitespace-nowrap">
                  <h1 className="text-lg font-serif italic text-white tracking-tight">Linguist.AI</h1>
                  <p className="text-[9px] uppercase tracking-widest text-text-muted">Laboratorium AI</p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {/* Desktop Toggle Collapse Button */}
                <button
                  type="button"
                  onClick={() => setIsDesktopCollapsed(true)}
                  className="hidden md:flex p-1.5 rounded-lg text-text-muted hover:text-white hover:bg-white/5 transition-colors"
                  title="Tutup / Ciutkan Sidebar"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>

                {/* Mobile Close Button */}
                <button
                  type="button"
                  onClick={() => setIsMobileOpen(false)}
                  className="md:hidden p-1.5 rounded-lg text-text-muted hover:text-white hover:bg-white/5 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Navigation Items */}
        <div className="flex-1 overflow-y-auto px-3 py-6 space-y-6 custom-scrollbar">
          <div>
            {(!isDesktopCollapsed || isMobileOpen) && (
              <p className="text-[10px] uppercase tracking-wider text-text-muted px-3 mb-3 font-mono">
                Modul Pembelajaran
              </p>
            )}
            <ul className="space-y-1.5">
              {navItems.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <li key={item.name}>
                    <button
                      onClick={() => navigate(item.path)}
                      title={item.name}
                      className={`w-full flex items-center gap-3 text-xs sm:text-sm px-3 py-2.5 rounded-xl transition-all ${
                        isActive
                          ? 'text-white bg-white/10 font-medium border border-border-main'
                          : 'text-text-dim hover:text-white hover:bg-white/[0.03]'
                      } ${isDesktopCollapsed && !isMobileOpen ? 'justify-center px-0' : ''}`}
                    >
                      <item.icon
                        className={`w-4 h-4 shrink-0 ${isActive ? 'text-brand-blue' : 'text-text-muted'}`}
                      />
                      {(!isDesktopCollapsed || isMobileOpen) && (
                        <span className="truncate text-left">{item.name}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* User Profile & Actions Bottom Bar */}
        <div className="p-3 border-t border-border-main shrink-0 space-y-2">
          {/* Fitur Pengaturan Ubah Password Diatas Tombol Logout */}
          {(!isDesktopCollapsed || isMobileOpen) ? (
            <button
              type="button"
              onClick={handleOpenPasswordModal}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-border-main/70 text-text-dim hover:text-white text-xs transition-all group shadow-sm"
              title="Pengaturan akun: Ubah Kata Sandi"
            >
              <div className="flex items-center gap-2.5">
                <KeyRound className="w-3.5 h-3.5 text-brand-blue group-hover:scale-110 transition-transform" />
                <span className="font-medium">Ubah Kata Sandi</span>
              </div>
              <span className="text-[9px] font-mono uppercase bg-brand-blue/10 text-brand-blue border border-brand-blue/20 px-1.5 py-0.5 rounded">
                Pengaturan
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleOpenPasswordModal}
              className="w-full p-2 flex items-center justify-center rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-border-main/70 text-brand-blue hover:text-white text-xs transition-all"
              title="Pengaturan: Ubah Kata Sandi"
            >
              <KeyRound className="w-4 h-4" />
            </button>
          )}

          {/* User Profile Card */}
          <div
            className={`flex items-center gap-3 p-2 rounded-xl bg-white/[0.02] border border-border-main/50 ${
              isDesktopCollapsed && !isMobileOpen ? 'justify-center p-1.5' : 'justify-between'
            }`}
          >
            <div
              className="flex items-center gap-2.5 min-w-0"
              title={user?.email || displayName}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="w-8 h-8 rounded-full object-cover border border-border-main shadow-sm shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-blue to-brand-purple flex items-center justify-center text-xs font-bold text-white shadow-sm shrink-0">
                  {initials}
                </div>
              )}
              {(!isDesktopCollapsed || isMobileOpen) && (
                <div className="overflow-hidden min-w-0">
                  <p className="text-xs font-medium text-white truncate max-w-[120px]">
                    {displayName}
                  </p>
                  <p className="text-[10px] text-text-muted truncate">
                    {isGuest ? 'Mode Pengunjung' : 'Pelajar Terverifikasi'}
                  </p>
                </div>
              )}
            </div>

            {(!isDesktopCollapsed || isMobileOpen) && (
              <button
                type="button"
                onClick={() => setShowLogoutModal(true)}
                title="Keluar dari akun"
                className="p-1.5 text-text-muted hover:text-red-400 hover:bg-white/5 rounded-lg transition-colors shrink-0"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Collapsed logout icon */}
          {isDesktopCollapsed && !isMobileOpen && (
            <button
              type="button"
              onClick={() => setShowLogoutModal(true)}
              title="Keluar dari akun"
              className="w-full p-2 flex items-center justify-center text-text-muted hover:text-red-400 hover:bg-white/5 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Viewport */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
        {/* Top Header */}
        <header className="h-16 border-b border-border-main px-4 sm:px-8 flex items-center justify-between shrink-0 bg-bg-nav/50 backdrop-blur-md z-20">
          <div className="flex items-center gap-3">
            {/* Mobile Hamburger Button */}
            <button
              onClick={() => setIsMobileOpen(true)}
              className="md:hidden p-2 rounded-lg text-text-dim hover:text-white hover:bg-white/5 transition-colors"
              aria-label="Buka Menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Breadcrumbs */}
            <div className="flex items-center gap-2 text-[11px] text-text-muted uppercase tracking-wider font-mono">
              <span className="hidden sm:inline">Linguist.AI</span>
              <span className="hidden sm:inline">/</span>
              <span className="text-white font-medium truncate max-w-[180px] sm:max-w-none">
                {navItems.find((i) => i.path === location.pathname)?.name || 'Modul Pembelajaran'}
              </span>
            </div>
          </div>

          {/* AI Engine Status Badge */}
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-border-main border border-white/5 shadow-inner">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] sm:text-[11px] font-mono text-text-dim">
              Mesin AI Siaga <span className="hidden sm:inline text-brand-blue font-semibold">· Llama-3 / Gemini</span>
            </span>
          </div>
        </header>

        {/* Scrollable Page Body (Responsive for iPhone & Android) */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar -webkit-overflow-scrolling-touch">
          {children}
        </main>

        {/* Floating Status Bar (Desktop & Tablet Friendly, Clean & Non-obstructive) */}
        <div className="hidden sm:flex absolute bottom-5 left-6 right-6 md:left-10 md:right-10 h-11 bg-bg-nav/85 backdrop-blur-md border border-border-main/90 rounded-full px-5 items-center justify-between shadow-2xl z-30 pointer-events-auto">
          <div className="flex items-center gap-4 text-[10px] text-text-muted font-mono uppercase tracking-wider">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
              <span>Mesin AI Siaga</span>
            </div>
            <div className="h-3.5 w-[1px] bg-border-main"></div>
            <span className="text-text-dim flex items-center gap-1.5">
              <Activity className="w-3 h-3 text-brand-blue" /> Masukan Real-time Aktif
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                navigate('/#history');
                const el = document.getElementById('history');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              className="text-[10px] uppercase font-mono tracking-widest text-text-muted hover:text-brand-blue transition-colors flex items-center gap-1"
            >
              <History className="w-3 h-3" /> Riwayat
            </button>
          </div>
        </div>
      </div>

      {/* Ubah Kata Sandi Modal */}
      <AnimatePresence>
        {showPasswordModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.15 }}
              className="w-full max-w-md bg-bg-panel border border-border-main rounded-2xl p-6 shadow-2xl space-y-5 relative"
            >
              <div className="flex items-center justify-between pb-2 border-b border-border-main">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-brand-blue/15 border border-brand-blue/30 flex items-center justify-center text-brand-blue shrink-0">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">Pengaturan Kata Sandi</h3>
                    <p className="text-xs text-text-muted">Perbarui kata sandi akun Anda</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowPasswordModal(false)}
                  className="p-1.5 rounded-lg text-text-muted hover:text-white hover:bg-white/5 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {isGuest ? (
                <div className="space-y-4 py-2">
                  <div className="p-4 rounded-xl bg-brand-purple/10 border border-brand-purple/30 text-purple-200 text-xs leading-relaxed space-y-2">
                    <p className="font-semibold text-purple-100 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-brand-purple" /> Mode Pengunjung (Tamu)
                    </p>
                    <p>
                      Anda sedang menggunakan mode pengunjung tanpa registrasi. Akun tamu tidak memiliki kata sandi untuk diubah.
                    </p>
                    <p className="text-text-muted text-[11px]">
                      Untuk menyimpan riwayat latihan secara permanen dan memiliki kata sandi pribadi, silakan daftarkan akun resmi Anda.
                    </p>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowPasswordModal(false)}
                      className="px-4 py-2 text-xs font-medium text-text-dim hover:text-white rounded-lg hover:bg-white/5 transition-colors"
                    >
                      Tutup
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowPasswordModal(false);
                        handleConfirmLogout();
                      }}
                      className="px-4 py-2 text-xs font-medium bg-brand-blue hover:bg-brand-blue/90 text-white rounded-lg transition-all"
                    >
                      Daftar Akun Baru
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleChangePassword} className="space-y-4">
                  {passwordError && (
                    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-300 text-xs">
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      <span>{passwordError}</span>
                    </div>
                  )}

                  {passwordSuccess && (
                    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{passwordSuccess}</span>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-text-dim uppercase tracking-wider block text-left">
                      Kata Sandi Baru
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                      <input
                        type={showNewPass ? 'text' : 'password'}
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Minimal 6 karakter"
                        disabled={isUpdatingPassword}
                        className="w-full bg-bg-nav border border-border-main rounded-xl py-2.5 pl-10 pr-11 text-xs text-white placeholder:text-text-muted/60 focus:outline-none focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/30 transition-all disabled:opacity-50"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPass(!showNewPass)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-white p-1"
                      >
                        {showNewPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-text-dim uppercase tracking-wider block text-left">
                      Konfirmasi Kata Sandi Baru
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                      <input
                        type={showConfirmPass ? 'text' : 'password'}
                        required
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        placeholder="Ulangi kata sandi baru"
                        disabled={isUpdatingPassword}
                        className="w-full bg-bg-nav border border-border-main rounded-xl py-2.5 pl-10 pr-11 text-xs text-white placeholder:text-text-muted/60 focus:outline-none focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/30 transition-all disabled:opacity-50"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPass(!showConfirmPass)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-white p-1"
                      >
                        {showConfirmPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-3">
                    <button
                      type="button"
                      disabled={isUpdatingPassword}
                      onClick={() => setShowPasswordModal(false)}
                      className="px-4 py-2 text-xs font-medium text-text-dim hover:text-white rounded-lg hover:bg-white/5 transition-colors disabled:opacity-50"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={isUpdatingPassword || newPassword.length < 6}
                      className="px-4 py-2 text-xs font-medium bg-brand-blue hover:bg-brand-blue/90 text-white rounded-lg transition-all flex items-center gap-2 shadow-lg shadow-brand-blue/20 disabled:opacity-50"
                    >
                      {isUpdatingPassword ? (
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <KeyRound className="w-3.5 h-3.5" />
                      )}
                      Simpan Sandi Baru
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Logout Confirmation Modal */}
      <AnimatePresence>
        {showLogoutModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.15 }}
              className="w-full max-w-sm bg-bg-panel border border-border-main rounded-2xl p-6 shadow-2xl space-y-5"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 shrink-0">
                  <LogOut className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Konfirmasi Keluar</h3>
                  <p className="text-xs text-text-muted">Apakah Anda yakin ingin keluar?</p>
                </div>
              </div>

              <p className="text-xs text-text-dim leading-relaxed">
                Sesi Anda di perangkat ini akan diakhiri. Semua catatan progres dan riwayat latihan Anda tetap tersimpan dengan aman di cloud.
              </p>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  disabled={isLoggingOut}
                  onClick={() => setShowLogoutModal(false)}
                  className="px-4 py-2 text-xs font-medium text-text-dim hover:text-white rounded-lg hover:bg-white/5 transition-colors disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={isLoggingOut}
                  onClick={handleConfirmLogout}
                  className="px-4 py-2 text-xs font-medium bg-red-500/90 hover:bg-red-500 text-white rounded-lg transition-all flex items-center gap-2 shadow-lg shadow-red-500/20 disabled:opacity-50"
                >
                  {isLoggingOut ? (
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <LogOut className="w-3.5 h-3.5" />
                  )}
                  Ya, Keluar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
