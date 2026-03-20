import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Zap, Layout, Megaphone, Folder, Hash, MessageCircle, Settings } from 'lucide-react';

export default function Sidebar({ currentUser, unreadDMs, handleLogout }) {
  const location = useLocation();
  const getInitials = (name) => name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?';

  const navItems = [
    { id: 'kanban', path: '/kanban', label: 'Tablica Zadań', icon: Layout, color: 'text-white', activeColor: 'bg-indigo-600 shadow-indigo-600/30' },
    { id: 'campaigns', path: '/campaigns', label: 'Kampanie Marketing', icon: Megaphone, color: 'text-pink-400', activeColor: 'bg-white/10 border-white/10' },
    ...(currentUser?.group !== 'AGENCJE' ? [
      { id: 'projects', path: '/projects', label: 'Projekty i Jednostki', icon: Folder, color: 'text-emerald-400', activeColor: 'bg-white/10 border-white/10' },
      { id: 'products', path: '/products', label: 'Katalog SKU (PIM)', icon: Hash, color: 'text-orange-400', activeColor: 'bg-white/10 border-white/10' },
      { id: 'chat', path: '/chat', label: 'Komunikator', icon: MessageCircle, color: 'text-indigo-400', activeColor: 'bg-white/10 border-white/10', badge: unreadDMs?.total > 0 ? unreadDMs.total : null }
    ] : []),
    ...(currentUser?.role === 'ADMIN' ? [
      { id: 'admin', path: '/admin', label: 'Ustawienia Master', icon: Settings, color: 'text-white', activeColor: 'bg-white/10 border-white/10', isFooter: true }
    ] : [])
  ];

  const isActive = (path) => location.pathname === path || (path === '/kanban' && location.pathname === '/');

  return (
    <aside className="w-80 bg-[#0f172a] flex flex-col z-[60] shadow-[10px_0_50px_rgba(0,0,0,0.15)] relative transition-all duration-300 border-r border-slate-800">
      <div className="p-8 pb-10">
        <div className="flex items-center space-x-4 mb-4">
          <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30 ring-2 ring-indigo-500/50">
            <Zap className="w-7 h-7 text-white fill-white animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white tracking-tighter leading-none bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">NEXUS ERP</h1>
            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] mt-1 block">APS Workspace</span>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-5 space-y-2 overflow-y-auto custom-scrollbar">
        <div className="px-4 mb-4 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Menu Systemowe</div>
        {navItems.filter(item => !item.isFooter).map(item => (
          <Link to={item.path} key={item.id} className={`w-full px-5 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all duration-300 flex items-center group relative border border-transparent ${isActive(item.path) ? `${item.activeColor} text-white shadow-xl` : 'text-slate-400 hover:bg-slate-800/50 hover:border-slate-700/50 hover:text-white'}`}>
            <item.icon className={`w-5 h-5 mr-4 transition-transform duration-300 group-hover:scale-110 ${isActive(item.path) ? 'text-white' : item.color}`} /> 
            {item.label}
            {item.badge && <span className="ml-auto bg-rose-600 text-white text-[10px] font-black h-5 w-5 rounded-full flex items-center justify-center animate-pulse shadow-lg shadow-rose-600/40">{item.badge}</span>}
          </Link>
        ))}
      </nav>

      <div className="p-6 mt-auto bg-gradient-to-t from-slate-900 to-transparent">
        {navItems.filter(item => item.isFooter).map(item => (
          <Link to={item.path} key={item.id} className={`w-full px-5 py-4 mb-4 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all duration-300 flex items-center group relative border border-transparent ${isActive(item.path) ? `${item.activeColor} text-white shadow-xl` : 'text-slate-400 hover:bg-slate-800/50 hover:border-slate-700/50 hover:text-white'}`}><item.icon className={`w-5 h-5 mr-4 transition-transform duration-300 group-hover:scale-110 ${isActive(item.path) ? 'text-white' : item.color}`} /> {item.label}</Link>
        ))}
        <div className="bg-slate-800/80 backdrop-blur-md rounded-[2rem] p-5 border border-slate-700/50 shadow-inner hover:shadow-lg transition-all duration-300 group">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-[1.25rem] bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-black text-white shadow-inner ring-2 ring-white/10 group-hover:ring-white/30 transition-all">{getInitials(currentUser?.name)}</div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-[11px] font-black text-white truncate leading-tight mb-1">{currentUser?.name}</span>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate">{currentUser?.department}</span>
            </div>
          </div>
          <button onClick={handleLogout} className="w-full mt-5 py-3.5 bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white rounded-[1.25rem] text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-300 shadow-sm hover:shadow-rose-500/25 active:scale-95">Wyloguj Sesję</button>
        </div>
      </div>
    </aside>
  );
}