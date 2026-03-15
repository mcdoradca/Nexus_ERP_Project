import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { 
  Plus, Layout, Settings, Folder, Hash, MessageCircle, Megaphone, 
  Bell, X, Search, ChevronRight, Clock, ShieldAlert, AlertOctagon, 
  PlayCircle, StopCircle, Cloud, CloudLightning, Target, Zap, 
  Loader2, Paperclip, Send, Users, User, DollarSign, ArrowRight, CheckCircle2,
  Trash2, Mail, Lock, Shield, Eye, EyeOff, Check, Filter, Calendar
} from 'lucide-react';

const API_URL = 'http://localhost:3001';

function App() {
  const [activeTab, setActiveTab] = useState('kanban');
  const [token, setToken] = useState(localStorage.getItem('aps_token'));
  const [currentUser, setCurrentUser] = useState(JSON.parse(localStorage.getItem('aps_user')));
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  
  // Data States
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [users, setUsers] = useState([]);
  const [products, setProducts] = useState([]);
  const [brands, setBrands] = useState([]);
  const [notifications, setNotifications] = useState([]);
  
  // UI States
  const [selectedTask, setSelectedTask] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [selectedFilterId, setSelectedFilterId] = useState('all');
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [isNewProductModalOpen, setIsNewProductModalOpen] = useState(false);
  const [isNewBrandModalOpen, setIsNewBrandModalOpen] = useState(false);
  const [isUserEditModalOpen, setIsUserEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  
  // Form States
  const [newTaskForm, setNewTaskForm] = useState({ title: '', description: '', priority: 'MEDIUM', projectId: '', campaignId: '', assigneeIds: [], dueDate: '' });
  const [newBrandName, setNewBrandName] = useState('');
  const [newProductForm, setNewProductForm] = useState({ ean: '', sku: '', name: '', brandId: '', stock: 0, salePrice: 0, basePrice: 0, inboundTransportCost: 0, packagingCost: 0, bdoEprCost: 0, outboundTransportCost: 0, status: 'Aktywny', subiektId: '', baselinkerId: '' });
  
  // Chat States
  const [activeChat, setActiveChat] = useState('general'); // 'general' or userId
  const [chatMessages, setChatMessages] = useState([]);
  const [newChatMessage, setNewChatMessage] = useState('');
  const [unreadDMs, setUnreadDMs] = useState({ total: 0, perUser: {} });
  const [socket, setSocket] = useState(null);

  // Task Details States
  const [taskComments, setTaskComments] = useState([]);
  const [newCommentText, setNewCommentText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isBlockingMode, setIsBlockingMode] = useState(false);
  const [blockReason, setBlockReason] = useState('');

  const [showNotifications, setShowNotifications] = useState(false);
  const fileInputRef = useRef(null);
  const commentsEndRef = useRef(null);

  useEffect(() => {
    if (token) {
      const newSocket = io(API_URL, { auth: { token } });
      setSocket(newSocket);
      fetchData();
      
      newSocket.on('receive_global_message', (msg) => {
        if (activeChat === 'general') setChatMessages(prev => [...prev, msg]);
      });

      newSocket.on('receive_direct_message', (msg) => {
        if (activeChat === msg.senderId || msg.senderId === currentUser.id) {
          setChatMessages(prev => [...prev, msg]);
        } else {
          fetchUnreadCount();
        }
      });

      newSocket.on('task_updated', fetchData);
      newSocket.on('new_notification', (notif) => {
        setNotifications(prev => [notif, ...prev]);
        new Audio('/notification.mp3').play().catch(() => {});
      });

      return () => newSocket.disconnect();
    }
  }, [token, activeChat]);

  const fetchData = async () => {
    try {
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const [t, p, c, u, b, pr, n] = await Promise.all([
        axios.get(`${API_URL}/api/tasks`, config),
        axios.get(`${API_URL}/api/projects`, config),
        axios.get(`${API_URL}/api/campaigns`, config),
        axios.get(`${API_URL}/api/users`, config),
        axios.get(`${API_URL}/api/brands`, config),
        axios.get(`${API_URL}/api/products`, config),
        axios.get(`${API_URL}/api/notifications`, config)
      ]);
      setTasks(t.data);
      setProjects(p.data);
      setCampaigns(c.data);
      setUsers(u.data);
      setBrands(b.data);
      setProducts(pr.data);
      setNotifications(n.data);
      fetchUnreadCount();
    } catch (err) {
      if (err.response?.status === 401) handleLogout();
    }
  };

  const fetchUnreadCount = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/chat/unread`, { headers: { Authorization: `Bearer ${token}` } });
      setUnreadDMs({ total: res.data.totalUnread, perUser: res.data.unreadPerUser });
    } catch (err) {}
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${API_URL}/api/auth/login`, loginForm);
      localStorage.setItem('aps_token', res.data.token);
      localStorage.setItem('aps_user', JSON.stringify(res.data.user));
      setToken(res.data.token);
      setCurrentUser(res.data.user);
    } catch (err) { alert('Błąd logowania'); }
  };

  const handleLogout = () => {
    localStorage.removeItem('aps_token');
    localStorage.removeItem('aps_user');
    setToken(null);
    setCurrentUser(null);
  };

  // --- HANDLERS ---
  const handleCreateTask = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/api/tasks`, newTaskForm, { headers: { Authorization: `Bearer ${token}` } });
      setIsNewTaskModalOpen(false);
      fetchData();
    } catch (err) { alert('Błąd tworzenia zadania'); }
  };

  const handleCreateBrand = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/api/brands`, { name: newBrandName }, { headers: { Authorization: `Bearer ${token}` } });
      setNewBrandName(''); setIsNewBrandModalOpen(false); fetchData();
    } catch (err) { alert('Błąd tworzenia marki'); }
  };

  const handleCreateProduct = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/api/products`, newProductForm, { headers: { Authorization: `Bearer ${token}` } });
      setIsNewProductModalOpen(false); fetchData();
      setNewProductForm({ ean: '', sku: '', name: '', brandId: '', stock: 0, salePrice: 0, basePrice: 0, inboundTransportCost: 0, packagingCost: 0, bdoEprCost: 0, outboundTransportCost: 0, status: 'Aktywny', subiektId: '', baselinkerId: '' });
    } catch (err) { alert('Błąd tworzenia produktu'); }
  };

  const handleUpdateTaskStatus = async (taskId, status) => {
    try {
      await axios.patch(`${API_URL}/api/tasks/${taskId}/status`, { status }, { headers: { Authorization: `Bearer ${token}` } });
      fetchData();
    } catch (err) {}
  };

  const handleNotificationClick = (n) => {
    if (n.relatedTaskId) {
      const task = tasks.find(t => t.id === n.relatedTaskId);
      if (task) setSelectedTask(task);
    }
    setShowNotifications(false);
  };

  const getInitials = (name) => name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?';

  // --- RENDERERS ---
  // --- RENDERERS ---
  const renderProjectsView = () => (
    <div className="flex-1 flex flex-col p-10 bg-[#f8fafc] min-h-0 overflow-hidden">
      <div className="flex items-center justify-between mb-10 shrink-0">
        <div>
          <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Projekty Operacyjne</h2>
          <p className="text-sm text-slate-500 font-bold uppercase tracking-widest mt-1">Zarządzanie Jednostkami i Zadaniami Zespołu</p>
        </div>
        {currentUser?.role === 'ADMIN' && (
          <button onClick={() => setIsNewProjectModalOpen(true)} className="px-8 py-3 bg-slate-900 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-2xl flex items-center">
            <Plus className="w-4 h-4 mr-3" /> Nowy Projekt
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10 overflow-y-auto custom-scrollbar pr-4 pb-12">
        {projects.map(p => {
          const projectTasks = tasks.filter(t => t.projectId === p.id);
          const doneTasks = projectTasks.filter(t => t.status === 'DONE').length;
          const progress = projectTasks.length > 0 ? (doneTasks / projectTasks.length) * 100 : 0;
          
          return (
            <div key={p.id} onClick={() => setSelectedProject(p)} className="group bg-white rounded-[3rem] border border-slate-100 p-10 shadow-[0_8px_30px_rgba(0,0,0,0.03)] hover:shadow-[0_25px_60px_rgba(0,0,0,0.1)] hover:border-indigo-200 transition-all cursor-pointer relative overflow-hidden flex flex-col active:scale-[0.98]">
              <div className={`absolute top-0 left-0 w-3 h-full ${p.color} shadow-lg shadow-black/5`}></div>
              
              <div className="flex justify-between items-start mb-8">
                <div className={`px-4 py-1.5 rounded-xl border ${p.color.replace('bg-', 'bg-').replace('500', '50')} ${p.color.replace('bg-', 'text-').replace('500', '700')} ${p.color.replace('bg-', 'border-').replace('500', '100')} text-[10px] font-black uppercase tracking-widest`}>
                  {p.category || 'PROJEKT ERP'}
                </div>
                <ChevronRight className="w-5 h-5 text-slate-200 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all" />
              </div>

              <h3 className="text-xl font-black text-slate-800 mb-4 uppercase leading-tight group-hover:text-indigo-600 transition-colors tracking-tight">{p.name}</h3>
              <p className="text-xs text-slate-500 font-bold mb-10 line-clamp-3 leading-relaxed opacity-70 group-hover:opacity-100 transition-opacity">{p.description}</p>
              
              <div className="mt-auto">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Postęp Realizacji</span>
                  <span className="text-[10px] font-black text-slate-900">{Math.round(progress)}%</span>
                </div>
                <div className="h-2 w-full bg-slate-50 rounded-full overflow-hidden border border-slate-100 shadow-inner mb-8">
                  <div className={`h-full ${p.color} transition-all duration-1000 shadow-sm`} style={{ width: `${progress}%` }}></div>
                </div>

                <div className="flex items-center justify-between pt-8 border-t border-slate-50">
                   <div className="flex items-center text-[10px] font-black text-slate-400 uppercase tracking-widest">
                     <Clock className="w-3.5 h-3.5 mr-2" /> Start: {new Date(p.createdAt).toLocaleDateString()}
                   </div>
                   <div className="flex -space-x-3">
                     {projectTasks.slice(0, 4).map(t => (
                       <div key={t.id} className="w-9 h-9 rounded-2xl bg-slate-900 border-4 border-white flex items-center justify-center text-[9px] font-black text-white shadow-xl">{getInitials(t.assignees?.[0]?.name)}</div>
                     ))}
                     {projectTasks.length > 4 && (
                       <div className="w-9 h-9 rounded-2xl bg-indigo-600 border-4 border-white flex items-center justify-center text-[9px] font-black text-white shadow-xl">+{projectTasks.length - 4}</div>
                     )}
                   </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderCampaigns = () => (
    <div className="flex-1 flex flex-col p-10 bg-[#f8fafc] min-h-0 overflow-hidden">
      <div className="flex items-center justify-between mb-10 shrink-0">
        <div>
          <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Kampanie Marketingowe</h2>
          <p className="text-sm text-slate-500 font-bold uppercase tracking-widest mt-1">Planowanie Strategiczne i Performance</p>
        </div>
      </div>

      <div className="space-y-8 overflow-y-auto custom-scrollbar pr-4 pb-12">
        {campaigns.map(c => {
          const campaignTasks = tasks.filter(t => t.campaignId === c.id);
          return (
            <div key={c.id} className="bg-white rounded-[3rem] border border-slate-100 p-10 shadow-[0_8px_30px_rgba(0,0,0,0.03)] hover:shadow-[0_40px_80px_rgba(0,0,0,0.1)] transition-all relative overflow-hidden flex flex-col lg:flex-row lg:items-center justify-between gap-10 group">
              <div className={`absolute top-0 left-0 w-full h-2 ${c.color} shadow-lg`}></div>
              
              <div className="flex-1 max-w-2xl">
                <div className={`inline-flex items-center px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] mb-4 ${c.status === 'ACTIVE' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-50 text-slate-400'}`}>
                  {c.status === 'ACTIVE' ? 'KAMPANIA AKTYWNA' : 'PLANOWANIE'}
                </div>
                <h3 className="text-2xl font-black text-slate-800 mb-3 uppercase tracking-tight group-hover:text-pink-600 transition-colors">{c.name}</h3>
                <p className="text-sm text-slate-500 font-bold leading-relaxed opacity-70 group-hover:opacity-100 transition-opacity">{c.description}</p>
              </div>

              <div className="flex items-center space-x-12 shrink-0 bg-slate-50/50 p-8 rounded-[2.5rem] border border-slate-100">
                <div className="text-center">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Zasoby / Zadania</div>
                  <div className="text-3xl font-black text-slate-900 tabular-nums">{campaignTasks.length}</div>
                </div>
                
                <div className="h-12 w-px bg-slate-200"></div>

                <div className="text-center">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Postęp</div>
                  <div className="flex items-center space-x-2">
                     <span className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse shadow-lg shadow-emerald-500/20"></span>
                     <span className="text-[11px] font-black text-slate-900 uppercase">Live Metrics</span>
                  </div>
                </div>

                <button onClick={() => { setSelectedFilterId(c.id); setActiveTab('kanban'); }} className="p-5 bg-slate-900 text-white rounded-[1.5rem] hover:bg-slate-800 transition-all shadow-2xl hover:scale-110 active:scale-95 group-hover:bg-pink-600">
                  <ArrowRight className="w-6 h-6" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderChatInterface = () => (
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
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xs font-black ${u.color} text-white shadow-inner`}>{getInitials(u.name)}</div>
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
               <div key={u.id} className={`w-10 h-10 rounded-2xl border-4 border-white ${u.color} flex items-center justify-center text-[10px] font-black text-white shadow-xl`}>{getInitials(u.name)}</div>
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

  const renderAdminPanel = () => (
    <div className="flex-1 flex flex-col p-12 bg-[#f8fafc] min-h-0 overflow-hidden">
      <div className="flex items-center justify-between mb-12 shrink-0">
        <div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tighter uppercase">Panel Kontrolny</h2>
          <p className="text-sm text-slate-500 font-bold uppercase tracking-widest mt-2">Zarządzanie infrastrukturą Nexus ERP</p>
        </div>
        <div className="flex space-x-4">
          <button className="px-8 py-3 bg-white border border-slate-200 text-slate-900 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-all shadow-sm">Eksport Danych</button>
          <button className="px-8 py-3 bg-indigo-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-indigo-500 shadow-2xl shadow-indigo-200 transition-all">Nowy Operator</button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-12 overflow-y-auto custom-scrollbar pb-12 pr-4">
        {/* User Management Module */}
        <div className="bg-white rounded-[3rem] border border-slate-100 shadow-[0_20px_50px_rgba(0,0,0,0.03)] overflow-hidden flex flex-col h-[40rem] relative group">
          <div className="p-10 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center sticky top-0 z-10 backdrop-blur-md">
            <div className="flex items-center">
              <div className="w-14 h-14 bg-indigo-600 rounded-[1.5rem] flex items-center justify-center mr-6 shadow-2xl shadow-indigo-200">
                <Users className="w-6 h-6 text-white"/>
              </div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-[0.25em]">Kadra Pracownicza</h3>
            </div>
            <button className="p-3 bg-white border border-slate-200 hover:bg-indigo-600 hover:text-white rounded-2xl text-slate-400 transition-all shadow-sm"><Plus className="w-6 h-6"/></button>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] sticky top-0 z-10 border-b border-slate-100">
                <tr>
                  <th className="px-10 py-6">Konsultant / Operator</th>
                  <th className="px-10 py-6 text-center">Rola Systemowa</th>
                  <th className="px-10 py-6 text-right">Zarządzanie</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50/50 transition-all">
                    <td className="px-10 py-8">
                      <div className="flex items-center text-left">
                        <div className={`w-12 h-12 rounded-[1.25rem] ${u.color} flex items-center justify-center text-[11px] font-black text-white mr-5 shadow-xl border-4 border-white`}>
                          {getInitials(u.name)}
                        </div>
                        <div>
                          <div className="text-[13px] font-black text-slate-900 uppercase tracking-tight leading-none mb-1.5">{u.name}</div>
                          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-10 py-8 text-center">
                      <div className="flex flex-col items-center">
                        <span className="px-5 py-2 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-[0.2em] mb-2 shadow-lg">{u.role}</span>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{u.group || 'STANDARD'}</span>
                      </div>
                    </td>
                    <td className="px-10 py-8 text-right">
                      <div className="flex justify-end space-x-3">
                        <button onClick={() => { setEditingUser(u); setIsUserEditModalOpen(true); }} className="p-4 bg-indigo-50 text-indigo-600 rounded-[1.25rem] hover:bg-slate-900 hover:text-white transition-all shadow-sm active:scale-90">
                          <Settings className="w-5 h-5"/>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* System Health Module */}
        <div className="bg-slate-900 rounded-[3rem] p-12 text-white shadow-2xl relative overflow-hidden flex flex-col justify-center">
           <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/20 blur-[100px] rounded-full"></div>
           <div className="relative z-10">
              <h3 className="text-xs font-black text-indigo-400 uppercase tracking-[0.4em] mb-8">System Health & Metrics</h3>
              <div className="grid grid-cols-2 gap-10">
                 <div>
                    <div className="text-4xl font-black tracking-tighter mb-2">99.9%</div>
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Uptime Core</div>
                 </div>
                 <div>
                    <div className="text-4xl font-black tracking-tighter mb-2">24ms</div>
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">API Latency</div>
                 </div>
                 <div>
                    <div className="text-4xl font-black tracking-tighter mb-2">Active</div>
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">PIM Sync</div>
                 </div>
                 <div>
                    <div className="text-4xl font-black tracking-tighter mb-2">Safe</div>
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data Encryption</div>
                 </div>
              </div>
              <div className="mt-12 p-8 bg-white/5 rounded-[2rem] border border-white/10">
                 <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Database Load</span>
                    <span className="text-[10px] font-black text-emerald-400">Normal</span>
                 </div>
                 <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 w-1/3 shadow-lg shadow-indigo-500/50"></div>
                 </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );

  const renderLogin = () => (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-10 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-indigo-600/20 blur-[150px] rounded-full"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-pink-600/10 blur-[150px] rounded-full"></div>
      
      <div className="w-full max-w-xl bg-white/5 backdrop-blur-3xl rounded-[4rem] shadow-[0_50px_100px_rgba(0,0,0,0.5)] overflow-hidden p-16 border border-white/10 relative z-10">
        <div className="flex flex-col items-center text-center mb-16">
          <div className="w-24 h-24 bg-indigo-600 rounded-[2.5rem] flex items-center justify-center shadow-2xl shadow-indigo-500/40 mb-8 animate-in zoom-in duration-700">
            <Zap className="w-12 h-12 text-white fill-white" />
          </div>
          <h1 className="text-5xl font-black text-white tracking-tighter mb-4 uppercase">Nexus ERP</h1>
          <p className="text-slate-400 font-bold uppercase tracking-[0.4em] text-xs">Enterprise Management Engine</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-8">
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] block ml-4">Identyfikator E-mail</label>
            <div className="relative group">
              <Mail className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
              <input type="email" required placeholder="admin@nexus.local" className="w-full pl-16 pr-8 py-5 bg-white/5 border border-white/10 rounded-3xl outline-none focus:ring-4 focus:ring-indigo-500/20 text-white font-bold transition-all placeholder:text-slate-600" value={loginForm.email} onChange={e => setLoginForm({...loginForm, email: e.target.value})} />
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] block ml-4">Hasło Dostępowe</label>
            <div className="relative group">
              <Lock className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
              <input type="password" required placeholder="••••••••" className="w-full pl-16 pr-8 py-5 bg-white/5 border border-white/10 rounded-3xl outline-none focus:ring-4 focus:ring-indigo-500/20 text-white font-bold transition-all placeholder:text-slate-600" value={loginForm.password} onChange={e => setLoginForm({...loginForm, password: e.target.value})} />
            </div>
          </div>

          <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-6 rounded-3xl transition-all shadow-2xl shadow-indigo-600/30 uppercase tracking-[0.2em] text-sm mt-4 active:scale-95">Inicjalizuj Sesję</button>
        </form>

        <div className="mt-16 text-center border-t border-white/5 pt-8">
          <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest">Prywatne Środowisko APS Workspace &copy; 2026</p>
        </div>
      </div>
    </div>
  );

  const renderProducts = () => {
    const isAdmin = currentUser?.role === 'ADMIN';
    return (
      <div className="flex-1 flex flex-col p-10 bg-[#f8fafc] h-full w-full relative min-h-0 overflow-hidden">
        <div className="flex items-center justify-between mb-10 shrink-0">
          <div>
            <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Katalog SKU</h2>
            <p className="text-sm text-slate-500 font-bold uppercase tracking-widest mt-1">Product Information Management & Unit Economics</p>
          </div>
          <div className="flex space-x-4">
            {isAdmin && (
              <>
                <button onClick={() => setIsNewBrandModalOpen(true)} className="px-6 py-3 bg-white border border-slate-200 text-slate-700 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 shadow-sm flex items-center group transition-all">
                  <Target className="w-4 h-4 mr-3 text-indigo-500 group-hover:scale-110 transition-transform" /> Dodaj Markę
                </button>
                <button onClick={() => setIsNewProductModalOpen(true)} className="px-8 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 shadow-2xl flex items-center transition-all">
                  <Plus className="w-4 h-4 mr-3" /> Nowe SKU
                </button>
              </>
            )}
          </div>
        </div>

        <div className="bg-white rounded-[3rem] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.08)] border border-slate-200/50 flex-1 flex flex-col min-h-0 overflow-hidden relative">
          <div className="p-0 overflow-auto custom-scrollbar flex-1">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50/80 sticky top-0 z-10 border-b border-slate-100 backdrop-blur-xl">
                <tr>
                  <th className="p-8 font-black uppercase tracking-[0.2em] text-[10px] text-slate-400">Identyfikacja Produkty</th>
                  <th className="p-8 font-black uppercase tracking-[0.2em] text-[10px] text-slate-400 text-center">Status PIM</th>
                  <th className="p-8 font-black uppercase tracking-[0.2em] text-[10px] text-slate-400">Marka</th>
                  <th className="p-8 font-black uppercase tracking-[0.2em] text-[10px] text-slate-400 text-center">Stock</th>
                  <th className="p-8 font-black uppercase tracking-[0.2em] text-[10px] text-slate-400 text-center">API Sync</th>
                  {isAdmin && (
                    <>
                      <th className="p-8 font-black uppercase tracking-[0.2em] text-[10px] text-slate-400">Struktura Kosztów</th>
                      <th className="p-8 font-black uppercase tracking-[0.2em] text-[10px] text-slate-400 text-right">Analiza Unit Econ.</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {products.map(p => {
                  const tc = p.basePrice + p.inboundTransportCost + p.packagingCost + p.bdoEprCost + p.outboundTransportCost;
                  const margin = p.salePrice - tc;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/50 transition-all group">
                      <td className="p-8">
                        <div className="font-mono text-[9px] font-black text-slate-400 tracking-wider mb-1 uppercase">{p.ean || 'BRAK EAN'}</div>
                        <div className="font-black text-slate-900 text-sm uppercase tracking-tight group-hover:text-indigo-600 transition-colors">{p.name}</div>
                        <div className="text-[10px] font-bold text-slate-400 mt-1 uppercase">SKU: {p.sku}</div>
                      </td>
                      <td className="p-8 text-center">
                        <span className={`text-[9px] font-black px-4 py-1.5 rounded-xl uppercase tracking-widest ${p.status === 'Aktywny' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>{p.status}</span>
                      </td>
                      <td className="p-8">
                        <div className="inline-flex items-center px-4 py-2 bg-indigo-50/50 text-indigo-700 rounded-2xl text-[10px] font-black uppercase tracking-tighter border border-indigo-100/50">
                          <Target className="w-3 h-3 mr-2" /> {p.brand?.name || 'Bez Marki'}
                        </div>
                      </td>
                      <td className="p-8 text-center">
                        <div className="font-black text-slate-800 text-lg tabular-nums tracking-tighter">{p.stock}</div>
                        <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">Sztuk</div>
                      </td>
                      <td className="p-8 text-center">
                        <div className="flex items-center justify-center space-x-3">
                          <div className={`p-2 rounded-xl border ${p.subiektId ? 'bg-emerald-50 border-emerald-100 text-emerald-600 shadow-lg shadow-emerald-500/10' : 'bg-slate-50 border-slate-100 text-slate-300 opacity-30 grayscale'}`}>
                            <Cloud className="w-5 h-5" />
                          </div>
                          <div className={`p-2 rounded-xl border ${p.baselinkerId ? 'bg-blue-50 border-blue-100 text-blue-600 shadow-lg shadow-blue-500/10' : 'bg-slate-50 border-slate-100 text-slate-300 opacity-30 grayscale'}`}>
                            <CloudLightning className="w-5 h-5" />
                          </div>
                        </div>
                      </td>
                      {isAdmin && (
                        <>
                          <td className="p-8">
                            <div className="flex items-center justify-between text-[10px] mb-1">
                              <span className="font-black text-slate-400 uppercase tracking-widest">Koszty Zakupu:</span>
                              <span className="font-bold text-slate-700 tabular-nums">{p.basePrice.toFixed(2)} zł</span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden mb-2">
                               <div className="h-full bg-slate-400" style={{ width: `${(tc/p.salePrice)*100}%` }}></div>
                            </div>
                            <div className="text-[11px] font-black text-slate-900 tabular-nums">TC: {tc.toFixed(2)} zł</div>
                          </td>
                          <td className="p-8 text-right">
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Profitability</div>
                            <div className={`text-xl font-black tabular-nums tracking-tighter ${margin > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {margin > 0 ? '+' : ''}{margin.toFixed(2)} zł
                            </div>
                            <div className={`text-[10px] font-black uppercase ${margin > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                              {((margin / p.salePrice) * 100).toFixed(1)}% Marży
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          <div className="p-8 bg-slate-50/50 border-t border-slate-100 shrink-0 flex justify-between items-center">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Łącznie produktów: {products.length}</span>
            <div className="flex space-x-2">
               <button className="p-2 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-indigo-600 shadow-sm transition-all"><ArrowRight className="w-4 h-4 rotate-180" /></button>
               <button className="px-5 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl">1 – 10</button>
               <button className="p-2 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-indigo-600 shadow-sm transition-all"><ArrowRight className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderKanban = () => {
    const columns = [
      { id: 'TODO', name: 'Zaległe / Backlog', color: 'bg-slate-100', icon: <Clock className="w-3 h-3 mr-2" />, dot: 'bg-slate-400' },
      { id: 'IN_PROGRESS', name: 'W Realizacji', color: 'bg-indigo-50', icon: <PlayCircle className="w-3 h-3 mr-2 text-indigo-600" />, dot: 'bg-indigo-600' },
      { id: 'REVIEW', name: 'Weryfikacja QA', color: 'bg-amber-50', icon: <Eye className="w-3 h-3 mr-2 text-amber-600" />, dot: 'bg-amber-600' },
      { id: 'DONE', name: 'Zakończone', color: 'bg-emerald-50', icon: <CheckCircle2 className="w-3 h-3 mr-2 text-emerald-600" />, dot: 'bg-emerald-600' }
    ];

    let filteredTasks = tasks;
    if (selectedFilterId !== 'all') {
      if (selectedFilterId.startsWith('proj_')) {
        filteredTasks = tasks.filter(t => t.projectId === selectedFilterId.replace('proj_', ''));
      } else {
        filteredTasks = tasks.filter(t => t.campaignId === selectedFilterId);
      }
    }

    return (
      <div className="flex-1 flex flex-col h-full bg-[#f8fafc] min-h-0 overflow-hidden">
        {/* KANBAN FILTERS / TOOLBAR */}
        <div className="px-10 py-6 flex items-center justify-between border-b border-slate-200/50 bg-white/50 shrink-0">
          <div className="flex items-center space-x-3 overflow-x-auto custom-scrollbar no-scrollbar scroll-smooth">
            <div onClick={() => setSelectedFilterId('all')} className={`px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest cursor-pointer border-2 transition-all shrink-0 ${selectedFilterId === 'all' ? 'bg-slate-900 text-white border-slate-900 shadow-xl shadow-slate-900/20' : 'bg-white text-slate-500 border-slate-100 hover:border-indigo-200'}`}>Wszystkie</div>
            {campaigns.map(c => (
              <div key={c.id} onClick={() => setSelectedFilterId(c.id)} className={`px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest cursor-pointer border-2 transition-all shrink-0 flex items-center ${selectedFilterId === c.id ? `${c.color} text-white border-transparent shadow-xl shadow-pink-200/50 scale-105` : 'bg-white text-slate-500 border-slate-100 hover:border-pink-200 group'}`}>
                <Megaphone className="w-3.5 h-3.5 mr-2" /> {c.name}
              </div>
            ))}
            {projects.map(p => (
              <div key={p.id} onClick={() => setSelectedFilterId(`proj_${p.id}`)} className={`px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest cursor-pointer border-2 transition-all shrink-0 flex items-center ${selectedFilterId === `proj_${p.id}` ? `${p.color} text-white border-transparent shadow-xl shadow-indigo-200/50 scale-105` : 'bg-white text-slate-500 border-slate-100 hover:border-indigo-200'}`}>
                <Folder className="w-3.5 h-3.5 mr-2" /> {p.name}
              </div>
            ))}
          </div>

          <button onClick={() => setIsNewTaskModalOpen(true)} className="px-8 py-3 bg-slate-900 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-2xl flex items-center">
            <Plus className="w-4 h-4 mr-2" /> Dodaj Zadanie
          </button>
        </div>

        {/* KANBAN BOARD CONTENT */}
        <div className="flex-1 overflow-x-auto p-10 flex space-x-10 scroll-smooth">
          {columns.map(col => (
            <div key={col.id} className="w-[22rem] flex-shrink-0 flex flex-col min-h-0 bg-slate-50/50 rounded-[3rem] p-4 border border-slate-200/30">
              <div className="flex items-center justify-between px-6 py-4 mb-4">
                <div className="flex items-center">
                  <span className={`w-2 h-2 rounded-full ${col.dot} mr-3 shadow-md`}></span>
                  <span className="text-[11px] font-black text-slate-800 uppercase tracking-[0.2em]">{col.name}</span>
                </div>
                <span className="bg-white/80 px-3 py-1 rounded-xl text-[10px] font-black text-slate-500 border border-slate-100 shadow-sm">{filteredTasks.filter(t => t.status === col.id).length}</span>
              </div>
              
              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-5 px-2 pb-6">
                {filteredTasks.filter(t => t.status === col.id).map(task => (
                  <div key={task.id} onClick={() => setSelectedTask(task)} className="group bg-white p-6 rounded-[2rem] border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-[0_20px_40px_rgba(0,0,0,0.08)] hover:border-indigo-200 transition-all cursor-pointer relative overflow-hidden active:scale-[0.98]">
                    {task.isBlocked && <div className="absolute top-0 right-0 bg-red-500 text-white p-2 rounded-bl-2xl shadow-lg ring-4 ring-white animate-bounce z-10"><AlertOctagon className="w-4 h-4" /></div>}
                    
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-2">
                         <span className={`text-[9px] font-black text-slate-400 font-mono tracking-tight uppercase`}>{task.taskId}</span>
                         <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest ${task.priority === 'HIGH' ? 'bg-red-50 text-red-600' : task.priority === 'MEDIUM' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-50 text-slate-400'}`}>
                           {task.priority}
                         </span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-200 group-hover:text-indigo-400 transition-colors" />
                    </div>

                    <h3 className="text-[13px] font-black text-slate-800 leading-snug mb-4 group-hover:text-indigo-600 transition-colors uppercase tracking-tight">{task.title}</h3>
                    
                    {task.project && (
                      <div className={`inline-flex items-center px-4 py-1.5 rounded-xl border border-slate-50 bg-slate-50/50 text-[10px] font-black text-slate-500 uppercase tracking-tighter mb-5`}>
                        <Folder className="w-3 h-3 mr-2" /> {task.project.name}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                      <div className="flex -space-x-2">
                        {task.assignees?.slice(0, 3).map(a => (
                          <div key={a.id} title={a.name} className={`w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-black ${a.color} text-white ring-4 ring-white shadow-sm`}>{getInitials(a.name)}</div>
                        ))}
                        {task.assignees?.length > 3 && (
                          <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-[8px] font-black text-slate-400 ring-4 ring-white shadow-sm">+{task.assignees.length - 3}</div>
                        )}
                      </div>
                      
                      <div className="flex items-center space-x-3 text-slate-400">
                        {task._count?.comments > 0 && <div className="text-[10px] font-black flex items-center"><MessageCircle className="w-3.5 h-3.5 mr-1" /> {task._count.comments}</div>}
                        <Clock className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>
                ))}
                
                {filteredTasks.filter(t => t.status === col.id).length === 0 && (
                  <div className="py-20 flex flex-col items-center justify-center opacity-30 grayscale pointer-events-none">
                    <Zap className="w-10 h-10 text-slate-300 mb-4" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Pusto...</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderProjectDetails = () => {
    if (!selectedProject) return null;
    const projectTasks = tasks.filter(t => t.projectId === selectedProject.id);
    const projectUsers = [...new Set(projectTasks.flatMap(t => t.assignees || []))];
    const doneTasks = projectTasks.filter(t => t.status === 'DONE').length;
    const progress = projectTasks.length > 0 ? (doneTasks / projectTasks.length) * 100 : 0;

    return (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex justify-end animate-in fade-in duration-300">
        <div className="w-full max-w-[50rem] bg-white h-full shadow-[-40px_0_100px_rgba(0,0,0,0.2)] flex flex-col animate-in slide-in-from-right duration-500 overflow-hidden">
          {/* Header Drawer */}
          <div className="p-10 border-b border-slate-100 flex justify-between items-center bg-[#f8fafc] shrink-0">
            <div className="flex items-center">
              <div className={`w-4 h-16 ${selectedProject.color} rounded-full mr-8 shadow-xl`}></div>
              <div>
                <div className="flex items-center space-x-3 mb-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Operational Unit</span>
                  <span className={`px-3 py-1 rounded-lg ${selectedProject.color.replace('bg-', 'bg-').replace('500', '50')} ${selectedProject.color.replace('bg-', 'text-').replace('500', '700')} text-[9px] font-black uppercase tracking-widest`}>{selectedProject.category || 'PROJECT'}</span>
                </div>
                <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none">{selectedProject.name}</h3>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <button className="p-4 hover:bg-white bg-slate-100/50 rounded-2xl text-slate-400 hover:text-indigo-600 transition-all border border-transparent hover:border-slate-100"><Settings className="w-6 h-6" /></button>
              <button onClick={() => setSelectedProject(null)} className="p-4 hover:bg-slate-900 bg-slate-100 rounded-2xl text-slate-400 hover:text-white transition-all shadow-sm"><X className="w-6 h-6" /></button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-12 space-y-12 bg-white">
            {/* Stats Bar */}
            <div className="grid grid-cols-3 gap-8">
               <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Zasoby</div>
                  <div className="text-2xl font-black text-slate-900">{projectTasks.length} <span className="text-slate-400 text-sm">Zadań</span></div>
               </div>
               <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Ukończono</div>
                  <div className="text-2xl font-black text-slate-900">{doneTasks} <span className="text-slate-400 text-sm">Tasków</span></div>
               </div>
               <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Postęp</div>
                  <div className="text-2xl font-black text-indigo-600">{Math.round(progress)}%</div>
               </div>
            </div>

            {/* Description Section */}
            <div>
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-6 flex items-center">
                <Layout className="w-4 h-4 mr-3" /> Brief i Założenia
              </h4>
              <div className="bg-slate-50/50 rounded-[2.5rem] p-8 border border-slate-100 relative group">
                <p className="text-slate-600 text-sm font-bold leading-relaxed italic pr-12">"{selectedProject.description}"</p>
                <div className="h-10 w-px bg-slate-200 absolute right-8 top-1/2 -translate-y-1/2 opacity-30"></div>
              </div>
            </div>

            {/* Team Section */}
            <div>
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-8 flex items-center">
                <Users className="w-4 h-4 mr-3" /> Zespół Dedykowany
              </h4>
              <div className="flex flex-wrap gap-4">
                {projectUsers.length > 0 ? projectUsers.map(u => (
                  <div key={u.id} className="flex items-center bg-white px-6 py-3 rounded-[1.5rem] border border-slate-100 shadow-sm hover:border-indigo-200 transition-all cursor-default">
                    <div className={`w-10 h-10 rounded-2xl ${u.color} flex items-center justify-center text-[10px] font-black text-white mr-4 shadow-xl border-4 border-white`}>{getInitials(u.name)}</div>
                    <div>
                      <div className="text-[11px] font-black text-slate-900 uppercase tracking-tight">{u.name}</div>
                      <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{u.department}</div>
                    </div>
                  </div>
                )) : <div className="text-[11px] font-black text-slate-300 uppercase tracking-widest py-4">Brak przypisanych osób</div>}
              </div>
            </div>

            {/* Task List Section */}
            <div>
              <div className="flex items-center justify-between mb-8">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center">
                  <Hash className="w-4 h-4 mr-3" /> Rejestr Zadań ({projectTasks.length})
                </h4>
                <button className="text-[9px] font-black text-indigo-600 hover:text-indigo-800 uppercase tracking-widest flex items-center transition-colors">
                  <Plus className="w-3 h-3 mr-1" /> Dodaj Szybko
                </button>
              </div>
              <div className="space-y-4">
                {projectTasks.map(t => (
                  <div key={t.id} onClick={() => setSelectedTask(t)} className="p-6 bg-white border border-slate-100 rounded-[2rem] hover:shadow-xl hover:border-indigo-100 transition-all cursor-pointer group flex items-center justify-between">
                    <div className="flex items-center">
                       <div className={`w-2 h-10 rounded-full mr-6 ${t.isBlocked ? 'bg-red-500' : 'bg-slate-100'}`}></div>
                       <div>
                         <div className="flex items-center space-x-3 mb-1">
                           <span className="text-[9px] font-black text-slate-400 font-mono">{t.taskId}</span>
                           <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest ${t.status === 'DONE' ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'}`}>{t.status}</span>
                         </div>
                         <h5 className="text-[13px] font-black text-slate-800 uppercase tracking-tight group-hover:text-indigo-600 transition-colors leading-tight">{t.title}</h5>
                       </div>
                    </div>
                    <div className="flex -space-x-2">
                      {t.assignees?.slice(0, 2).map(a => (
                        <div key={a.id} className={`w-8 h-8 rounded-xl border-2 border-white ${a.color} flex items-center justify-center text-[8px] font-black text-white shadow-sm`}>{getInitials(a.name)}</div>
                      ))}
                    </div>
                  </div>
                ))}
                {projectTasks.length === 0 && <div className="py-20 text-center text-slate-300 font-black text-[10px] uppercase tracking-widest border-2 border-dashed border-slate-50 rounded-[2rem]">Projekt nie ma jescze zadań</div>}
              </div>
            </div>
          </div>
          
          {/* Footer Drawer */}
          <div className="p-10 bg-slate-50 border-t border-slate-100 shrink-0">
             <div className="flex items-center justify-between">
                <div className="flex flex-col">
                   <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Utworzono</span>
                   <span className="text-xs font-black text-slate-800 uppercase">{new Date(selectedProject.createdAt).toLocaleDateString()}</span>
                </div>
                <button className="px-10 py-5 bg-slate-900 text-white rounded-[1.5rem] text-[11px] font-black uppercase tracking-widest hover:bg-slate-800 hover:scale-105 active:scale-95 transition-all shadow-2xl">Zakończ Projekt</button>
             </div>
          </div>
        </div>
      </div>
    );
  };

  const renderTaskDetails = () => {
    if (!selectedTask) return null;
    return (
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xl z-[110] flex items-center justify-center p-8 animate-in fade-in duration-300">
        <div className="w-full max-w-5xl bg-white h-full max-h-[55rem] rounded-[4rem] shadow-[0_50px_150px_rgba(0,0,0,0.3)] flex flex-col animate-in zoom-in duration-500 overflow-hidden relative">
          
          {/* Top Bar */}
          <div className="p-10 border-b border-slate-100 flex justify-between items-center bg-[#f8fafc] shrink-0">
            <div className="flex items-center space-x-6">
              <span className="text-xs font-black text-slate-400 font-mono tracking-widest">{selectedTask.taskId}</span>
              <div className={`px-5 py-2 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg ${selectedTask.status === 'DONE' ? 'bg-emerald-500 text-white shadow-emerald-500/20' : 'bg-indigo-600 text-white shadow-indigo-600/20'}`}>{selectedTask.status}</div>
              <div className={`px-5 py-2 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] border-2 ${selectedTask.priority === 'HIGH' ? 'border-red-500 text-red-600' : 'border-slate-200 text-slate-400'}`}>{selectedTask.priority} Priority</div>
            </div>
            <button onClick={() => setSelectedTask(null)} className="p-5 hover:bg-slate-900 hover:text-white bg-white border border-slate-100 rounded-[2rem] transition-all text-slate-400 shadow-sm"><X className="w-6 h-6" /></button>
          </div>

          <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
            {/* Left Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-12 space-y-12">
               <div>
                 <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter leading-tight mb-6">{selectedTask.title}</h2>
                 <p className="text-slate-500 font-bold leading-relaxed text-base italic opacity-80 border-l-4 border-indigo-100 pl-8 transition-opacity hover:opacity-100">{selectedTask.description || 'Pusto tutaj... brak opisu technicznego.'}</p>
               </div>

               {selectedTask.isBlocked && (
                 <div className="bg-rose-50 border border-rose-100 rounded-[2.5rem] p-10 flex items-start space-x-6 shadow-2xl shadow-rose-500/10">
                   <div className="p-4 bg-rose-500 rounded-3xl text-white shadow-lg animate-pulse"><AlertOctagon className="w-8 h-8" /></div>
                   <div>
                     <h4 className="text-sm font-black text-rose-900 uppercase tracking-tight mb-2">Blokada Systemowa</h4>
                     <p className="text-rose-600 text-sm font-bold leading-relaxed">{selectedTask.blockReason}</p>
                   </div>
                 </div>
               )}

               <div className="pt-12 border-t border-slate-50">
                 <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] mb-10 flex items-center">
                   <MessageCircle className="w-5 h-5 mr-4" /> Activity Stream
                 </h4>
                 <div className="space-y-10">
                    <div className="flex space-x-6 animate-in slide-in-from-left duration-300">
                       <div className="w-12 h-12 rounded-2xl bg-slate-900 flex-shrink-0 flex items-center justify-center text-[10px] font-black text-white shadow-lg">AD</div>
                       <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                             <span className="text-[11px] font-black text-slate-900 uppercase tracking-tight">System Admin</span>
                             <span className="text-[9px] font-black text-slate-300 uppercase">Dzisiaj, 14:20</span>
                          </div>
                          <div className="bg-slate-50 p-6 rounded-[2rem] rounded-tl-none border border-slate-100 text-[13px] font-bold text-slate-600 leading-relaxed">System zsynchronizował to zadanie z tablicą Nexus 2.0. Status ustawiony na domyślny.</div>
                       </div>
                    </div>
                    {/* Placeholder for real comments */}
                    <div className="text-center py-16 text-slate-300 font-black text-[10px] uppercase tracking-widest border-2 border-dashed border-slate-50 rounded-[3rem]">Brak nowych komentarzy w wątku</div>
                 </div>
               </div>
            </div>

            {/* Right Sidebar Details */}
            <div className="w-full lg:w-96 bg-[#f8fafc] border-l border-slate-100 p-12 space-y-10 shrink-0">
               <div className="space-y-3">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Jednostka Nadrzędna</h4>
                  <div className="flex items-center bg-white p-5 rounded-[1.5rem] border border-slate-100 shadow-sm hover:border-indigo-200 transition-colors">
                     <Folder className="w-5 h-5 text-indigo-500 mr-4" />
                     <span className="text-xs font-black text-slate-800 uppercase truncate">{selectedTask.project?.name || selectedTask.campaign?.name || 'Operacja Wolnostojąca'}</span>
                  </div>
               </div>

               <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Operatorzy</h4>
                  <div className="space-y-3">
                    {selectedTask.assignees?.map(a => (
                      <div key={a.id} className="flex items-center bg-white px-5 py-3 rounded-[1.5rem] border border-slate-100 shadow-sm">
                        <div className={`w-10 h-10 rounded-2xl ${a.color} flex items-center justify-center text-[10px] font-black text-white mr-4 shadow-xl border-4 border-white`}>{getInitials(a.name)}</div>
                        <span className="text-xs font-black text-slate-900 uppercase tracking-tight">{a.name}</span>
                      </div>
                    ))}
                    {(!selectedTask.assignees || selectedTask.assignees.length === 0) && <div className="text-[10px] font-black text-slate-300 uppercase py-4">Brak operatorów</div>}
                  </div>
                  <button className="w-full py-4 text-[10px] font-black text-indigo-600 hover:bg-white rounded-2xl border border-dashed border-indigo-200 uppercase tracking-widest transition-all mt-4">+ Przypisz Osobę</button>
               </div>

               <div className="pt-10 space-y-6">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Timeline</h4>
                  <div className="flex items-center text-xs font-black text-slate-800">
                     <Clock className="w-5 h-5 mr-4 text-slate-300" />
                     <span className="uppercase">Due Date: </span>
                     <span className="ml-auto">Brak Terminu</span>
                  </div>
               </div>
            </div>
          </div>

          {/* Comment Input Footer */}
          <div className="p-12 bg-white border-t border-slate-100 shrink-0">
            <div className="flex items-center space-x-6">
               <div className="w-14 h-14 bg-indigo-600 rounded-[1.5rem] flex items-center justify-center text-white shadow-2xl flex-shrink-0">{getInitials(currentUser?.name)}</div>
               <div className="flex-1 flex items-center bg-slate-50 p-3 rounded-[2.5rem] border border-slate-200 focus-within:ring-8 focus-within:ring-indigo-600/5 transition-all">
                  <input placeholder="Dodaj komentarz techniczny..." className="flex-1 bg-transparent border-none outline-none px-6 py-2 text-sm font-bold placeholder:text-slate-400" />
                  <button className="p-5 bg-slate-900 text-white rounded-[1.5rem] hover:bg-indigo-600 transition-all shadow-xl active:scale-90"><Send className="w-6 h-6"/></button>
               </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderModals = () => {
    const inputClass = "w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-slate-800 focus:ring-4 focus:ring-indigo-600/10 focus:border-indigo-600/30 transition-all placeholder:text-slate-400";
    const labelClass = "text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 block ml-2";

    return (
      <>
        {/* Nowe Zadanie */}
        {isNewTaskModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[120] flex items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="bg-white rounded-[3rem] shadow-[0_50px_100px_rgba(0,0,0,0.3)] w-full max-w-2xl overflow-hidden animate-in zoom-in duration-500 flex flex-col max-h-[90vh]">
              <div className="p-10 bg-[#f8fafc] border-b border-slate-100 flex justify-between items-center shrink-0">
                <div className="flex items-center">
                  <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center mr-6 shadow-xl">
                    <Zap className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Inicjacja Zadania</h3>
                </div>
                <button onClick={() => setIsNewTaskModalOpen(false)} className="p-4 hover:bg-white rounded-2xl transition-all text-slate-400 border border-transparent hover:border-slate-100"><X className="w-6 h-6" /></button>
              </div>
              <form onSubmit={handleCreateTask} className="p-10 space-y-8 overflow-y-auto custom-scrollbar">
                <div>
                  <label className={labelClass}>Tytuł Operacyjny</label>
                  <input required placeholder="Np. Optymalizacja konwersji Checkout..." className={inputClass} value={newTaskForm.title} onChange={e => setNewTaskForm({...newTaskForm, title: e.target.value})} />
                </div>
                <div>
                  <label className={labelClass}>Szczegółowy Opis Techniczny</label>
                  <textarea placeholder="Zdefiniuj zakres prac i oczekiwany rezultat..." className={`${inputClass} h-40 resize-none`} value={newTaskForm.description} onChange={e => setNewTaskForm({...newTaskForm, description: e.target.value})} />
                </div>
                <div className="grid grid-cols-2 gap-8">
                  <div>
                    <label className={labelClass}>Przypisz do Projektu</label>
                    <select className={inputClass} value={newTaskForm.projectId} onChange={e => setNewTaskForm({...newTaskForm, projectId: e.target.value})}>
                      <option value="">Brak (Zadanie Generalne)</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Priorytet Realizacji</label>
                    <select className={inputClass} value={newTaskForm.priority} onChange={e => setNewTaskForm({...newTaskForm, priority: e.target.value})}>
                      <option value="LOW">LOW - Standard</option>
                      <option value="MEDIUM">MEDIUM - Business Needs</option>
                      <option value="HIGH">HIGH - Critical / Hotfix</option>
                    </select>
                  </div>
                </div>
                <button type="submit" className="w-full py-6 bg-slate-900 text-white font-black rounded-3xl shadow-2xl hover:bg-indigo-600 hover:scale-[1.02] active:scale-[0.98] transition-all uppercase tracking-[0.2em] text-sm mt-4">Uruchom Przepływ Zadania</button>
              </form>
            </div>
          </div>
        )}

        {/* Nowa Marka (PIM) */}
        {isNewBrandModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[120] flex items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in duration-500">
              <div className="p-10 border-b border-slate-100 flex justify-between items-center bg-[#f8fafc]">
                 <div className="flex items-center">
                    <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center mr-6 shadow-xl shadow-indigo-200">
                       <Target className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Rejestracja Marki</h3>
                 </div>
                 <button onClick={() => setIsNewBrandModalOpen(false)} className="p-4 hover:bg-white rounded-2xl transition-all text-slate-400"><X className="w-6 h-6" /></button>
              </div>
              <form onSubmit={handleCreateBrand} className="p-10 space-y-8">
                <div>
                  <label className={labelClass}>Nazwa Brandu</label>
                  <input required placeholder="Np. Nexus Luxury..." type="text" className={inputClass} value={newBrandName} onChange={e => setNewBrandName(e.target.value)} />
                </div>
                <button type="submit" className="w-full py-6 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-3xl shadow-2xl shadow-indigo-600/20 transition-all uppercase tracking-[0.2em] text-sm active:scale-95">Zatwierdź w Bazie PIM</button>
              </form>
            </div>
          </div>
        )}

        {/* Nowy Produkt (PIM) */}
        {isNewProductModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[120] flex items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="bg-white rounded-[4rem] shadow-[0_50px_150px_rgba(0,0,0,0.4)] w-full max-w-4xl overflow-hidden animate-in zoom-in duration-700 max-h-[90vh] flex flex-col relative">
              <div className="p-10 border-b border-slate-100 flex justify-between items-center bg-[#f8fafc] shrink-0">
                <div className="flex items-center">
                   <div className="w-16 h-16 bg-slate-900 rounded-[1.5rem] flex items-center justify-center mr-8 shadow-2xl shadow-black/20">
                      <Hash className="w-8 h-8 text-white" />
                   </div>
                   <div>
                     <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Nowa Karta Produktu SKU</h3>
                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Inicjalizacja Modułu PIM & Unit Economics</p>
                   </div>
                </div>
                <button onClick={() => setIsNewProductModalOpen(false)} className="p-6 hover:bg-white rounded-3xl transition-all text-slate-400 border border-transparent hover:border-slate-100 shadow-sm"><X className="w-8 h-8" /></button>
              </div>
              <form onSubmit={handleCreateProduct} className="p-12 space-y-12 overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-2 gap-10">
                  <div className="col-span-2">
                    <label className={labelClass}>Oficjalna Nazwa Handlowa *</label>
                    <input required placeholder="Np. Nexus Core Ultra S1..." type="text" className={inputClass} value={newProductForm.name} onChange={e => setNewProductForm({...newProductForm, name: e.target.value})} />
                  </div>
                  <div>
                    <label className={labelClass}>Indywidualny Kod EAN *</label>
                    <input required placeholder="8-13 cyfr..." type="text" className={`${inputClass} font-mono`} value={newProductForm.ean} onChange={e => setNewProductForm({...newProductForm, ean: e.target.value})} />
                  </div>
                  <div>
                    <label className={labelClass}>SKU (Identyfikator Wewnętrzny) *</label>
                    <input required placeholder="NEX-XXX-001..." type="text" className={`${inputClass} font-mono`} value={newProductForm.sku} onChange={e => setNewProductForm({...newProductForm, sku: e.target.value})} />
                  </div>
                  <div>
                    <label className={labelClass}>Przynależność Brandowa *</label>
                    <select required className={inputClass} value={newProductForm.brandId} onChange={e => setNewProductForm({...newProductForm, brandId: e.target.value})}>
                      <option value="">Wybierz markę z listy...</option>
                      {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Stan Magazynowy Początkowy</label>
                    <input type="number" placeholder="0" className={inputClass} value={newProductForm.stock} onChange={e => setNewProductForm({...newProductForm, stock: e.target.value})} />
                  </div>
                </div>

                <div className="pt-12 border-t border-slate-100">
                  <h4 className="text-sm font-black text-indigo-600 uppercase tracking-[0.3em] mb-10 flex items-center">
                    <DollarSign className="w-6 h-6 mr-4" /> Struktura Analityczna Unit Economics
                  </h4>
                  <div className="grid grid-cols-3 gap-8">
                    <div><label className={labelClass}>Cena Zakupu netto</label><input type="number" step="0.01" className={inputClass} value={newProductForm.basePrice} onChange={e => setNewProductForm({...newProductForm, basePrice: e.target.value})} /></div>
                    <div><label className={labelClass}>Transport In (cła)</label><input type="number" step="0.01" className={inputClass} value={newProductForm.inboundTransportCost} onChange={e => setNewProductForm({...newProductForm, inboundTransportCost: e.target.value})} /></div>
                    <div><label className={labelClass}>Koszty pakowania</label><input type="number" step="0.01" className={inputClass} value={newProductForm.packagingCost} onChange={e => setNewProductForm({...newProductForm, packagingCost: e.target.value})} /></div>
                    <div><label className={labelClass}>BDO / Śmieci</label><input type="number" step="0.01" className={inputClass} value={newProductForm.bdoEprCost} onChange={e => setNewProductForm({...newProductForm, bdoEprCost: e.target.value})} /></div>
                    <div><label className={labelClass}>Logistyka Out</label><input type="number" step="0.01" className={inputClass} value={newProductForm.outboundTransportCost} onChange={e => setNewProductForm({...newProductForm, outboundTransportCost: e.target.value})} /></div>
                    <div>
                      <label className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.3em] mb-3 block ml-2">Cena Sprzedaży Detalicznej *</label>
                      <input required type="number" step="0.01" className="w-full px-6 py-4 bg-indigo-50 border-2 border-indigo-200 rounded-2xl outline-none font-black text-indigo-700 text-lg shadow-inner focus:ring-8 focus:ring-indigo-600/5 transition-all" value={newProductForm.salePrice} onChange={e => setNewProductForm({...newProductForm, salePrice: e.target.value})} />
                    </div>
                  </div>
                </div>

                <button type="submit" className="w-full py-7 bg-slate-900 hover:bg-indigo-600 text-white font-black rounded-[2rem] shadow-[0_25px_60px_rgba(0,0,0,0.2)] hover:shadow-indigo-600/30 transition-all uppercase tracking-[0.3em] text-sm mt-6 mb-10 group flex items-center justify-center">
                   <Cloud className="w-6 h-6 mr-4 group-hover:animate-bounce" /> Zapisz i Synchronizuj SKU
                </button>
              </form>
            </div>
          </div>
        )}
        {renderProjectDetails()}
        {renderTaskDetails()}
      </>
    );
  };

  if (!token) return renderLogin();

  return (
    <div className="flex h-screen bg-[#f8fafc] text-slate-900 font-sans overflow-hidden">
      {/* ENTERPRISE SIDEBAR */}
      <aside className="w-80 bg-slate-900 flex flex-col z-[60] shadow-[10px_0_40px_rgba(0,0,0,0.1)] relative">
        <div className="p-8 pb-12">
          <div className="flex items-center space-x-4 mb-4">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Zap className="w-7 h-7 text-white fill-white" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white tracking-tighter leading-none">NEXUS ERP</h1>
              <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] mt-1 block">APS Workspace</span>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-2 overflow-y-auto custom-scrollbar">
          <div className="px-4 mb-4 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Menu Systemowe</div>
          
          <button onClick={() => setActiveTab('kanban')} className={`w-full px-6 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center group ${activeTab === 'kanban' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
            <Layout className={`w-5 h-5 mr-4 transition-colors ${activeTab === 'kanban' ? 'text-white' : 'text-slate-500 group-hover:text-indigo-400'}`} /> 
            Tablica Zadań
          </button>

          <button onClick={() => setActiveTab('campaigns')} className={`w-full px-6 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center group ${activeTab === 'campaigns' ? 'bg-white/10 text-white border border-white/10' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
            <Megaphone className={`w-5 h-5 mr-4 transition-colors ${activeTab === 'campaigns' ? 'text-pink-400' : 'text-slate-500 group-hover:text-pink-400'}`} /> 
            Kampanie Marketing
          </button>

          {currentUser?.group !== 'AGENCJE' && (
            <>
              <button onClick={() => setActiveTab('projects')} className={`w-full px-6 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center group ${activeTab === 'projects' ? 'bg-white/10 text-white border border-white/10' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
                <Folder className={`w-5 h-5 mr-4 transition-colors ${activeTab === 'projects' ? 'text-emerald-400' : 'text-slate-500 group-hover:text-emerald-400'}`} /> 
                Projekty i Jednostki
              </button>
              
              <button onClick={() => setActiveTab('products')} className={`w-full px-6 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center group ${activeTab === 'products' ? 'bg-white/10 text-white border border-white/10' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
                <Hash className={`w-5 h-5 mr-4 transition-colors ${activeTab === 'products' ? 'text-orange-400' : 'text-slate-500 group-hover:text-orange-400'}`} /> 
                Katalog SKU (PIM)
              </button>

              <button onClick={() => setActiveTab('chat')} className={`w-full px-6 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center group relative ${activeTab === 'chat' ? 'bg-white/10 text-white border border-white/10' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
                <MessageCircle className={`w-5 h-5 mr-4 transition-colors ${activeTab === 'chat' ? 'text-indigo-400' : 'text-slate-500 group-hover:text-indigo-400'}`} /> 
                Komunikator
                {unreadDMs.total > 0 && <span className="ml-auto bg-red-600 text-white text-[10px] font-black h-5 w-5 rounded-full flex items-center justify-center animate-pulse">{unreadDMs.total}</span>}
              </button>
            </>
          )}

          {currentUser?.role === 'ADMIN' && (
            <div className="pt-8">
              <div className="px-4 mb-4 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Administracja</div>
              <button onClick={() => setActiveTab('admin')} className={`w-full px-6 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center group ${activeTab === 'admin' ? 'bg-white/10 text-white border border-white/10' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
                <Settings className={`w-5 h-5 mr-4 transition-colors ${activeTab === 'admin' ? 'text-white' : 'text-slate-500 group-hover:text-white'}`} /> 
                Ustawienia Master
              </button>
            </div>
          )}
        </nav>

        <div className="p-6 mt-auto">
          <div className="bg-slate-800/50 rounded-[2rem] p-4 border border-slate-700/50">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-[10px] font-black text-white shadow-inner">{getInitials(currentUser?.name)}</div>
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] font-black text-white truncate leading-none">{currentUser?.name}</span>
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1 truncate">{currentUser?.department}</span>
              </div>
            </div>
            <button onClick={handleLogout} className="w-full mt-4 py-3 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all">Wyloguj</button>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        <header className="h-24 sticky top-0 flex items-center justify-between px-10 bg-white/70 backdrop-blur-xl border-b border-slate-200/50 z-50">
          <div className="flex items-center space-x-6">
            <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">
              {activeTab === 'kanban' && 'Tablica Zadań'}
              {activeTab === 'campaigns' && 'Kampanie Marketingowe'}
              {activeTab === 'projects' && 'Zarządzanie Projektami'}
              {activeTab === 'products' && 'Katalog Produktów SKU'}
              {activeTab === 'chat' && 'Centrum Komunikacji'}
              {activeTab === 'admin' && 'Panel Administratora Systemu'}
            </h2>
          </div>

          <div className="flex items-center space-x-6">
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 transition-colors group-focus-within:text-indigo-600" />
              <input type="text" placeholder="Szukaj w Nexus..." className="pl-12 pr-6 py-3 bg-slate-100 border-none rounded-2xl text-xs font-bold focus:ring-2 focus:ring-indigo-600/20 w-64 transition-all" />
            </div>

            <button onClick={() => { setShowNotifications(!showNotifications); if(!showNotifications) fetchData(); }} className="p-3 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-2xl transition-all relative border border-transparent">
              <Bell className="w-6 h-6" />
              {notifications.some(n => !n.isRead) && <span className="absolute top-2 right-2 w-3 h-3 bg-red-500 rounded-full border-2 border-white animate-pulse"></span>}
            </button>

            {showNotifications && (
              <div className="absolute right-10 top-24 w-96 bg-white rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-slate-100 z-[100] overflow-hidden">
                <div className="p-6 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center"><h4 className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-800">Powiadomienia</h4><button onClick={() => setShowNotifications(false)} className="text-slate-400 hover:text-slate-800"><X className="w-5 h-5"/></button></div>
                <div className="max-h-[30rem] overflow-y-auto custom-scrollbar">
                  {notifications.length === 0 ? <div className="p-10 text-center text-slate-400 font-bold text-xs italic">Brak nowych powiadomień</div> : notifications.map(n => (
                    <div key={n.id} onClick={() => handleNotificationClick(n)} className={`p-6 border-b border-slate-50 cursor-pointer hover:bg-slate-50 transition-all ${n.isRead ? 'opacity-50' : ''}`}>
                      <div className="flex items-center mb-1">
                        <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest">{n.title}</span>
                      </div>
                      <p className="text-xs text-slate-500 font-bold leading-relaxed">{n.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-hidden relative">
          {activeTab === 'kanban' && renderKanban()}
          {activeTab === 'campaigns' && renderCampaigns()}
          {activeTab === 'projects' && renderProjectsView()}
          {activeTab === 'products' && renderProducts()}
          {activeTab === 'chat' && renderChatInterface()}
          {activeTab === 'admin' && renderAdminPanel()}
        </div>
      </main>

      {renderModals()}
    </div>
  );
}

export default App;
