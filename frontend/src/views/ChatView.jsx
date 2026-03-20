import React from 'react';
import { Hash, Search, Paperclip, Send } from 'lucide-react';

import { getInitials, getDepartmentColor } from '../utils';

export default function ChatView({ currentUser, users, activeChat, setActiveChat, unreadDMs, chatMessages, newChatMessage, setNewChatMessage, commentsEndRef }) {
  return (
    <div className="flex-1 flex h-full min-h-0 overflow-hidden bg-white relative">
      <div className="w-96 border-r border-slate-100 flex flex-col shrink-0 bg-[#f8fafc]">
        <div className="p-10 border-b border-slate-100 bg-white/50 backdrop-blur-md sticky top-0 z-10">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-[0.3em] mb-6">Wiadomości i Kanały</h3>
          <div className="relative group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-600 transition-colors"/>
            <input className="w-full pl-14 pr-6 py-4 bg-white border border-slate-200 rounded-2xl text-xs outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all font-bold placeholder:text-slate-400" placeholder="Szukaj osób..."/>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-3">
          <div onClick={() => setActiveChat('general')} className={`p-6 rounded-[2rem] cursor-pointer transition-all flex items-center justify-between group ${activeChat === 'general' ? 'bg-indigo-600 shadow-2xl shadow-indigo-600/20 text-white' : 'bg-white border border-slate-100 hover:border-indigo-200'}`}>
            <div className="flex items-center">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm ${activeChat === 'general' ? 'bg-indigo-500/50' : 'bg-indigo-50 text-indigo-600'}`}>
                <Hash className="w-6 h-6"/>
              </div>
              <div className="ml-4">
                <div className="text-[11px] font-black uppercase tracking-wider"># Kanał Ogólny</div>
                <div className={`text-[9px] font-bold mt-1 ${activeChat === 'general' ? 'text-indigo-200' : 'text-slate-400'}`}>Ogłoszenia firmowe</div>
              </div>
            </div>
            {unreadDMs.total > 0 && <span className="bg-red-500 text-white text-[9px] font-black w-5 h-5 rounded-full flex items-center justify-center border-2 border-white">!</span>}
          </div>

          <div className="pt-8 px-4 pb-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Członkowie Zespołu</div>
          
          {users.filter(u => u.id !== currentUser.id).map(u => (
            <div key={u.id} onClick={() => setActiveChat(u.id)} className={`p-5 rounded-[2rem] cursor-pointer transition-all flex items-center justify-between group ${activeChat === u.id ? 'bg-slate-900 shadow-2xl shadow-slate-900/20 text-white' : 'bg-white border border-slate-100 hover:border-slate-300'}`}>
              <div className="flex items-center">
                <div className="relative">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xs font-black ${getDepartmentColor(u.department)}`}>{getInitials(u.name)}</div>
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-4 border-white rounded-full"></div>
                </div>
                <div className="ml-4">
                  <div className="text-[11px] font-black uppercase tracking-tight">{u.name}</div>
                  <div className={`text-[9px] font-black mt-1 ${activeChat === u.id ? 'text-slate-400' : 'text-slate-400'}`}>{u.department}</div>
                </div>
              </div>
              {unreadDMs.perUser[u.id] > 0 && <span className="bg-rose-500 text-white text-[9px] font-black w-6 h-6 rounded-full flex items-center justify-center border-2 border-white shadow-lg">{unreadDMs.perUser[u.id]}</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col bg-white min-w-0">
        <div className="h-28 border-b border-slate-100 flex items-center justify-between px-10 bg-white/50 backdrop-blur-xl shrink-0 z-10">
          <div className="flex items-center">
            <div className={`w-14 h-14 rounded-[1.5rem] flex items-center justify-center text-sm font-black shadow-2xl ${activeChat === 'general' ? 'bg-indigo-600 text-white' : (users.find(u => u.id === activeChat)?.color || 'bg-slate-900') + ' text-white'}`}>
              {activeChat === 'general' ? <Hash className="w-7 h-7"/> : getInitials(users.find(u => u.id === activeChat)?.name)}
            </div>
            <div className="ml-6">
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-widest leading-none">{activeChat === 'general' ? 'Strumień Ogólny' : users.find(u => u.id === activeChat)?.name}</h3>
              <div className="flex items-center mt-2.5">
                <span className="w-2 h-2 bg-emerald-500 rounded-full mr-3 shadow-lg shadow-emerald-500/20 animate-pulse"></span>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{activeChat === 'general' ? 'Otwarta dyskusja strategiczna' : 'Bezpośredni kanał szyfrowany'}</span>
              </div>
            </div>
          </div>
          <div className="flex -space-x-3">
             {users.slice(0, 5).map(u => (
               <div key={u.id} className={`w-10 h-10 rounded-2xl flex items-center justify-center text-[10px] font-black ${getDepartmentColor(u.department)}`}>{getInitials(u.name)}</div>
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
                  <div className={`p-6 rounded-[2.5rem] shadow-[0_8px_30px_rgba(0,0,0,0.03)] text-[13px] font-bold leading-relaxed border ${isMe ? 'bg-indigo-600 text-white rounded-tr-none border-indigo-500 shadow-indigo-200/40' : 'bg-white text-slate-800 border-slate-100 rounded-tl-none shadow-slate-200/20'}`}>
                    {m.content}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={commentsEndRef}/>
        </div>

        <div className="p-10 bg-white border-t border-slate-100 shrink-0 z-10">
          <form onSubmit={(e) => { e.preventDefault(); if(!newChatMessage.trim()) return; /* sendMessage logic would normally go here if implemented in handler */ }} className="flex items-center space-x-4 bg-slate-100/50 p-3 rounded-[2.5rem] border border-slate-200 focus-within:ring-8 focus-within:ring-indigo-500/5 transition-all">
            <button type="button" className="p-5 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-[1.5rem] transition-all"><Paperclip className="w-6 h-6"/></button>
            <input value={newChatMessage} onChange={(e) => setNewChatMessage(e.target.value)} placeholder="Napisz do zespołu..." className="flex-1 bg-transparent border-none outline-none text-sm font-bold py-2 px-4 placeholder:text-slate-400"/>
            <button type="submit" disabled={!newChatMessage.trim()} className={`p-5 rounded-[1.5rem] transition-all shadow-2xl active:scale-90 ${newChatMessage.trim() ? 'bg-slate-900 text-white hover:bg-indigo-600 hover:scale-110' : 'bg-slate-200 text-slate-400 opacity-50'}`}>
              <Send className="w-6 h-6"/>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
