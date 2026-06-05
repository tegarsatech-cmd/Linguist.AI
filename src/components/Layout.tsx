import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LayoutDashboard, PenTool, Mic2, FlaskConical, LogOut } from 'lucide-react';
import { motion } from 'motion/react';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Tes Kalimat Inggris', path: '/exercise/writing', icon: PenTool },
    { name: 'Tes Berbicara Inggris', path: '/exercise/speaking', icon: Mic2 },
    { name: 'Lab Kosakata', path: '#', icon: FlaskConical, disabled: true },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-bg-deep text-[#E4E4E7]">
      {/* Left Navigation Rail */}
      <nav className="nav-rail flex-shrink-0">
        <div className="mb-10 cursor-pointer" onClick={() => navigate('/')}>
          <h1 className="text-xl serif-title text-[#D4D4D8]">Linguist.AI</h1>
          <p className="academic-label mt-1">Keunggulan Akademik</p>
        </div>
        
        <div className="space-y-6 flex-1">
          <div>
            <p className="academic-label mb-4 opacity-70">Modul Pembelajaran</p>
            <ul className="space-y-1.5">
              {navItems.map((item) => (
                <li
                  key={item.name}
                  onClick={() => !item.disabled && navigate(item.path)}
                  className={`flex items-center gap-3 text-sm px-3 py-2 rounded-md transition-all cursor-pointer group ${
                    location.pathname === item.path 
                    ? 'text-white bg-border-main' 
                    : 'text-text-dim hover:text-white hover:bg-white/[0.03]'
                  } ${item.disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  <item.icon className={`w-4 h-4 ${location.pathname === item.path ? 'text-brand-blue' : 'text-text-muted group-hover:text-text-dim'}`} />
                  {item.name}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-auto border-t border-border-main pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-blue to-brand-purple flex items-center justify-center text-xs font-bold shadow-lg">
                {user?.displayName?.split(' ').map(n => n[0]).join('') || 'U'}
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-medium truncate max-w-[100px]">{user?.displayName}</p>
                <p className="text-[10px] text-text-muted">Pelajar Lanjutan</p>
              </div>
            </div>
            <button 
              onClick={logout}
              className="p-1.5 hover:bg-white/5 rounded-md text-text-muted hover:text-white transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b border-border-main px-8 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2 text-[10px] text-text-muted uppercase tracking-wider">
            <span>Modul Akademik</span>
            <span>/</span>
            <span className="text-[#E4E4E7]">
              {navItems.find(i => i.path === location.pathname)?.name || 'Analisis'}
            </span>
          </div>
          <div className="flex items-center gap-4">
             <div className="flex items-center gap-2 px-3 py-1 bg-border-main rounded-md">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[10px] text-brand-blue font-mono">GROQ-Llama-3-70B Aktif</span>
             </div>
          </div>
        </header>

        {/* Content Region */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {children}
        </div>

        {/* Floating Status Bar */}
        <div className="absolute bottom-6 left-8 right-8 h-12 bg-bg-nav/80 backdrop-blur-md border border-border-main rounded-full px-6 flex items-center justify-between shadow-2xl z-50">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <span className="text-[10px] text-text-muted font-mono uppercase tracking-widest">Mesin AI Siaga</span>
            </div>
            <div className="h-4 w-[1px] bg-border-main"></div>
            <span className="text-[10px] text-text-dim uppercase tracking-wider">Masukan Real-time Aktif</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => navigate('/#history')}
              className="text-[10px] uppercase tracking-widest text-text-muted hover:text-brand-blue transition-colors"
            >
              Riwayat
            </button>
            <button className="text-[10px] uppercase tracking-widest text-text-muted hover:text-brand-blue transition-colors">Ekspor PDF</button>
          </div>
        </div>
      </main>
    </div>
  );
}
