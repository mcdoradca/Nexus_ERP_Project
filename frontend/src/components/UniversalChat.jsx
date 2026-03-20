import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Paperclip, Send, Loader2, Smile, FileText, Image as ImageIcon } from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// mode: 'global' | 'direct' | 'task' | 'campaign' | 'project'
export default function UniversalChat({ mode, targetId, currentUser, socket, title, subtitle }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const fileInputRef = useRef(null);
  const commentsEndRef = useRef(null);
  const token = localStorage.getItem('token');

  const scrollToBottom = () => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    fetchMessages();
  }, [mode, targetId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Socket Listeners
  useEffect(() => {
    if (!socket) return;
    
    const handleGlobalMsg = (msg) => {
      if (mode === 'global') setMessages((prev) => [...prev, msg]);
    };
    
    const handleDirectMsg = (msg) => {
      if (mode === 'direct' && (msg.senderId === targetId || msg.receiverId === targetId || msg.senderId === currentUser.id)) {
        setMessages((prev) => {
          if (prev.find(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }
    };

    const handleEntityMsg = (msg) => {
      setMessages((prev) => [...prev, msg]);
    };

    if (mode === 'global') {
      socket.on('receive_global_message', handleGlobalMsg);
    } else if (mode === 'direct') {
      socket.on('receive_direct_message', handleDirectMsg);
    } else if (['task', 'campaign', 'project'].includes(mode)) {
      socket.on(`receive_entity_message_${mode}_${targetId}`, handleEntityMsg);
    }

    return () => {
      if (mode === 'global') socket.off('receive_global_message', handleGlobalMsg);
      if (mode === 'direct') socket.off('receive_direct_message', handleDirectMsg);
      if (['task', 'campaign', 'project'].includes(mode)) socket.off(`receive_entity_message_${mode}_${targetId}`, handleEntityMsg);
    };
  }, [socket, mode, targetId, currentUser.id]);

  const fetchMessages = async () => {
    if (!token || (!targetId && mode !== 'global')) return;
    try {
      const endpoint = mode === 'global' ? '/api/chat/global' : `/api/chat/${mode}/${targetId}`;
      const res = await axios.get(`${API_URL}${endpoint}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMessages(res.data);
    } catch (err) {
      console.error('Failed to fetch messages', err);
    }
  };

  const handleSendMessage = async (e) => {
    e?.preventDefault();
    if (!newMessage.trim() || !socket) return;

    const payload = { content: newMessage };
    let eventName = '';

    if (mode === 'global') {
      eventName = 'send_global_message';
    } else if (mode === 'direct') {
      eventName = 'send_direct_message';
      payload.receiverId = targetId;
    } else {
      eventName = 'send_entity_message';
      payload.entityType = mode;
      payload.entityId = targetId;
    }

    socket.emit(eventName, payload);
    setNewMessage('');
    setShowEmojiPicker(false);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const endpoint = mode === 'global' ? '/api/chat/global/files' : `/api/chat/${mode}/${targetId}/files`;
      await axios.post(`${API_URL}${endpoint}`, formData, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
    } catch (err) {
      console.error('File upload failed', err);
      alert('Nie udało się przesłać pliku.');
    } finally {
      setIsUploading(false);
      e.target.value = null; // reset input
    }
  };

  const onEmojiClick = (emojiObject) => {
    setNewMessage(prev => prev + emojiObject.emoji);
  };

  const renderMessageContent = (msg) => {
    if (msg.actionType === 'file' && msg.fileUrl) {
      const isImage = msg.fileName && (msg.fileName.toLowerCase().endsWith('.jpg') || msg.fileName.toLowerCase().endsWith('.png') || msg.fileName.toLowerCase().endsWith('.jpeg') || msg.fileName.toLowerCase().endsWith('.gif') || msg.fileName.toLowerCase().endsWith('.webp'));
      return (
        <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer" className="flex flex-col gap-2 group/file hover:opacity-80 transition-opacity">
          {isImage ? (
             <img src={msg.fileUrl} alt={msg.fileName} className="max-w-[200px] lg:max-w-[300px] rounded-sm object-cover shadow-sm border border-slate-200" />
          ) : (
            <div className="flex items-center gap-3 p-3 bg-white/20 rounded-sm border border-white/30 backdrop-blur-sm">
              <FileText className="w-8 h-8 opacity-80" />
              <div className="flex flex-col">
                <span className="font-bold underline text-sm line-clamp-1">{msg.fileName}</span>
                <span className="text-[10px] uppercase tracking-widest opacity-70">Kliknij by pobrać</span>
              </div>
            </div>
          )}
        </a>
      );
    }
    return <span>{msg.content}</span>;
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 relative">
      <div className="h-24 border-b border-slate-200 flex items-center justify-between px-8 bg-white/80 backdrop-blur-lg shrink-0 z-10 shadow-sm">
        <div>
          <h3 className="text-xl font-black text-slate-800 uppercase tracking-widest">{title || 'Komunikator'}</h3>
          {subtitle && <p className="text-xs font-bold text-slate-500 tracking-wider mt-1">{subtitle}</p>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 space-y-6 scroll-smooth bg-gradient-to-br from-slate-50 to-slate-100">
        {messages.map((m, idx) => {
          const authorId = m.authorId || m.senderId;
          const authorName = m.author?.name || m.sender?.name || 'Nieznany';
          const authorColor = m.author?.color || m.sender?.color || 'bg-slate-400';
          const isMe = authorId === currentUser.id;

          return (
            <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 duration-300`} style={{ animationDelay: `${Math.min(idx * 20, 300)}ms` }}>
              <div className="max-w-[75%] lg:max-w-[60%] flex flex-col group">
                <div className={`flex items-center mb-1.5 px-3 ${isMe ? 'flex-row-reverse text-right' : 'flex-row text-left'}`}>
                  {!isMe && (
                    <div className={`w-5 h-5 rounded-md flex items-center justify-center text-[8px] font-black text-white mr-2 shadow-sm ${authorColor}`}>
                      {authorName.substring(0, 2).toUpperCase()}
                    </div>
                  )}
                  <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">{authorName}</span>
                  <span className="text-[9px] font-bold text-slate-400 mx-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                
                <div className={`p-4 sm:p-5 rounded-sm sm:rounded-[2rem] text-sm font-semibold leading-relaxed shadow-sm break-words ${isMe ? 'bg-indigo-600 text-white rounded-tr-none shadow-indigo-200/50' : 'bg-white text-slate-700 border border-slate-200/60 rounded-tl-none'}`}>
                  {renderMessageContent(m)}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={commentsEndRef} />
      </div>

      {showEmojiPicker && (
        <div className="absolute bottom-28 left-8 z-50 shadow-2xl rounded-sm overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
          <EmojiPicker onEmojiClick={onEmojiClick} searchPlaceholder="Szukaj emotki..." />
        </div>
      )}

      <div className="p-6 bg-white border-t border-slate-200 shrink-0 z-20 shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.05)]">
        <form onSubmit={handleSendMessage} className="flex items-center gap-3 bg-slate-50 border border-slate-200 p-2 pl-4 rounded-[2rem] focus-within:ring-4 focus-within:ring-indigo-500/10 focus-within:border-indigo-300 transition-all">
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
          
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="p-3 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-full transition-all cursor-pointer shadow-sm">
            {isUploading ? <Loader2 className="w-5 h-5 animate-spin text-indigo-500" /> : <Paperclip className="w-5 h-5" />}
          </button>
          
          <button type="button" onClick={() => setShowEmojiPicker(!showEmojiPicker)} className={`p-3 rounded-full transition-all cursor-pointer shadow-sm ${showEmojiPicker ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:text-indigo-600 hover:bg-white'}`}>
            <Smile className="w-5 h-5" />
          </button>

          <input 
            value={newMessage} 
            onChange={(e) => setNewMessage(e.target.value)} 
            placeholder="Napisz do zespołu..." 
            className="flex-1 bg-transparent border-none outline-none text-[13px] font-bold py-2 px-2 placeholder:text-slate-400 text-slate-800"
          />
          
          <button type="submit" disabled={!newMessage.trim()} className={`p-4 rounded-full transition-all flex items-center justify-center w-12 h-12 ${newMessage.trim() ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-600/30' : 'bg-slate-200 text-slate-400'}`}>
            <Send className="w-5 h-5 ml-1" />
          </button>
        </form>
      </div>
    </div>
  );
}
