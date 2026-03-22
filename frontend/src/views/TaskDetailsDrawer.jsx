import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { getInitials, getDepartmentColor } from '../utils';
import UniversalChat from '../components/UniversalChat';
import { 
  X, Folder, Users, AlertOctagon, CheckCircle2, Clock, Calendar, 
  ShieldAlert, Zap, PlayCircle, StopCircle, CornerDownRight, Plus, 
  Building, UserCheck, Trash2, Archive, Loader2
} from 'lucide-react';

const TaskDetailsDrawer = ({
  task,
  onClose,
  currentUser,
  users,
  tasks,
  socket,
  fetchData,
  token,
  API_URL,
  onSelectTask
}) => {
  const currentTask = tasks.find(t => t.id === task.id) || task;
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [attachments, setAttachments] = useState([]);
  
  useEffect(() => {
    axios.get(`${API_URL}/api/chat/task/${currentTask.id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setAttachments(res.data.filter(c => c.fileUrl)))
      .catch(err => console.error(err));
  }, [currentTask.id, API_URL, token]);
  
  const [isEditingBlocked, setIsEditingBlocked] = useState(false);
  const [blockReason, setBlockReason] = useState(currentTask.blockReason || '');
  const [blockerId, setBlockerId] = useState(currentTask.blockerId || '');

  const [isAddingSubtask, setIsAddingSubtask] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  const [isEditingAssignees, setIsEditingAssignees] = useState(false);
  const [isEditingGroups, setIsEditingGroups] = useState(false);
  
  const [isEditingDates, setIsEditingDates] = useState(false);
  const [startDate, setStartDate] = useState(currentTask.startDate ? currentTask.startDate.split('T')[0] : '');
  const [dueDate, setDueDate] = useState(currentTask.dueDate ? currentTask.dueDate.split('T')[0] : '');

  const handleStatusChange = async (newStatus) => {
    try {
      if (newStatus === 'REVIEW' && currentTask.status !== 'REVIEW') {
           if (!window.confirm("Zadanie zgłoszone do prezesa. Jego edycja zostanie zablokowana do czasu decyzji zwrotnej. Kontynuować?")) return;
      }
      await axios.patch(`${API_URL}/api/tasks/${currentTask.id}/status`, { status: newStatus }, { headers: { Authorization: `Bearer ${token}` } });
      fetchData();
    } catch (err) { console.error(err); }
  };

  const handlePriorityChange = async (newPriority) => {
    try {
      await axios.patch(`${API_URL}/api/tasks/${currentTask.id}`, { priority: newPriority }, { headers: { Authorization: `Bearer ${token}` } });
      fetchData();
    } catch (err) { console.error(err); }
  };

  const handleBlockTask = async () => {
    try {
      if (!isEditingBlocked) { setIsEditingBlocked(true); return; }
      if (!blockReason && !blockerId) return alert('Wymagany powód lub osoba.');
      await axios.patch(`${API_URL}/api/tasks/${currentTask.id}/block`, { isBlocked: true, blockReason, blockerId }, { headers: { Authorization: `Bearer ${token}` } });
      setIsEditingBlocked(false);
      fetchData();
    } catch (err) { console.error(err); }
  };

  const handleUnblockTask = async () => {
    try {
      await axios.patch(`${API_URL}/api/tasks/${currentTask.id}/block`, { isBlocked: false }, { headers: { Authorization: `Bearer ${token}` } });
      fetchData();
    } catch (err) { console.error(err); }
  };

  const toggleWork = async (isWorking) => {
    try {
      await axios.patch(`${API_URL}/api/tasks/${currentTask.id}/work`, { isWorking }, { headers: { Authorization: `Bearer ${token}` } });
      fetchData();
    } catch (err) { console.error(err); }
  };

  const addSubtask = async () => {
    if (!newSubtaskTitle.trim()) return;
    try {
      await axios.post(`${API_URL}/api/tasks`, {
        title: newSubtaskTitle, priority: 'MEDIUM', parentTaskId: currentTask.id,
        projectId: currentTask.projectId, campaignId: currentTask.campaignId
      }, { headers: { Authorization: `Bearer ${token}` } });
      setNewSubtaskTitle('');
      setIsAddingSubtask(false);
      fetchData();
    } catch (err) { console.error(err); }
  };

  const saveDates = async () => {
    try {
      await axios.patch(`${API_URL}/api/tasks/${currentTask.id}`, { startDate, dueDate }, { headers: { Authorization: `Bearer ${token}` } });
      setIsEditingDates(false);
      fetchData();
    } catch (err) { console.error(err); }
  };

  const toggleAssignee = async (userId) => {
    const currentAssigneeIds = currentTask.assignees.map(a => a.id);
    const newIds = currentAssigneeIds.includes(userId) ? currentAssigneeIds.filter(id => id !== userId) : [...currentAssigneeIds, userId];
    try {
      await axios.patch(`${API_URL}/api/tasks/${currentTask.id}`, { assigneeIds: newIds }, { headers: { Authorization: `Bearer ${token}` } });
      fetchData();
    } catch (err) { console.error(err); }
  };

  const toggleGroup = async (groupName) => {
    const currentGroups = currentTask.assignedGroups || [];
    const newGroups = currentGroups.includes(groupName) ? currentGroups.filter(g => g !== groupName) : [...currentGroups, groupName];
    try {
      await axios.patch(`${API_URL}/api/tasks/${currentTask.id}`, { assignedGroups: newGroups }, { headers: { Authorization: `Bearer ${token}` } });
      fetchData();
    } catch (err) { console.error(err); }
  };

  const amIWorking = currentTask.activeWorkers?.some(w => w.id === currentUser.id);
  const DEPARTMENTS = ["MARKETING", "BIURO", "MAGAZYN", "HANDLOWCY", "KAM", "ECOMMERCE", "SERWIS", "PREZES", "AGENCJA", "GOŚCIE"];
  const handleArchive = async () => {
    if(!window.confirm("Zarchiwizować to zlecenie operacyjne? Zniknie ono z Tablicy Kanban, ale będzie dostępne w Archiwum w Panelu Administratora.")) return;
    setIsProcessing(true);
    try {
      await axios.patch(`${API_URL}/api/tasks/${currentTask.id}/archive`, {}, { headers: { Authorization: `Bearer ${token}` } });
      fetchData(); onClose();
    } catch (err) { console.error(err); setIsProcessing(false); }
  };

  const handleHardDelete = async () => {
    if(!window.confirm("BARDZO WAŻNE! Czy na pewno całkowicie wymazać z Bazy to zgłoszenie operacyjne wraz ze wszystkimi załącznikami i historią wpisów? Wykonany zostanie Hard-Delete (TRWAŁE).")) return;
    setIsProcessing(true);
    try {
      await axios.delete(`${API_URL}/api/tasks/${currentTask.id}`, { headers: { Authorization: `Bearer ${token}` } });
      fetchData(); onClose();
    } catch (err) { console.error(err); setIsProcessing(false); }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xl z-[110] flex items-center justify-center p-8 animate-in fade-in duration-300">
      <div className="w-full max-w-[1400px] bg-white h-full max-h-[85vh] rounded-sm shadow-[0_30px_100px_rgba(0,0,0,0.4)] flex flex-col animate-in zoom-in duration-500 overflow-hidden relative min-h-0">
        
        {/* Top Bar */}
        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-[#f8fafc] shrink-0">
          <div className="flex items-center space-x-4 flex-wrap">
            <span className="text-xs font-black text-slate-400 font-mono tracking-widest">{currentTask.taskId}</span>
            
            {/* STATUS SELECTOR */}
            <select 
              value={currentTask.status} 
              onChange={(e) => handleStatusChange(e.target.value)}
              className={`px-5 py-2 rounded-sm text-[10px] font-black uppercase tracking-[0.2em] shadow-sm outline-none cursor-pointer border hover:scale-105 transition-transform appearance-none ${currentTask.status === 'DONE' ? 'bg-slate-900 text-white border-slate-900' : currentTask.status === 'REVIEW' ? 'bg-amber-100 text-amber-700 border-amber-200' : currentTask.status === 'IN_PROGRESS' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-200'}`}>
              <option value="TODO">🆕 Nowe (W Kolejce)</option>
              <option value="IN_PROGRESS">🚀 W realizacji</option>
              <option value="REVIEW">👑 Weryfikacja (Prezes)</option>
              <option value="DONE">✅ Zamknięte</option>
            </select>

            {/* PRIORITY SELECTOR */}
            <select 
              value={currentTask.priority} 
              onChange={(e) => handlePriorityChange(e.target.value)}
              className={`px-5 py-2 rounded-sm text-[10px] font-black uppercase tracking-[0.2em] shadow-sm outline-none cursor-pointer border hover:scale-105 transition-transform appearance-none ${currentTask.priority === 'URGENT' ? 'bg-red-600 text-white border-red-600 animate-pulse' : currentTask.priority === 'HIGH' ? 'bg-red-50 text-red-600 border-red-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
              <option value="LOW">Niski Priorytet</option>
              <option value="MEDIUM">Normalny</option>
              <option value="HIGH">Wysoki</option>
              <option value="URGENT">⚠️ Pilne (ASAP)</option>
            </select>

            {/* BLOCK BUTTON */}
            {currentTask.isBlocked ? (
               <button onClick={handleUnblockTask} className="px-5 py-2 rounded-sm text-[10px] font-black uppercase tracking-widest bg-rose-500 text-white flex items-center shadow-lg shadow-rose-500/30 hover:bg-rose-600 transition-all"><X className="w-3 h-3 mr-2" /> Odblokuj</button>
            ) : (
               <button onClick={handleBlockTask} className="px-5 py-2 rounded-sm text-[10px] font-black uppercase tracking-widest bg-white border border-rose-200 text-rose-500 flex items-center shadow-sm hover:bg-rose-50 transition-all"><AlertOctagon className="w-3 h-3 mr-2" /> Zatrzymaj / Blokada</button>
            )}

            {/* START WORK BUTTON */}
            {amIWorking ? (
              <button onClick={() => toggleWork(false)} className="px-5 py-2 rounded-sm text-[10px] font-black uppercase tracking-widest bg-amber-500 text-white flex items-center shadow-lg shadow-amber-500/30 hover:scale-105 transition-all animate-pulse"><StopCircle className="w-4 h-4 mr-2" /> Przerwij Pracę</button>
            ) : (
              <button onClick={() => toggleWork(true)} className="px-5 py-2 rounded-sm text-[10px] font-black uppercase tracking-widest bg-indigo-600 text-white flex items-center shadow-lg hover:scale-105 transition-all"><PlayCircle className="w-4 h-4 mr-2" /> Rozpocznij Pracę</button>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <button onClick={handleArchive} disabled={isProcessing} className="p-4 bg-white border border-slate-100 hover:border-indigo-300 hover:text-indigo-600 rounded-[1.5rem] transition-all text-slate-400 shadow-sm disabled:opacity-50" title="Archiwizuj Zlecenie">
               <Archive className="w-6 h-6" />
            </button>
            <button onClick={handleHardDelete} disabled={isProcessing} className="p-4 bg-white border border-slate-100 hover:border-rose-300 hover:text-rose-600 rounded-[1.5rem] transition-all text-slate-400 shadow-sm disabled:opacity-50" title="Trwale Usuń (Kosz)">
               <Trash2 className="w-6 h-6" />
            </button>
            <div className="w-2"></div>
            <button onClick={onClose} disabled={isProcessing} className="p-4 hover:bg-slate-900 hover:text-white bg-white border border-slate-100 rounded-[1.5rem] transition-all text-slate-400 shadow-sm disabled:opacity-50" title="Zamknij Szufladę">
               <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row divide-x divide-slate-200">
          
          {/* Kolumna 1 (W ŚRODKU, L:40%): Informacje Podstawowe i Subtaski */}
          <div className="w-full lg:w-[40%] order-2 lg:order-2 overflow-y-auto custom-scrollbar p-8 space-y-8 bg-blue-50/50 min-w-0 shadow-inner">
              
              {isEditingBlocked && (
                <div className="bg-rose-50 p-6 rounded-[2rem] border border-rose-200 space-y-4 animate-in slide-in-from-top-4">
                   <h4 className="text-sm font-black text-rose-800 uppercase tracking-widest flex items-center"><AlertOctagon className="w-4 h-4 mr-2" /> Formularz Zatrzymania</h4>
                   <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-black text-rose-600 uppercase mb-2 block">Czekamy na stanowisko / osobę:</label>
                        <select className="w-full p-4 rounded-sm border border-rose-200 bg-white text-sm font-bold outline-none" value={blockerId} onChange={e => setBlockerId(e.target.value)}>
                           <option value="">-- Wszyscy / Nikogo w szczególności --</option>
                           {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.department})</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-black text-rose-600 uppercase mb-2 block">Opis problemu / Czego brakuje?</label>
                        <input type="text" className="w-full p-4 rounded-sm border border-rose-200 bg-white text-sm font-bold outline-none placeholder:text-rose-200" placeholder="np. Brak akceptacji kosztorysu..." value={blockReason} onChange={e => setBlockReason(e.target.value)} />
                      </div>
                   </div>
                   <div className="flex justify-end space-x-2">
                      <button onClick={() => setIsEditingBlocked(false)} className="px-4 py-2 text-rose-500 font-bold text-xs uppercase tracking-widest">Anuluj</button>
                      <button onClick={handleBlockTask} className="px-6 py-2 bg-rose-500 text-white rounded-sm font-bold text-xs uppercase tracking-widest shadow-lg shadow-rose-500/20">Zatwierdź Blokadę</button>
                   </div>
                </div>
              )}

              {currentTask.isBlocked && !isEditingBlocked && (
                <div className="bg-rose-50 border border-rose-100 rounded-[2.5rem] p-8 flex items-start space-x-6 shadow-xl shadow-rose-500/5">
                  <div className="p-4 bg-rose-500 rounded-sm text-white shadow-lg animate-pulse shrink-0"><ShieldAlert className="w-6 h-6" /></div>
                  <div>
                    <h4 className="text-[11px] font-black text-rose-900 uppercase tracking-[0.2em] mb-2 flex items-center">
                      Procedura Wstrzymana
                      {currentTask.blocker && <span className="ml-3 bg-white text-rose-600 px-3 py-1 rounded-sm border border-rose-100 flex items-center"><UserCheck className="w-3 h-3 mr-2" /> Wąskie Gardło: {currentTask.blocker.name}</span>}
                    </h4>
                    <p className="text-rose-600 text-sm font-bold leading-relaxed">{currentTask.blockReason || 'Brak definicji powodu.'}</p>
                  </div>
                </div>
              )}

             <div>
               {currentTask.parentTask && (
                 <div onClick={() => onSelectTask(currentTask.parentTask)} className="mb-4 inline-flex items-center px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-sm text-[10px] font-black uppercase tracking-widest border border-indigo-100/50 shadow-sm cursor-pointer transition-colors active:scale-95">
                    <CornerDownRight className="w-3 h-3 mr-2 rotate-180" /> Zadanie Nadrzędne: {currentTask.parentTask.title}
                 </div>
               )}
               <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-tight mb-4">{currentTask.title}</h2>
               <p className="text-slate-500 font-bold leading-relaxed text-sm italic opacity-80 border-l-4 border-indigo-100 pl-6">{currentTask.description || 'Brak opisu operacyjnego.'}</p>
               <div className="mt-4 flex items-center text-[10px] font-black uppercase text-slate-400 tracking-widest">
                  <UserCheck className="w-3 h-3 mr-2" /> Wdrożone przez: {currentTask.creator?.name || 'Automatyzacja Nexus'}
               </div>
             </div>

             {/* Subtasks Section */}
             <div className="bg-slate-50 p-6 rounded-sm border border-slate-200">
                <div className="flex items-center justify-between mb-5">
                   <h4 className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-3 py-2 rounded-sm uppercase tracking-widest flex items-center border border-indigo-100"><CornerDownRight className="w-3.5 h-3.5 mr-2" /> Lista Check-In (Zadania Zależne)</h4>
                   {!isAddingSubtask && (
                     <button onClick={() => setIsAddingSubtask(true)} className="text-[9px] font-black text-indigo-600 hover:text-indigo-800 uppercase tracking-widest flex items-center"><Plus className="w-3 h-3 mr-1" /> Dodaj Węzeł</button>
                   )}
                </div>
                {isAddingSubtask && (
                  <div className="flex items-center space-x-3 mb-6">
                    <input autoFocus className="flex-1 p-3 bg-white border border-slate-200 rounded-sm outline-none focus:border-indigo-500 text-xs font-bold" placeholder="Tytuł pod-zadania..." value={newSubtaskTitle} onChange={e => setNewSubtaskTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && addSubtask()} />
                    <button onClick={addSubtask} className="px-4 py-3 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-sm">Dodaj</button>
                    <button onClick={() => setIsAddingSubtask(false)} className="p-3 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                  </div>
                )}
                <div className="space-y-3">
                   {currentTask.subTasks?.map(st => (
                     <div key={st.id} onClick={() => onSelectTask(st)} className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-sm shadow-sm hover:border-indigo-200 transition-all cursor-pointer group active:scale-[0.98]">
                        <div className="flex items-center">
                          <div className={`w-2 h-2 rounded-full mr-4 shadow-sm ${st.status === 'DONE' ? 'bg-emerald-500' : st.isBlocked ? 'bg-rose-500' : 'bg-amber-400 group-hover:animate-pulse'}`}></div>
                          <span className={`text-xs font-black uppercase tracking-tight group-hover:text-indigo-600 transition-colors ${st.status === 'DONE' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{st.title}</span>
                        </div>
                        <span className="text-[9px] font-bold text-slate-400 font-mono group-hover:text-indigo-400">{st.taskId}</span>
                     </div>
                   ))}
                   {(!currentTask.subTasks || currentTask.subTasks.length === 0) && !isAddingSubtask && <div className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Brak zadań zagnieżdżonych.</div>}
                </div>
             </div>

          </div>

          {/* Kolumna 2: Right Sidebar Details (Middle now) */}
          <div className="w-full lg:w-[25%] order-2 lg:order-1 bg-white p-6 space-y-6 shrink-0 overflow-y-auto custom-scrollbar">

             {/* Pliki Zamieszczone w Zleceniu */}
             <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200/50 pb-2">
                  <h4 className="text-[9px] font-black text-blue-600 bg-blue-50 px-3 py-2 rounded-sm uppercase tracking-widest flex items-center border border-blue-100 shadow-sm"><Folder className="w-3 h-3 mr-2" /> Załączniki</h4>
                  <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-sm">{attachments.length}</span>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                  {attachments.map(a => (
                     <a key={a.id} href={a.fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center p-3 bg-white border border-slate-100 rounded-sm hover:border-indigo-300 hover:shadow-md transition-all group cursor-pointer">
                        <div className="w-8 h-8 rounded-sm bg-indigo-50 text-indigo-600 flex items-center justify-center mr-3 group-hover:scale-110 transition-transform flex-shrink-0"><Folder className="w-4 h-4" /></div>
                        <div className="flex-1 min-w-0">
                           <p className="text-[9px] font-black text-slate-700 uppercase tracking-tight truncate">{a.fileName || 'Plik Zlecenia'}</p>
                           <p className="text-[8px] font-bold text-slate-400">{new Date(a.createdAt).toLocaleDateString()}</p>
                        </div>
                     </a>
                  ))}
                  {attachments.length === 0 && (
                    <div className="px-4 py-6 border-2 border-dashed border-slate-200 rounded-sm flex flex-col items-center justify-center text-center opacity-60">
                      <Folder className="w-6 h-6 text-slate-400 mb-2" />
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-relaxed">Brak plików.<br/>Wrzuć w sekcji Czat na dole.</span>
                    </div>
                  )}
                </div>
             </div>
             
             {/* Aktywni Złodzieje Czasu (Kto nad tym pracuje) */}
             {currentTask.activeWorkers?.length > 0 && (
                <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-sm shadow-sm">
                  <h4 className="text-[9px] font-black text-emerald-700 uppercase tracking-widest mb-3 flex items-center"><Zap className="w-3 h-3 mr-2 animate-pulse" /> Live: Tracker Czasu</h4>
                  <div className="flex flex-wrap gap-2">
                    {currentTask.activeWorkers.map(w => (
                       <div key={w.id} className={`px-3 py-1.5 rounded-sm ${getDepartmentColor(a.department)} flex items-center text-[9px] font-black tracking-widest animate-in zoom-in`}>
                          <div className="w-1.5 h-1.5 bg-white rounded-full mr-2 animate-ping"></div> {w.name.split(' ')[0]}
                       </div>
                    ))}
                  </div>
                </div>
             )}

             {/* Dates */}
             <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-[9px] font-black text-orange-600 bg-orange-50 px-3 py-2 rounded-sm uppercase tracking-widest flex items-center border border-orange-100 shadow-sm"><Calendar className="w-3 h-3 mr-2" /> Ramy Czasowe</h4>
                  {!isEditingDates ? (
                    <button onClick={() => setIsEditingDates(true)} className="text-[9px] text-indigo-600 font-black uppercase">Edytuj</button>
                  ) : (
                    <button onClick={saveDates} className="text-[9px] text-emerald-600 font-black uppercase">Zapisz</button>
                  )}
                </div>
                {isEditingDates ? (
                  <div className="space-y-3 p-4 bg-white border border-slate-200 rounded-sm shadow-sm">
                    <div><label className="text-[8px] font-black uppercase tracking-widest text-slate-400 block mb-1">Start</label><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full text-xs font-bold bg-slate-50 p-2 rounded outline-none" /></div>
                    <div><label className="text-[8px] font-black uppercase tracking-widest text-slate-400 block mb-1">Koniec (Deadline)</label><input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="w-full text-xs font-bold bg-slate-50 p-2 rounded outline-none" /></div>
                  </div>
                ) : (
                  <div className="flex flex-col space-y-2">
                    <div className="flex items-center justify-between p-3 bg-white rounded-sm border border-slate-100">
                      <span className="text-[9px] font-black text-slate-400 uppercase">Start</span>
                      <span className="text-[10px] font-bold text-slate-700">{currentTask.startDate ? new Date(currentTask.startDate).toLocaleDateString() : 'Brak'}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-rose-50 rounded-sm border border-rose-100/50">
                      <span className="text-[9px] font-black text-rose-400 uppercase">Koniec</span>
                      <span className="text-[10px] font-black text-rose-600">{currentTask.dueDate ? new Date(currentTask.dueDate).toLocaleDateString() : 'Brak terminu'}</span>
                    </div>
                  </div>
                )}
             </div>

             {/* Grupy / Departamenty */}
             <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-[9px] font-black text-fuchsia-600 bg-fuchsia-50 px-3 py-2 rounded-sm uppercase tracking-widest flex items-center border border-fuchsia-100 shadow-sm"><Building className="w-3 h-3 mr-2" /> Departamenty</h4>
                  <button onClick={() => setIsEditingGroups(!isEditingGroups)} className="text-[9px] text-indigo-600 font-black uppercase">{isEditingGroups ? 'Gotowe' : 'Zarządzaj'}</button>
                </div>
                <div className="flex flex-wrap gap-2">
                   {currentTask.assignedGroups?.map(g => (
                      <div key={g} className="px-3 py-1.5 bg-slate-900 text-white rounded-sm text-[9px] font-black uppercase tracking-widest shadow-md flex items-center">
                        {g} {isEditingGroups && <X onClick={() => toggleGroup(g)} className="w-3 h-3 ml-2 cursor-pointer hover:text-rose-400" />}
                      </div>
                   ))}
                   {(!currentTask.assignedGroups || currentTask.assignedGroups.length === 0) && !isEditingGroups && <div className="text-[10px] text-slate-300 font-black uppercase pb-2">Brak przydzielonych grup</div>}
                </div>
                {isEditingGroups && (
                  <div className="p-4 bg-slate-100 rounded-sm flex flex-wrap gap-2">
                     {DEPARTMENTS.map(d => (
                        <button key={d} onClick={() => toggleGroup(d)} className={`px-2 py-1 text-[8px] font-black uppercase tracking-widest rounded border ${currentTask.assignedGroups?.includes(d) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'}`}>{d}</button>
                     ))}
                  </div>
                )}
             </div>

             {/* Operatorzy Indywidualni */}
             <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-[9px] font-black text-teal-600 bg-teal-50 px-3 py-2 rounded-sm uppercase tracking-widest flex items-center border border-teal-100 shadow-sm"><Users className="w-3 h-3 mr-2" /> Operatorzy</h4>
                  <button onClick={() => setIsEditingAssignees(!isEditingAssignees)} className="text-[9px] text-indigo-600 font-black uppercase">{isEditingAssignees ? 'Gotowe' : 'Zarządzaj'}</button>
                </div>
                <div className="space-y-2">
                  {currentTask.assignees?.map(a => (
                    <div key={a.id} className="flex items-center justify-between bg-white px-4 py-2 rounded-sm border border-slate-100 shadow-sm">
                      <div className="flex items-center">
                         <div className={`w-6 h-6 rounded-sm ${getDepartmentColor(a.department)} flex items-center justify-center text-[7px] font-black mr-3`}>{getInitials(a.name)}</div>
                         <span className="text-[10px] font-black text-slate-800 uppercase tracking-tight">{a.name}</span>
                      </div>
                      {isEditingAssignees && <button onClick={() => toggleAssignee(a.id)} className="text-rose-500 hover:text-rose-700"><X className="w-4 h-4" /></button>}
                    </div>
                  ))}
                  {(!currentTask.assignees || currentTask.assignees.length === 0) && !isEditingAssignees && <div className="text-[10px] font-black text-slate-300 uppercase py-2">Brak przypisanych osiob.</div>}
                </div>
                
                {isEditingAssignees && (
                  <div className="p-4 bg-white border border-indigo-100 rounded-sm max-h-48 overflow-y-auto custom-scrollbar space-y-2">
                     {users.map(u => (
                        <div key={u.id} onClick={() => toggleAssignee(u.id)} className={`flex items-center p-2 rounded-sm cursor-pointer text-[9px] font-black uppercase transition-colors ${currentTask.assignees?.some(a => a.id === u.id) ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-50'}`}>
                           <UserCheck className={`w-3 h-3 mr-2 ${currentTask.assignees?.some(a => a.id === u.id) ? 'opacity-100' : 'opacity-0'}`} /> {u.name}
                        </div>
                     ))}
                  </div>
                )}
             </div>

          </div>

          {/* Kolumna 3: Czat przymocowany na prawej flance (max 25%) */}
          <div className="w-full lg:w-[35%] order-3 lg:order-3 min-w-[320px] bg-emerald-50/80 flex flex-col p-4 shrink-0 border-l border-emerald-100">
             <div className="flex-1 border-2 border-emerald-200 rounded-sm overflow-hidden flex flex-col bg-emerald-50/50 shadow-sm ring-4 ring-emerald-500/10">
                <UniversalChat mode="task" targetId={currentTask.id} currentUser={currentUser} socket={socket} title="Wątek Techniczny Zlecenia" subtitle={`Task ID: ${currentTask.taskId}`} />
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskDetailsDrawer;
