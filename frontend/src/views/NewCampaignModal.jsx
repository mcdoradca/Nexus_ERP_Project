import React, { useState } from 'react';
import axios from 'axios';
import { X, Megaphone, Calendar, DollarSign, Target, AlignLeft } from 'lucide-react';

const NewCampaignModal = ({
  isOpen,
  onClose,
  brands,
  products,
  fetchData,
  token,
  API_URL
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
    color: 'bg-blue-500'
  });

  const handleCreate = async (e) => {
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

      await axios.post(`${API_URL}/api/campaigns`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchData();
      onClose();
    } catch (err) {
      console.error("Create campaign ERROR:", err.response?.data || err.message);
      alert(err.response?.data?.error || "Wystąpił błąd podczas tworzenia osi kampanii");
    }
  };

  if (!isOpen) return null;

  const inputClass = "w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-sm text-[11px] font-black text-slate-800 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none";
  const labelClass = "text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 block flex items-center";

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[120] flex items-center justify-center p-6 animate-in fade-in duration-300">
      <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-4xl overflow-hidden animate-in zoom-in duration-500 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-10 border-b border-slate-100 flex justify-between items-center bg-[#f8fafc] shrink-0">
           <div className="flex items-center">
              <div className="w-12 h-12 bg-pink-500 rounded-sm flex items-center justify-center mr-6 shadow-xl shadow-pink-200">
                 <Megaphone className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Inicjacja Osi Kampanii</h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Zdefiniuj Ramy Czasowe i Budżet Projektu</p>
              </div>
           </div>
           <button onClick={onClose} className="p-4 hover:bg-white rounded-sm transition-all text-slate-400"><X className="w-6 h-6" /></button>
        </div>

        {/* Body */}
        <form onSubmit={handleCreate} className="p-10 space-y-8 overflow-y-auto custom-scrollbar flex-1">
          
          <div className="grid grid-cols-2 gap-8">
            <div className="col-span-2">
              <label className={labelClass}>Nazwa Wyświetlana Kampanii</label>
              <input required placeholder="np. Złota Wyprzedaż Hebe 2026..." className={inputClass} value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
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
              <div className="grid grid-cols-3 gap-2">
                 <div>
                   <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Media</label>
                   <input type="number" placeholder="0" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-black" value={formData.budgetMedia} onChange={e => setFormData({...formData, budgetMedia: e.target.value})} />
                 </div>
                 <div>
                   <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 block">POSM</label>
                   <input type="number" placeholder="0" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-black" value={formData.budgetPOSM} onChange={e => setFormData({...formData, budgetPOSM: e.target.value})} />
                 </div>
                 <div>
                   <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Agencja</label>
                   <input type="number" placeholder="0" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-black" value={formData.budgetAgency} onChange={e => setFormData({...formData, budgetAgency: e.target.value})} />
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
            <Megaphone className="w-5 h-5 mr-3 group-hover:scale-110 transition-transform" /> Wygeneruj Oś Kampanii
          </button>

        </form>
      </div>
    </div>
  );
};

export default NewCampaignModal;
