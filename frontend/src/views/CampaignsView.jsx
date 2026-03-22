import React from 'react';
import { Target, Megaphone, CheckCircle2, User, Plus } from 'lucide-react';
import { DevBadge } from '../components/DevBadge';

const CampaignsView = ({
  campaigns,
  brands,
  timelineRange,
  setTimelineRange,
  setSelectedCampaign,
  setIsNewCampaignModalOpen,
  devMode
}) => {
  const [selectedBrandFilter, setSelectedBrandFilter] = React.useState('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = React.useState('ALL');

  // ---- TIMELINE LOGIC ----
  const now = new Date();
  let timelineStartDate = new Date(now);
  
  let columns = [];
  let pixelsPerDay = 30;

  if (timelineRange === 'YEAR') {
    timelineStartDate = new Date(now.getFullYear(), 0, 1);
    pixelsPerDay = 3; 
    for (let i = 0; i < 12; i++) {
      let d = new Date(now.getFullYear(), i, 1);
      let daysInMonth = new Date(now.getFullYear(), i + 1, 0).getDate();
      columns.push({ id: `m_${i}`, label: d.toLocaleString('pl-PL', { month: 'short' }), date: d.getFullYear(), width: daysInMonth * pixelsPerDay });
    }
  } else if (timelineRange === '12_WEEKS') {
    timelineStartDate.setDate(now.getDate() - (now.getDay() || 7) + 1);
    pixelsPerDay = 12; 
    for (let i = 0; i < 12; i++) {
      let d = new Date(timelineStartDate);
      d.setDate(d.getDate() + (i * 7));
      let weekNum = Math.ceil((((d - new Date(d.getFullYear(),0,1)) / 86400000) + new Date(d.getFullYear(),0,1).getDay()+1)/7);
      columns.push({ id: `w_${i}`, label: `T ${weekNum}`, date: d.toLocaleDateString('pl-PL', { day:'2-digit', month:'2-digit' }), width: 7 * pixelsPerDay });
    }
  } else {
    timelineStartDate.setDate(now.getDate() - (now.getDay() || 7) + 1);
    pixelsPerDay = 35; 
    for (let i = 0; i < 4; i++) {
      let d = new Date(timelineStartDate);
      d.setDate(d.getDate() + (i * 7));
      let weekNum = Math.ceil((((d - new Date(d.getFullYear(),0,1)) / 86400000) + new Date(d.getFullYear(),0,1).getDay()+1)/7);
      columns.push({ id: `w_${i}`, label: `Tydzień ${weekNum}`, date: d.toLocaleDateString('pl-PL', { day:'2-digit', month:'2-digit' }), width: 7 * pixelsPerDay });
    }
  }

  const resetTime = (d) => { const nd = new Date(d); nd.setHours(0,0,0,0); return nd; };
  const tStart = resetTime(timelineStartDate).getTime();

  const getStatusColor = (status) => {
    switch(status) {
      case 'Zatrzymana': return 'bg-red-500 border-red-600 shadow-red-500/30 text-white';
      case 'W trakcie': return 'bg-emerald-500 border-emerald-600 shadow-emerald-500/30 text-white';
      case 'Przygotowanie': return 'bg-orange-500 border-orange-600 shadow-orange-500/30 text-white';
      case 'Zakończona': return 'bg-slate-900 border-slate-950 shadow-slate-900/30 text-white';
      case 'Planowana': default: return 'bg-blue-500 border-blue-600 shadow-blue-500/30 text-white';
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#f8fafc] min-h-0 overflow-hidden relative">
      <DevBadge id="C-20" devMode={devMode} />
      <div className="h-20 border-b border-slate-200/60 bg-white flex items-center justify-between px-8 shrink-0 z-20 relative">
        <DevBadge id="C-21" devMode={devMode} />
        <div className="flex items-center space-x-6">
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tighter flex items-center">
            <Megaphone className="w-5 h-5 mr-3 text-pink-500" /> Centrum Promocji
          </h2>
          <div className="h-6 w-px bg-slate-200"></div>
          <div className="flex space-x-2 bg-slate-50 p-1 rounded-sm border border-slate-200/70">
             <button onClick={()=>setTimelineRange('4_WEEKS')} className={`px-4 py-1.5 rounded-sm text-[10px] font-black uppercase tracking-widest transition-all ${timelineRange==='4_WEEKS'?'bg-white text-indigo-600 shadow-sm border border-slate-200':'text-slate-400 hover:text-slate-800'}`}>4 Tygodnie</button>
             <button onClick={()=>setTimelineRange('12_WEEKS')} className={`px-4 py-1.5 rounded-sm text-[10px] font-black uppercase tracking-widest transition-all ${timelineRange==='12_WEEKS'?'bg-white text-indigo-600 shadow-sm border border-slate-200':'text-slate-400 hover:text-slate-800'}`}>Kwartał</button>
             <button onClick={()=>setTimelineRange('YEAR')} className={`px-4 py-1.5 rounded-sm text-[10px] font-black uppercase tracking-widest transition-all ${timelineRange==='YEAR'?'bg-white text-indigo-600 shadow-sm border border-slate-200':'text-slate-400 hover:text-slate-800'}`}>Rok</button>
          </div>
          <div className="h-6 w-px bg-slate-200"></div>
          <div className="flex space-x-2">
             <select value={selectedBrandFilter} onChange={(e) => setSelectedBrandFilter(e.target.value)} className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-black text-slate-600 uppercase tracking-widest outline-none shadow-sm cursor-pointer hover:border-indigo-300 transition-all">
               <option value="ALL">Firma: Wszystkie</option>
               {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
             </select>
             <select value={selectedStatusFilter} onChange={(e) => setSelectedStatusFilter(e.target.value)} className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-black text-slate-600 uppercase tracking-widest outline-none shadow-sm cursor-pointer hover:border-indigo-300 transition-all">
               <option value="ALL">Status: Wszystkie</option>
               <option value="Planowana">Planowana</option>
               <option value="W trakcie">W trakcie</option>
               <option value="Zatrzymana">Zatrzymana</option>
               <option value="Przygotowanie">Przygotowanie</option>
               <option value="Zakończona">Zakończona</option>
             </select>
          </div>
        </div>
        <button onClick={() => setIsNewCampaignModalOpen(true)} className="px-6 py-2.5 bg-slate-900 text-white rounded-sm text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 shadow-xl shadow-slate-900/10 flex items-center transition-all active:scale-95 group">
          <Plus className="w-4 h-4 mr-2 group-hover:rotate-90 transition-transform" /> Dodaj Oś Kampanii
        </button>
      </div>

      <div className="flex-1 overflow-auto flex relative bg-white custom-scrollbar-horizontal">
        <div className="w-72 flex-shrink-0 border-r border-slate-200 bg-slate-50/80 flex flex-col sticky left-0 z-30 shadow-[10px_0_20px_rgba(0,0,0,0.03)] backdrop-blur-md">
          <div className="h-16 border-b border-slate-200 flex items-center px-6 bg-white font-black text-[10px] uppercase tracking-[0.2em] text-slate-400 shrink-0">
            Podmiot / Marka
          </div>
          {brands.filter(b => selectedBrandFilter === 'ALL' || b.id === selectedBrandFilter).map((b, idx) => (
            <div key={b.id} className={`h-32 px-6 py-4 flex flex-col justify-center border-b border-slate-100/80 ${idx % 2 === 0 ? 'bg-white' : 'bg-transparent'} shrink-0`}>
              <div className="flex items-center">
                <div className="w-10 h-10 rounded-sm bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mr-4 shrink-0 shadow-inner"><Target className="w-5 h-5" /></div>
                <h3 className="font-black text-[13px] text-slate-800 uppercase tracking-tight truncate">{b.name}</h3>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col min-w-max relative pb-32">
          <div className="h-16 flex border-b border-slate-200 bg-white sticky top-0 z-20 shrink-0">
             {columns.map(w => (
               <div key={w.id} style={{ width: `${w.width}px` }} className="border-r border-slate-100 flex flex-col items-center justify-center flex-shrink-0">
                 <span className="text-[11px] font-black text-slate-800 uppercase tracking-[0.2em]">{w.label}</span>
                 <span className="text-[9px] font-bold text-slate-400 mt-0.5">{w.date}</span>
               </div>
             ))}
          </div>
          
          {brands.filter(b => selectedBrandFilter === 'ALL' || b.id === selectedBrandFilter).map((b, idx) => {
            const brandCampaigns = campaigns.filter(c => c.brandId === b.id && (selectedStatusFilter === 'ALL' || c.status === selectedStatusFilter));
            return (
              <div key={b.id} className={`h-32 flex relative border-b border-slate-100/80 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'} shrink-0`}>
                {columns.map(w => (
                  <div key={w.id} style={{ width: `${w.width}px` }} className="border-r border-slate-100/50 flex-shrink-0 h-full"></div>
                ))}

                {brandCampaigns.map((c) => {
                  const statusClass = c.color || getStatusColor(c.status);
                  
                  // BEZWZGLĘDNA MATEMATYKA DAT (Bez stref czasowych, pełne i zamknięte daty)
                  const getDaysDiff = (d1Str, d2Str) => {
                     const d1 = new Date(d1Str); const d2 = new Date(d2Str);
                     const u1 = Date.UTC(d1.getFullYear(), d1.getMonth(), d1.getDate());
                     const u2 = Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate());
                     return Math.round((u1 - u2) / 86400000);
                  };

                  const daysOffset = getDaysDiff(c.startDate, timelineStartDate);
                  const durationDays = getDaysDiff(c.endDate, c.startDate) + 1; // + 1 Bo kampania trwa przez CAŁY dzień końcowy (inclusive)
                  
                  if (daysOffset + durationDays < 0) return null;

                  const leftPx = Math.max(0, daysOffset * pixelsPerDay);
                  let widthPx = durationDays * pixelsPerDay;
                  if (widthPx < 100) widthPx = 100;

                  return (
                    <div key={c.id} onClick={() => setSelectedCampaign(c)} className={`absolute top-4 h-24 rounded-bl-none rounded-sm border ${statusClass} shadow-xl p-4 flex flex-col justify-between cursor-pointer hover:brightness-110 hover:-translate-y-1 hover:shadow-2xl transition-all group z-10 overflow-hidden`} style={{ left: `${leftPx + 10}px`, width: `${widthPx - 10}px` }}>
                      <div className="flex justify-between items-start w-full relative z-10">
                        <div className="flex flex-col max-w-[70%]">
                           <span className="font-black text-xs uppercase tracking-widest truncate">{c.name}</span>
                           <span className={`text-[9px] font-bold opacity-80 mt-1 uppercase tracking-wider truncate ${timelineRange === 'YEAR' && widthPx < 180 ? 'hidden' : 'block'}`}>{c.product?.name || 'Wiele produktów'}</span>
                        </div>
                        {widthPx > 150 && <div className="bg-black/30 px-3 py-1 rounded-sm text-[9px] font-black uppercase tracking-widest backdrop-blur-sm border border-white/10 text-white">{c.status}</div>}
                      </div>
                      
                      <div className="flex items-center justify-between w-full relative z-10 mt-auto">
                         <div className="flex items-center space-x-3">
                            {widthPx > 180 && <span className="text-[10px] font-black bg-white/10 px-2 py-1 rounded border border-white/20"><User className="w-3 h-3 inline mr-1" /> {c.budget} PLN</span>}
                         </div>
                         <div className={`bg-white text-slate-900 px-4 py-1.5 rounded-sm text-[10px] font-black uppercase tracking-[0.2em] shadow-lg flex items-center ${widthPx < 150 ? 'mx-auto w-full justify-center' : ''}`}>
                           <CheckCircle2 className="w-3 h-3 text-emerald-500 mr-2" />
                           {c.soldCount || 0} / {c.plannedCount || 0}
                         </div>
                      </div>
                      <div className="absolute top-0 right-0 w-40 h-40 bg-white opacity-10 rounded-full -translate-y-12 translate-x-16 pointer-events-none"></div>
                      <div className="absolute bottom-0 left-0 h-1 bg-white/20 w-full"><div className="h-full bg-white relative" style={{width: `${Math.min(100, ((c.soldCount||0)/(c.plannedCount||1)*100))}%`}}></div></div>
                    </div>
                  );
                })}
                {brandCampaigns.length === 0 && (
                  <div className="absolute left-10 top-1/2 -translate-y-1/2 flex items-center opacity-30">
                     <Megaphone className="w-4 h-4 mr-2 text-slate-400" />
                     <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Brak Aktywacji</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CampaignsView;
