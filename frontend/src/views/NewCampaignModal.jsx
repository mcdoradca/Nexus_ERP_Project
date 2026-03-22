import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X, Megaphone, Calendar, DollarSign, Target, AlignLeft, Users, Palette, Check, Folder } from 'lucide-react';

const COLORS = [
  { id: 'bg-blue-500', label: 'Niebieski' },
  { id: 'bg-emerald-500', label: 'Szmaragd' },
  { id: 'bg-pink-500', label: 'Różowy' },
  { id: 'bg-purple-500', label: 'Fiolet' },
  { id: 'bg-orange-500', label: 'Pomarańcz' },
  { id: 'bg-slate-800', label: 'Czarny' }
];

const DEPARTMENTS = ['MARKETING', 'BIURO', 'MAGAZYN', 'HANDLOWCY', 'KAM', 'PREZES', 'ECOMMERCE', 'SERWIS', 'AGENCJE'];

const NewCampaignModal = ({
  isOpen,
  onClose,
  brands,
  products,
  users = [],
  fetchData,
  token,
  API_URL,
  initialData = null
}) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    startDate: '',
    endDate: '',
    budget: '',
    budgetMedia: '',
    budgetPOSM: '',
    budgetAgency: '',
    brandId: '',
    productId: '',
    plannedCount: '',
    instructions: '',
    color: 'bg-blue-500',
    assignees: [],
    assignedGroups: []
  });

  useEffect(() => {
    if (initialData && isOpen) {
      setFormData({
        name: initialData.name || '',
        description: initialData.description || '',
        startDate: initialData.startDate ? new Date(initialData.startDate).toISOString().split('T')[0] : '',
        endDate: initialData.endDate ? new Date(initialData.endDate).toISOString().split('T')[0] : '',
        budget: initialData.budget || '',
        budgetMedia: initialData.budgetMedia || '',
        budgetPOSM: initialData.budgetPOSM || '',
        budgetAgency: initialData.budgetAgency || '',
        brandId: initialData.brandId || '',
        productId: initialData.productId || '',
        plannedCount: initialData.plannedCount || '',
        instructions: initialData.instructions || '',
        color: initialData.color || 'bg-blue-500',
        assignees: initialData.assignees ? initialData.assignees.map(a => a.id) : [],
        assignedGroups: initialData.assignedGroups || []
      });
    } else if (isOpen) {
      setFormData({
        name: '', description: '', startDate: '', endDate: '', budget: '', budgetMedia: '', budgetPOSM: '', budgetAgency: '', brandId: '', productId: '', plannedCount: '', instructions: '', color: 'bg-blue-500', assignees: [], assignedGroups: []
      });
    }
  }, [initialData, isOpen]);

  const handleCreateOrUpdate = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...formData };
      
      // Explicit parsings for backend (Prisma)
      if (payload.budget) payload.budget = parseFloat(payload.budget) || 0;
      if (payload.budgetMedia) payload.budgetMedia = parseFloat(payload.budgetMedia) || 0;
      if (payload.budgetPOSM) payload.budgetPOSM = parseFloat(payload.budgetPOSM) || 0;
      if (payload.budgetAgency) payload.budgetAgency = parseFloat(payload.budgetAgency) || 0;
      if (payload.plannedCount) payload.plannedCount = parseInt(payload.plannedCount) || 0;
      
      // Prevent UUID errors for empty optional relational fields
      if (!payload.productId) delete payload.productId;

      const method = initialData ? 'patch' : 'post';
      const endpoint = initialData ? `${API_URL}/api/campaigns/${initialData.id}` : `${API_URL}/api/campaigns`;

      await axios[method](endpoint, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchData();
      onClose();
    } catch (err) {
      console.error("Create/Update campaign ERROR:", err.response?.data || err.message);
      alert(err.response?.data?.error || "Wystąpił błąd podczas zapisywania osi kampanii");
    }
  };

  const handleAssigneeToggle = (userId) => {
    setFormData(prev => ({
      ...prev,
      assignees: prev.assignees.includes(userId) 
        ? prev.assignees.filter(id => id !== userId)
        : [...prev.assignees, userId]
    }));
  };

  const handleGroupToggle = (dept) => {
    setFormData(prev => ({
      ...prev,
      assignedGroups: prev.assignedGroups.includes(dept)
        ? prev.assignedGroups.filter(g => g !== dept)
        : [...prev.assignedGroups, dept]
    }));
  };

  if (!isOpen) return null;

  const inputClass = "w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-sm text-[11px] font-black text-slate-800 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none";
  const labelClass = "text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 block flex items-center";

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[120] flex items-center justify-center p-6 animate-in fade-in duration-300">
      <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-5xl overflow-hidden animate-in zoom-in duration-500 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-10 border-b border-slate-100 flex justify-between items-center bg-[#f8fafc] shrink-0">
           <div className="flex items-center">
              <div className={`w-12 h-12 ${formData.color.replace('bg-', 'bg-').split(' ')[0]} rounded-sm flex items-center justify-center mr-6 shadow-xl transition-colors`}>
                 <Megaphone className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">
                  {initialData ? 'Edycja Osi Kampanii' : 'Inicjacja Osi Kampanii'}
                </h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Zdefiniuj Ramy Czasowe i Budżet Projektu</p>
              </div>
           </div>
           <button onClick={onClose} className="p-4 hover:bg-white rounded-sm transition-all text-slate-400"><X className="w-6 h-6" /></button>
        </div>

        {/* Body */}
        <form onSubmit={handleCreateOrUpdate} className="p-10 space-y-8 overflow-y-auto custom-scrollbar flex-1">
          
          <div className="grid grid-cols-2 gap-8">
            <div className="col-span-2">
              <label className={labelClass}>Nazwa Wyświetlana Kampanii</label>
              <input required placeholder="np. Złota Wyprzedaż Hebe 2026..." className={inputClass} value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
            </div>

            {/* Kolory */}
            <div className="col-span-2">
              <label className={labelClass}><Palette className="w-3 h-3 mr-2" /> Kolor Identyfikacyjny Osi</label>
              <div className="flex flex-wrap gap-3">
                {COLORS.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setFormData({ ...formData, color: c.id })}
                    className={`h-10 px-4 rounded-sm flex items-center shadow-sm transition-all ${c.id} ${
                      formData.color === c.id ? 'ring-2 ring-offset-2 ring-slate-800 scale-105' : 'opacity-70 hover:opacity-100'
                    }`}
                  >
                    <span className="text-[10px] font-black text-white uppercase tracking-wider">{c.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* PIM Selection */}
            <div className="space-y-6">
              <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] border-b border-slate-100 pb-2 mb-4"><Target className="w-3 h-3 inline mr-2"/>Asortyment PIM</h4>
              <div>
                <label className={labelClass}>Podmiot / Marka</label>
                <select required className={inputClass} value={formData.brandId} onChange={e => setFormData({...formData, brandId: e.target.value})}>
                  <option value="" disabled>Wybierz Markę / Firmę</option>
                  {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Promowany SKU (Opcjonalnie)</label>
                <select className={inputClass} value={formData.productId} onChange={e => setFormData({...formData, productId: e.target.value})}>
                  <option value="">Wiele produktów (Ogólna)</option>
                  {formData.brandId && products.filter(p => p.brandId === formData.brandId).map(p => (
                    <option key={p.id} value={p.id}>[{p.sku}] {p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Szacowany Wolumen (Sztuki)</label>
                <input type="number" placeholder="np. 5000" className={inputClass} value={formData.plannedCount} onChange={e => setFormData({...formData, plannedCount: e.target.value})} />
              </div>
            </div>

            {/* Dates & Budgets */}
            <div className="space-y-6">
              <h4 className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] border-b border-slate-100 pb-2 mb-4"><Calendar className="w-3 h-3 inline mr-2"/>Czas & Kapitał</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Data Startu</label>
                  <input required type="date" className={inputClass} value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} />
                </div>
                <div>
                  <label className={labelClass}>Data Końca</label>
                  <input required type="date" className={inputClass} value={formData.endDate} onChange={e => setFormData({...formData, endDate: e.target.value})} />
                </div>
              </div>
              <div>
                <label className={labelClass}>Budżet Całkowity (PLN)</label>
                <div className="relative">
                  <DollarSign className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input required type="number" step="0.01" placeholder="0.00" className={`${inputClass} pl-10`} value={formData.budget} onChange={e => setFormData({...formData, budget: e.target.value})} />
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-100 p-4 rounded-sm mt-4">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center">
                  Opcjonalny podział budżetu wg. kosztorysów (Wypelnia Zarząd):
                </p>
                <div className="grid grid-cols-3 gap-4">
                   <div>
                     <label className="text-[8px] font-black text-indigo-500 uppercase tracking-widest mb-1 flex items-center"><Target className="w-3 h-3 mr-1" /> Reklama Cyfrowa (Media)</label>
                     <input type="number" placeholder="0" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-sm text-[10px] font-black focus:border-indigo-400 outline-none reflection-input transition-all" value={formData.budgetMedia} onChange={e => setFormData({...formData, budgetMedia: e.target.value})} />
                   </div>
                   <div>
                     <label className="text-[8px] font-black text-emerald-500 uppercase tracking-widest mb-1 flex items-center"><Folder className="w-3 h-3 mr-1" /> Wydruki / Ekspozytory (POSM)</label>
                     <input type="number" placeholder="0" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-sm text-[10px] font-black focus:border-emerald-400 outline-none reflection-input transition-all" value={formData.budgetPOSM} onChange={e => setFormData({...formData, budgetPOSM: e.target.value})} />
                   </div>
                   <div>
                     <label className="text-[8px] font-black text-pink-500 uppercase tracking-widest mb-1 flex items-center"><Users className="w-3 h-3 mr-1" /> Prowizja i Koszty (Agencja)</label>
                     <input type="number" placeholder="0" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-sm text-[10px] font-black focus:border-pink-400 outline-none reflection-input transition-all" value={formData.budgetAgency} onChange={e => setFormData({...formData, budgetAgency: e.target.value})} />
                   </div>
                </div>
              </div>
            </div>

            {/* Asygnacje (Nowość Fazy 17) */}
            <div className="col-span-2 space-y-6">
               <h4 className="text-[10px] font-black text-purple-600 uppercase tracking-[0.2em] border-b border-slate-100 pb-2 mb-4"><Users className="w-3 h-3 inline mr-2"/> Przydziały (Kto realizuje)</h4>
               
               <div className="grid grid-cols-2 gap-8">
                  <div>
                    <label className={labelClass}>Departamenty i Grupy</label>
                    <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto custom-scrollbar p-2 bg-slate-50 border border-slate-200 rounded-sm">
                      {DEPARTMENTS.map(dept => (
                        <label key={dept} className={`flex items-center px-3 py-2 rounded-sm text-[10px] font-black cursor-pointer transition-colors ${formData.assignedGroups.includes(dept) ? 'bg-purple-100 text-purple-700' : 'bg-white text-slate-500 hover:bg-slate-100'}`}>
                          <input type="checkbox" className="hidden" checked={formData.assignedGroups.includes(dept)} onChange={() => handleGroupToggle(dept)} />
                          {formData.assignedGroups.includes(dept) && <Check className="w-3 h-3 mr-1" />}
                          {dept}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>Wykonawcy (Osoby)</label>
                    <div className="flex flex-col gap-1 max-h-32 overflow-y-auto custom-scrollbar p-2 bg-slate-50 border border-slate-200 rounded-sm">
                      {users.map(u => (
                        <label key={u.id} className={`flex items-center p-2 rounded-sm text-[10px] font-black cursor-pointer transition-colors ${formData.assignees.includes(u.id) ? 'bg-indigo-100 text-indigo-700' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>
                          <input type="checkbox" className="hidden" checked={formData.assignees.includes(u.id)} onChange={() => handleAssigneeToggle(u.id)} />
                          <div className={`w-4 h-4 rounded-sm mr-2 flex items-center justify-center ${formData.assignees.includes(u.id) ? 'bg-indigo-500 text-white' : 'bg-slate-200'}`}>
                            {formData.assignees.includes(u.id) && <Check className="w-3 h-3" />}
                          </div>
                          {u.name} <span className="text-slate-400 ml-1 font-normal">({u.department})</span>
                        </label>
                      ))}
                    </div>
                  </div>
               </div>
            </div>

            {/* Description / Instructions */}
            <div className="col-span-2 space-y-4">
              <label className={labelClass}><AlignLeft className="w-3 h-3 mr-2"/> Wytyczne Instruktażowe / Brief</label>
              <textarea placeholder="Szczegóły operacyjne dla Handlowców / Agencji reklamowej..." className={`${inputClass} min-h-[120px] resize-y`} value={formData.instructions} onChange={e => setFormData({...formData, instructions: e.target.value})} />
            </div>

          </div>

          <button type="submit" className="w-full py-6 bg-pink-500 hover:bg-pink-600 text-white font-black rounded-sm shadow-2xl shadow-pink-500/20 transition-all uppercase tracking-[0.2em] text-xs active:scale-95 flex items-center justify-center group">
            <Megaphone className="w-5 h-5 mr-3 group-hover:scale-110 transition-transform" /> 
            {initialData ? 'Aktualizuj Oś Kampanii' : 'Wygeneruj Oś Kampanii'}
          </button>

        </form>
      </div>
    </div>
  );
};

export default NewCampaignModal;
