import React, { useState, useEffect, useMemo, useRef } from 'react';
import NewTaskModal from './views/NewTaskModal';
import UniversalChat from './components/UniversalChat';
import TaskDetailsDrawer from './views/TaskDetailsDrawer';
import KanbanView from './views/KanbanView';
import ProjectsView from './views/ProjectsView';
import CampaignsView from './views/CampaignsView';
import NewCampaignModal from './views/NewCampaignModal';
import CampaignDetailsDrawer from './views/CampaignDetailsDrawer';
import ProductsView from './views/ProductsView';
import AdminPanelView from './views/AdminPanelView';
import axios from 'axios';
import { io } from 'socket.io-client';
import { 
  Plus, Layout, Settings, Folder, Hash, MessageCircle, Megaphone, 
  Bell, X, Search, ChevronRight, Clock, ShieldAlert, AlertOctagon, 
  PlayCircle, StopCircle, Cloud, CloudLightning, Target, Zap, 
  Loader2, Paperclip, Send, Users, User, DollarSign, ArrowRight, CheckCircle2,
  Trash2, Mail, Lock, Shield, Eye, EyeOff, Check, Filter, Calendar
} from 'lucide-react';

import { getInitials, getDepartmentColor } from './utils';

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
  const [isNewBrandModalOpen, setIsNewBrandModalOpen] = useState(false);
  const [isNewProductModalOpen, setIsNewProductModalOpen] = useState(false);
  const [isNewCampaignModalOpen, setIsNewCampaignModalOpen] = useState(false);
  const [timelineRange, setTimelineRange] = useState('4_WEEKS');
  const [isUserEditModalOpen, setIsUserEditModalOpen] = useState(false);
  const [isNewUserModalOpen, setIsNewUserModalOpen] = useState(false);
  
  const [editingUser, setEditingUser] = useState(null);
  const [newUserForm, setNewUserForm] = useState({ 
    email: '', name: '', password: '', role: 'USER', group: 'PRACOWNICY', department: 'BRAK', color: 'bg-emerald-500', accessibleModules: ["kanban", "campaigns", "projects", "products", "chat"] 
  });
  const [devMode, setDevMode] = useState(false); // DEV MAP MODE
  
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
    } catch (err) { console.error('Błąd pobierania liczby wiadomości', err); }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${API_URL}/api/auth/login`, loginForm);
      localStorage.setItem('aps_token', res.data.token);
      localStorage.setItem('aps_user', JSON.stringify(res.data.user));
      setToken(res.data.token);
      setCurrentUser(res.data.user);
    } catch (err) { 
      console.error('Błąd logowania', err); 
      alert('Błąd logowania'); 
    }
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

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/api/users`, newUserForm, { headers: { Authorization: `Bearer ${token}` } });
      setIsNewUserModalOpen(false);
      setNewUserForm({ email: '', name: '', password: '', role: 'USER', group: 'PRACOWNICY', department: 'BRAK', color: 'bg-emerald-500', accessibleModules: ["kanban"] });
      fetchData();
    } catch (err) {
      console.error('Błąd tworzenia operatora', err);
      alert('Nie udało się utworzyć operatora. Upewnij się, że adres email jest unikalny.');
    }
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (!editingUser) return;
    try {
      await axios.patch(`${API_URL}/api/users/${editingUser.id}`, {
        role: editingUser.role,
        group: editingUser.group,
        department: editingUser.department,
        accessibleModules: editingUser.accessibleModules
      }, { headers: { Authorization: `Bearer ${token}` } });
      
      setIsUserEditModalOpen(false);
      setEditingUser(null);
      fetchData();
    } catch (err) {
      console.error('Błąd edycji operatora:', err);
      alert('Nie udało się zapisać zmian w uprawnieniach. Odmowa dostępu lub błąd serwera.');
    }
  };

  const handleUpdateTaskStatus = async (taskId, status) => {
    try {
      await axios.patch(`${API_URL}/api/tasks/${taskId}/status`, { status }, { headers: { Authorization: `Bearer ${token}` } });
      fetchData();
    } catch (err) { console.error('Błąd aktualizacji', err); }
  };

  const handleNotificationClick = (n) => {
    if (n.relatedTaskId) {
      const task = tasks.find(t => t.id === n.relatedTaskId);
      if (task) setSelectedTask(task);
    }
    setShowNotifications(false);
  };



  // --- KOMPONENT DEV BADGE ---
  const DevBadge = ({ id }) => {
    if (!devMode) return null;
    return (
      <span className="absolute top-2 left-2 z-[9999] bg-fuchsia-500 text-white text-[10px] font-black px-2 py-0.5 rounded shadow-[0_0_15px_rgba(217,70,239,0.6)] pointer-events-none border-[1.5px] border-white uppercase tracking-widest hover:scale-150 transition-transform origin-top-left flex items-center justify-center opacity-90 backdrop-blur-sm">
        {id}
      </span>
    );
  };

  // --- RENDERERS ---
  const renderChatInterface = () => (
    <div className="flex-1 flex h-full min-h-0 overflow-hidden bg-white relative">
      <div className="w-96 border-r border-slate-100 flex flex-col shrink-0 bg-[#f8fafc]">
        <div className="p-10 border-b border-slate-100 bg-white/50 backdrop-blur-md sticky top-0 z-10">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-[0.3em] mb-6">Wiadomości i Kanały</h3>
          <div className="relative group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-600 transition-colors"/>
            <input className="w-full pl-14 pr-6 py-4 bg-white border border-slate-200 rounded-sm text-xs outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all font-bold placeholder:text-slate-400" placeholder="Szukaj osób..."/>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-3">
          <div onClick={() => setActiveChat('general')} className={`p-6 rounded-[2rem] cursor-pointer transition-all flex items-center justify-between group ${activeChat === 'general' ? 'bg-indigo-600 shadow-2xl shadow-indigo-600/20 text-white' : 'bg-white border border-slate-100 hover:border-indigo-200'}`}>
            <div className="flex items-center">
              <div className={`w-12 h-12 rounded-sm flex items-center justify-center shadow-sm ${activeChat === 'general' ? 'bg-indigo-500/50' : 'bg-indigo-50 text-indigo-600'}`}>
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
                  <div className={`w-12 h-12 rounded-sm flex items-center justify-center text-xs font-black ${getDepartmentColor(u.department)}`}>{getInitials(u.name)}</div>
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
        <UniversalChat 
          mode={activeChat === 'general' ? 'global' : 'direct'}
          targetId={activeChat === 'general' ? null : activeChat}
          currentUser={currentUser}
          socket={socket}
          title={activeChat === 'general' ? 'Strumień Ogólny' : users.find(u => u.id === activeChat)?.name}
          subtitle={activeChat === 'general' ? 'Otwarta dyskusja strategiczna' : 'Bezpośredni kanał szyfrowany'}
        />
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
              <input type="email" required placeholder="admin@nexus.local" className="w-full pl-16 pr-8 py-5 bg-white/5 border border-white/10 rounded-sm outline-none focus:ring-4 focus:ring-indigo-500/20 text-white font-bold transition-all placeholder:text-slate-600" value={loginForm.email} onChange={e => setLoginForm({...loginForm, email: e.target.value})} />
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] block ml-4">Hasło Dostępowe</label>
            <div className="relative group">
              <Lock className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
              <input type="password" required placeholder="••••••••" className="w-full pl-16 pr-8 py-5 bg-white/5 border border-white/10 rounded-sm outline-none focus:ring-4 focus:ring-indigo-500/20 text-white font-bold transition-all placeholder:text-slate-600" value={loginForm.password} onChange={e => setLoginForm({...loginForm, password: e.target.value})} />
            </div>
          </div>

          <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-6 rounded-sm transition-all shadow-2xl shadow-indigo-600/30 uppercase tracking-[0.2em] text-sm mt-4 active:scale-95">Inicjalizuj Sesję</button>
        </form>

        <div className="mt-16 text-center border-t border-white/5 pt-8">
          <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest">Prywatne Środowisko APS Workspace &copy; 2026</p>
        </div>
      </div>
    </div>
  );

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
                  <span className={`px-3 py-1 rounded-sm ${selectedProject.color.replace('bg-', 'bg-').replace('500', '50')} ${selectedProject.color.replace('bg-', 'text-').replace('500', '700')} text-[9px] font-black uppercase tracking-widest`}>{selectedProject.category || 'PROJECT'}</span>
                </div>
                <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none">{selectedProject.name}</h3>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <button className="p-4 hover:bg-white bg-slate-100/50 rounded-sm text-slate-400 hover:text-indigo-600 transition-all border border-transparent hover:border-slate-100"><Settings className="w-6 h-6" /></button>
              <button onClick={() => setSelectedProject(null)} className="p-4 hover:bg-slate-900 bg-slate-100 rounded-sm text-slate-400 hover:text-white transition-all shadow-sm"><X className="w-6 h-6" /></button>
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
                    <div className={`w-10 h-10 rounded-sm ${getDepartmentColor(u.department)} flex items-center justify-center text-[10px] font-black mr-4`}>{getInitials(u.name)}</div>
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
                           <span className={`px-2 py-0.5 rounded-sm text-[8px] font-black uppercase tracking-widest ${t.status === 'DONE' ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'}`}>{t.status}</span>
                         </div>
                         <h5 className="text-[13px] font-black text-slate-800 uppercase tracking-tight group-hover:text-indigo-600 transition-colors leading-tight">{t.title}</h5>
                       </div>
                    </div>
                    <div className="flex -space-x-2">
                      {t.assignees?.slice(0, 2).map(a => (
                        <div key={a.id} className={`w-8 h-8 rounded-sm ${getDepartmentColor(a.department)} flex items-center justify-center text-[8px] font-black`}>{getInitials(a.name)}</div>
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
             <div className="flex items-center justify-between mt-8">
                <div className="flex flex-col">
                   <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Utworzono</span>
                   <span className="text-xs font-black text-slate-800 uppercase">{new Date(selectedProject.createdAt).toLocaleDateString()}</span>
                </div>
                <button className="px-10 py-5 bg-slate-900 text-white rounded-[1.5rem] text-[11px] font-black uppercase tracking-widest hover:bg-slate-800 hover:scale-105 active:scale-95 transition-all shadow-2xl">Zakończ Projekt</button>
             </div>
             
             {/* Sekcja Komunikatora - Projekt */}
             <div className="mt-12 h-[500px] border border-slate-200 rounded-[2rem] overflow-hidden shadow-sm">
                <UniversalChat mode="project" targetId={selectedProject.id} currentUser={currentUser} socket={socket} title={`Wątek #P-${selectedProject.projectId.split('-').pop()}`} subtitle="Tablica Główna Projektu" />
             </div>
          </div>
        </div>
      </div>
    );
  };


  const renderCampaignDetails = () => {
    if (!selectedCampaign) return null;
    const projectTasks = tasks.filter(t => t.campaignId === selectedCampaign.id);
    
    return (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex justify-end animate-in fade-in duration-300">
        <div className="w-full max-w-[55rem] bg-white h-full shadow-[-40px_0_100px_rgba(0,0,0,0.2)] flex flex-col animate-in slide-in-from-right duration-500 overflow-hidden relative">
          <DevBadge id="D-40" />
          {/* Header */}
          <div className="p-10 border-b border-slate-100 flex justify-between items-center bg-[#f8fafc] shrink-0">
            <div className="flex items-center space-x-6">
              <div className="w-16 h-16 bg-slate-900 rounded-[1.5rem] flex items-center justify-center shadow-xl shadow-slate-900/20 text-white"><Megaphone className="w-8 h-8" /></div>
              <div>
                <div className="flex items-center space-x-3 mb-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Oś Czasu / PIM</span>
                  <span className={`px-3 py-1 rounded-sm ${selectedCampaign.color?.replace('bg-', 'bg-')?.replace('500', '50')} ${selectedCampaign.color?.replace('bg-', 'text-')?.replace('500', '600')} text-[9px] font-black uppercase tracking-widest`}>{selectedCampaign.status}</span>
                </div>
                <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none">{selectedCampaign.name}</h3>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-2 block">{selectedCampaign.product?.name || 'Promocja Wieloproduktowa'}</span>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <button className="p-4 hover:bg-white bg-slate-100/50 rounded-sm text-slate-400 hover:text-pink-600 transition-all border border-transparent hover:border-slate-100 shadow-sm"><Settings className="w-6 h-6" /></button>
              <button onClick={() => setSelectedCampaign(null)} className="p-4 hover:bg-slate-900 bg-slate-100 rounded-sm text-slate-400 hover:text-white transition-all shadow-sm"><X className="w-6 h-6" /></button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-10 bg-white grid grid-cols-3 gap-8 content-start">
            
            {/* Top Metrics / KPIs */}
            <div className="col-span-3 grid grid-cols-4 gap-6">
               <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100">
                  <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center"><Target className="w-3 h-3 mr-2" /> Marka</div>
                  <div className="text-sm font-black text-slate-900 uppercase truncate">{selectedCampaign.brand?.name || 'Brak'}</div>
               </div>
               <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100">
                  <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center"><DollarSign className="w-3 h-3 mr-2" /> Budżet</div>
                  <div className="text-sm font-black text-slate-900 tabular-nums uppercase">{selectedCampaign.budget} PLN</div>
               </div>
               <div className="p-6 bg-emerald-50 rounded-[2rem] border border-emerald-100 col-span-2 flex justify-between items-center relative overflow-hidden">
                  <div className="absolute right-[-10%] top-[-50%] opacity-10"><Target className="w-32 h-32 text-emerald-600"/></div>
                  <div>
                    <div className="text-[9px] font-black text-emerald-600/70 uppercase tracking-widest mb-1 flex items-center">Realizacja Celu Sprzedaży</div>
                    <div className="text-2xl font-black text-emerald-600 tabular-nums">{selectedCampaign.soldCount || 0} / {selectedCampaign.plannedCount || 0} <span className="text-sm opacity-50">SZT</span></div>
                  </div>
                  <button className="relative z-10 px-6 py-3 bg-white text-emerald-600 text-[10px] font-black uppercase tracking-widest rounded-sm shadow-lg border border-emerald-100 hover:scale-105 active:scale-95 transition-all">Rozlicz</button>
               </div>
            </div>

            {/* Left Column (2/3 width) */}
            <div className="col-span-2 space-y-10">
               {/* Instructions */}
               <div>
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-6 flex items-center"><MessageCircle className="w-4 h-4 mr-3" /> Instrukcje dla Handlowców / Agencji</h4>
                  <div className="bg-slate-50/70 rounded-[2.5rem] p-8 border border-slate-100 relative group min-h-[8rem]">
                    <p className="text-slate-600 text-sm font-bold leading-relaxed">{selectedCampaign.instructions || 'Brak wdrożonych wytycznych operacyjnych.'}</p>
                  </div>
               </div>

               {/* Tasks */}
               <div>
                  <div className="flex items-center justify-between mb-6">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center"><Zap className="w-4 h-4 mr-3" /> Zadania Operacyjne (Tik-Tok, Darkposty)</h4>
                    <button className="text-[9px] font-black text-pink-600 hover:text-pink-800 uppercase tracking-widest">Więcej</button>
                  </div>
                  <div className="space-y-4">
                    {projectTasks.map(t => (
                      <div key={t.id} className="p-5 bg-white border border-slate-100 rounded-[1.5rem] shadow-sm flex items-center justify-between">
                         <div className="flex items-center space-x-4">
                           <div className={`w-8 h-8 rounded-full flex items-center justify-center ${t.status==='DONE' ? 'bg-emerald-50 text-emerald-500' : 'bg-slate-100 text-slate-400'}`}>
                             <CheckCircle2 className="w-4 h-4" />
                           </div>
                           <div>
                             <div className="text-[11px] font-black text-slate-800 uppercase tracking-tight">{t.title}</div>
                             <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{t.status}</div>
                           </div>
                         </div>
                      </div>
                    ))}
                    {projectTasks.length === 0 && <div className="p-10 text-center text-slate-300 font-black text-[10px] uppercase tracking-widest border-2 border-dashed border-slate-50 rounded-[2rem]">Brak Aktywnych Zadań</div>}
                  </div>
               </div>
            </div>

            {/* Right Column (1/3 width) */}
            <div className="col-span-1 border-l border-slate-100 pl-8 space-y-10">
               {/* Assets */}
               <div>
                 <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-6 flex items-center"><Folder className="w-4 h-4 mr-3" /> Materiały POSM</h4>
                 <div className="space-y-3">
                   <button className="w-full p-4 border-2 border-dashed border-slate-200 rounded-[1.5rem] text-[10px] font-black text-slate-400 uppercase tracking-widest hover:border-indigo-400 hover:text-indigo-600 transition-colors">+ Wgraj Plik</button>
                 </div>
               </div>

               {/* Assignees */}
               <div>
                 <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-6 flex items-center"><Users className="w-4 h-4 mr-3" /> Obsługa</h4>
                 <div className="flex -space-x-2">
                    {/* Placeholder for Assignees (Users that own the tasks inside the campaign) */}
                    <div className="w-10 h-10 rounded-[1rem] bg-indigo-600 border-2 border-white flex items-center justify-center text-[10px] font-black text-white shadow-md">KAM</div>
                    <div className="w-10 h-10 rounded-[1rem] bg-pink-500 border-2 border-white flex items-center justify-center text-[10px] font-black text-white shadow-md">AG</div>
                 </div>
               </div>
            </div>
            </div>
            
            {/* Kampania Chat */}
            <div className="h-[400px] border-t border-slate-100 shrink-0 relative z-0">
                 <UniversalChat mode="campaign" targetId={selectedCampaign.id} currentUser={currentUser} socket={socket} title="Szybka Komunikacja w Kampanii" subtitle={`Marketing: ${selectedCampaign.brand?.name || ''}`} />
            </div>
          </div>
        </div>
    );
  };

  const renderModals = () => {
    const inputClass = "w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-sm outline-none font-bold text-slate-800 focus:ring-4 focus:ring-indigo-600/10 focus:border-indigo-600/30 transition-all placeholder:text-slate-400";
    const labelClass = "text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 block ml-2";

    const ALL_MODULES = [
      { id: 'kanban', label: 'Tablica Wydarzeń (Zadania)' },
      { id: 'campaigns', label: 'Centrum Kampanii' },
      { id: 'projects', label: 'Projekty' },
      { id: 'products', label: 'Katalog SKU (PIM)' },
      { id: 'chat', label: 'Komunikator' },
      { id: 'admin', label: 'Ustawienia Master (Opcjonalne)' }
    ];

    return (
      <>
        {/* Rejestracja Nowego Operatora (Z Hasłem) */}
        {isNewUserModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[120] flex items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in duration-500 flex flex-col max-h-[90vh]">
              <div className="p-10 border-b border-slate-100 flex justify-between items-center bg-[#f8fafc] shrink-0">
                 <div className="flex items-center">
                    <div className="w-12 h-12 bg-emerald-500 rounded-sm flex items-center justify-center mr-6 shadow-xl shadow-emerald-200">
                       <Plus className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Rejestracja Operatora</h3>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Stwórz nowy profil dostępu i wyznacz hasło</p>
                    </div>
                 </div>
                 <button onClick={() => setIsNewUserModalOpen(false)} className="p-4 hover:bg-white rounded-sm transition-all text-slate-400"><X className="w-6 h-6" /></button>
              </div>
              <form onSubmit={handleCreateUser} className="p-10 space-y-8 overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className={labelClass}>Imię i Nazwisko / Login</label>
                    <input required placeholder="Jan Kowalski" className={inputClass} value={newUserForm.name} onChange={e => setNewUserForm({...newUserForm, name: e.target.value})} />
                  </div>
                  <div>
                    <label className={labelClass}>Adres Email</label>
                    <input required type="email" placeholder="jan@nexus.local" className={inputClass} value={newUserForm.email} onChange={e => setNewUserForm({...newUserForm, email: e.target.value})} />
                  </div>
                  <div className="col-span-2">
                    <label className={labelClass}>Hasło Startowe (Wymagane)</label>
                    <input required type="password" placeholder="••••••••" className={inputClass} value={newUserForm.password} onChange={e => setNewUserForm({...newUserForm, password: e.target.value})} />
                  </div>
                  <div>
                    <label className={labelClass}>Rola Systemowa</label>
                    <select required className={inputClass} value={newUserForm.role} onChange={e => setNewUserForm({...newUserForm, role: e.target.value})}>
                      <option value="USER">Standardowy Operator (USER)</option>
                      <option value="ADMIN">Administrator Główy (ADMIN)</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Przydział do Departamentu</label>
                    <select required className={inputClass} value={newUserForm.department} onChange={e => setNewUserForm({...newUserForm, department: e.target.value})}>
                      <option value="BRAK">Nieprzydzielony (BRAK)</option>
                      <option value="MARKETING">Marketing</option>
                      <option value="BIURO">Biuro</option>
                      <option value="HANDLOWCY">Handlowcy B2B</option>
                    </select>
                  </div>
                </div>

                <div className="pt-8 border-t border-slate-100">
                  <label className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] mb-4 block">Zezwolenia Modułowe dla Operatora</label>
                  <div className="grid grid-cols-2 gap-4">
                    {ALL_MODULES.map(m => (
                      <label key={m.id} className="flex items-center space-x-3 cursor-pointer p-4 border border-slate-100 rounded-sm hover:bg-slate-50 transition-colors">
                        <input type="checkbox" className="w-4 h-4 text-emerald-600 rounded" 
                          checked={newUserForm.accessibleModules?.includes(m.id)}
                          onChange={(e) => {
                            const newModules = e.target.checked 
                                ? [...(newUserForm.accessibleModules || []), m.id]
                                : (newUserForm.accessibleModules || []).filter(x => x !== m.id);
                            setNewUserForm({...newUserForm, accessibleModules: newModules});
                          }} />
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-700">{m.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <button type="submit" className="w-full py-6 bg-emerald-500 hover:bg-emerald-600 text-white font-black rounded-sm shadow-2xl transition-all uppercase tracking-[0.2em] text-sm active:scale-95 flex items-center justify-center group">
                  <Plus className="w-6 h-6 mr-3 group-hover:scale-110 transition-transform" /> Stwórz Użytkownika
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Edycja Użytkownika (Admin) */}
        {isUserEditModalOpen && editingUser && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[120] flex items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in duration-500">
              <div className="p-10 border-b border-slate-100 flex justify-between items-center bg-[#f8fafc]">
                 <div className="flex items-center">
                    <div className="w-12 h-12 bg-indigo-600 rounded-sm flex items-center justify-center mr-6 shadow-xl shadow-indigo-200">
                       <Settings className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Uprawnienia</h3>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">{editingUser.email}</p>
                    </div>
                 </div>
                 <button onClick={() => {setIsUserEditModalOpen(false); setEditingUser(null);}} className="p-4 hover:bg-white rounded-sm transition-all text-slate-400"><X className="w-6 h-6" /></button>
              </div>
              <form onSubmit={handleUpdateUser} className="p-10 space-y-8">
                <div>
                  <label className={labelClass}>Rola Systemowa</label>
                  <select required className={inputClass} value={editingUser.role} onChange={e => setEditingUser({...editingUser, role: e.target.value})}>
                    <option value="USER">Standardowy Operator (USER)</option>
                    <option value="ADMIN">Administrator Główy (ADMIN)</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Grupa Uprawnień (RBAC)</label>
                  <select required className={inputClass} value={editingUser.group} onChange={e => setEditingUser({...editingUser, group: e.target.value})}>
                    <option value="PRACOWNICY">Pracownik Nexusa</option>
                    <option value="AGENCJE">Agencja Reklamowa</option>
                    <option value="GOSC">Ograniczone Konto Gościa</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Przydział do Departamentu</label>
                  <select required className={inputClass} value={editingUser.department} onChange={e => setEditingUser({...editingUser, department: e.target.value})}>
                    <option value="BRAK">Nieprzydzielony (BRAK)</option>
                    <option value="MARKETING">Sekcja Marketingu</option>
                    <option value="BIURO">Centralne Biuro</option>
                    <option value="MAGAZYN">Logistyka i Magazyn</option>
                    <option value="HANDLOWCY">Pion Handlowców B2B</option>
                    <option value="KAM">Pion Key Account (KAM)</option>
                    <option value="PREZES">Zarząd Główny (PREZES)</option>
                    <option value="ECOMMERCE">Dział E-commerce</option>
                    <option value="SERWIS">Serwis Techniczny</option>
                    <option value="AGENCJA">Zewnętrzna Agencja (AGENCJA)</option>
                    <option value="GOŚĆ">Konto Tymczasowe (GOŚĆ)</option>
                  </select>
                </div>

                <div className="pt-8 border-t border-slate-100">
                  <label className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] mb-4 block">Widoczne Moduły Paska Nawigacji</label>
                  <div className="grid grid-cols-2 gap-4">
                    {ALL_MODULES.map(m => (
                      <label key={m.id} className="flex items-center space-x-3 cursor-pointer p-4 border border-slate-100 rounded-sm hover:bg-slate-50 transition-colors">
                        <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded" 
                          checked={editingUser.accessibleModules?.includes(m.id)}
                          onChange={(e) => {
                            const newModules = e.target.checked 
                                ? [...(editingUser.accessibleModules || []), m.id]
                                : (editingUser.accessibleModules || []).filter(x => x !== m.id);
                            setEditingUser({...editingUser, accessibleModules: newModules});
                          }} />
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-700">{m.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <button type="submit" className="w-full py-6 bg-slate-900 hover:bg-indigo-600 text-white font-black rounded-sm shadow-2xl transition-all uppercase tracking-[0.2em] text-sm active:scale-95 flex items-center justify-center group">
                  <Cloud className="w-6 h-6 mr-3 group-hover:animate-bounce" /> Wykonaj Aktualizację w Bazie
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Nowe Zadanie */}
        <NewTaskModal 
          isOpen={isNewTaskModalOpen} 
          onClose={() => setIsNewTaskModalOpen(false)} 
          projects={projects} 
          campaigns={campaigns} 
          users={users} 
          fetchData={fetchData} 
          token={token} 
          API_URL={API_URL} 
        />

        {/* Nowa Kampania */}
        <NewCampaignModal 
          isOpen={isNewCampaignModalOpen} 
          onClose={() => setIsNewCampaignModalOpen(false)} 
          brands={brands} 
          products={products} 
          fetchData={fetchData} 
          token={token} 
          API_URL={API_URL} 
        />

        {/* Nowa Marka (PIM) */}
        {isNewBrandModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[120] flex items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in duration-500">
              <div className="p-10 border-b border-slate-100 flex justify-between items-center bg-[#f8fafc]">
                 <div className="flex items-center">
                    <div className="w-12 h-12 bg-indigo-600 rounded-sm flex items-center justify-center mr-6 shadow-xl shadow-indigo-200">
                       <Target className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Rejestracja Marki</h3>
                 </div>
                 <button onClick={() => setIsNewBrandModalOpen(false)} className="p-4 hover:bg-white rounded-sm transition-all text-slate-400"><X className="w-6 h-6" /></button>
              </div>
              <form onSubmit={handleCreateBrand} className="p-10 space-y-8">
                <div>
                  <label className={labelClass}>Nazwa Brandu</label>
                  <input required placeholder="Np. Nexus Luxury..." type="text" className={inputClass} value={newBrandName} onChange={e => setNewBrandName(e.target.value)} />
                </div>
                <button type="submit" className="w-full py-6 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-sm shadow-2xl shadow-indigo-600/20 transition-all uppercase tracking-[0.2em] text-sm active:scale-95">Zatwierdź w Bazie PIM</button>
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
                <button onClick={() => setIsNewProductModalOpen(false)} className="p-6 hover:bg-white rounded-sm transition-all text-slate-400 border border-transparent hover:border-slate-100 shadow-sm"><X className="w-8 h-8" /></button>
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
                      <input required type="number" step="0.01" className="w-full px-6 py-4 bg-indigo-50 border-2 border-indigo-200 rounded-sm outline-none font-black text-indigo-700 text-lg shadow-inner focus:ring-8 focus:ring-indigo-600/5 transition-all" value={newProductForm.salePrice} onChange={e => setNewProductForm({...newProductForm, salePrice: e.target.value})} />
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
        {selectedTask && <TaskDetailsDrawer task={selectedTask} onClose={() => setSelectedTask(null)} currentUser={currentUser} users={users} tasks={tasks} socket={socket} fetchData={fetchData} token={token} API_URL={API_URL} onSelectTask={(t) => setSelectedTask(t)} />}
        {selectedCampaign && <CampaignDetailsDrawer campaign={selectedCampaign} onClose={() => setSelectedCampaign(null)} currentUser={currentUser} tasks={tasks} socket={socket} />}
      </>
    );
  };

  if (!token) return renderLogin();

  return (
    <div className="flex flex-col h-screen bg-[#f8fafc] text-slate-900 font-sans overflow-hidden relative">
      <header className="h-20 bg-white border-b border-slate-200/50 flex items-center justify-between px-8 z-50 shrink-0 shadow-[0_4px_20px_rgba(0,0,0,0.02)] relative">
        <DevBadge id="H-1" />
        <div className="flex items-center">
          <div className="flex items-center cursor-pointer mr-12 group relative">
            <DevBadge id="MENU-1" />
            <div className="w-10 h-10 bg-indigo-600 rounded-[0.9rem] flex items-center justify-center shadow-lg shadow-indigo-500/30 group-hover:scale-105 transition-transform">
              <Zap className="w-5 h-5 text-white fill-white" />
            </div>
            <div className="ml-4">
              <h1 className="text-lg font-black text-slate-800 tracking-tighter leading-none mb-0.5 group-hover:text-indigo-600 transition-colors">APS IE Workspace</h1>
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.3em] block">Nexus Network</span>
            </div>
          </div>

          <nav className="hidden lg:flex items-center space-x-1 bg-slate-50/80 p-1.5 rounded-sm border border-slate-100 backdrop-blur-sm">
            
            {/* Ochrona zakładek na bazie modyfikatora accessibleModules zapisywanego z backendu */}
            {(currentUser?.role === 'ADMIN' || currentUser?.accessibleModules?.includes('kanban')) && (
              <button onClick={() => setActiveTab('kanban')} className={`px-5 py-2 rounded-sm text-[10px] font-black uppercase tracking-widest transition-all flex items-center h-10 ${activeTab === 'kanban' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/60' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/50'}`}>
                <Layout className={`w-4 h-4 mr-2 ${activeTab === 'kanban' ? 'text-indigo-500' : 'text-slate-400'}`} /> Tablica
              </button>
            )}

            {(currentUser?.role === 'ADMIN' || currentUser?.accessibleModules?.includes('campaigns')) && (
              <button onClick={() => setActiveTab('campaigns')} className={`px-5 py-2 rounded-sm text-[10px] font-black uppercase tracking-widest transition-all flex items-center h-10 ${activeTab === 'campaigns' ? 'bg-white text-pink-600 shadow-sm border border-slate-200/60' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/50'}`}>
                 <Megaphone className={`w-4 h-4 mr-2 ${activeTab === 'campaigns' ? 'text-pink-500' : 'text-slate-400'}`} /> Kampanie
              </button>
            )}

            {(currentUser?.role === 'ADMIN' || currentUser?.accessibleModules?.includes('projects')) && (
              <button onClick={() => setActiveTab('projects')} className={`px-5 py-2 rounded-sm text-[10px] font-black uppercase tracking-widest transition-all flex items-center h-10 ${activeTab === 'projects' ? 'bg-white text-emerald-600 shadow-sm border border-slate-200/60' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/50'}`}>
                <Folder className={`w-4 h-4 mr-2 ${activeTab === 'projects' ? 'text-emerald-500' : 'text-slate-400'}`} /> Projekty
              </button>
            )}

            {(currentUser?.role === 'ADMIN' || currentUser?.accessibleModules?.includes('products')) && (
              <button onClick={() => setActiveTab('products')} className={`px-5 py-2 rounded-sm text-[10px] font-black uppercase tracking-widest transition-all flex items-center h-10 ${activeTab === 'products' ? 'bg-white text-orange-600 shadow-sm border border-slate-200/60' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/50'}`}>
                <Hash className={`w-4 h-4 mr-2 ${activeTab === 'products' ? 'text-orange-500' : 'text-slate-400'}`} /> Katalog (PIM)
              </button>
            )}

            {(currentUser?.role === 'ADMIN' || currentUser?.accessibleModules?.includes('chat')) && (
              <button onClick={() => setActiveTab('chat')} className={`px-5 py-2 rounded-sm text-[10px] font-black uppercase tracking-widest transition-all flex items-center h-10 relative ${activeTab === 'chat' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/60' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/50'}`}>
                <MessageCircle className={`w-4 h-4 mr-2 ${activeTab === 'chat' ? 'text-indigo-500' : 'text-slate-400'}`} /> Komunikator
                {unreadDMs.total > 0 && <span className="absolute top-1 right-1 bg-red-500 text-white text-[8px] font-black w-3.5 h-3.5 rounded-full flex items-center justify-center animate-pulse">{unreadDMs.total}</span>}
              </button>
            )}

            {(currentUser?.role === 'ADMIN' || currentUser?.accessibleModules?.includes('admin')) && (
              <button onClick={() => setActiveTab('admin')} className={`px-5 py-2 rounded-sm text-[10px] font-black uppercase tracking-widest transition-all flex items-center h-10 ${activeTab === 'admin' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/50'}`}>
                <Settings className={`w-4 h-4 mr-2 ${activeTab === 'admin' ? 'text-slate-300' : 'text-slate-400'}`} /> Admin Panel
              </button>
            )}
          </nav>
        </div>

        <div className="flex items-center space-x-5">
          <div className="relative group hidden xl:block">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 transition-colors group-focus-within:text-indigo-600" />
            <input type="text" placeholder="Globalne wyszukiwanie..." className="pl-12 pr-6 py-2.5 bg-slate-50 border border-slate-100 rounded-[1rem] text-[11px] font-bold focus:ring-4 focus:ring-indigo-600/10 focus:border-indigo-300 w-56 transition-all outline-none" />
          </div>

          <button onClick={() => { setShowNotifications(!showNotifications); if(!showNotifications) fetchData(); }} className="relative p-3 bg-slate-50 border border-slate-100 rounded-[1rem] text-slate-500 hover:text-indigo-600 hover:bg-white transition-all">
             <Bell className="w-5 h-5" />
             {notifications.some(n => !n.isRead) && <span className="absolute top-0 right-0 w-3 h-3 bg-rose-500 rounded-full border-2 border-white translate-x-1 -translate-y-1 shadow-md"></span>}
          </button>
          
          <div className="w-px h-8 bg-slate-200 mx-2"></div>
          
          <div className="flex items-center cursor-pointer group px-2">
             <div className={`w-10 h-10 rounded-sm flex items-center justify-center text-[10px] font-black group-hover:-translate-y-0.5 transition-transform ${getDepartmentColor(currentUser?.department)}`}>{getInitials(currentUser?.name)}</div>
             <div className="hidden lg:block ml-4">
               <div className="text-[11px] font-black text-slate-900 uppercase tracking-tight leading-none mb-1">{currentUser?.name}</div>
               <div className="text-[8px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-2 py-0.5 rounded-md inline-flex border border-indigo-100/50">{currentUser?.department || 'System'}</div>
             </div>
          </div>
          
          <button onClick={handleLogout} className="text-[10px] font-black text-slate-400 hover:text-rose-600 uppercase tracking-widest transition-colors mx-3">Wyloguj</button>
          
          <button onClick={() => setIsNewTaskModalOpen(true)} className="ml-2 px-6 py-3 bg-indigo-600 text-white rounded-[1.25rem] text-[10px] font-black uppercase tracking-[0.2em] hover:bg-indigo-500 active:scale-95 transition-all shadow-[0_8px_25px_rgba(79,70,229,0.3)] flex items-center">
             <Plus className="w-4 h-4 mr-2" /> Zadanie
          </button>
        </div>
      </header>

      {showNotifications && (
        <div className="absolute right-32 top-24 w-96 bg-white rounded-sm shadow-[0_40px_100px_rgba(0,0,0,0.15)] border border-slate-200 z-[100] overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="p-6 border-b border-slate-100 bg-[#f8fafc] flex justify-between items-center"><h4 className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-800">Powiadomienia</h4><button onClick={() => setShowNotifications(false)} className="text-slate-400 hover:text-rose-500 bg-white p-2 rounded-sm shadow-sm"><X className="w-4 h-4"/></button></div>
          <div className="max-h-[30rem] overflow-y-auto custom-scrollbar">
            {notifications.length === 0 ? <div className="p-12 text-center text-slate-400 font-bold text-xs">Brak aktywnych notyfikacji</div> : notifications.map(n => (
              <div key={n.id} onClick={() => handleNotificationClick(n)} className={`p-6 border-b border-slate-50 cursor-pointer hover:bg-indigo-50/30 transition-all ${n.isRead ? 'opacity-60' : ''}`}>
                <div className="flex items-center mb-2">
                  <span className={`w-2 h-2 rounded-full mr-3 ${n.isRead ? 'bg-slate-300' : 'bg-indigo-500 animate-pulse'}`}></span>
                  <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest">{n.title}</span>
                </div>
                <p className="text-xs text-slate-500 font-bold leading-relaxed ml-5">{n.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* RENDEROWANIE WIDOKÓW */}
      <main className="flex-1 min-h-0 bg-[#f8fafc] flex flex-col relative w-full overflow-hidden">
          {activeTab === 'kanban' && <KanbanView tasks={tasks} projects={projects} campaigns={campaigns} selectedFilterId={selectedFilterId} setSelectedFilterId={setSelectedFilterId} setIsNewTaskModalOpen={setIsNewTaskModalOpen} setSelectedTask={setSelectedTask} devMode={devMode} />}
          {activeTab === 'campaigns' && <CampaignsView campaigns={campaigns} brands={brands} timelineRange={timelineRange} setTimelineRange={setTimelineRange} setSelectedCampaign={setSelectedCampaign} setIsNewCampaignModalOpen={setIsNewCampaignModalOpen} devMode={devMode} />}
          {activeTab === 'projects' && <ProjectsView projects={projects} tasks={tasks} currentUser={currentUser} setIsNewProjectModalOpen={setIsNewProjectModalOpen} setSelectedProject={setSelectedProject} devMode={devMode} />}
          {activeTab === 'products' && <ProductsView products={products} currentUser={currentUser} setIsNewBrandModalOpen={setIsNewBrandModalOpen} setIsNewProductModalOpen={setIsNewProductModalOpen} />}
          {activeTab === 'chat' && renderChatInterface()}
          {activeTab === 'admin' && <AdminPanelView users={users} setIsNewUserModalOpen={setIsNewUserModalOpen} setEditingUser={setEditingUser} setIsUserEditModalOpen={setIsUserEditModalOpen} token={token} API_URL={API_URL} />}
      </main>

      {/* DEV MAP TRIGGER BUTTON */}
      <button 
        onClick={() => setDevMode(!devMode)} 
        className={`fixed bottom-8 right-8 z-[9000] rounded-full p-4 shadow-2xl transition-all ${devMode ? 'bg-fuchsia-600 text-white animate-pulse' : 'bg-slate-900 opacity-30 hover:opacity-100 text-white'}`}
        title="Przełącz Widok Deweloperski (DEV MAP)"
      >
        <Layout className="w-5 h-5" />
      </button>

      {renderModals()}
    </div>
  );
}

export default App;
