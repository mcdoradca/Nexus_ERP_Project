import React, { useState, useEffect, useMemo, useRef } from 'react';
import NewTaskModal from './views/NewTaskModal';
import UniversalChat from './components/UniversalChat';
import TaskDetailsDrawer from './views/TaskDetailsDrawer';
import KanbanView from './views/KanbanView';
import ProjectsView from './views/ProjectsView';
import CampaignsView from './views/CampaignsView';
import NewCampaignModal from './views/NewCampaignModal';
import CampaignDetailsModal from './views/CampaignDetailsModal';
import ProductsView from './views/ProductsView';
import AdminPanelView from './views/AdminPanelView';
import MToolView from './views/MToolView';
import CrmView from './views/CrmView';
import AllegroAdsMonitor from './views/AllegroAdsMonitor';
import PortfolioManagerView from './views/PortfolioManagerView';
import GodModeAnalyticsView from './views/GodModeAnalyticsView';
import ZeroBleedHubView from './views/ZeroBleedHubView';
import PublicBookingView from './views/PublicBookingView';
import MeetingDashboardView from './views/MeetingDashboardView';
import EmployeeDashboardView from './views/EmployeeDashboardView';
import axios from 'axios';
import { io } from 'socket.io-client';
import { 
  Building2, Plus, Layout, Settings, Folder, Hash, MessageCircle, Megaphone, 
  Bell, X, Search, ChevronRight, Clock, ShieldAlert, AlertOctagon, 
  PlayCircle, StopCircle, Cloud, CloudLightning, Target, Zap, 
  Loader2, Paperclip, Send, Users, User, DollarSign, ArrowRight, CheckCircle2,
  Trash2, Mail, Lock, Shield, Eye, EyeOff, Check, Filter, Calendar, Briefcase, TrendingUp,
  Package, Database, Image, FileText, Bot, BarChart3, LogOut, CheckSquare, CheckCircle
} from 'lucide-react';

import { getInitials, getDepartmentColor } from './utils';

const API_URL = import.meta.env.PROD ? '' : 'http://localhost:3001';

function App() {
  const [currentUser, setCurrentUser] = useState(JSON.parse(localStorage.getItem('aps_user')));
  const [activeTab, setActiveTab] = useState(localStorage.getItem('aps_last_tab') || (currentUser?.role === 'ADMIN' ? 'kanban' : 'dashboard'));
  
  useEffect(() => {
      localStorage.setItem('aps_last_tab', activeTab);
  }, [activeTab]);
  const [token, setToken] = useState(localStorage.getItem('aps_token'));
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  
  // Data States
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [users, setUsers] = useState([]);
  const [products, setProducts] = useState([]);
  const [brands, setBrands] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [companies, setCompanies] = useState([]);
  
  // UI States
  const [selectedTask, setSelectedTask] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [selectedFilterId, setSelectedFilterId] = useState('all');
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [isNewBrandModalOpen, setIsNewBrandModalOpen] = useState(false);
  const [isNewProductModalOpen, setIsNewProductModalOpen] = useState(false);
  const [autofillEanLoading, setAutofillEanLoading] = useState(false);
  const [isNewCampaignModalOpen, setIsNewCampaignModalOpen] = useState(false);
  const [campaignForEdit, setCampaignForEdit] = useState(null); // FAZA 17
  const [timelineRange, setTimelineRange] = useState('4_WEEKS');
  const [isUserEditModalOpen, setIsUserEditModalOpen] = useState(false);
  const [isNewUserModalOpen, setIsNewUserModalOpen] = useState(false);
  
  const [editingUser, setEditingUser] = useState(null);
  const [editingProduct, setEditingProduct] = useState(null);
  const [newUserForm, setNewUserForm] = useState({ 
    email: '', name: '', password: '', role: 'USER', group: 'PRACOWNICY', department: 'BRAK', color: 'bg-emerald-500', accessibleModules: ["kanban", "campaigns", "mtool", "projects", "products", "chat"] 
  });
  const [devMode, setDevMode] = useState(false); // DEV MAP MODE
  
  // Form States
  const [newTaskForm, setNewTaskForm] = useState({ title: '', description: '', priority: 'MEDIUM', projectId: '', campaignId: '', assigneeIds: [], dueDate: '' });
  const [newProjectForm, setNewProjectForm] = useState({ name: '', description: '', color: 'bg-emerald-500', budget: 0, category: 'PROJEKT ERP' });
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

  // PIM Search Dropdown State
  const [brandSearchTerm, setBrandSearchTerm] = useState('');
  const [isBrandDropdownOpen, setIsBrandDropdownOpen] = useState(false);
  const brandDropdownRef = useRef(null);
  
  // PIM Dynamic Schema State
  const [categorySchema, setCategorySchema] = useState(null);

  useEffect(() => {
    if (newProductForm?.allegroCategoryId && isNewProductModalOpen && token) {
        axios.get(`${API_URL}/api/categories/${newProductForm.allegroCategoryId}`, { headers: { Authorization: `Bearer ${token}` } })
            .then(res => setCategorySchema(res.data))
            .catch(err => setCategorySchema(null));
    } else {
        setCategorySchema(null);
    }
  }, [newProductForm?.allegroCategoryId, isNewProductModalOpen, token]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (brandDropdownRef.current && !brandDropdownRef.current.contains(event.target)) {
        setIsBrandDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleCreateBrandInline = async (name) => {
      if(!name) return;
      try {
          const brandRes = await axios.post(`${API_URL}/api/brands`, { name: name.trim() }, { headers: { Authorization: `Bearer ${token}` } });
          setBrands(prev => [...prev, brandRes.data]); 
          setNewProductForm(prev => ({ ...prev, brandId: brandRes.data.id }));
          setBrandSearchTerm(brandRes.data.name);
          setIsBrandDropdownOpen(false);
      } catch(err) { alert('Błąd tworzenia marki'); }
  };

  const filteredBrands = brands.filter(b => b.name.toLowerCase().includes(brandSearchTerm.toLowerCase()));

  useEffect(() => {
    if (token) {
      const newSocket = io(API_URL, { 
        path: '/api/socket.io',
        auth: { token } 
      });
      setSocket(newSocket);
      fetchData();

      newSocket.on('receive_direct_message', (msg) => {
        fetchUnreadCount();
      });

      newSocket.on('task_updated', fetchData);
      newSocket.on('new_notification', (notif) => {
        setNotifications(prev => [notif, ...prev]);
        new Audio('/notification.mp3').play().catch(() => {});
      });

      return () => newSocket.disconnect();
    }
  }, [token]);

  const fetchData = async () => {
    try {
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const [t, p, c, u, b, pr, n, co] = await Promise.all([
        axios.get(`${API_URL}/api/tasks`, config),
        axios.get(`${API_URL}/api/projects`, config),
        axios.get(`${API_URL}/api/campaigns`, config),
        axios.get(`${API_URL}/api/users`, config),
        axios.get(`${API_URL}/api/brands`, config),
        axios.get(`${API_URL}/api/products`, config),
        axios.get(`${API_URL}/api/notifications`, config),
        axios.get(`${API_URL}/api/crm/companies`, config)
      ]);
      setTasks(t.data);
      setProjects(p.data);
      setCampaigns(c.data);
      setUsers(u.data);
      setBrands(b.data);
      setProducts(pr.data);
      setNotifications(n.data);
      setCompanies(co.data);
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

  const handleCreateProject = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/api/projects`, newProjectForm, { headers: { Authorization: `Bearer ${token}` } });
      setIsNewProjectModalOpen(false);
      setNewProjectForm({ name: '', description: '', color: 'bg-emerald-500', budget: 0, category: 'PROJEKT ERP' });
      fetchData();
    } catch (err) { alert('Błąd tworzenia projektu'); }
  };

  const handleCreateBrand = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/api/brands`, { name: newBrandName }, { headers: { Authorization: `Bearer ${token}` } });
      setNewBrandName(''); setIsNewBrandModalOpen(false); fetchData();
    } catch (err) { alert('Błąd tworzenia marki'); }
  };

  const handleAutofillEAN = async () => {
    if (!newProductForm.ean) return alert('Zeskanuj lub wpisz kod EAN do wyszukania.');
    setAutofillEanLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/products/autofill/${newProductForm.ean}`, { headers: { Authorization: `Bearer ${token}` } });
      const { name, brand, sku, price, stock, baselinkerId, imageUrl, weight, length, width, height, taxRate, images, descriptionHtml, features, videoUrl, stockErpUnits, stockWmsUnits } = res.data;
      
      let matchedBrandId = newProductForm.brandId;
      if (brand && typeof brand === 'string') {
          const cleanBrand = brand.toLowerCase().trim();
          const matchedBrand = brands.find(b => b.name.toLowerCase().trim() === cleanBrand);
          
          if (matchedBrand) {
              matchedBrandId = matchedBrand.id;
          } else {
              try {
                  const brandRes = await axios.post(`${API_URL}/api/brands`, { name: brand.trim() }, { headers: { Authorization: `Bearer ${token}` } });
                  matchedBrandId = brandRes.data.id;
                  setBrands(prev => [...prev, brandRes.data]); 
                  fetchData(); 
              } catch (be) { console.error('Błąd auto-tworzenia marki', be); }
          }
      }

      
      // Auto-update text field if brand matched
      if(matchedBrandId) {
          const b = brands.find(x => x.id === matchedBrandId) || {name: brand};
          setBrandSearchTerm(b.name);
      } else {
          setBrandSearchTerm('');
      }
      
      setNewProductForm(prev => ({
        ...prev,
        name: name || prev.name,
        sku: sku || prev.sku,
        salePrice: price || prev.salePrice,
        stock: stock !== undefined ? stock : prev.stock,
        baselinkerId: baselinkerId || prev.baselinkerId,
        brandId: matchedBrandId || prev.brandId,
        imageUrl: imageUrl || prev.imageUrl,
        weight: weight !== undefined ? weight : prev.weight,
        length: length !== undefined ? length : prev.length,
        width: width !== undefined ? width : prev.width,
        height: height !== undefined ? height : prev.height,
        taxRate: taxRate !== undefined ? taxRate : prev.taxRate,
        images: images || prev.images,
        descriptionHtml: descriptionHtml || prev.descriptionHtml,
        features: features || prev.features,
        videoUrl: videoUrl || prev.videoUrl,
        stockErpUnits: stockErpUnits !== undefined ? stockErpUnits : prev.stockErpUnits,
        stockWmsUnits: stockWmsUnits !== undefined ? stockWmsUnits : prev.stockWmsUnits
      }));
    } catch (err) {
      const debugInfo = err.response?.data?.debug;
      console.log('--- BASELINKER DEBUG INFO ---', debugInfo);
      alert(`Brak EAN w bazach lub BaseLinker odmówił dostępu.\nSprawdź konsolę (F12) by zobaczyć co odpowiedział serwer bazy!`);
    } finally {
      setAutofillEanLoading(false);
    }
  };

  const handleCreateProduct = async (e) => {
    e.preventDefault();
    try {
      if (editingProduct) {
        await axios.patch(`${API_URL}/api/products/${editingProduct}`, newProductForm, { headers: { Authorization: `Bearer ${token}` } });
      } else {
        await axios.post(`${API_URL}/api/products`, newProductForm, { headers: { Authorization: `Bearer ${token}` } });
      }
      setIsNewProductModalOpen(false);
      setEditingProduct(null);
      setNewProductForm({ 
          ean: '', sku: '', name: '', brandId: '', stock: 0, salePrice: 0, basePrice: 0, 
          inboundTransportCost: 0, packagingCost: 0, bdoEprCost: 0, outboundTransportCost: 0, 
          status: 'Aktywny', subiektId: '', baselinkerId: '',
          weight: 0, length: 0, width: 0, height: 0, taxRate: 23,
          images: [], videoUrl: '', descriptionHtml: '', features: {}, 
          stockErpUnits: 0, stockWmsUnits: 0
      });
      fetchData();
    } catch (err) {
      console.error('Błąd zapisu produktu:', err);
      const backendMsg = err.response?.data?.error || err.response?.data?.details || err.message;
      alert("Błąd zapisu produktu: " + backendMsg + "\nUpewnij się czy SKU i EAN są unikalne oraz czy uzupełniłeś wymagane pola.");
    }
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
        name: editingUser.name,
        email: editingUser.email,
        password: editingUser.password,
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

  const handleUpdateSmtpConfig = async (e) => {
    e.preventDefault();
    try {
      await axios.patch(`${API_URL}/api/users/${editingUser.id}/smtp`, {
        smtpHost: editingUser.smtpHost,
        smtpPort: editingUser.smtpPort,
        smtpUser: editingUser.smtpUser,
        smtpPassword: editingUser.smtpPassword
      }, { headers: { Authorization: `Bearer ${token}` } });
      
      alert('Zapisano konfigurację SMTP!');
    } catch (err) {
      console.error('Błąd konfiguracji SMTP:', err);
      alert('Nie udało się zapisać konfiguracji SMTP. ' + (err.response?.data?.error || ''));
    }
  };

  const handleUpdateTaskStatus = async (taskId, status) => {
    try {
      await axios.patch(`${API_URL}/api/tasks/${taskId}/status`, { status }, { headers: { Authorization: `Bearer ${token}` } });
      fetchData();
    } catch (err) { console.error('Błąd aktualizacji', err); }
  };

  const handleNotificationClick = (n) => {
    if (!n.isRead) {
      handleToggleNotificationRead(n.id, true);
    }
    if (n.relatedTaskId) {
      const task = tasks.find(t => t.id === n.relatedTaskId);
      if (task) setSelectedTask(task);
    }
    setShowNotifications(false);
  };

  const handleToggleNotificationRead = async (id, isRead) => {
    try {
      await axios.patch(`${API_URL}/api/notifications/${id}/status`, { isRead }, { headers: { Authorization: `Bearer ${token}` } });
      fetchData();
    } catch (err) { console.error('Błąd aktualizacji powiadomienia', err); }
  };

  const handleDeleteNotification = async (e, id) => {
    e.stopPropagation(); // zapobiega kliknięciu w powiadomienie
    try {
      await axios.delete(`${API_URL}/api/notifications/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      fetchData();
    } catch (err) { console.error('Błąd usuwania powiadomienia', err); }
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
      <div className="w-96 border-r border-slate-300 flex flex-col shrink-0 bg-gradient-to-b from-[#f8fafc] to-[#e2e8f0]">
        <div className="p-5 border-b border-slate-300 bg-white/50 backdrop-blur-md sticky top-0 z-10">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-[0.3em] mb-6">Wiadomości i Kanały</h3>
          <div className="relative group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 group-focus-within:text-indigo-600 transition-colors"/>
            <input className="w-full pl-14 pr-6 py-4 bg-white border border-slate-400 rounded-sm text-xs outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all font-bold placeholder:text-slate-600" placeholder="Szukaj osób..."/>
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

      <div className="flex-1 flex flex-col bg-white min-w-0">
        <UniversalChat 
          mode={activeChat === 'general' ? 'global' : 'direct'}
          targetId={activeChat === 'general' ? null : activeChat}
          currentUser={currentUser}
          socket={socket}
          token={token}
          title={activeChat === 'general' ? 'Strumień Ogólny' : users.find(u => u.id === activeChat)?.name}
          subtitle={activeChat === 'general' ? 'Otwarta dyskusja strategiczna' : 'Bezpośredni kanał szyfrowany'}
        />
      </div>
    </div>
  );

  const renderLogin = () => (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-5 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-indigo-600/20 blur-[150px] rounded-sm"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-pink-600/10 blur-[150px] rounded-sm"></div>
      
      <div className="w-full max-w-xl bg-white/5 backdrop-blur-3xl rounded-sm shadow-[0_50px_100px_rgba(0,0,0,0.5)] overflow-hidden p-16 border border-white/10 relative z-10">
        <div className="flex flex-col items-center text-center mb-16">
          <div className="w-28 h-28 bg-white overflow-hidden rounded-sm flex items-center justify-center shadow-2xl shadow-indigo-500/40 mb-8 animate-in zoom-in duration-700">
            <img src="/logo.jpg" alt="NeS Logo" className="w-full h-full object-contain p-2" />
          </div>
          <h1 className="text-5xl font-black text-white tracking-tighter mb-4 uppercase">NeS Nexus Sentinel</h1>
          <p className="text-slate-600 font-bold uppercase tracking-[0.4em] text-xs">Enterprise Management Engine</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-8">
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] block ml-4">Identyfikator E-mail</label>
            <div className="relative group">
              <Mail className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
              <input type="email" required placeholder="admin@nes-sentinel.local" className="w-full pl-16 pr-8 py-5 bg-white/5 border border-white/10 rounded-sm outline-none focus:ring-4 focus:ring-indigo-500/20 text-white font-bold transition-all placeholder:text-slate-600" value={loginForm.email} onChange={e => setLoginForm({...loginForm, email: e.target.value})} />
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
          <div className="p-5 border-b border-slate-300 flex justify-between items-center bg-gradient-to-b from-[#f8fafc] to-[#e2e8f0] shrink-0">
            <div className="flex items-center">
              <div className={`w-4 h-16 ${selectedProject.color} rounded-sm mr-8 shadow-xl`}></div>
              <div>
                <div className="flex items-center space-x-3 mb-2">
                  <span className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em]">Operational Unit</span>
                  <span className={`px-3 py-1 rounded-sm ${selectedProject.color.replace('bg-', 'bg-').replace('500', '50')} ${selectedProject.color.replace('bg-', 'text-').replace('500', '700')} text-[9px] font-black uppercase tracking-widest`}>{selectedProject.category || 'PROJECT'}</span>
                </div>
                <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none">{selectedProject.name}</h3>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <button className="p-4 hover:bg-white bg-slate-100/50 rounded-sm text-slate-600 hover:text-indigo-600 transition-all border border-transparent hover:border-slate-300"><Settings className="w-6 h-6" /></button>
              <button onClick={() => setSelectedProject(null)} className="p-4 hover:bg-slate-900 bg-slate-100 rounded-sm text-slate-600 hover:text-white transition-all shadow-sm"><X className="w-6 h-6" /></button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-12 bg-white">
            {/* Stats Bar */}
            <div className="grid grid-cols-3 gap-4">
               <div className="p-6 bg-slate-50 rounded-sm border border-slate-300">
                  <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-2">Zasoby</div>
                  <div className="text-2xl font-black text-slate-900">{projectTasks.length} <span className="text-slate-600 text-sm">Zadań</span></div>
               </div>
               <div className="p-6 bg-slate-50 rounded-sm border border-slate-300">
                  <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-2">Ukończono</div>
                  <div className="text-2xl font-black text-slate-900">{doneTasks} <span className="text-slate-600 text-sm">Tasków</span></div>
               </div>
               <div className="p-6 bg-slate-50 rounded-sm border border-slate-300">
                  <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-2">Postęp</div>
                  <div className="text-2xl font-black text-indigo-600">{Math.round(progress)}%</div>
               </div>
            </div>

            {/* Description Section */}
            <div>
              <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] mb-6 flex items-center">
                <Layout className="w-4 h-4 mr-3" /> Brief i Założenia
              </h4>
              <div className="bg-slate-50/50 rounded-sm p-4 border border-slate-300 relative group">
                <p className="text-slate-600 text-sm font-bold leading-relaxed italic pr-12">"{selectedProject.description}"</p>
                <div className="h-10 w-px bg-slate-200 absolute right-8 top-1/2 -translate-y-1/2 opacity-30"></div>
              </div>
            </div>

            {/* Team Section */}
            <div>
              <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] mb-8 flex items-center">
                <Users className="w-4 h-4 mr-3" /> Zespół Dedykowany
              </h4>
              <div className="flex flex-wrap gap-4">
                {projectUsers.length > 0 ? projectUsers.map(u => (
                  <div key={u.id} className="flex items-center bg-white px-6 py-3 rounded-sm border border-slate-300 shadow-sm hover:border-indigo-200 transition-all cursor-default">
                    <div className={`w-10 h-10 rounded-sm ${getDepartmentColor(u.department)} flex items-center justify-center text-[10px] font-black mr-4`}>{getInitials(u.name)}</div>
                    <div>
                      <div className="text-[11px] font-black text-slate-900 uppercase tracking-tight">{u.name}</div>
                      <div className="text-[8px] font-black text-slate-600 uppercase tracking-widest">{u.department}</div>
                    </div>
                  </div>
                )) : <div className="text-[11px] font-black text-slate-300 uppercase tracking-widest py-4">Brak przypisanych osób</div>}
              </div>
            </div>

            {/* Task List Section */}
            <div>
              <div className="flex items-center justify-between mb-8">
                <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] flex items-center">
                  <Hash className="w-4 h-4 mr-3" /> Rejestr Zadań ({projectTasks.length})
                </h4>
                <button className="text-[9px] font-black text-indigo-600 hover:text-indigo-800 uppercase tracking-widest flex items-center transition-colors">
                  <Plus className="w-3 h-3 mr-1" /> Dodaj Szybko
                </button>
              </div>
              <div className="space-y-4">
                {projectTasks.map(t => (
                  <div key={t.id} onClick={() => setSelectedTask(t)} className="p-6 bg-white border border-slate-300 rounded-sm hover:shadow-xl hover:border-indigo-100 transition-all cursor-pointer group flex items-center justify-between">
                    <div className="flex items-center">
                       <div className={`w-2 h-10 rounded-sm mr-6 ${t.isBlocked ? 'bg-red-500' : 'bg-slate-100'}`}></div>
                       <div>
                         <div className="flex items-center space-x-3 mb-1">
                           <span className="text-[9px] font-black text-slate-600 font-mono">{t.taskId}</span>
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
                {projectTasks.length === 0 && <div className="py-20 text-center text-slate-300 font-black text-[10px] uppercase tracking-widest border-2 border-dashed border-slate-50 rounded-sm">Projekt nie ma jescze zadań</div>}
              </div>
            </div>
            
            {/* Footer przeniesiony w strefę scrollowalną */}
            <div className="pt-8 mt-12 border-t border-slate-300">
               <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                     <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Utworzono</span>
                     <span className="text-xs font-black text-slate-800 uppercase">{new Date(selectedProject.createdAt).toLocaleDateString()}</span>
                  </div>
                  <button onClick={async () => {
                     if(!window.confirm('Czy na pewno chcesz zakończyć ten projekt?')) return;
                     try {
                        await fetch(`${API_URL}/api/projects/${selectedProject.id}`, {
                           method: 'PATCH',
                           headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                           body: JSON.stringify({ status: 'ZAKOŃCZONY', isArchived: true })
                        });
                        setSelectedProject(null);
                        fetchData();
                     } catch (err) {
                        console.error(err);
                        alert('Błąd podczas kończenia projektu');
                     }
                  }} className="px-10 py-5 bg-slate-900 text-white rounded-sm text-[11px] font-black uppercase tracking-widest hover:bg-slate-800 hover:scale-105 active:scale-95 transition-all shadow-2xl">Zakończ Projekt</button>
               </div>
               
               {/* Sekcja Komunikatora - Projekt */}
               <div className="mt-12 h-[500px] border border-slate-400 rounded-sm overflow-hidden shadow-sm">
                  <UniversalChat mode="project" targetId={selectedProject.id} currentUser={currentUser} socket={socket} token={token} title={`Wątek #P-${(selectedProject.id || '').split('-').pop()}`} subtitle="Tablica Główna Projektu" />
               </div>
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
          <div className="p-5 border-b border-slate-300 flex justify-between items-center bg-gradient-to-b from-[#f8fafc] to-[#e2e8f0] shrink-0">
            <div className="flex items-center space-x-6">
              <div className="w-16 h-16 bg-slate-900 rounded-sm flex items-center justify-center shadow-xl shadow-slate-900/20 text-white"><Megaphone className="w-8 h-8" /></div>
              <div>
                <div className="flex items-center space-x-3 mb-2">
                  <span className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em]">=Oś Czasu / PIM</span>
                  <span className={`px-3 py-1 rounded-sm ${selectedCampaign.color?.replace('bg-', 'bg-')?.replace('500', '50')} ${selectedCampaign.color?.replace('bg-', 'text-')?.replace('500', '600')} text-[9px] font-black uppercase tracking-widest`}>{selectedCampaign.status}</span>
                </div>
                <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none">{selectedCampaign.name}</h3>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-2 block">{selectedCampaign.product?.name || 'Promocja Wieloproduktowa'}</span>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <button className="p-4 hover:bg-white bg-slate-100/50 rounded-sm text-slate-600 hover:text-pink-600 transition-all border border-transparent hover:border-slate-300 shadow-sm"><Settings className="w-6 h-6" /></button>
              <button onClick={() => setSelectedCampaign(null)} className="p-4 hover:bg-slate-900 bg-slate-100 rounded-sm text-slate-600 hover:text-white transition-all shadow-sm"><X className="w-6 h-6" /></button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-5 bg-white grid grid-cols-3 gap-4 content-start">
            
            {/* Top Metrics / KPIs */}
            <div className="col-span-3 grid grid-cols-4 gap-6">
               <div className="p-6 bg-slate-50 rounded-sm border border-slate-300">
                  <div className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-2 flex items-center"><Target className="w-3 h-3 mr-2" /> Marka</div>
                  <div className="text-sm font-black text-slate-900 uppercase truncate">{selectedCampaign.brand?.name || 'Brak'}</div>
               </div>
               <div className="p-6 bg-slate-50 rounded-sm border border-slate-300">
                  <div className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-2 flex items-center"><DollarSign className="w-3 h-3 mr-2" /> Budżet</div>
                  <div className="text-sm font-black text-slate-900 tabular-nums uppercase">{selectedCampaign.budget} PLN</div>
               </div>
               <div className="p-6 bg-emerald-50 rounded-sm border border-emerald-100 col-span-2 flex justify-between items-center relative overflow-hidden">
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
                  <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] mb-6 flex items-center"><MessageCircle className="w-4 h-4 mr-3" /> Instrukcje dla Handlowców / Agencji</h4>
                  <div className="bg-slate-50/70 rounded-sm p-4 border border-slate-300 relative group min-h-[8rem]">
                    <p className="text-slate-600 text-sm font-bold leading-relaxed">{selectedCampaign.instructions || 'Brak wdrożonych wytycznych operacyjnych.'}</p>
                  </div>
               </div>

               {/* Tasks */}
               <div>
                  <div className="flex items-center justify-between mb-6">
                    <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] flex items-center"><Zap className="w-4 h-4 mr-3" /> Zadania Operacyjne (Tik-Tok, Darkposty)</h4>
                    <button className="text-[9px] font-black text-pink-600 hover:text-pink-800 uppercase tracking-widest">Więcej</button>
                  </div>
                  <div className="space-y-4">
                    {projectTasks.map(t => (
                      <div key={t.id} className="p-5 bg-white border border-slate-300 rounded-sm shadow-sm flex items-center justify-between">
                         <div className="flex items-center space-x-4">
                           <div className={`w-8 h-8 rounded-sm flex items-center justify-center ${t.status==='DONE' ? 'bg-emerald-50 text-emerald-500' : 'bg-slate-100 text-slate-600'}`}>
                             <CheckCircle2 className="w-4 h-4" />
                           </div>
                           <div>
                             <div className="text-[11px] font-black text-slate-800 uppercase tracking-tight">{t.title}</div>
                             <div className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mt-0.5">{t.status}</div>
                           </div>
                         </div>
                      </div>
                    ))}
                    {projectTasks.length === 0 && <div className="p-5 text-center text-slate-300 font-black text-[10px] uppercase tracking-widest border-2 border-dashed border-slate-50 rounded-sm">Brak Aktywnych Zadań</div>}
                  </div>
               </div>
            </div>

            {/* Right Column (1/3 width) */}
            <div className="col-span-1 border-l border-slate-300 pl-8 space-y-10">
               {/* Assets */}
               <div>
                 <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] mb-6 flex items-center"><Folder className="w-4 h-4 mr-3" /> Materiały POSM</h4>
                 <div className="space-y-3">
                   <button className="w-full p-4 border-2 border-dashed border-slate-400 rounded-sm text-[10px] font-black text-slate-600 uppercase tracking-widest hover:border-indigo-400 hover:text-indigo-600 transition-colors">+ Wgraj Plik</button>
                 </div>
               </div>

               {/* Assignees */}
               <div>
                 <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] mb-6 flex items-center"><Users className="w-4 h-4 mr-3" /> Obsługa</h4>
                 <div className="flex -space-x-2">
                    {/* Placeholder for Assignees (Users that own the tasks inside the campaign) */}
                    <div className="w-10 h-10 rounded-sm bg-indigo-600 border-2 border-white flex items-center justify-center text-[10px] font-black text-white shadow-md">KAM</div>
                    <div className="w-10 h-10 rounded-sm bg-pink-500 border-2 border-white flex items-center justify-center text-[10px] font-black text-white shadow-md">AG</div>
                 </div>
               </div>
            </div>
            </div>
            
            {/* Kampania Chat */}
            <div className="h-[400px] border-t border-slate-300 shrink-0 relative z-0">
                 <UniversalChat mode="campaign" targetId={selectedCampaign.id} currentUser={currentUser} socket={socket} token={token} title="Szybka Komunikacja w Kampanii" subtitle={`Marketing: ${selectedCampaign.brand?.name || ''}`} />
            </div>
          </div>
        </div>
    );
  };

  const renderModals = () => {
    const inputClass = "w-full px-6 py-4 bg-slate-50 border border-slate-300 rounded-sm outline-none font-bold text-slate-800 focus:ring-4 focus:ring-indigo-600/10 focus:border-indigo-600/30 transition-all placeholder:text-slate-600";
    const labelClass = "text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] mb-3 block ml-2";

    const ALL_MODULES = [
      { id: 'kanban', label: 'Tablica Wydarzeń (Zadania)' },
      { id: 'campaigns', label: 'Centrum Kampanii' },
      { id: 'mtool', label: 'Narzędzia MTool' },
      { id: 'crm', label: 'Katalog Firm (CRM)' },
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
            <div className="bg-white rounded-sm shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in duration-500 flex flex-col max-h-[85vh] min-h-0">
              <div className="p-5 border-b border-slate-300 flex justify-between items-center bg-gradient-to-b from-[#f8fafc] to-[#e2e8f0] shrink-0">
                 <div className="flex items-center">
                    <div className="w-12 h-12 bg-emerald-500 rounded-sm flex items-center justify-center mr-6 shadow-xl shadow-emerald-200">
                       <Plus className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Załóż Nowy Pomyślnie</h3>
                      <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mt-1">Stwórz nowy profil dostępowy.</p>
                    </div>
                 </div>
                 <button onClick={() => setIsNewUserModalOpen(false)} className="p-4 hover:bg-white rounded-sm transition-all text-slate-600"><X className="w-6 h-6" /></button>
              </div>
              <form onSubmit={handleCreateUser} className="p-5 space-y-8 overflow-y-auto custom-scrollbar flex-1 min-h-0">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className={labelClass}>Imię i Nazwisko / Login</label>
                    <input required placeholder="Jan Kowalski" className={inputClass} value={newUserForm.name} onChange={e => setNewUserForm({...newUserForm, name: e.target.value})} />
                  </div>
                  <div>
                    <label className={labelClass}>Adres Email</label>
                    <input required type="email" placeholder="jan@nes-sentinel.local" className={inputClass} value={newUserForm.email} onChange={e => setNewUserForm({...newUserForm, email: e.target.value})} />
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

                <div className="pt-8 border-t border-slate-300">
                  <label className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] mb-4 block">Zezwolenia Modułowe dla Operatora</label>
                  <div className="grid grid-cols-2 gap-4">
                    {ALL_MODULES.map(m => (
                      <label key={m.id} className="flex items-center space-x-3 cursor-pointer p-4 border border-slate-300 rounded-sm hover:bg-slate-50 transition-colors">
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
            <div className="bg-white rounded-sm shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in duration-500 flex flex-col max-h-[85vh] min-h-0">
              <div className="p-5 border-b border-slate-300 flex justify-between items-center bg-gradient-to-b from-[#f8fafc] to-[#e2e8f0] shrink-0">
                 <div className="flex items-center">
                    <div className="w-12 h-12 bg-indigo-600 rounded-sm flex items-center justify-center mr-6 shadow-xl shadow-indigo-200">
                       <Settings className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Uprawnienia</h3>
                      <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mt-1">{editingUser.email}</p>
                    </div>
                 </div>
                 <button type="button" onClick={() => {setIsUserEditModalOpen(false); setEditingUser(null);}} className="p-4 hover:bg-white rounded-sm transition-all text-slate-600"><X className="w-6 h-6" /></button>
              </div>
              <form onSubmit={handleUpdateUser} className="p-5 space-y-8 overflow-y-auto custom-scrollbar flex-1 min-h-0">
                <div className="p-6 bg-indigo-50/50 border border-indigo-100 rounded-sm space-y-4">
                  <h4 className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] mb-2">Dane Autoryzacyjne Pracownika</h4>
                  <div>
                    <label className={labelClass}>Imię i Nazwisko</label>
                    <input type="text" required className={inputClass} value={editingUser.name || ''} onChange={e => setEditingUser({...editingUser, name: e.target.value})} />
                  </div>
                  <div>
                    <label className={labelClass}>Służbowy Adres E-mail</label>
                    <input type="email" required className={inputClass} value={editingUser.email || ''} onChange={e => setEditingUser({...editingUser, email: e.target.value})} />
                  </div>
                  <div>
                    <label className={labelClass}>Nowe Hasło (Pole Zabezpieczone)</label>
                    <input type="password" placeholder="...zostaw rygorystycznie puste wyłączając procedurę ratunkową zmiany hasła" className={`${inputClass} !bg-white focus:!border-rose-300 focus:!ring-rose-500/20`} value={editingUser.password || ''} onChange={e => setEditingUser({...editingUser, password: e.target.value})} />
                  </div>
                </div>

                <div className="p-6 bg-slate-50/50 border border-slate-300 rounded-sm space-y-4 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-slate-200/50 blur-3xl rounded-full pointer-events-none"></div>
                  <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-[0.2em] mb-2 flex justify-between items-center">
                    <span>Konfiguracja SMTP (Poczta Wychodząca)</span>
                    <button type="button" onClick={handleUpdateSmtpConfig} className="px-3 py-1 bg-slate-800 text-white hover:bg-slate-700 rounded-sm text-[8px] transition-all">Zapisz tylko SMTP</button>
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Serwer SMTP (Host)</label>
                      <input type="text" placeholder="np. ssl0.ovh.net" className={inputClass} value={editingUser.smtpHost || ''} onChange={e => setEditingUser({...editingUser, smtpHost: e.target.value})} />
                    </div>
                    <div>
                      <label className={labelClass}>Port SMTP</label>
                      <input type="number" placeholder="465" className={inputClass} value={editingUser.smtpPort || ''} onChange={e => setEditingUser({...editingUser, smtpPort: e.target.value})} />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Użytkownik (Adres E-mail Skrzynki)</label>
                    <input type="email" placeholder="np. kontakt@n-e-s.it" className={inputClass} value={editingUser.smtpUser || ''} onChange={e => setEditingUser({...editingUser, smtpUser: e.target.value})} />
                  </div>
                  <div>
                    <label className={labelClass}>Hasło SMTP</label>
                    <input type="password" placeholder="...podaj hasło do skrzynki (zostanie zaszyfrowane w bazie)" className={`${inputClass} !bg-white focus:!border-rose-300 focus:!ring-rose-500/20`} value={editingUser.smtpPassword || ''} onChange={e => setEditingUser({...editingUser, smtpPassword: e.target.value})} />
                  </div>
                </div>

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

                <div className="pt-8 border-t border-slate-300">
                  <label className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] mb-4 block">Widoczne Moduły Paska Nawigacji</label>
                  <div className="grid grid-cols-2 gap-4">
                    {ALL_MODULES.map(m => (
                      <label key={m.id} className="flex items-center space-x-3 cursor-pointer p-4 border border-slate-300 rounded-sm hover:bg-slate-50 transition-colors">
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

        {/* Nowa Kampania / Edycja Kampanii */}
        <NewCampaignModal 
          isOpen={isNewCampaignModalOpen || !!campaignForEdit} 
          onClose={() => { setIsNewCampaignModalOpen(false); setCampaignForEdit(null); }} 
          brands={brands} 
          companies={companies}
          products={products} 
          users={users}
          fetchData={fetchData} 
          token={token} 
          API_URL={API_URL} 
          initialData={campaignForEdit}
        />

        {/* Nowy Projekt */}
        {isNewProjectModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[120] flex items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="bg-white rounded-sm shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in duration-500 flex flex-col max-h-[85vh] min-h-0">
              <div className="p-5 border-b border-slate-300 flex justify-between items-center bg-gradient-to-b from-[#f8fafc] to-[#e2e8f0]">
                 <div className="flex items-center">
                    <div className="w-12 h-12 bg-emerald-500 rounded-sm flex items-center justify-center mr-6 shadow-xl shadow-emerald-200">
                       <Folder className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Nowy Projekt</h3>
                      <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mt-1">Zdefiniuj ramy jednostki operacyjnej.</p>
                    </div>
                 </div>
                 <button onClick={() => setIsNewProjectModalOpen(false)} className="p-4 hover:bg-white rounded-sm transition-all text-slate-600"><X className="w-6 h-6" /></button>
              </div>
              <form onSubmit={handleCreateProject} className="p-5 space-y-6 overflow-y-auto custom-scrollbar flex-1 min-h-0">
                <div>
                  <label className={labelClass}>Nazwa Projektu</label>
                  <input required placeholder="Nazwa projektu..." type="text" className={inputClass} value={newProjectForm.name} onChange={e => setNewProjectForm({...newProjectForm, name: e.target.value})} />
                </div>
                <div>
                  <label className={labelClass}>Kategoria</label>
                  <input placeholder="Np. KAMPANIA, PRODUKCJA..." type="text" className={inputClass} value={newProjectForm.category} onChange={e => setNewProjectForm({...newProjectForm, category: e.target.value})} />
                </div>
                <div>
                  <label className={labelClass}>Budżet (PLN)</label>
                  <input type="number" className={inputClass} value={newProjectForm.budget} onChange={e => setNewProjectForm({...newProjectForm, budget: parseFloat(e.target.value)})} />
                </div>
                <div>
                  <label className={labelClass}>Opis / Założenia</label>
                  <textarea className={`${inputClass} min-h-[100px]`} value={newProjectForm.description} onChange={e => setNewProjectForm({...newProjectForm, description: e.target.value})} />
                </div>
                <div>
                  <label className={labelClass}>Kolor Zespołu</label>
                  <select className={inputClass} value={newProjectForm.color} onChange={e => setNewProjectForm({...newProjectForm, color: e.target.value})}>
                    <option value="bg-emerald-500">Szmaragdowy</option>
                    <option value="bg-indigo-500">Indygo</option>
                    <option value="bg-rose-500">Różowy</option>
                    <option value="bg-amber-500">Bursztynowy</option>
                  </select>
                </div>
                <div className="pt-4">
                  <button type="submit" className="w-full py-6 bg-emerald-500 hover:bg-emerald-600 text-white font-black rounded-sm shadow-2xl shadow-emerald-600/20 transition-all uppercase tracking-[0.2em] text-sm active:scale-95 flex items-center justify-center">
                    Utwórz Projekt
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Nowa Marka (PIM) */}
        {isNewBrandModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[120] flex items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="bg-white rounded-sm shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in duration-500">
              <div className="p-5 border-b border-slate-300 flex justify-between items-center bg-gradient-to-b from-[#f8fafc] to-[#e2e8f0]">
                 <div className="flex items-center">
                    <div className="w-12 h-12 bg-indigo-600 rounded-sm flex items-center justify-center mr-6 shadow-xl shadow-indigo-200">
                       <Target className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Rejestracja Marki</h3>
                 </div>
                 <button onClick={() => setIsNewBrandModalOpen(false)} className="p-4 hover:bg-white rounded-sm transition-all text-slate-600"><X className="w-6 h-6" /></button>
              </div>
              <form onSubmit={handleCreateBrand} className="p-5 space-y-8">
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
            <div className="bg-white rounded-sm shadow-[0_50px_150px_rgba(0,0,0,0.4)] w-full max-w-4xl overflow-hidden animate-in zoom-in duration-700 max-h-[85vh] flex flex-col relative min-h-0">
               <div className="absolute top-0 w-full h-1 bg-gradient-to-r from-fuchsia-500 via-indigo-500 to-emerald-500"></div>
               <div className="p-5 border-b border-slate-300 flex justify-between items-center bg-gradient-to-b from-[#f8fafc] to-[#e2e8f0] shrink-0">
                  <div className="flex items-center">
                    <div className="w-12 h-12 bg-slate-900 rounded-sm flex items-center justify-center mr-6">
                      <Hash className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">
                         {editingProduct ? 'Edycja Kartoteki PIM' : 'Rejestr Nowego Produktu'}
                      </h3>
                      <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mt-1">Zdefiniuj Kartotekę PIM (Ceny, Cło, Parametry BDO)</p>
                    </div>
                  </div>
                  <button onClick={() => { setIsNewProductModalOpen(false); setEditingProduct(null); }} className="p-4 hover:bg-slate-900 rounded-sm transition-all text-slate-600 hover:text-white"><X className="w-6 h-6" /></button>
               </div>
                
               <form onSubmit={handleCreateProduct} className="p-6 space-y-12 overflow-y-auto custom-scrollbar flex-1 min-h-0">
                
                <div className="flex flex-col md:flex-row gap-6 mb-6">
                   {/* Stabilna Główna Miniaturka */}
                   {newProductForm.imageUrl && (
                      <div className="w-40 shrink-0 bg-white border border-slate-200 rounded-sm p-3 shadow-sm flex flex-col items-center justify-center">
                         <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 block w-full text-center border-b border-slate-100 pb-2">Główna Miniatura</span>
                         <img src={newProductForm.imageUrl} alt="PIM Thumbnail" className="w-full h-auto object-contain rounded-sm" />
                      </div>
                   )}
                   
                   {/* Moduł API EAN */}
                   <div className="flex-1 p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-sm flex flex-col justify-center">
                      <label className="text-[10px] font-black text-indigo-800 uppercase tracking-widest mb-3 flex items-center"><CloudLightning className="w-4 h-4 mr-2"/> Automatyka Globalnej Sieci (EAN)</label>
                      <div className="flex space-x-4 items-end">
                        <input type="text" placeholder="Zeskanuj kod kreskowy tu..." className="flex-1 px-4 py-3 bg-white border border-blue-200 rounded-sm text-sm font-bold text-slate-800 focus:border-indigo-500 outline-none font-mono tracking-widest shadow-inner" value={newProductForm.ean} onChange={e => setNewProductForm({...newProductForm, ean: e.target.value})} />
                        <button type="button" onClick={handleAutofillEAN} disabled={autofillEanLoading} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-widest rounded-sm shadow-md transition-all flex items-center shrink-0">
                          {autofillEanLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin"/> : <Search className="w-4 h-4 mr-2"/> } {autofillEanLoading ? 'Szukam...' : 'Interpoluj EAN'}
                        </button>
                      </div>
                   </div>
                </div>

                <div className="grid grid-cols-2 gap-5">
                  <div className="col-span-2">
                    <label className={labelClass}>Oficjalna Nazwa Handlowa *</label>
                    <input required placeholder="Np. Nexus Core Ultra S1..." type="text" className={inputClass} value={newProductForm.name} onChange={e => setNewProductForm({...newProductForm, name: e.target.value})} />
                  </div>
                  <div>
                    <label className={labelClass}>SKU (Identyfikator Wewnętrzny) *</label>
                    <input required placeholder="NEX-XXX-001..." type="text" className={`${inputClass} font-mono`} value={newProductForm.sku} onChange={e => setNewProductForm({...newProductForm, sku: e.target.value})} />
                  </div>
                  <div ref={brandDropdownRef} className="relative z-30">
                    <label className={labelClass}>Marka (Wybierz lub dodaj nową) *</label>
                    <div className="relative">
                       <input 
                         type="text" 
                         required
                         className={`${inputClass} pr-10`}
                         placeholder="Wpisz nazwę marki..."
                         value={brandSearchTerm}
                         onChange={(e) => {
                            setBrandSearchTerm(e.target.value);
                            setNewProductForm(prev => ({...prev, brandId: ''}));
                            setIsBrandDropdownOpen(true);
                         }}
                         onFocus={() => setIsBrandDropdownOpen(true)}
                       />
                       <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    </div>
                    {isBrandDropdownOpen && (
                       <div className="absolute z-50 w-full mt-1 bg-white border border-slate-300 rounded-sm shadow-[0_10px_40px_rgba(0,0,0,0.1)] max-h-48 overflow-y-auto custom-scrollbar">
                          {filteredBrands.length > 0 ? (
                             filteredBrands.map(b => (
                                <div 
                                   key={b.id} 
                                   className={`p-3 cursor-pointer hover:bg-indigo-50 transition-colors border-b border-slate-100 last:border-b-0 ${newProductForm.brandId === b.id ? 'bg-indigo-50' : ''}`}
                                   onMouseDown={(e) => {
                                      e.preventDefault(); 
                                      setNewProductForm(prev => ({...prev, brandId: b.id}));
                                      setBrandSearchTerm(b.name);
                                      setIsBrandDropdownOpen(false);
                                   }}
                                >
                                   <div className="text-xs font-bold text-slate-800">{b.name}</div>
                                </div>
                             ))
                          ) : (
                             <div className="p-3 text-center">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Brak marki w bazie</span>
                                <button type="button" onMouseDown={(e) => { e.preventDefault(); handleCreateBrandInline(brandSearchTerm); }} className="w-full py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white rounded-sm text-[10px] font-black uppercase tracking-widest transition-colors flex items-center justify-center">
                                  <Plus className="w-3 h-3 mr-2" /> Dodaj: "{brandSearchTerm}"
                                </button>
                             </div>
                          )}
                       </div>
                    )}
                  </div>
                  
                  <div className="col-span-2 mt-4 p-5 bg-indigo-50/50 border border-indigo-100 rounded-sm">
                     <label className="text-[10px] font-black text-indigo-700 uppercase tracking-widest mb-3 flex items-center">
                        <Target className="w-4 h-4 mr-2" /> ID Kategorii Allegro (Data Quality Score)
                     </label>
                     <div className="flex space-x-4">
                        <input type="text" placeholder="Np. 257745" className={`${inputClass} flex-1`} value={newProductForm.allegroCategoryId || ''} onChange={e => setNewProductForm({...newProductForm, allegroCategoryId: e.target.value})} />
                        {editingProduct && (
                           <button type="button" onClick={async () => {
                              try {
                                 const res = await axios.get(`${API_URL}/api/products/${editingProduct}/sync-category-bl`, { headers: { Authorization: `Bearer ${token}` } });
                                 setNewProductForm(prev => ({...prev, allegroCategoryId: res.data.allegroCategoryId}));
                                 alert("Pomyślnie dopasowano kategorię Allegro na podstawie kodu EAN oraz zsynchronizowano słownik.");
                              } catch (err) {
                                 alert("Błąd: " + (err.response?.data?.error || err.message));
                              }
                           }} className="px-6 py-3 bg-white text-indigo-600 font-black text-[10px] uppercase tracking-widest rounded-sm border border-indigo-200 hover:bg-indigo-600 hover:text-white transition-all whitespace-nowrap shadow-sm">
                              Szukaj po EAN
                           </button>
                        )}
                     </div>
                     <p className="text-[9px] text-indigo-500 mt-2 font-bold uppercase tracking-widest">
                        Przypisanie ID pozwoli na dynamiczną ewaluację brakujących parametrów wymaganych do skutecznej syndykacji na Marketplace Allegro.
                     </p>
                  </div>
                </div>

                {/* Nowa Sekcja: Logistyka i Gabaryty */}
                <div className="pt-10 border-t border-slate-300">
                   <h4 className="text-sm font-black text-slate-800 uppercase tracking-[0.3em] mb-8 flex items-center">
                     <Package className="w-5 h-5 mr-3 text-indigo-500" /> Logistyka i Gabaryty (PIM)
                   </h4>
                   <div className="grid grid-cols-5 gap-6">
                     <div><label className={labelClass}>Waga (kg)</label><input type="number" step="0.01" className={inputClass} value={newProductForm.weight || 0} onChange={e => setNewProductForm({...newProductForm, weight: e.target.value})} /></div>
                     <div><label className={labelClass}>Długość (cm)</label><input type="number" step="0.1" className={inputClass} value={newProductForm.length || 0} onChange={e => setNewProductForm({...newProductForm, length: e.target.value})} /></div>
                     <div><label className={labelClass}>Szerokość (cm)</label><input type="number" step="0.1" className={inputClass} value={newProductForm.width || 0} onChange={e => setNewProductForm({...newProductForm, width: e.target.value})} /></div>
                     <div><label className={labelClass}>Wysokość (cm)</label><input type="number" step="0.1" className={inputClass} value={newProductForm.height || 0} onChange={e => setNewProductForm({...newProductForm, height: e.target.value})} /></div>
                     <div><label className={labelClass}>Stawka VAT (%)</label><input type="number" className={inputClass} value={newProductForm.taxRate || 23} onChange={e => setNewProductForm({...newProductForm, taxRate: e.target.value})} /></div>
                   </div>
                </div>

                {/* Nowa Sekcja: Stany Magazynowe Rozszerzone */}
                <div className="pt-10 border-t border-slate-300">
                   <h4 className="text-sm font-black text-slate-800 uppercase tracking-[0.3em] mb-8 flex items-center">
                     <Database className="w-5 h-5 mr-3 text-indigo-500" /> Architektura Zapasów
                   </h4>
                   <div className="flex space-x-6">
                     <div className="flex-1 bg-slate-50 p-6 rounded-sm border border-slate-300">
                        <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-2">Zapas Zintegrowany (Suma)</div>
                        <div className="flex items-center">
                           <input type="number" className="w-24 bg-white border border-slate-400 rounded-sm px-3 py-1 font-black text-xl mr-2 outline-none focus:border-indigo-500" value={newProductForm.stock || 0} onChange={e => setNewProductForm({...newProductForm, stock: e.target.value})} />
                           <span className="text-sm text-slate-600 font-bold">szt.</span>
                        </div>
                     </div>
                     <div className="flex-1 bg-indigo-50 p-6 rounded-sm border border-indigo-100 opacity-80 cursor-not-allowed">
                        <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2">Własny ERP (NeS)</div>
                        <div className="text-2xl font-black text-indigo-900">{newProductForm.stockErpUnits || 0} <span className="text-sm text-indigo-400">szt.</span></div>
                     </div>
                     <div className="flex-1 bg-emerald-50 p-6 rounded-sm border border-emerald-100 opacity-80 cursor-not-allowed">
                        <div className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-2">Zewnętrzny WMS (Fulfillment)</div>
                        <div className="text-2xl font-black text-emerald-900">{newProductForm.stockWmsUnits || 0} <span className="text-sm text-emerald-400">szt.</span></div>
                     </div>
                   </div>
                </div>

                {/* Nowa Sekcja: Multimedia i Opis (Read Only) */}
                <div className="pt-10 border-t border-slate-300">
                   <h4 className="text-sm font-black text-slate-800 uppercase tracking-[0.3em] mb-8 flex items-center">
                     <Image className="w-5 h-5 mr-3 text-indigo-500" /> Multimedia i Dane Techniczne
                   </h4>
                   <div className="grid grid-cols-2 gap-5">
                      <div>
                         <label className={labelClass}>Galeria BaseLinker ({newProductForm.images?.length || 0})</label>
                         {newProductForm.images && newProductForm.images.length > 0 ? (
                            <div className="grid grid-cols-4 gap-2 mt-4">
                               {newProductForm.images.map((img, idx) => (
                                   <div key={idx} className="aspect-square bg-white border border-slate-400 rounded-sm overflow-hidden shadow-sm">
                                      <img src={img} alt="PIM" className="w-full h-full object-cover" />
                                   </div>
                               ))}
                            </div>
                         ) : (
                            <div className="p-6 bg-slate-50 border border-slate-300 rounded-sm text-center text-slate-600 text-xs font-bold mt-4">
                               Brak zsynchronizowanych multimediów.
                            </div>
                         )}
                         {newProductForm.videoUrl && (
                             <div className="mt-4 p-4 bg-blue-50 border border-blue-100 rounded-sm text-blue-600 text-[10px] font-black uppercase tracking-widest flex items-center">
                                 <PlayCircle className="w-4 h-4 mr-2" /> Wideo produktowe dostępne
                             </div>
                         )}
                      </div>
                      <div>
                         <label className={labelClass}>Opis HTML i Parametry</label>
                         <div className="space-y-4 mt-4">
                            <div className={`p-4 rounded-sm border flex flex-col justify-between ${newProductForm.descriptionHtml ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-slate-50 border-slate-300 text-slate-600'}`}>
                               <div className="flex items-center text-xs font-black uppercase tracking-widest justify-between w-full">
                                  <div className="flex items-center">
                                     <FileText className="w-4 h-4 mr-2" />
                                     {newProductForm.descriptionHtml ? 'Zapisano bogaty opis HTML' : 'Brak Opisu HTML'}
                                  </div>
                                  {newProductForm.descriptionHtml && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                               </div>
                               {newProductForm.descriptionHtml && (
                                   <div className="mt-3 max-h-32 overflow-y-auto custom-scrollbar p-2 bg-white rounded border border-emerald-100 text-[10px] text-slate-600 font-mono">
                                       {newProductForm.descriptionHtml}
                                   </div>
                               )}
                            </div>

                            {newProductForm.aeoContent && (
                               <div className="p-4 rounded-sm border bg-amber-50 border-amber-200 text-amber-800">
                                   <div className="flex items-center justify-between text-xs font-black uppercase tracking-widest mb-2">
                                       <div className="flex items-center">
                                           <Zap className="w-4 h-4 mr-2 text-amber-500" />
                                           Treść AEO (Answer Engine Optimization)
                                       </div>
                                       <span className="bg-amber-200 text-amber-900 px-2 py-0.5 rounded text-[9px]">SGE / Perplexity Ready</span>
                                   </div>
                                   <div className="max-h-48 overflow-y-auto custom-scrollbar p-3 bg-white rounded border border-amber-200 text-[11px] text-slate-700 font-serif leading-relaxed">
                                       <div dangerouslySetInnerHTML={{ __html: newProductForm.aeoContent }} />
                                   </div>
                               </div>
                            )}
                            
                            <div className="p-4 bg-slate-50 border border-slate-300 rounded-sm">
                               <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-3 flex items-center justify-between">
                                  <div className="flex items-center space-x-3">
                                      <span>Atrybuty Techniczne i Parametry Allegro ({Object.keys(newProductForm.features || {}).length})</span>
                                      {categorySchema && <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-[9px] flex items-center"><Zap className="w-3 h-3 mr-1"/> Schema: {categorySchema.name}</span>}
                                  </div>
                                  <button type="button" onClick={async () => {
                                      if (!editingProduct) return;
                                      try {
                                          const btn = document.getElementById('btn_autofill_pxm');
                                          const prevText = btn.innerHTML;
                                          btn.innerHTML = 'Pobieram (BL + AI)...';
                                          btn.disabled = true;
                                          
                                          const res = await axios.post(`${API_URL}/api/products/${editingProduct}/autofill-params`, {}, { headers: { Authorization: `Bearer ${token}` } });
                                          setNewProductForm(prev => ({...prev, features: res.data.features}));
                                          
                                          btn.innerHTML = prevText;
                                          btn.disabled = false;
                                          alert("Zakończono PXM Auto-Fill. Zaimportowano dane z BaseLinkera, a luki uzupełnił Agent AI.");
                                      } catch (err) {
                                          alert("Błąd: " + (err.response?.data?.error || err.message));
                                          const btn = document.getElementById('btn_autofill_pxm');
                                          if (btn) { btn.innerHTML = 'Pobierz dane (Auto-Fill)'; btn.disabled = false; }
                                      }
                                  }} id="btn_autofill_pxm" className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-sm text-[9px] font-bold uppercase transition-colors shadow-sm flex items-center">
                                      <Zap className="w-3 h-3 mr-1" /> Pobierz dane (Auto-Fill)
                                  </button>
                               </div>
                               
                               <div className="flex flex-col space-y-2">
                                   {categorySchema?.parameters && categorySchema.parameters.map(param => {
                                      const isRequired = param.required;
                                      const val = (newProductForm.features || {})[param.name] || '';
                                      const hasVal = val !== '';
                                      return (
                                       <div key={param.id} className={`flex items-center space-x-2 p-2 rounded-sm border ${hasVal ? 'bg-indigo-50/30 border-indigo-100' : 'bg-white border-slate-200'}`}>
                                           <div className="w-1/3 text-[10px] font-bold text-slate-700 uppercase tracking-widest flex flex-col">
                                               <span>{param.name}</span>
                                               {isRequired && <span className="text-[8px] text-rose-500 uppercase mt-0.5">Wymagane</span>}
                                           </div>
                                           {param.dictionary && param.dictionary.length > 0 ? (
                                               <select className="flex-1 bg-white border border-slate-300 rounded-sm px-3 py-2 text-[11px] font-bold outline-none focus:border-indigo-500" value={val} onChange={e => {
                                                   const updated = {...(newProductForm.features || {}), [param.name]: e.target.value};
                                                   if (!e.target.value) delete updated[param.name];
                                                   setNewProductForm({...newProductForm, features: updated});
                                               }}>
                                                   <option value="">-- Wybierz ze słownika --</option>
                                                   {param.dictionary.map(d => <option key={d.id} value={d.value}>{d.value}</option>)}
                                               </select>
                                           ) : (
                                               <input type="text" className="flex-1 bg-white border border-slate-300 rounded-sm px-3 py-2 text-[11px] font-bold outline-none focus:border-indigo-500" placeholder={`Wpisz wartość (${param.type})`} value={val} onChange={e => {
                                                   const updated = {...(newProductForm.features || {}), [param.name]: e.target.value};
                                                   if (!e.target.value) delete updated[param.name];
                                                   setNewProductForm({...newProductForm, features: updated});
                                               }} />
                                           )}
                                       </div>
                                      );
                                   })}

                                   {!categorySchema?.parameters && Object.entries(newProductForm.features || {}).map(([k, v]) => (
                                       <div key={k} className="flex items-center space-x-2 group">
                                           <input type="text" value={k} readOnly className="w-1/3 bg-slate-100 border border-slate-300 rounded-sm px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest" />
                                           <input type="text" value={v} onChange={e => {
                                               const updated = {...newProductForm.features, [k]: e.target.value};
                                               setNewProductForm({...newProductForm, features: updated});
                                           }} className="flex-1 bg-white border border-slate-300 rounded-sm px-3 py-2 text-[11px] font-bold outline-none focus:border-indigo-500" />
                                           <button type="button" onClick={() => {
                                               const updated = {...newProductForm.features};
                                               delete updated[k];
                                               setNewProductForm({...newProductForm, features: updated});
                                           }} className="p-2 text-slate-400 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"><X className="w-4 h-4" /></button>
                                       </div>
                                   ))}
                                   
                                   {!categorySchema?.parameters && (
                                   <div className="flex items-center space-x-2 mt-2 pt-3 border-t border-slate-200">
                                       <input type="text" id="new_feat_key" placeholder="Nazwa (np. Stan, Rodzaj)" className="w-1/3 bg-white border border-indigo-200 rounded-sm px-3 py-2 text-[10px] font-bold uppercase tracking-widest outline-none focus:border-indigo-500 placeholder:normal-case placeholder:tracking-normal" />
                                       <input type="text" id="new_feat_val" placeholder="Wartość (np. Nowy)" className="flex-1 bg-white border border-indigo-200 rounded-sm px-3 py-2 text-[11px] font-bold outline-none focus:border-indigo-500" onKeyDown={e => {
                                           if (e.key === 'Enter') {
                                               e.preventDefault();
                                               const keyInput = document.getElementById('new_feat_key');
                                               const key = keyInput.value.trim();
                                               const val = e.target.value.trim();
                                               if (key && val) {
                                                   setNewProductForm(prev => ({...prev, features: {...(prev.features || {}), [key]: val}}));
                                                   keyInput.value = '';
                                                   e.target.value = '';
                                                   keyInput.focus();
                                               }
                                           }
                                       }} />
                                       <button type="button" onClick={() => {
                                           const keyInput = document.getElementById('new_feat_key');
                                           const valInput = document.getElementById('new_feat_val');
                                           const key = keyInput.value.trim();
                                           const val = valInput.value.trim();
                                           if (key && val) {
                                               setNewProductForm(prev => ({...prev, features: {...(prev.features || {}), [key]: val}}));
                                               keyInput.value = '';
                                               valInput.value = '';
                                               keyInput.focus();
                                           }
                                       }} className="p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-sm transition-colors shadow-md"><Plus className="w-4 h-4" /></button>
                                   </div>
                                   )}
                                   <p className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest mt-2 flex items-center">
                                      <Zap className="w-3 h-3 mr-1" /> {categorySchema ? 'Wypełnij wymagane wartości z oficjalnego słownika Allegro.' : 'Pobierz kategorię Allegro, aby załadować interaktywny formularz parametrów.'}
                                   </p>
                               </div>
                            </div>
                         </div>
                      </div>
                   </div>
                </div>

                <div className="pt-12 border-t border-slate-300">
                  <h4 className="text-sm font-black text-indigo-600 uppercase tracking-[0.3em] mb-5 flex items-center">
                    <DollarSign className="w-6 h-6 mr-4" /> Struktura Analityczna Unit Economics
                  </h4>
                  <div className="grid grid-cols-3 gap-4">
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

                <div className="flex space-x-4 mt-6 mb-5">
                   {newProductForm.id && (
                     <button type="button" onClick={async () => {
                         if(!window.confirm('Czy na pewno chcesz bezpowrotnie usunąć ten produkt z bazy PIM?')) return;
                         try {
                            const res = await fetch(`${API_URL}/api/products/${newProductForm.id}`, {
                               method: 'DELETE',
                               headers: { 'Authorization': `Bearer ${token}` }
                            });
                            if(!res.ok) throw new Error('Błąd usuwania API');
                            setIsNewProductModalOpen(false);
                            fetchData();
                         } catch (err) {
                            alert('Błąd podczas usuwania: ' + err.message);
                         }
                     }} className="w-1/3 py-7 bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 font-black rounded-sm shadow-sm transition-all uppercase tracking-widest text-[11px] group flex items-center justify-center">
                        <Trash2 className="w-5 h-5 mr-3" /> Usuń
                     </button>
                   )}
                   <button type="submit" className="flex-1 py-7 bg-slate-900 hover:bg-indigo-600 text-white font-black rounded-sm shadow-[0_25px_60px_rgba(0,0,0,0.2)] hover:shadow-indigo-600/30 transition-all uppercase tracking-[0.3em] text-sm group flex items-center justify-center">
                      <Cloud className="w-6 h-6 mr-4 group-hover:animate-bounce" /> Zapisz Kartotekę PIM
                   </button>
                </div>
              </form>
            </div>
          </div>
        )}
        {renderProjectDetails()}
        {selectedTask && <TaskDetailsDrawer task={selectedTask} onClose={() => setSelectedTask(null)} currentUser={currentUser} users={users} tasks={tasks} socket={socket} fetchData={fetchData} token={token} API_URL={API_URL} onSelectTask={(t) => setSelectedTask(t)} />}
        {selectedCampaign && <CampaignDetailsModal campaign={campaigns.find(c => c.id === selectedCampaign.id) || selectedCampaign} onClose={() => setSelectedCampaign(null)} onEdit={(camp) => { setSelectedCampaign(null); setCampaignForEdit(camp); setIsNewCampaignModalOpen(true); }} fetchData={fetchData} tasks={tasks} socket={socket} token={token} API_URL={API_URL} currentUser={currentUser} />}
      </>
    );
  };

  // --- KRYTYCZNE: BRAMKA PUBLICZNA DLA KALENDARZA REKRUTERÓW ---
  if (window.location.pathname === '/book') {
      return <PublicBookingView API_URL={API_URL} />;
  }

  if (!token) return renderLogin();

  return (
      <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden relative">
      {/* GLOBAL SIDEBAR */}
      <aside className="w-16 bg-slate-900 border-r border-slate-800 flex flex-col items-center py-4 z-50 shrink-0 shadow-2xl hidden md:flex">
        <DevBadge id="H-1" />
        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center mb-6 shadow-lg shadow-indigo-500/30 cursor-pointer hover:scale-105 transition-transform" title="NeS Nexus Sentinel">
          <img src="/logo.jpg" alt="NeS Logo" className="w-7 h-7 object-contain rounded-lg" />
        </div>
        
        <nav className="flex flex-col gap-3 w-full px-2 mt-2 overflow-y-auto custom-scrollbar flex-1 items-center">
          <button onClick={() => setActiveTab('dashboard')} title="Moja Tablica" className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${activeTab === 'dashboard' ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
             <Layout className="w-5 h-5" />
          </button>

          {(currentUser?.role === 'ADMIN' || currentUser?.accessibleModules?.includes('kanban')) && (
            <button onClick={() => setActiveTab('kanban')} title="Kanban" className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${activeTab === 'kanban' ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
              <CheckSquare className="w-5 h-5" />
            </button>
          )}

          {(currentUser?.role === 'ADMIN' || currentUser?.accessibleModules?.includes('mtool')) && (
            <button onClick={() => setActiveTab('mtool')} title="MTool" className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${activeTab === 'mtool' ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
              <Target className="w-5 h-5" />
            </button>
          )}

          {(currentUser?.role === 'ADMIN' || currentUser?.accessibleModules?.includes('campaigns')) && (
            <>
              <button onClick={() => setActiveTab('allegro-ads')} title="Mózg Ads" className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${activeTab === 'allegro-ads' ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
                <Bot className="w-5 h-5" />
              </button>
              <button onClick={() => setActiveTab('portfolio')} title="God-Mode CMO" className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${activeTab === 'portfolio' ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
                <BarChart3 className="w-5 h-5" />
              </button>
              <button onClick={() => setActiveTab('sentinel')} title="Nexus Sentinel" className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${activeTab === 'sentinel' ? 'bg-rose-500 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
                <ShieldAlert className="w-5 h-5" />
              </button>
              <button onClick={() => setActiveTab('zero-bleed')} title="Zero-Bleed Hub" className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all mt-4 ${activeTab === 'zero-bleed' ? 'bg-slate-100 text-slate-900 shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
                <AlertOctagon className="w-5 h-5" />
              </button>
              <button onClick={() => setActiveTab('meetings')} title="Kalendarz / Calendly" className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all mt-4 ${activeTab === 'meetings' ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
                <Calendar className="w-5 h-5" />
              </button>
            </>
          )}

          {(currentUser?.role === 'ADMIN' || currentUser?.accessibleModules?.includes('campaigns')) && (
            <button onClick={() => setActiveTab('campaigns')} title="Kampanie" className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${activeTab === 'campaigns' ? 'bg-pink-500 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
              <Megaphone className="w-5 h-5" />
            </button>
          )}

          {(currentUser?.role === 'ADMIN' || currentUser?.accessibleModules?.includes('projects')) && (
            <button onClick={() => setActiveTab('projects')} title="Projekty" className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${activeTab === 'projects' ? 'bg-emerald-500 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
              <Folder className="w-5 h-5" />
            </button>
          )}

          {(currentUser?.role === 'ADMIN' || currentUser?.accessibleModules?.includes('products')) && (
            <button onClick={() => setActiveTab('products')} title="PIM" className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${activeTab === 'products' ? 'bg-orange-500 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
              <Hash className="w-5 h-5" />
            </button>
          )}

          {(currentUser?.role === 'ADMIN' || currentUser?.accessibleModules?.includes('crm')) && (
            <button onClick={() => setActiveTab('crm')} title="Kontrahenci" className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${activeTab === 'crm' ? 'bg-blue-500 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
              <Building2 className="w-5 h-5" />
            </button>
          )}

          {(currentUser?.role === 'ADMIN' || currentUser?.accessibleModules?.includes('chat')) && (
            <button onClick={() => setActiveTab('chat')} title="Czat" className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all relative ${activeTab === 'chat' ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
              <MessageCircle className="w-5 h-5" />
              {unreadDMs.total > 0 && <span className="absolute top-0 right-0 bg-rose-500 border-2 border-slate-900 text-white text-[8px] font-bold w-3 h-3 rounded-full flex items-center justify-center"></span>}
            </button>
          )}
        </nav>
        
        <div className="mt-auto pt-4 flex flex-col items-center gap-3 w-full">
           {(currentUser?.role === 'ADMIN' || currentUser?.accessibleModules?.includes('admin')) && (
             <button onClick={() => setActiveTab('admin')} title="Admin" className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${activeTab === 'admin' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-white hover:bg-slate-800'}`}>
                <Settings className="w-5 h-5" />
             </button>
           )}
           <button onClick={handleLogout} title="Wyloguj" className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-all">
              <LogOut className="w-5 h-5" />
           </button>
        </div>
      </aside>

      {/* MAIN CONTENT WRAPPER */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white relative">
        
        {/* HEADER (Minimalist) */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-6 shrink-0 z-40">
           {/* Breadcrumb / Context */}
           <div className="flex items-center gap-3">
             <div className="md:hidden flex items-center">
               <img src="/logo.jpg" alt="NeS Logo" className="w-6 h-6 rounded mr-2" />
               <span className="font-semibold text-sm">NeS</span>
             </div>
             <div className="hidden md:flex items-center text-sm">
               <span className="text-slate-400 font-medium">NeS Nexus Sentinel</span>
               <span className="text-slate-300 mx-2">/</span>
               <span className="font-semibold text-slate-800 capitalize">{activeTab.replace('-', ' ')}</span>
             </div>
           </div>
           
           {/* Actions */}
           <div className="flex items-center gap-3 lg:gap-5 ml-auto">
             <div className="relative group hidden lg:block">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 transition-colors group-focus-within:text-indigo-600" />
               <input id="globalSearch" name="globalSearch" type="text" placeholder="Szukaj wszędzie..." className="pl-9 pr-4 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-sm font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 w-64 transition-all outline-none" />
             </div>

             <button onClick={() => { setShowNotifications(!showNotifications); if(!showNotifications) fetchData(); }} className="relative p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-500 hover:text-indigo-600 transition-all">
                <Bell className="w-4 h-4" />
                {notifications.some(n => !n.isRead) && <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-rose-500 rounded-full border-2 border-white translate-x-1 -translate-y-1"></span>}
             </button>
             
             <div className="w-px h-6 bg-slate-200 mx-1 hidden sm:block"></div>
             
             <div className="flex items-center gap-3 cursor-pointer group">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 group-hover:bg-slate-200 transition-colors ${getDepartmentColor(currentUser?.department)}`}>{getInitials(currentUser?.name)}</div>
                <div className="hidden xl:block">
                  <div className="text-sm font-semibold text-slate-800 leading-tight group-hover:text-indigo-600 transition-colors">{currentUser?.name}</div>
                  <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">{currentUser?.department || 'System'}</div>
                </div>
             </div>
             
             <button onClick={() => setIsNewTaskModalOpen(true)} className="ml-2 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-500 active:scale-95 transition-all shadow-sm shadow-indigo-200 flex items-center shrink-0">
                <Plus className="w-4 h-4 sm:mr-1.5" /> <span className="hidden sm:inline">Nowe Zadanie</span>
             </button>
           </div>
        </header>

        {/* Notifications Dropdown */}
        {showNotifications && (
          <div className="absolute right-6 top-16 w-80 bg-white rounded-xl shadow-2xl shadow-slate-200/50 border border-slate-200 z-[100] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h4 className="font-semibold text-sm text-slate-800">Powiadomienia</h4>
              <button onClick={() => setShowNotifications(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-200/50"><X className="w-4 h-4"/></button>
            </div>
            <div className="max-h-[25rem] overflow-y-auto custom-scrollbar">
              {notifications.length === 0 ? <div className="p-6 text-center text-slate-500 font-medium text-sm">Brak notyfikacji</div> : notifications.map(n => (
                <div key={n.id} onClick={() => handleNotificationClick(n)} className={`p-4 border-b border-slate-50 cursor-pointer hover:bg-slate-50 transition-colors group relative ${n.isRead ? 'opacity-60' : ''}`}>
                  <div className="flex items-center mb-1 pr-12">
                    <span className={`w-2 h-2 rounded-full mr-2 ${n.isRead ? 'bg-slate-200' : 'bg-indigo-500 animate-pulse'}`}></span>
                    <span className="text-xs font-semibold text-slate-800">{n.title}</span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed ml-4 pr-12">{n.message}</p>
                  
                  {/* Actions wrapper */}
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => { e.stopPropagation(); handleToggleNotificationRead(n.id, !n.isRead); }} className="p-1.5 text-slate-400 hover:text-indigo-600 bg-white shadow-sm border border-slate-200 rounded-md transition-colors" title={n.isRead ? "Oznacz jako nieprzeczytane" : "Oznacz jako przeczytane"}>
                        <CheckCircle className="w-3 h-3" />
                    </button>
                    <button onClick={(e) => handleDeleteNotification(e, n.id)} className="p-1.5 text-slate-400 hover:text-rose-600 bg-white shadow-sm border border-slate-200 rounded-md transition-colors" title="Usuń trwale">
                        <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MAIN VIEW AREA */}
        <main className="flex-1 min-h-0 bg-slate-50 flex flex-col relative w-full overflow-hidden">
            {activeTab === 'dashboard' && <EmployeeDashboardView currentUser={currentUser} tasks={tasks} notifications={notifications} campaigns={campaigns} API_URL={API_URL} onSelectTask={setSelectedTask} />}
            {activeTab === 'kanban' && <KanbanView tasks={tasks} projects={projects} campaigns={campaigns} selectedFilterId={selectedFilterId} setSelectedFilterId={setSelectedFilterId} setIsNewTaskModalOpen={setIsNewTaskModalOpen} setSelectedTask={setSelectedTask} devMode={devMode} />}
            {activeTab === 'campaigns' && <CampaignsView campaigns={campaigns} brands={brands} companies={companies} timelineRange={timelineRange} setTimelineRange={setTimelineRange} setSelectedCampaign={setSelectedCampaign} setIsNewCampaignModalOpen={setIsNewCampaignModalOpen} devMode={devMode} />}
            {activeTab === 'allegro-ads' && <AllegroAdsMonitor token={token} API_URL={API_URL} />}
            {activeTab === 'portfolio' && <PortfolioManagerView token={token} API_URL={API_URL} />}
            {activeTab === 'sentinel' && <GodModeAnalyticsView token={token} API_URL={API_URL} />}
            {activeTab === 'zero-bleed' && <ZeroBleedHubView token={token} API_URL={API_URL} />}
            {activeTab === 'meetings' && <MeetingDashboardView token={token} API_URL={API_URL} />}
            {activeTab === 'mtool' && <MToolView token={token} API_URL={API_URL} currentUser={currentUser} campaigns={campaigns} socket={socket} />}
            {activeTab === 'projects' && <ProjectsView projects={projects} tasks={tasks} currentUser={currentUser} setIsNewProjectModalOpen={setIsNewProjectModalOpen} setSelectedProject={setSelectedProject} devMode={devMode} />}
            {activeTab === 'crm' && <CrmView token={token} API_URL={API_URL} currentUser={currentUser} fetchAppGlobalData={fetchData} />}
            {activeTab === 'products' && <ProductsView 
            products={products} 
            currentUser={currentUser} 
            fetchAppGlobalData={fetchData}
            setIsNewBrandModalOpen={setIsNewBrandModalOpen} 
            setIsNewProductModalOpen={() => {
               setEditingProduct(null);
               setNewProductForm({ 
                   ean: '', sku: '', name: '', brandId: '', stock: 0, salePrice: 0, basePrice: 0, 
                   inboundTransportCost: 0, packagingCost: 0, bdoEprCost: 0, outboundTransportCost: 0, 
                   status: 'Aktywny', subiektId: '', baselinkerId: '',
                   weight: 0, length: 0, width: 0, height: 0, taxRate: 23,
                   images: [], videoUrl: '', descriptionHtml: '', features: {}, 
                   stockErpUnits: 0, stockWmsUnits: 0
               });
               setIsNewProductModalOpen(true);
            }}
            onEditProduct={(p) => {
               setEditingProduct(p.id);
               let calcBdo = parseFloat(p.bdoEprCost) || 0;
               if (p.bomElements && p.bomElements.length > 0) {
                   calcBdo = 0;
                   p.bomElements.forEach(b => { calcBdo += (parseFloat(b.weightGrams) / 1000) * parseFloat(b.material.ratePerKg); });
               }
               setNewProductForm({ ...p, bdoEprCost: parseFloat(calcBdo.toFixed(4)) });
               setBrandSearchTerm(p.brand ? p.brand.name : '');
               setIsNewProductModalOpen(true);
            }}
          />}
            {activeTab === 'chat' && renderChatInterface()}
            {activeTab === 'admin' && <AdminPanelView users={users} setIsNewUserModalOpen={setIsNewUserModalOpen} setEditingUser={setEditingUser} setIsUserEditModalOpen={setIsUserEditModalOpen} token={token} API_URL={API_URL} />}
        </main>
      </div>

      {renderModals()}
    </div>
  );
}

export default App;

