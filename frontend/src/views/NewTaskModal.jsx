import React, { useState } from 'react';
import axios from 'axios';
import { getInitials, getDepartmentColor } from '../utils';
import { 
  X, Zap, Calendar, Users, Building, Folder, Megaphone
} from 'lucide-react';

const NewTaskModal = ({
  isOpen,
  onClose,
  projects,
  campaigns,
  users,
  fetchData,
  token,
  API_URL
}) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'MEDIUM',
    projectId: '',
    campaignId: '',
    startDate: '',
    dueDate: '',
    assigneeIds: [],
    assignedGroups: []
  });

  const DEPARTMENTS = ["MARKETING", "BIURO", "MAGAZYN", "HANDLOWCY", "KAM", "ECOMMERCE", "SERWIS", "PREZES", "AGENCJA", "GOŚCIE"];

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/api/tasks`, formData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchData();
      onClose();
    } catch (err) {
      console.error("Create task ERROR:", err.response?.data || err.message);
      alert(err.response?.data?.error || "Wystąpił błąd podczas tworzenia zadania");
    }
  };

  const toggleAssignee = (id) => {
    const isSelected = formData.assigneeIds.includes(id);
    setFormData({
      ...formData,
      assigneeIds: isSelected 
        ? formData.assigneeIds.filter(userId => userId !== id)
        : [...formData.assigneeIds, id]
    });
  };

  const toggleGroup = (group) => {
    const isSelected = formData.assignedGroups.includes(group);
    setFormData({
      ...formData,
      assignedGroups: isSelected
        ? formData.assignedGroups.filter(g => g !== group)
        : [...formData.assignedGroups, group]
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[120] flex items-center justify-center p-6 animate-in fade-in duration-300">
      <div className="bg-white rounded-[3rem] shadow-[0_50px_100px_rgba(0,0,0,0.3)] w-full max-w-4xl overflow-hidden animate-in zoom-in duration-500 flex flex-col max-h-[95vh]">
        <div className="p-10 bg-[#f8fafc] border-b border-slate-100 flex justify-between items-center shrink-0">
          <div className="flex items-center">
            <div className="w-12 h-12 bg-indigo-600 rounded-sm flex items-center justify-center mr-6 shadow-xl shadow-indigo-600/30">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Inicjacja Zadania (Full Setup)</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Stwórz i natychmiastowo rozdysponuj etaty w zespole.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-4 hover:bg-white rounded-sm transition-all text-slate-400 border border-transparent hover:border-slate-100"><X className="w-6 h-6" /></button>
        </div>

        <form onSubmit={handleCreate} className="p-10 overflow-y-auto custom-scrollbar flex-1 flex flex-col space-y-10">
          
          <div className="space-y-8">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-800 ml-4 block mb-2">Tytuł Operacyjny *</label>
              <input required placeholder="Np. Uruchomienie przedsprzedaży..." className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all font-bold text-slate-700" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
            </div>
            
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-800 ml-4 block mb-2">Opis / Dyspozycja dla załogi</label>
              <textarea placeholder="Szczegóły operacyjne..." className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all font-bold text-slate-700 h-32 resize-none" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8 border-t border-slate-100">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-3 flex items-center"><Folder className="w-3 h-3 mr-2" /> Przypisz do Projektu</label>
              <select className="w-full p-4 bg-white border border-slate-200 rounded-sm outline-none font-bold text-sm text-slate-600 appearance-none" value={formData.projectId} onChange={e => setFormData({...formData, projectId: e.target.value, campaignId: ''})}>
                <option value="">Brak (Zadanie Generalne)</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-3 flex items-center"><Megaphone className="w-3 h-3 mr-2" /> Przypisz do Kampanii (Marketing)</label>
              <select className="w-full p-4 bg-white border border-slate-200 rounded-sm outline-none font-bold text-sm text-slate-600 appearance-none" value={formData.campaignId} onChange={e => setFormData({...formData, campaignId: e.target.value, projectId: ''})}>
                <option value="">Brak</option>
                {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-8 border-t border-slate-100">
             <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-3 flex items-center"><Zap className="w-3 h-3 mr-2 text-rose-500" /> Priorytet Wykonawczy</label>
                <select className="w-full p-4 bg-white border border-slate-200 rounded-sm outline-none font-black text-xs uppercase tracking-widest appearance-none" value={formData.priority} onChange={e => setFormData({...formData, priority: e.target.value})}>
                  <option value="LOW">LOW - Poboczne</option>
                  <option value="MEDIUM">MEDIUM - Standard</option>
                  <option value="HIGH" className="text-rose-600">HIGH - Wysoki</option>
                  <option value="URGENT" className="text-red-600 bg-red-50">URGENT - PILNE!</option>
                </select>
             </div>
             <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-3 flex items-center"><Calendar className="w-3 h-3 mr-2" /> Data Startu</label>
                <input type="date" className="w-full p-4 bg-white border border-slate-200 rounded-sm outline-none font-bold text-sm text-slate-600" value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} />
             </div>
             <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-3 flex items-center"><Calendar className="w-3 h-3 mr-2" /> Termin Realizacji (Deadline)</label>
                <input type="date" className="w-full p-4 bg-rose-50 border border-rose-200 rounded-sm outline-none font-bold text-sm text-rose-600" value={formData.dueDate} onChange={e => setFormData({...formData, dueDate: e.target.value})} />
             </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8 border-t border-slate-100">
             <div>
               <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-3 flex items-center"><Building className="w-3 h-3 mr-2" /> Przydzielone Departamenty</label>
               <div className="flex flex-wrap gap-2">
                 {DEPARTMENTS.map(d => (
                    <div 
                      key={d} 
                      onClick={() => toggleGroup(d)}
                      className={`px-3 py-2 border rounded-sm cursor-pointer text-[9px] font-black uppercase tracking-widest transition-all ${formData.assignedGroups.includes(d) ? 'bg-indigo-600 text-white border-indigo-600 shadow-md transform scale-105' : 'bg-white text-slate-500 hover:border-indigo-300'}`}
                    >
                       {d}
                    </div>
                 ))}
               </div>
             </div>
             
             <div>
               <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-3 flex items-center"><Users className="w-3 h-3 mr-2" /> Celowane Kadry (Operatorzy)</label>
               <div className="max-h-48 overflow-y-auto custom-scrollbar bg-slate-50 rounded-sm p-4 border border-slate-100 space-y-2">
                 {users.map(u => (
                    <div 
                      key={u.id} 
                      onClick={() => toggleAssignee(u.id)}
                      className={`flex items-center p-3 rounded-sm cursor-pointer transition-colors border ${formData.assigneeIds.includes(u.id) ? 'bg-white border-indigo-200 shadow-sm' : 'border-transparent hover:bg-slate-100'}`}
                    >
                      <div className={`w-8 h-8 rounded-sm flex flex-shrink-0 items-center justify-center text-[10px] font-black mr-4 ${formData.assigneeIds.includes(u.id) ? 'bg-indigo-600 text-white shadow-inner' : getDepartmentColor(u.department)}`}>
                        {getInitials(u.name)}
                      </div>
                      <div className="flex flex-col flex-1">
                         <span className={`text-[11px] font-black uppercase tracking-tight ${formData.assigneeIds.includes(u.id) ? 'text-indigo-900' : 'text-slate-700'}`}>{u.name}</span>
                         <span className="text-[9px] font-bold text-slate-400">{u.department}</span>
                      </div>
                      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${formData.assigneeIds.includes(u.id) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>
                         {formData.assigneeIds.includes(u.id) && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
                      </div>
                    </div>
                 ))}
               </div>
             </div>
          </div>
          
          <div className="pt-6 shrink-0 mt-auto">
             <button type="submit" className="w-full py-6 bg-slate-900 text-white font-black rounded-sm shadow-2xl hover:bg-indigo-600 hover:scale-[1.01] active:scale-[0.98] transition-all uppercase tracking-[0.3em] text-[11px]">Zatwierdź i Utwórz (Dispatch)</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewTaskModal;
