import React from 'react';
import { Megaphone, Settings, X, Target, DollarSign, MessageCircle, Zap, CheckCircle2, Folder, Users } from 'lucide-react';
import UniversalChat from '../components/UniversalChat';

// --- KOMPONENT DEV BADGE ---
const DevBadge = ({ id }) => {
  return (
    <span className="absolute top-2 left-2 z-[9999] bg-fuchsia-500 text-white text-[10px] font-black px-2 py-0.5 rounded shadow-[0_0_15px_rgba(217,70,239,0.6)] pointer-events-none border-[1.5px] border-white uppercase tracking-widest flex items-center justify-center opacity-90 backdrop-blur-sm">
      {id}
    </span>
  );
};

const CampaignDetailsDrawer = ({ campaign, onClose, currentUser, tasks, socket }) => {
  if (!campaign) return null;
  const projectTasks = tasks.filter(t => t.campaignId === campaign.id);

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
                <span className={`px-3 py-1 rounded-sm ${campaign.color?.replace('bg-', 'bg-')?.replace('500', '50') || 'bg-blue-50'} ${campaign.color?.replace('bg-', 'text-')?.replace('500', '600') || 'text-blue-600'} text-[9px] font-black uppercase tracking-widest`}>{campaign.status}</span>
              </div>
              <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none">{campaign.name}</h3>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-2 block">{campaign.product?.name || 'Promocja Wieloproduktowa'}</span>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <button className="p-4 hover:bg-white bg-slate-100/50 rounded-sm text-slate-400 hover:text-pink-600 transition-all border border-transparent hover:border-slate-100 shadow-sm"><Settings className="w-6 h-6" /></button>
            <button onClick={onClose} className="p-4 hover:bg-slate-900 bg-slate-100 rounded-sm text-slate-400 hover:text-white transition-all shadow-sm"><X className="w-6 h-6" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-10 bg-white grid grid-cols-3 gap-8 content-start">
          
          {/* Top Metrics / KPIs */}
          <div className="col-span-3 grid grid-cols-4 gap-6">
             <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100">
                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center"><Target className="w-3 h-3 mr-2" /> Marka</div>
                <div className="text-sm font-black text-slate-900 uppercase truncate">{campaign.brand?.name || 'Brak'}</div>
             </div>
             <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100">
                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center"><DollarSign className="w-3 h-3 mr-2" /> Budżet</div>
                <div className="text-sm font-black text-slate-900 tabular-nums uppercase">{campaign.budget} PLN</div>
             </div>
             <div className="p-6 bg-emerald-50 rounded-[2rem] border border-emerald-100 col-span-2 flex justify-between items-center relative overflow-hidden">
                <div className="absolute right-[-10%] top-[-50%] opacity-10"><Target className="w-32 h-32 text-emerald-600"/></div>
                <div>
                  <div className="text-[9px] font-black text-emerald-600/70 uppercase tracking-widest mb-1 flex items-center">Realizacja Celu Sprzedaży</div>
                  <div className="text-2xl font-black text-emerald-600 tabular-nums">{campaign.soldCount || 0} / {campaign.plannedCount || 0} <span className="text-sm opacity-50">SZT</span></div>
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
                  <p className="text-slate-600 text-sm font-bold leading-relaxed">{campaign.instructions || 'Brak wdrożonych wytycznych operacyjnych.'}</p>
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
               <UniversalChat mode="campaign" targetId={campaign.id} currentUser={currentUser} socket={socket} title="Szybka Komunikacja w Kampanii" subtitle={`Marketing: ${campaign.brand?.name || ''}`} />
          </div>
        </div>
      </div>
  );
};

export default CampaignDetailsDrawer;
