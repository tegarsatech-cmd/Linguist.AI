import React, { useState } from "react";
import { motion } from "motion/react";
import { LogIn, UserPlus, Mail, Lock, Eye, EyeOff } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

export default function Login() {
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      if (isRegister) {
        if (password !== confirmPassword) {
          setError("Password tidak cocok");
          return;
        }
        await register(email, password);
        setSuccess("Pendaftaran berhasil. Silakan cek email Anda untuk konfirmasi.");
        setEmail("");
        setPassword("");
        setConfirmPassword("");
      } else {
        await login(email, password);
      }
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      await login();
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-bg-deep relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-1/4 right-1/4 w-[500px] h-[500px] bg-brand-blue/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-brand-purple/5 rounded-full blur-[100px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="sophisticated-card w-full max-w-sm p-12 text-center relative z-10"
      >
        <div className="mb-10">
          <h1 className="text-3xl font-serif italic text-white tracking-tight">
            Linguist.AI
          </h1>
          <p className="academic-label mt-2">Keunggulan Akademik</p>
        </div>

        <div className="space-y-8">
          <p className="text-xs text-text-dim leading-relaxed tracking-wide">
            {isRegister
              ? "Daftar akun baru untuk mengakses lingkungan Riset AI."
              : "Masuk dengan akun Anda untuk mengakses lingkungan Riset AI."}
          </p>

          {/* Toggle Login/Register */}
          <div className="flex bg-white/5 rounded-lg p-1">
            <button
              onClick={() => {
                setIsRegister(false);
                setError("");
                setSuccess("");
              }}
              className={`flex-1 py-2 px-4 rounded-md text-xs font-medium transition-all ${
                !isRegister
                  ? "bg-white text-bg-deep"
                  : "text-text-dim hover:text-white"
              }`}
            >
              Masuk
            </button>
            <button
              onClick={() => {
                setIsRegister(true);
                setError("");
                setSuccess("");
              }}
              className={`flex-1 py-2 px-4 rounded-md text-xs font-medium transition-all ${
                isRegister
                  ? "bg-white text-bg-deep"
                  : "text-text-dim hover:text-white"
              }`}
            >
              Daftar
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-4">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  className="w-full bg-white/5 border border-border-main rounded-lg py-3 pl-10 pr-4 text-sm placeholder-text-muted focus:outline-none focus:border-brand-blue transition-colors"
                  required
                />
              </div>

              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full bg-white/5 border border-border-main rounded-lg py-3 pl-10 pr-12 text-sm placeholder-text-muted focus:outline-none focus:border-brand-blue transition-colors"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-text-muted hover:text-white transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>

              {isRegister && (
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Konfirmasi Password"
                    className="w-full bg-white/5 border border-border-main rounded-lg py-3 pl-10 pr-4 text-sm placeholder-text-muted focus:outline-none focus:border-brand-blue transition-colors"
                    required
                  />
                </div>
              )}
            </div>

            {error && (
              <div className="text-red-400 text-xs text-center bg-red-500/10 border border-red-500/20 rounded-lg py-2">
                {error}
              </div>
            )}

            {success && (
              <div className="text-emerald-300 text-xs text-center bg-emerald-500/10 border border-emerald-500/20 rounded-lg py-2">
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-blue hover:bg-brand-blue/80 disabled:opacity-50 disabled:cursor-not-allowed border border-brand-blue py-3 rounded-lg text-sm font-medium uppercase tracking-widest transition-all flex items-center justify-center gap-3 active:scale-95"
            >
              {loading ? (
                <div className="w-4 h-4 border border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {isRegister ? (
                    <UserPlus className="w-4 h-4" />
                  ) : (
                    <LogIn className="w-4 h-4" />
                  )}
                  {isRegister ? "Daftar" : "Masuk"}
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border-main"></div>
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-2 bg-bg-deep text-text-muted">atau</span>
            </div>
          </div>

          {/* Google Login */}
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full bg-[#111318] border border-border-main py-3 rounded text-xs font-medium uppercase tracking-widest hover:bg-white/[0.03] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-3 active:scale-95"
          >
            <div className="w-4 h-4 bg-white rounded-full flex items-center justify-center overflow-hidden grayscale">
              <img
                src="https://www.google.com/favicon.ico"
                alt="G"
                className="w-2.5 h-2.5"
              />
            </div>
            Masuk dengan Google
          </button>
        </div>

        <footer className="mt-16 pt-8 border-t border-border-main text-[9px] uppercase tracking-[0.3em] text-text-muted">
          Divisi Bahasa AI &copy; 2026
        </footer>
      </motion.div>
    </div>
  );
}
