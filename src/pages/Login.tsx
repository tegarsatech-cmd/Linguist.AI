import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  LogIn,
  UserPlus,
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  KeyRound,
  ArrowLeft,
  Sparkles,
  Clock,
  Compass,
  Key,
} from "lucide-react";
import { useAuth, translateAuthError } from "../contexts/AuthContext";
import { getClientIp, getDeviceFingerprint } from "../lib/securityStore";

type AuthMode = "login" | "register" | "forgot" | "reset" | "verify";

const STORAGE_REMEMBERED_EMAIL = "linguist_saved_email";

export default function Login() {
  const {
    login,
    register,
    verifySignupOtp,
    resendConfirmationEmail,
    resetPassword,
    verifyResetCode,
    setSessionFromUrl,
    updatePassword,
    loginAsGuest,
  } = useAuth();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // OTP Verification States
  const [otpCode, setOtpCode] = useState("");
  const [isVerifyingManual, setIsVerifyingManual] = useState(false);
  const [isResendingEmail, setIsResendingEmail] = useState(false);

  // Rate Limiting States (Login berdasarkan IP / Perangkat)
  const [clientIp, setClientIp] = useState("127.0.0.1");
  const [failCount, setFailCount] = useState(0);
  const [lockoutRemaining, setLockoutRemaining] = useState(0); // seconds

  // Deteksi tautan reset kata sandi atau verifikasi email dari URL Supabase
  useEffect(() => {
    const hash = window.location.hash || "";
    const search = window.location.search || "";
    if (hash.includes("type=recovery") || search.includes("type=recovery")) {
      setMode("reset");
      setSuccess("Tautan pemulihan akun diverifikasi. Silakan masukkan kata sandi baru Anda di bawah ini.");
    } else if (hash.includes("type=signup") || search.includes("type=signup") || search.includes("type=email")) {
      setSuccess("Akun email berhasil diverifikasi! Anda sekarang dapat langsung masuk.");
      setMode("login");
    } else if (search.includes("error_description=")) {
      const params = new URLSearchParams(search);
      const desc = params.get("error_description");
      if (desc) {
        setError(translateAuthError(desc));
      }
    }
  }, []);

  // Initialize client IP, remembered email, and IP-based lockout state
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_REMEMBERED_EMAIL);
    if (saved) {
      setEmail(saved);
      setRememberMe(true);
    }

    getClientIp().then((ip) => {
      const sanitizedIp = ip || "127.0.0.1";
      setClientIp(sanitizedIp);
      const ipFailKey = `linguist_login_fails_${sanitizedIp.replace(/[^a-zA-Z0-9_]/g, "_")}`;
      const ipLockoutKey = `linguist_login_lockout_${sanitizedIp.replace(/[^a-zA-Z0-9_]/g, "_")}`;

      const savedCount = parseInt(localStorage.getItem(ipFailKey) || "0", 10);
      setFailCount(savedCount);

      const lockoutUntil = parseInt(localStorage.getItem(ipLockoutKey) || "0", 10);
      const now = Date.now();
      if (lockoutUntil > now) {
        setLockoutRemaining(Math.ceil((lockoutUntil - now) / 1000));
      }
    });
  }, []);

  // Timer interval for login lockout countdown
  useEffect(() => {
    if (lockoutRemaining <= 0) return;

    const timer = setInterval(() => {
      setLockoutRemaining((prev) => {
        if (prev <= 1) {
          const ipLockoutKey = `linguist_login_lockout_${clientIp.replace(/[^a-zA-Z0-9_]/g, "_")}`;
          localStorage.removeItem(ipLockoutKey);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [lockoutRemaining, clientIp]);

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setError("");
    setSuccess("");
    setPassword("");
    setConfirmPassword("");
    setOtpCode("");
  };

  const handleRateLimitFailure = () => {
    const newCount = failCount + 1;
    setFailCount(newCount);
    const ipFailKey = `linguist_login_fails_${clientIp.replace(/[^a-zA-Z0-9_]/g, "_")}`;
    const ipLockoutKey = `linguist_login_lockout_${clientIp.replace(/[^a-zA-Z0-9_]/g, "_")}`;
    const ipLevelKey = `linguist_login_level_${clientIp.replace(/[^a-zA-Z0-9_]/g, "_")}`;

    localStorage.setItem(ipFailKey, newCount.toString());

    if (newCount >= 3) {
      const currentLevel = parseInt(localStorage.getItem(ipLevelKey) || "1", 10);
      const lockSeconds = currentLevel === 1 ? 60 : currentLevel === 2 ? 120 : 300;
      const lockoutTimestamp = Date.now() + lockSeconds * 1000;

      localStorage.setItem(ipLockoutKey, lockoutTimestamp.toString());
      localStorage.setItem(ipLevelKey, (currentLevel + 1).toString());
      setLockoutRemaining(lockSeconds);
      setError(
        `Terlalu banyak percobaan salah (${newCount}x) dari IP ${clientIp}. Akses masuk dibatasi sementara demi keamanan. Coba lagi dalam ${lockSeconds} detik.`
      );
    } else {
      const remainingAttempts = 3 - newCount;
      setError(
        `Email atau kata sandi salah. Percobaan ke-${newCount} dari 3 (IP: ${clientIp}). Sisa ${remainingAttempts} kali percobaan sebelum dibatasi 1 menit.`
      );
    }
  };

  const clearRateLimit = () => {
    setFailCount(0);
    setLockoutRemaining(0);
    const ipFailKey = `linguist_login_fails_${clientIp.replace(/[^a-zA-Z0-9_]/g, "_")}`;
    const ipLockoutKey = `linguist_login_lockout_${clientIp.replace(/[^a-zA-Z0-9_]/g, "_")}`;
    const ipLevelKey = `linguist_login_level_${clientIp.replace(/[^a-zA-Z0-9_]/g, "_")}`;
    localStorage.removeItem(ipFailKey);
    localStorage.removeItem(ipLockoutKey);
    localStorage.removeItem(ipLevelKey);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutRemaining > 0 && mode === "login") return;

    setError("");
    setSuccess("");

    // Mode: Reset Kata Sandi Baru
    if (mode === "reset") {
      if (password.length < 6) {
        setError("Kata sandi baru minimal harus terdiri dari 6 karakter.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Konfirmasi kata sandi baru tidak cocok.");
        return;
      }
      setLoading(true);
      try {
        await updatePassword(password);
        setSuccess("Kata sandi berhasil diperbarui! Silakan masuk dengan kata sandi baru Anda.");
        setMode("login");
        setPassword("");
        setConfirmPassword("");
        window.history.replaceState(null, "", window.location.pathname);
      } catch (err: any) {
        setError(translateAuthError(err));
      } finally {
        setLoading(false);
      }
      return;
    }

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError("Silakan masukkan alamat email.");
      return;
    }

    if (rememberMe) {
      localStorage.setItem(STORAGE_REMEMBERED_EMAIL, cleanEmail);
    } else {
      localStorage.removeItem(STORAGE_REMEMBERED_EMAIL);
    }

    if (mode === "forgot") {
      setLoading(true);
      try {
        await resetPassword(cleanEmail);
        setSuccess(
          "Kode reset kata sandi telah dikirim ke email Anda! Silakan periksa inbox/spam Gmail Anda dan masukkan kode 6-digit di formulir bawah."
        );
      } catch (err: any) {
        setError(translateAuthError(err));
      } finally {
        setLoading(false);
      }
      return;
    }

    if (mode === "register") {
      if (password.length < 6) {
        setError("Kata sandi minimal harus terdiri dari 6 karakter.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Konfirmasi kata sandi tidak cocok.");
        return;
      }

      setLoading(true);
      try {
        const res = await register(cleanEmail, password);
        if (res?.requiresConfirmation) {
          setMode("verify");
          setSuccess(
            `Pendaftaran berhasil! Kode verifikasi OTP telah dikirim ke ${cleanEmail}. Masukkan 6-digit kode OTP di bawah.`
          );
        } else {
          setSuccess("Pendaftaran berhasil dan akun Anda langsung aktif!");
        }
        setPassword("");
        setConfirmPassword("");
      } catch (err: any) {
        setError(translateAuthError(err));
      } finally {
        setLoading(false);
      }
      return;
    }

    // Mode: Login
    if (!password) {
      setError("Silakan masukkan kata sandi.");
      return;
    }

    setLoading(true);
    try {
      await login(cleanEmail, password);
      clearRateLimit();
    } catch (err: any) {
      const errorMsg = err?.message || "";
      if (errorMsg.includes("Invalid login credentials") || errorMsg.includes("invalid_credentials")) {
        handleRateLimitFailure();
      } else if (errorMsg.includes("Email not confirmed") || errorMsg.includes("email_not_confirmed")) {
        setError(
          "Email Anda belum dikonfirmasi. Silakan buka menu verifikasi untuk memasukkan 6-digit kode OTP email Anda."
        );
      } else {
        setError(translateAuthError(err));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError("Silakan masukkan alamat email Anda terlebih dahulu.");
      return;
    }

    if (!otpCode.trim()) {
      setError("Silakan masukkan kode OTP 6-digit dari email Anda.");
      return;
    }

    setIsVerifyingManual(true);
    try {
      await verifySignupOtp(cleanEmail, otpCode.trim());
      setSuccess("Email berhasil diverifikasi! Selamat datang di Linguist.AI.");
      setOtpCode("");
    } catch (err: any) {
      setError(translateAuthError(err));
    } finally {
      setIsVerifyingManual(false);
    }
  };

  const handleResendSignupEmail = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError("Silakan masukkan alamat email Anda terlebih dahulu.");
      return;
    }

    setIsResendingEmail(true);
    setError("");
    setSuccess("");
    try {
      await resendConfirmationEmail(cleanEmail);
      setSuccess(`Kode OTP konfirmasi baru telah dikirim ke ${cleanEmail}. Silakan periksa inbox atau spam Gmail Anda.`);
    } catch (err: any) {
      setError(translateAuthError(err));
    } finally {
      setIsResendingEmail(false);
    }
  };

  const handleManualVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError("Silakan masukkan alamat email Anda di atas.");
      return;
    }

    if (!otpCode.trim()) {
      setError("Silakan masukkan kode OTP 6-digit dari email Anda.");
      return;
    }

    setIsVerifyingManual(true);
    try {
      await verifyResetCode(cleanEmail, otpCode.trim());
      setMode("reset");
      setSuccess("Verifikasi OTP berhasil! Silakan masukkan kata sandi baru Anda di bawah ini.");
      setOtpCode("");
    } catch (err: any) {
      setError(translateAuthError(err));
    } finally {
      setIsVerifyingManual(false);
    }
  };

  const isLocked = lockoutRemaining > 0;
  const isPasswordMismatch = (mode === "register" || mode === "reset") && confirmPassword && password !== confirmPassword;
  const isPasswordValid = (mode === "login" || mode === "forgot") ? true : password.length >= 6;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-bg-deep relative overflow-hidden selection:bg-brand-blue/30">
      {/* Dynamic Background Glows */}
      <div className="absolute top-1/6 right-1/4 w-[500px] h-[500px] bg-brand-blue/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-1/6 left-1/4 w-[450px] h-[450px] bg-brand-purple/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(5,6,8,0.7)_100%)] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="w-full max-w-md bg-bg-panel/90 backdrop-blur-xl border border-border-main rounded-2xl p-8 sm:p-10 shadow-2xl relative z-10"
      >
        {/* Header Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-blue/10 border border-brand-blue/20 text-brand-blue text-[11px] font-mono mb-3">
            <Sparkles className="w-3 h-3" />
            <span>AI English Language Laboratory</span>
          </div>
          <h1 className="text-3xl font-serif italic text-white tracking-tight">
            Linguist.AI
          </h1>
          <p className="text-xs text-text-muted mt-1.5 font-medium tracking-wide">
            {mode === "login" && "Masuk dengan email dan kata sandi Anda"}
            {mode === "register" && "Buat akun baru untuk mulai latihan dan evaluasi AI"}
            {mode === "verify" && "Konfirmasi pendaftaran email Anda untuk mengaktifkan akun"}
            {mode === "forgot" && "Atur ulang kata sandi akun Anda"}
            {mode === "reset" && "Buat kata sandi baru untuk akun Anda"}
          </p>
        </div>

        {/* Tab Switcher (Login / Register) */}
        {mode !== "forgot" && mode !== "reset" && mode !== "verify" ? (
          <div className="flex bg-bg-nav p-1 rounded-xl border border-border-main mb-6">
            <button
              type="button"
              onClick={() => switchMode("login")}
              className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-2 ${
                mode === "login"
                  ? "bg-white text-bg-deep shadow-md font-semibold"
                  : "text-text-muted hover:text-white"
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              Masuk
            </button>
            <button
              type="button"
              onClick={() => switchMode("register")}
              className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-2 ${
                mode === "register"
                  ? "bg-white text-bg-deep shadow-md font-semibold"
                  : "text-text-muted hover:text-white"
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              Daftar Akun
            </button>
          </div>
        ) : (
          <div className="mb-6">
            <button
              type="button"
              onClick={() => switchMode("login")}
              className="inline-flex items-center gap-2 text-xs text-brand-blue hover:text-brand-blue/80 transition-colors font-medium"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Kembali ke halaman masuk
            </button>
          </div>
        )}

        {/* Lockout Banner (Rate Limiting Login berdasarkan IP) */}
        {isLocked && mode === "login" && (
          <div className="mb-5 flex items-center gap-3 p-4 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs">
            <Clock className="w-5 h-5 text-amber-400 shrink-0 animate-pulse" />
            <div>
              <p className="font-semibold text-amber-200">Akses Masuk Dibatasi ({clientIp})</p>
              <p className="text-amber-300/90 mt-0.5">
                Salah kata sandi 3x berturut-turut pada alamat IP ini. Tunggu{" "}
                <span className="font-mono font-bold text-white bg-amber-500/30 px-1.5 py-0.5 rounded">
                  {lockoutRemaining} detik
                </span>{" "}
                sebelum mencoba lagi.
              </p>
            </div>
          </div>
        )}

        {/* Alerts */}
        <AnimatePresence mode="wait">
          {error && !isLocked && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-5 flex items-start gap-3 p-3.5 rounded-xl bg-red-500/10 border border-red-500/25 text-red-300 text-xs leading-relaxed"
            >
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">{error}</div>
            </motion.div>
          )}

          {success && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-5 flex items-start gap-3 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs leading-relaxed"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1">{success}</div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Form Verifikasi Email Pendaftaran */}
        {mode === "verify" && (
          <div className="space-y-4 text-left">
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-text-dim uppercase tracking-wider block text-left">
                Alamat Email Terdaftar
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@email.com"
                  disabled={isVerifyingManual || isResendingEmail}
                  className="w-full bg-bg-nav border border-border-main rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-text-muted/60 focus:outline-none focus:border-brand-blue font-sans"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-text-dim uppercase tracking-wider block text-left">
                Kode 6-Digit dari Email (OTP)
              </label>
              <input
                type="text"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                placeholder="Contoh: 123456"
                disabled={isVerifyingManual || isResendingEmail}
                className="w-full bg-bg-nav border border-border-main rounded-xl py-2.5 px-3.5 text-sm text-white placeholder:text-text-muted/60 focus:outline-none focus:border-brand-blue font-mono text-center tracking-widest text-lg"
              />
              <p className="text-[10px] text-text-muted mt-1">
                Silakan periksa kotak masuk atau spam Gmail Anda untuk melihat 6-digit kode verifikasi OTP.
              </p>
            </div>

            <button
              type="button"
              disabled={isVerifyingManual || !otpCode.trim()}
              onClick={handleVerifySignup}
              className="w-full mt-3 bg-brand-blue hover:bg-brand-blue/90 disabled:opacity-50 border border-brand-blue/50 text-white font-medium py-3 px-4 rounded-xl text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2.5 shadow-lg shadow-brand-blue/10 active:scale-[0.99]"
            >
              {isVerifyingManual ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Verifikasi & Aktifkan Akun</span>
                </>
              )}
            </button>

            <button
              type="button"
              disabled={isResendingEmail}
              onClick={handleResendSignupEmail}
              className="w-full bg-white/5 hover:bg-white/10 disabled:opacity-40 border border-border-main text-text-dim hover:text-white font-medium py-2.5 px-3 rounded-xl text-xs transition-all flex items-center justify-center gap-2"
            >
              {isResendingEmail ? (
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Mail className="w-3.5 h-3.5 text-brand-blue" />
                  <span>Kirim Ulang Email Konfirmasi</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Main Form (Login / Register / Forgot / Reset) */}
        {mode !== "verify" && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Input (Hidden in 'reset' mode) */}
            {mode !== "reset" && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-text-dim uppercase tracking-wider block text-left">
                  Alamat Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (error) setError("");
                    }}
                    placeholder="nama@email.com"
                    disabled={loading || (mode === "login" && isLocked)}
                    className="w-full bg-bg-nav border border-border-main rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-text-muted/60 focus:outline-none focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/30 transition-all disabled:opacity-50"
                  />
                </div>
              </div>
            )}

            {/* Password Input (Hidden in 'forgot' mode) */}
            {mode !== "forgot" && (
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-[11px] font-medium text-text-dim uppercase tracking-wider block">
                    {mode === "reset" ? "Kata Sandi Baru" : "Kata Sandi"}
                  </label>
                  {mode === "login" && (
                    <button
                      type="button"
                      onClick={() => switchMode("forgot")}
                      className="text-[11px] text-brand-blue hover:text-brand-blue/80 hover:underline transition-colors"
                    >
                      Lupa kata sandi?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError("");
                    }}
                    placeholder="••••••••"
                    disabled={loading || (mode === "login" && isLocked)}
                    className="w-full bg-bg-nav border border-border-main rounded-xl py-2.5 pl-10 pr-11 text-sm text-white placeholder:text-text-muted/60 focus:outline-none focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/30 transition-all disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-white transition-colors p-1"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {(mode === "register" || mode === "reset") && (
                  <div className="flex items-center gap-2 pt-1 text-[11px]">
                    <span
                      className={`${
                        password.length >= 6 ? "text-emerald-400" : "text-text-muted"
                      }`}
                    >
                      • Minimal 6 karakter
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Confirm Password (only in 'register' or 'reset' mode) */}
            {(mode === "register" || mode === "reset") && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-text-dim uppercase tracking-wider block text-left">
                  {mode === "reset" ? "Konfirmasi Kata Sandi Baru" : "Konfirmasi Kata Sandi"}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    required
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (error) setError("");
                    }}
                    placeholder="Ulangi kata sandi"
                    disabled={loading}
                    className={`w-full bg-bg-nav border rounded-xl py-2.5 pl-10 pr-11 text-sm text-white placeholder:text-text-muted/60 focus:outline-none focus:ring-1 transition-all disabled:opacity-50 ${
                      isPasswordMismatch
                        ? "border-red-500/50 focus:border-red-500 focus:ring-red-500/30"
                        : "border-border-main focus:border-brand-blue focus:ring-brand-blue/30"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={showConfirmPassword ? "Sembunyikan password" : "Tampilkan password"}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-white transition-colors p-1"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {isPasswordMismatch && (
                  <p className="text-[11px] text-red-400 text-left">Kata sandi tidak cocok</p>
                )}
              </div>
            )}

            {/* Remember Me Checkbox & Verifikasi Shortcut (only in 'login' mode) */}
            {mode === "login" && (
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2">
                  <input
                    id="rememberMe"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-border-main bg-bg-nav text-brand-blue focus:ring-0 focus:ring-offset-0 cursor-pointer accent-brand-blue"
                  />
                  <label
                    htmlFor="rememberMe"
                    className="text-xs text-text-muted hover:text-text-dim cursor-pointer select-none"
                  >
                    Ingat email saya
                  </label>
                </div>

                <button
                  type="button"
                  onClick={() => switchMode("verify")}
                  className="text-[11px] text-brand-blue hover:text-brand-blue/80 hover:underline transition-colors"
                >
                  Verifikasi email
                </button>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={
                loading ||
                (mode === "login" && isLocked) ||
                !isPasswordValid ||
                isPasswordMismatch
              }
              className="w-full mt-3 bg-brand-blue hover:bg-brand-blue/90 disabled:opacity-50 disabled:cursor-not-allowed border border-brand-blue/50 text-white font-medium py-3 px-4 rounded-xl text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2.5 shadow-lg shadow-brand-blue/10 active:scale-[0.99]"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : mode === "login" ? (
                <>
                  <LogIn className="w-4 h-4" />
                  {isLocked ? `Dibatasi (${lockoutRemaining}s)` : "Masuk Sekarang"}
                </>
              ) : mode === "register" ? (
                <>
                  <UserPlus className="w-4 h-4" />
                  Buat Akun Baru
                </>
              ) : mode === "reset" ? (
                <>
                  <KeyRound className="w-4 h-4" />
                  Simpan Kata Sandi Baru
                </>
              ) : (
                <>
                  <KeyRound className="w-4 h-4" />
                  Kirim Kode Reset OTP
                </>
              )}
            </button>
          </form>
        )}

        {/* Verifikasi Kode OTP Reset Sandi */}
        {mode === "forgot" && (
          <div className="mt-6 pt-5 border-t border-border-main/80 space-y-3.5 text-left">
            <div className="flex items-center gap-2 text-white text-xs font-semibold">
              <Key className="w-4 h-4 text-brand-blue" />
              <span>Masukkan Kode OTP dari Email</span>
            </div>
            <p className="text-[11px] text-text-muted leading-relaxed">
              Masukkan 6-digit kode verifikasi OTP yang masuk ke kotak masuk atau spam Gmail Anda di bawah ini:
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-mono uppercase text-text-dim block mb-1">
                  Kode 6-Digit OTP dari Email
                </label>
                <input
                  type="text"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="Contoh: 849201"
                  disabled={isVerifyingManual}
                  className="w-full bg-bg-nav border border-border-main rounded-xl py-2 px-3 text-xs text-white placeholder:text-text-muted/60 focus:outline-none focus:border-brand-blue font-mono"
                />
              </div>

              

              <button
                type="button"
                disabled={isVerifyingManual || !otpCode.trim()}
                onClick={handleManualVerification}
                className="w-full bg-white/10 hover:bg-white/15 disabled:opacity-40 border border-white/15 text-white font-medium py-2.5 px-3 rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-sm"
              >
                {isVerifyingManual ? (
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Verifikasi OTP & Buat Kata Sandi Baru</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Mode Pengunjung (Tanpa Registrasi) */}
        {mode !== "reset" && (
          <div className="mt-6 pt-6 border-t border-border-main/80">
            <div className="relative mb-4 text-center">
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-bg-panel px-3 text-[10px] text-text-muted font-mono tracking-widest">
                  Atau Akses Cepat
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => loginAsGuest()}
              className="w-full py-2.5 px-4 rounded-xl border border-brand-purple/30 hover:border-brand-purple/60 bg-brand-purple/10 hover:bg-brand-purple/20 text-white font-medium text-xs transition-all flex items-center justify-center gap-2.5 shadow-sm group active:scale-[0.99]"
            >
              <Compass className="w-4 h-4 text-brand-purple group-hover:rotate-45 transition-transform" />
              <span>Masuk sebagai Pengunjung (Mode Tamu)</span>
            </button>
            <p className="text-[10px] text-text-muted text-center mt-2 leading-relaxed">
              Langsung coba semua modul AI dan laboratorium tanpa perlu daftar akun.
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-border-main/80 text-center text-[10px] text-text-muted tracking-wider">
          <span>Linguist.AI &copy; 2026</span>
        </div>
      </motion.div>
    </div>
  );
}
