import React from 'react';
import { useLocation } from 'react-router-dom';
import { Search, Bell, X } from 'lucide-react';

export default function Header({ notifications, showNotifications, setShowNotifications, handleNotificationClick, fetchData }) {
  const location = useLocation();

  const getTitle = () => {
    const path = location.pathname;
    if (path.startsWith('/kanban')) return 'Tablica Zadań';
    if (path.startsWith('/campaigns')) return 'Kampanie Marketingowe';
    if (path.startsWith('/projects')) return 'Zarządzanie Projektami';
    if (path.startsWith('/products')) return 'Katalog Produktów SKU';
    if (path.startsWith('/chat')) return 'Centrum Komunikacji';
    if (path.startsWith('/admin')) return 'Panel Administratora Systemu';
    return 'Nexus ERP';
  };

  return (
    <header className="h-28 sticky top-0 flex items-center justify-between px-10 bg-white/70 backdrop-blur-2xl border-b border-slate-200/50 z-50 transition-all duration-300">
      <div className="flex items-center space-x-6 animate-in slide-in-from-left-4 duration-500">
        <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-500 uppercase tracking-tighter drop-shadow-sm">
          {getTitle()}
        </h2>
      </div>

      <div className="flex items-center space-x-8">
        <div className="relative group">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 transition-colors duration-300 group-focus-within:text-indigo-600" />
          <input type="text" placeholder="Szukaj w ekosystemie..." className="pl-14 pr-6 py-4 bg-slate-100/80 border border-transparent rounded-[1.5rem] text-xs font-bold focus:ring-4 focus:ring-indigo-500/10 focus:bg-white focus:border-indigo-100 w-72 transition-all duration-300 outline-none shadow-inner placeholder:text-slate-400" />
        </div>

        <div className="relative">
          <button onClick={() => { setShowNotifications(!showNotifications); if(!showNotifications) fetchData(); }} className={`p-4 rounded-2xl transition-all duration-300 relative border ${showNotifications ? 'bg-indigo-50 border-indigo-100 text-indigo-600' : 'bg-slate-50 border-slate-100 text-slate-400 hover:text-indigo-600 hover:bg-white shadow-sm hover:shadow-md'}`}>
            <Bell className="w-6 h-6" />
            {notifications.some(n => !n.isRead) && <span className="absolute top-3 right-3 w-3 h-3 bg-rose-500 rounded-full border-2 border-white animate-pulse shadow-lg shadow-rose-500/50"></span>}
          </button>

          {showNotifications && (
            <div className="absolute right-0 top-16 w-[26rem] bg-white/95 backdrop-blur-3xl rounded-[2.5rem] shadow-[0_40px_100px_rgba(0,0,0,0.15)] border border-slate-100/80 z-[100] overflow-hidden animate-in slide-in-from-top-4 duration-300">
              <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                <h4 className="font-black text-[10px] uppercase tracking-[0.2em] text-indigo-600">Ostatnie Powiadomienia</h4>
                <button onClick={() => setShowNotifications(false)} className="p-2 bg-white border border-slate-100 rounded-full shadow-sm text-slate-400 hover:text-rose-500 hover:border-rose-100 transition-all"><X className="w-4 h-4"/></button>
              </div>
              <div className="max-h-[30rem] overflow-y-auto custom-scrollbar bg-slate-50/30">
                {notifications.length === 0 ? <div className="p-16 flex flex-col items-center justify-center text-center text-slate-400 font-bold text-xs"><Bell className="w-10 h-10 mb-4 opacity-20" />Brak nowych komunikatów</div> : notifications.map((n, idx) => (
                  <div key={n.id} onClick={() => handleNotificationClick(n)} className={`p-6 border-b border-slate-100/50 cursor-pointer hover:bg-white transition-all duration-300 group ${n.isRead ? 'opacity-60' : 'bg-white shadow-sm relative z-10'}`} style={{ animationDelay: `${idx * 50}ms` }}>
                    <div className="flex items-center mb-2">
                      <span className={`w-2 h-2 rounded-full mr-4 shadow-sm ${n.isRead ? 'bg-slate-200' : 'bg-indigo-500 shadow-indigo-500/40 animate-pulse'}`}></span>
                      <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest group-hover:text-indigo-600 transition-colors">{n.title}</span>
                    </div>
                    <p className="text-xs text-slate-500 font-bold leading-relaxed pl-6">{n.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}