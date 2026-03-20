import React from 'react';
import { Zap, Mail, Lock } from 'lucide-react';

export default function LoginView({ handleLogin, loginForm, setLoginForm }) {
  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center p-10 relative overflow-hidden font-sans selection:bg-indigo-500 selection:text-white">
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-indigo-600/20 blur-[150px] rounded-full animate-pulse duration-1000"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-600/20 blur-[150px] rounded-full animate-pulse delay-700 duration-1000"></div>
      
      <div className="w-full max-w-xl bg-white/[0.02] backdrop-blur-3xl rounded-[4rem] shadow-[0_50px_100px_rgba(0,0,0,0.5)] overflow-hidden p-16 border border-white/10 relative z-10 hover:border-white/20 transition-all duration-500 ring-1 ring-white/5">
        <div className="flex flex-col items-center text-center mb-16">
          <div className="w-28 h-28 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-[2.5rem] flex items-center justify-center shadow-[0_0_50px_rgba(99,102,241,0.4)] mb-8 animate-in zoom-in duration-700 ring-4 ring-white/10">
            <Zap className="w-14 h-14 text-white fill-white drop-shadow-md" />
          </div>
          <h1 className="text-5xl font-black tracking-tighter mb-4 uppercase text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400">Nexus ERP</h1>
          <p className="text-indigo-400 font-bold uppercase tracking-[0.4em] text-xs">Enterprise Management Engine</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-8 animate-in slide-in-from-bottom-8 duration-700 delay-150">
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] block ml-6">Identyfikator E-mail</label>
            <div className="relative group">
              <Mail className="absolute left-7 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-indigo-400 transition-colors duration-300" />
              <input type="email" required placeholder="admin@nexus.local" className="w-full pl-16 pr-8 py-5 bg-black/30 border border-white/5 rounded-3xl outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 text-white font-bold transition-all duration-300 placeholder:text-slate-600 hover:bg-black/50 shadow-inner" value={loginForm.email} onChange={e => setLoginForm({...loginForm, email: e.target.value})} />
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] block ml-6">Klucz Dostępowy</label>
            <div className="relative group">
              <Lock className="absolute left-7 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-purple-400 transition-colors duration-300" />
              <input type="password" required placeholder="••••••••" className="w-full pl-16 pr-8 py-5 bg-black/30 border border-white/5 rounded-3xl outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 text-white font-bold transition-all duration-300 placeholder:text-slate-600 hover:bg-black/50 shadow-inner" value={loginForm.password} onChange={e => setLoginForm({...loginForm, password: e.target.value})} />
            </div>
          </div>

          <button type="submit" className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-black py-6 rounded-3xl transition-all duration-300 shadow-[0_20px_50px_rgba(99,102,241,0.4)] uppercase tracking-[0.2em] text-sm mt-8 active:scale-95 hover:shadow-[0_20px_60px_rgba(99,102,241,0.6)] ring-2 ring-transparent hover:ring-white/20">Inicjalizuj Sesję</button>
        </form>
      </div>
    </div>
  );
}