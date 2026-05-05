import React, { useState } from 'react';
import { Hash, Search, Paperclip, Send, Menu } from 'lucide-react';

import { getInitials, getDepartmentColor } from '../utils';

export default function ChatView({ currentUser, users, activeChat, setActiveChat, unreadDMs, chatMessages, newChatMessage, setNewChatMessage, commentsEndRef }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  return (
    <div className="flex-1 flex h-full min-h-0 overflow-hidden bg-white relative">
      <div className={`${isSidebarOpen ? 'w-72 border-r' : 'w-0 border-r-0'} transition-all duration-300 ease-in-out border-slate-300 flex flex-col shrink-0 bg-gradient-to-b from-[#f8fafc] to-[#e2e8f0] overflow-hidden`}>
        <div className="w-72 h-full flex flex-col">
          <div className="p-6 border-b border-slate-300 bg-white/50 backdrop-blur-md sticky top-0 z-10">
            <h3 className="text-[10px] font-black text-slate-800 uppercase tracking-[0.2em] mb-4">Wiadomości i Kanały</h3>
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600 group-focus-within:text-indigo-600 transition-colors"/>
              <input className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-400 rounded-sm text-xs outline-none focus:ring-2 focus:ring-indigo-500/10 transition-all font-bold placeholder:text-slate-600" placeholder="Szukaj osób..."/>
            </div>
          </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-3">
          <div onClick={() => setActiveChat('general')} className={`p-6 rounded-sm cursor-pointer transition-all flex items-center justify-between group ${activeChat === 'general' ? 'bg-indigo-600 shadow-2xl shadow-indigo-600/20 text-white' : 'bg-white border border-slate-300 hover:border-indigo-200'}`}>
            <div className="flex items-center">
              <div className={`w-12 h-12 rounded-sm flex items-center justify-center shadow-sm ${activeChat === 'general' ? 'bg-indigo-500/50' : 'bg-indigo-50 text-indigo-600'}`}>
                <Hash className="w-6 h-6"/>
              </div>
              <div className="ml-4">
                <div className="text-[11px] font-black uppercase tracking-wider"># Kanał Ogólny</div>
                <div className={`text-[9px] font-bold mt-1 ${activeChat === 'general' ? 'text-indigo-200' : 'text-slate-600'}`}>Ogłoszenia firmowe</div>
              </div>
            </div>
            {unreadDMs.total > 0 && <span className="bg-red-500 text-white text-[9px] font-black w-5 h-5 rounded-sm flex items-center justify-center border-2 border-white">!</span>}
          </div>

          <div className="pt-8 px-4 pb-4 text-[10px] font-black text-slate-600 uppercase tracking-[0.3em]">Członkowie Zespołu</div>
          
          {users.filter(u => u.id !== currentUser.id).map(u => (
            <div key={u.id} onClick={() => setActiveChat(u.id)} className={`p-5 rounded-sm cursor-pointer transition-all flex items-center justify-between group ${activeChat === u.id ? 'bg-slate-900 shadow-2xl shadow-slate-900/20 text-white' : 'bg-white border border-slate-300 hover:border-slate-300'}`}>
              <div className="flex items-center">
                <div className="relative">
                  <div className={`w-12 h-12 rounded-sm flex items-center justify-center text-xs font-black ${getDepartmentColor(u.department)}`}>{getInitials(u.name)}</div>
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-4 border-white rounded-sm"></div>
                </div>
                <div className="ml-4">
                  <div className="text-[11px] font-black uppercase tracking-tight">{u.name}</div>
                  <div className={`text-[9px] font-black mt-1 ${activeChat === u.id ? 'text-slate-600' : 'text-slate-600'}`}>{u.department}</div>
                </div>
              </div>
              {unreadDMs.perUser[u.id] > 0 && <span className="bg-rose-500 text-white text-[9px] font-black w-6 h-6 rounded-sm flex items-center justify-center border-2 border-white shadow-lg">{unreadDMs.perUser[u.id]}</span>}
            </div>
          ))}
        </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col bg-white min-w-0">
        <div className="h-28 border-b border-slate-300 flex items-center justify-between px-10 bg-white/50 backdrop-blur-xl shrink-0 z-10">
          <div className="flex items-center">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="mr-6 p-2 rounded-sm hover:bg-slate-100 transition-colors text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50">
              <Menu className="w-6 h-6" />
            </button>
            <div className={`w-14 h-14 rounded-sm flex items-center justify-center text-sm font-black shadow-2xl ${activeChat === 'general' ? 'bg-indigo-600 text-white' : (users.find(u => u.id === activeChat)?.color || 'bg-slate-900') + ' text-white'}`}>
              {activeChat === 'general' ? <Hash className="w-7 h-7"/> : getInitials(users.find(u => u.id === activeChat)?.name)}
            </div>
            <div className="ml-6">
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-widest leading-none">{activeChat === 'general' ? 'Strumień Ogólny' : users.find(u => u.id === activeChat)?.name}</h3>
              <div className="flex items-center mt-2.5">
                <span className="w-2 h-2 bg-emerald-500 rounded-sm mr-3 shadow-lg shadow-emerald-500/20 animate-pulse"></span>
                <span className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em]">{activeChat === 'general' ? 'Otwarta dyskusja strategiczna' : 'Bezpośredni kanał szyfrowany'}</span>
              </div>
            </div>
          </div>
          <div className="flex -space-x-3">
             {users.slice(0, 5).map(u => (
               <div key={u.id} className={`w-10 h-10 rounded-sm flex items-center justify-center text-[10px] font-black ${getDepartmentColor(u.department)}`}>{getInitials(u.name)}</div>
             ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-10 space-y-8 bg-slate-50/20 relative">
          {chatMessages.map((m, idx) => {
            const isMe = m.senderId === currentUser.id;
            return (
              <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-4 duration-500`} style={{ animationDelay: `${idx * 50}ms` }}>
                <div className={`max-w-[65%] group`}>
                  <div className={`flex items-center mb-3 px-2 ${isMe ? 'flex-row-reverse text-right' : 'flex-row text-left'}`}>
                    <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">{m.sender?.name}</span>
                    <span className="text-[10px] font-black text-slate-300 uppercase tracking-tighter mx-4 opacity-0 group-hover:opacity-100 transition-opacity">
                      {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className={`p-6 rounded-sm shadow-[0_8px_30px_rgba(0,0,0,0.03)] text-[13px] font-bold leading-relaxed border ${isMe ? 'bg-[#dcf8c6] text-slate-900 rounded-tr-none border border-[#25D366] shadow-[#25D366]/20' : 'bg-white text-slate-800 border border-slate-300 rounded-tl-none shadow-slate-200/20'}`}>
                    {m.content}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={commentsEndRef}/>
        </div>

        <div className="p-10 bg-white border-t border-slate-300 shrink-0 z-10">
          <form onSubmit={(e) => { e.preventDefault(); if(!newChatMessage.trim()) return; /* sendMessage logic would normally go here if implemented in handler */ }} className="flex items-center space-x-4 bg-[#f0f2f5] p-3 rounded-sm border-2 border-[#25D366]/50 focus-within:ring-8 focus-within:ring-[#25D366]/20 focus-within:border-[#25D366] transition-all">
            <button type="button" className="p-5 text-slate-600 hover:text-indigo-600 hover:bg-white rounded-sm transition-all"><Paperclip className="w-6 h-6"/></button>
            <input value={newChatMessage} onChange={(e) => setNewChatMessage(e.target.value)} placeholder="Napisz do zespołu..." className="flex-1 bg-transparent border-none outline-none text-sm font-bold py-2 px-4 placeholder:text-slate-600"/>
            <button type="submit" disabled={!newChatMessage.trim()} className={`p-5 rounded-sm transition-all shadow-2xl active:scale-90 ${newChatMessage.trim() ? 'bg-[#25D366] text-white hover:bg-[#1ebd55] hover:scale-110' : 'bg-slate-200 text-slate-600 opacity-50'}`}>
              <Send className="w-6 h-6"/>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
