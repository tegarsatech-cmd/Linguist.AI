import React, { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  loginAsGuest: () => void;
  logout: () => Promise<void>;
}

export function translateAuthError(error: any): string {
  if (!error) return "Terjadi kesalahan. Silakan coba lagi.";
  const msg = typeof error === "string" ? error : error.message || "";

  if (/invalid login credentials/i.test(msg)) {
    return "Email atau kata sandi tidak valid. Periksa kembali akun Anda.";
  }
  if (/user already registered/i.test(msg)) {
    return "Email ini sudah terdaftar. Silakan langsung masuk.";
  }
  if (/password should be at least 6 characters/i.test(msg)) {
    return "Kata sandi minimal harus terdiri dari 6 karakter.";
  }
  if (/email not confirmed/i.test(msg)) {
    return "Email belum dikonfirmasi. Periksa kotak masuk atau spam email Anda.";
  }
  if (/signup requires a valid password/i.test(msg)) {
    return "Silakan masukkan kata sandi yang valid.";
  }
  if (/rate limit/i.test(msg) || /over_email_send_rate_limit/i.test(msg)) {
    return "Terlalu banyak percobaan dalam waktu singkat. Harap tunggu beberapa saat.";
  }
  if (/network/i.test(msg) || /failed to fetch/i.test(msg)) {
    return "Gagal terhubung ke server. Periksa koneksi internet Anda.";
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
        setTimeout(() => reject(new Error("Koneksi login timeout. Periksa internet Anda.")), 10000)
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
        setTimeout(() => reject(new Error("Koneksi pendaftaran timeout. Silakan coba lagi.")), 10000)
      );

      const { error } = await Promise.race([regPromise, timeoutPromise]);
      if (error) throw error;
    } catch (error) {
      console.error("Register Error:", error);
      throw error;
    }
  };

  const resetPassword = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/login`,
      });
      if (error) throw error;
    } catch (error) {
      console.error("Reset Password Error:", error);
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
        resetPassword,
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
