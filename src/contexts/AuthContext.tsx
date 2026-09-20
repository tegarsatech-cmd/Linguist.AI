import React, { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<{ requiresConfirmation: boolean; user: User | null }>;
  verifySignupOtp: (email: string, token: string) => Promise<void>;
  resendConfirmationEmail: (email: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  verifyResetCode: (email: string, token: string) => Promise<void>;
  setSessionFromUrl: (rawUrlOrHash: string) => Promise<{ type?: string; user: User | null }>;
  updatePassword: (newPassword: string) => Promise<void>;
  loginAsGuest: () => void;
  logout: () => Promise<void>;
}

export function translateAuthError(error: any): string {
  if (!error) return "Terjadi kesalahan. Silakan coba lagi.";
  const msg = typeof error === "string" ? error : error.message || "";

  if (/invalid login credentials|invalid_credentials/i.test(msg)) {
    return "Email atau kata sandi tidak valid. Periksa kembali akun Anda.";
  }
  if (/user already registered/i.test(msg)) {
    return "Email ini sudah terdaftar. Silakan langsung masuk.";
  }
  if (/password should be at least 6 characters/i.test(msg)) {
    return "Kata sandi minimal harus terdiri dari 6 karakter.";
  }
  if (/email not confirmed|email_not_confirmed/i.test(msg)) {
    return "Email belum dikonfirmasi. Periksa kotak masuk atau spam email Anda untuk mengaktifkan akun.";
  }
  if (/signup requires a valid password/i.test(msg)) {
    return "Silakan masukkan kata sandi yang valid.";
  }
  if (/network|failed to fetch/i.test(msg)) {
    return "Gagal terhubung ke server. Periksa koneksi internet Anda.";
  }
  if (/token.*expired|invalid token|otp.*expired|token is invalid|recovery token|link is invalid/i.test(msg)) {
    return "Kode verifikasi atau tautan telah kedaluwarsa atau tidak valid. Silakan periksa kembali atau minta kode/tautan baru.";
  }
  if (/user not found/i.test(msg)) {
    return "Akun dengan alamat email ini tidak ditemukan.";
  }
  return msg || "Terjadi kesalahan saat memproses permintaan.";
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const GUEST_STORAGE_KEY = "linguist_guest_session";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    // Safety timeout: loading tidak boleh macet lebih dari 1.2 detik
    const safetyTimer = setTimeout(() => {
      if (isMounted) setLoading(false);
    }, 1200);

    // Ambil sesi awal dengan proteksi timeout
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (!isMounted) return;
        if (session?.user) {
          setUser(session.user);
        } else {
          // Periksa apakah ada sesi tamu aktif di localStorage
          const savedGuest = localStorage.getItem(GUEST_STORAGE_KEY);
          if (savedGuest) {
            try {
              setUser(JSON.parse(savedGuest));
            } catch {
              localStorage.removeItem(GUEST_STORAGE_KEY);
            }
          }
        }
        setLoading(false);
      })
      .catch((err) => {
        console.warn("Notice: Gagal memuat sesi Supabase awal:", err?.message);
        if (isMounted) {
          const savedGuest = localStorage.getItem(GUEST_STORAGE_KEY);
          if (savedGuest) {
            try {
              setUser(JSON.parse(savedGuest));
            } catch {
              localStorage.removeItem(GUEST_STORAGE_KEY);
            }
          }
          setLoading(false);
        }
      })
      .finally(() => {
        clearTimeout(safetyTimer);
      });

    // Pantau perubahan status autentikasi
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;
      if (session?.user) {
        localStorage.removeItem(GUEST_STORAGE_KEY);
        setUser(session.user);
      } else {
        const savedGuest = localStorage.getItem(GUEST_STORAGE_KEY);
        if (savedGuest) {
          try {
            setUser(JSON.parse(savedGuest));
          } catch {
            setUser(null);
          }
        } else {
          setUser(null);
        }
      }
      setLoading(false);

      if (event === "SIGNED_IN" && session?.user) {
        syncUserProfile(session.user).catch(() => {});
      }
    });

    // Otomatis proses token verifikasi / OTP / code jika dibuka dari tautan email
    const handleUrlAuth = async () => {
      try {
        const search = window.location.search || "";
        const hash = window.location.hash || "";

        // 1. Tangani token_hash dari tautan verifikasi Supabase
        if (search.includes("token_hash=")) {
          const params = new URLSearchParams(search);
          const token_hash = params.get("token_hash");
          const type = (params.get("type") || "signup") as any;
          if (token_hash) {
            const { data, error } = await supabase.auth.verifyOtp({
              token_hash,
              type,
            });
            if (!error && data?.user && isMounted) {
              setUser(data.user);
              window.history.replaceState(null, "", window.location.pathname);
              return;
            }
          }
        }

        // 2. Tangani PKCE authorization code (?code=...)
        if (search.includes("code=")) {
          const params = new URLSearchParams(search);
          const code = params.get("code");
          if (code) {
            const { data, error } = await supabase.auth.exchangeCodeForSession(code);
            if (!error && data?.user && isMounted) {
              setUser(data.user);
              window.history.replaceState(null, "", window.location.pathname);
              return;
            }
          }
        }

        // 3. Tangani access_token di fragment hash (#access_token=...)
        if (hash.includes("access_token=")) {
          const params = new URLSearchParams(hash.replace(/^#/, ""));
          const access_token = params.get("access_token");
          const refresh_token = params.get("refresh_token") || "";
          if (access_token) {
            const { data, error } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            });
            if (!error && data?.user && isMounted) {
              setUser(data.user);
              if (!hash.includes("type=recovery")) {
                window.history.replaceState(null, "", window.location.pathname);
              }
            }
          }
        }
      } catch (e) {
        console.warn("Notice: Gagal memproses tautan autentikasi otomatis:", e);
      }
    };

    handleUrlAuth();

    return () => {
      isMounted = false;
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, []);

  const syncUserProfile = async (user: User) => {
    try {
      await supabase.from("users").upsert({
        id: user.id,
        email: user.email,
        display_name: user.user_metadata?.full_name || user.user_metadata?.name,
        photo_url: user.user_metadata?.avatar_url,
        created_at: new Date().toISOString(),
      });
    } catch {
      // ignore
    }
  };

  const login = async (email: string, password: string) => {
    try {
      localStorage.removeItem(GUEST_STORAGE_KEY);
      const loginPromise = supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Koneksi login timeout. Periksa internet Anda.")), 15000)
      );

      const { error } = await Promise.race([loginPromise, timeoutPromise]);
      if (error) throw error;
    } catch (error) {
      console.error("Login Error:", error);
      throw error;
    }
  };

  const register = async (email: string, password: string) => {
    try {
      localStorage.removeItem(GUEST_STORAGE_KEY);
      const regPromise = supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Koneksi pendaftaran timeout. Silakan coba lagi.")), 15000)
      );

      const { data, error } = await Promise.race([regPromise, timeoutPromise]);
      if (error) {
        // Jika pembatasan email sementara dari penyedia layanan terjadi, tetap arahkan pengguna ke verifikasi
        if (/rate limit|over_email_send_rate_limit/i.test(error.message || "")) {
          return { requiresConfirmation: true, user: null };
        }
        throw error;
      }

      if (data?.session?.user) {
        setUser(data.session.user);
        return { requiresConfirmation: false, user: data.session.user };
      }

      return {
        requiresConfirmation: true,
        user: data?.user || null,
      };
    } catch (error: any) {
      if (/rate limit|over_email_send_rate_limit/i.test(error?.message || "")) {
        return { requiresConfirmation: true, user: null };
      }
      console.error("Register Error:", error);
      throw error;
    }
  };

  const verifySignupOtp = async (email: string, token: string) => {
    const cleanEmail = email.trim();
    const cleanToken = token.trim();
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: cleanToken,
        type: 'signup',
      });
      if (error) {
        // Fallback: coba type 'email' jika 'signup' gagal
        const retry = await supabase.auth.verifyOtp({
          email: cleanEmail,
          token: cleanToken,
          type: 'email',
        });
        if (retry.error) throw error;
        if (retry.data?.user) {
          setUser(retry.data.user);
        }
        return;
      }
      if (data?.user) {
        setUser(data.user);
      }
    } catch (error) {
      console.error("Verify Signup OTP Error:", error);
      throw error;
    }
  };

  const resendConfirmationEmail = async (email: string) => {
    const cleanEmail = email.trim();
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: cleanEmail,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) throw error;
    } catch (error) {
      console.error("Resend Confirmation Error:", error);
      throw error;
    }
  };

  const resetPassword = async (email: string) => {
    try {
      const redirectUrl = `${window.location.origin}/login`;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: redirectUrl,
      });
      if (error) throw error;
    } catch (error) {
      console.error("Reset Password Error:", error);
      throw error;
    }
  };

  const verifyResetCode = async (email: string, token: string) => {
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: token.trim(),
        type: 'recovery',
      });
      if (error) throw error;
      if (data?.user) {
        setUser(data.user);
      }
    } catch (error) {
      console.error("Verify OTP Error:", error);
      throw error;
    }
  };

  const setSessionFromUrl = async (rawUrlOrHash: string) => {
    try {
      let text = rawUrlOrHash.trim();
      let urlObj: URL | null = null;
      try {
        if (text.startsWith("http://") || text.startsWith("https://")) {
          urlObj = new URL(text);
        }
      } catch {
        // Bukan format URL absolut
      }

      const searchParams = urlObj
        ? urlObj.searchParams
        : new URLSearchParams(text.includes('?') ? text.split('?')[1].split('#')[0] : '');
      const hashString = urlObj
        ? urlObj.hash.replace(/^#/, '')
        : (text.includes('#') ? text.split('#')[1] : '');
      const hashParams = new URLSearchParams(hashString);

      const accessToken = hashParams.get('access_token') || searchParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token') || searchParams.get('refresh_token') || '';
      const tokenHash = searchParams.get('token_hash') || hashParams.get('token_hash') || searchParams.get('token');
      const type = (searchParams.get('type') || hashParams.get('type') || 'signup') as any;
      const code = searchParams.get('code') || hashParams.get('code');

      // 1. Verifikasi dengan Access Token
      if (accessToken) {
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) throw error;
        if (data?.user) {
          setUser(data.user);
          return { type, user: data.user };
        }
      }

      // 2. Verifikasi dengan Token Hash
      if (tokenHash) {
        const { data, error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type || 'signup',
        });
        if (error) {
          if (type === 'signup') {
            const retry = await supabase.auth.verifyOtp({
              token_hash: tokenHash,
              type: 'email' as any,
            });
            if (!retry.error && retry.data?.user) {
              setUser(retry.data.user);
              return { type: 'email', user: retry.data.user };
            }
          }
          throw error;
        }
        if (data?.user) {
          setUser(data.user);
          return { type, user: data.user };
        }
      }

      // 3. Verifikasi dengan PKCE Code
      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
        if (data?.user) {
          setUser(data.user);
          return { type, user: data.user };
        }
      }

      throw new Error('Tautan tidak memuat token atau kode verifikasi yang valid.');
    } catch (error) {
      console.error("Set Session from URL Error:", error);
      throw error;
    }
  };

  const updatePassword = async (newPassword: string) => {
    if (user?.user_metadata?.is_guest) {
      throw new Error("Mode pengunjung tidak menggunakan kata sandi akun.");
    }
    const updatePromise = supabase.auth.updateUser({
      password: newPassword,
    });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Koneksi pembaruan kata sandi timeout.")), 10000)
    );
    const { error } = await Promise.race([updatePromise, timeoutPromise]);
    if (error) throw error;
  };

  const loginAsGuest = () => {
    const guestUser: User = {
      id: "guest-session-" + Math.random().toString(36).slice(2, 9),
      app_metadata: { provider: "guest" },
      user_metadata: {
        is_guest: true,
        full_name: "Tamu Pengunjung",
        name: "Pengunjung",
      },
      aud: "authenticated",
      created_at: new Date().toISOString(),
      email: "tamu@linguist.ai",
      role: "authenticated",
      phone: "",
      updated_at: new Date().toISOString(),
    };
    try {
      localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(guestUser));
    } catch {
      // ignore
    }
    setUser(guestUser);
    setLoading(false);
  };

  // Logout instan: hapus sesi lokal seketika tanpa tertahan lag jaringan
  const logout = async () => {
    // 1. Reset user state seketika (0ms)
    setUser(null);

    // 2. Bersihkan token Supabase & guest token dari storage
    try {
      localStorage.removeItem(GUEST_STORAGE_KEY);
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith("sb-") || key.includes("supabase.auth.token"))) {
          localStorage.removeItem(key);
        }
      }
    } catch {
      // ignore
    }

    // 3. Panggil signOut secara non-blocking di latar belakang (maks 800ms)
    try {
      await Promise.race([
        supabase.auth.signOut(),
        new Promise((resolve) => setTimeout(resolve, 800)),
      ]);
    } catch {
      // Abaikan jika network offline
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        verifySignupOtp,
        resendConfirmationEmail,
        resetPassword,
        verifyResetCode,
        setSessionFromUrl,
        updatePassword,
        loginAsGuest,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
