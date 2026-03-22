import React, { useRef, useState } from 'react';
import axios from 'axios';
import { Megaphone, X, Target, DollarSign, MessageCircle, Zap, CheckCircle2, Folder, Users, Edit3, Loader2, Instagram } from 'lucide-react';
import UniversalChat from '../components/UniversalChat';

// --- KOMPONENT DEV BADGE ---
const DevBadge = ({ id }) => {
  return (
    <span className="absolute top-2 left-2 z-[9999] bg-fuchsia-500 text-white text-[10px] font-black px-2 py-0.5 rounded shadow-[0_0_15px_rgba(217,70,239,0.6)] pointer-events-none border-[1.5px] border-white uppercase tracking-widest flex items-center justify-center opacity-90 backdrop-blur-sm">
      {id}
    </span>
  );
};

const CampaignDetailsModal = ({ campaign, onClose, onEdit, currentUser, tasks, socket, token, API_URL, fetchData }) => {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);
  
  if (!campaign) return null;
  const projectTasks = tasks.filter(t => t.campaignId === campaign.id);

  const handleFileUpload = async (e) => {
     const file = e.target.files[0];
     if (!file) return;
     
     setIsUploading(true);
     const formData = new FormData();
     formData.append('file', file);

     try {
       await axios.post(`${API_URL}/api/campaigns/${campaign.id}/assets`, formData, {
         headers: {
           'Authorization': `Bearer ${token}`,
           'Content-Type': 'multipart/form-data'
         }
       });
       fetchData(); // Odśwież widok Kampanii
     } catch (err) {
       console.error("Błąd zapisu pliku POSM", err);
       alert("Upload error. Sprawdź logi (dostęp tylko dla marketingu).");
     } finally {
       setIsUploading(false);
       if (fileInputRef.current) fileInputRef.current.value = "";
     }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
      <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-7xl overflow-hidden animate-in zoom-in duration-500 flex flex-col max-h-[95vh] relative">
        <DevBadge id="D-40 (MODAL)" />
        
        {/* Header */}
        <div className="p-10 border-b border-slate-100 flex justify-between items-center bg-[#f8fafc] shrink-0">
          <div className="flex items-center space-x-6">
            <div className={`w-16 h-16 ${campaign.color?.replace('bg-', 'bg-') || 'bg-slate-900'} rounded-[1.5rem] flex items-center justify-center shadow-xl shadow-slate-900/10 text-white transition-colors`}>
               <Megaphone className="w-8 h-8" />
            </div>
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
            <button 
              onClick={() => onEdit(campaign)} 
              className="px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[1.5rem] text-[11px] font-black uppercase tracking-widest transition-all shadow-xl shadow-indigo-600/30 flex items-center group active:scale-95"
            >
              <Edit3 className="w-4 h-4 mr-3 group-hover:scale-110 transition-transform" /> Edytuj Parametry Kampanii
            </button>
            <button onClick={onClose} className="p-4 hover:bg-slate-900 bg-white border border-slate-200 rounded-sm text-slate-400 hover:text-white transition-all shadow-sm"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar bg-white flex flex-col lg:flex-row min-h-0">
          
          {/* Main Content (Left) */}
          <div className="flex-1 p-10 overflow-y-auto custom-scrollbar space-y-12">
            
            {/* Top Metrics / KPIs */}
            <div className="grid grid-cols-3 gap-6">
               <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100">
                  <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center"><Target className="w-3 h-3 mr-2" /> Marka</div>
                  <div className="text-sm font-black text-slate-900 uppercase truncate">{campaign.brand?.name || 'Brak'}</div>
               </div>
               <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100">
                  <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center"><DollarSign className="w-3 h-3 mr-2" /> Budżet</div>
                  <div className="text-sm font-black text-slate-900 tabular-nums uppercase">{campaign.budget} PLN</div>
               </div>
               <div className="p-6 bg-emerald-50 rounded-[2rem] border border-emerald-100 flex justify-between items-center relative overflow-hidden">
                  <div className="absolute right-[-10%] top-[-50%] opacity-10"><Target className="w-32 h-32 text-emerald-600"/></div>
                  <div>
                    <div className="text-[9px] font-black text-emerald-600/70 uppercase tracking-widest mb-1 flex items-center">Sprzedaż (Sztuki)</div>
                    <div className="text-2xl font-black text-emerald-600 tabular-nums">{campaign.soldCount || 0} / {campaign.plannedCount || 0}</div>
                  </div>
               </div>
            </div>

            <div className="grid grid-cols-2 gap-10">
               {/* Instructions */}
               <div className="col-span-2">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-6 flex items-center"><MessageCircle className="w-4 h-4 mr-3" /> Instrukcje dla Handlowców / Agencji</h4>
                  <div className="bg-[#f8fafc] rounded-[2.5rem] p-8 border border-slate-100 relative group min-h-[8rem]">
                    <p className="text-slate-600 text-sm font-bold leading-relaxed whitespace-pre-wrap">{campaign.instructions || 'Brak wdrożonych wytycznych operacyjnych.'}</p>
                  </div>
               </div>

               {/* Tasks */}
               <div className="col-span-1">
                  <div className="flex items-center justify-between mb-6">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center"><Zap className="w-4 h-4 mr-3" /> Zlecone Zadania</h4>
                  </div>
                  <div className="space-y-4 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                    {projectTasks.map(t => (
                      <div key={t.id} className="p-5 bg-white border border-slate-100 rounded-[1.5rem] shadow-sm flex items-center justify-between hover:border-indigo-100 transition-colors cursor-pointer group">
                         <div className="flex items-center space-x-4">
                           <div className={`w-8 h-8 rounded-full flex items-center justify-center ${t.status==='DONE' ? 'bg-emerald-50 text-emerald-500' : 'bg-slate-100 text-slate-400'} group-hover:scale-110 transition-transform`}>
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

               {/* Right Meta Column */}
               <div className="col-span-1 border-l border-slate-100 pl-10 space-y-10">
                 {/* Assignees */}
                 <div>
                   <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-6 flex items-center"><Users className="w-4 h-4 mr-3" /> Grupy i Pracownicy</h4>
                   
                   <div className="flex flex-wrap gap-2 mb-4">
                     {campaign.assignedGroups?.map(g => (
                        <span key={g} className="px-3 py-1.5 bg-purple-50 text-purple-600 text-[9px] font-black uppercase tracking-widest rounded-sm border border-purple-100">{g}</span>
                     ))}
                     {!campaign.assignedGroups?.length && <span className="text-[9px] text-slate-400 uppercase">brak przypisanych działów</span>}
                   </div>

                   <div className="flex flex-wrap gap-3 mt-4">
                      {campaign.assignees?.map(u => (
                        <div key={u.id} className="flex items-center space-x-3 bg-white border border-slate-100 px-3 py-2 rounded-[1.5rem] shadow-sm">
                          <div title={u.name} className={`w-8 h-8 rounded-full ${u.color || 'bg-slate-200 text-slate-600'} flex items-center justify-center text-[9px] font-black shadow-inner`}>
                            {u.name?.split(' ').map(n=>n[0]).join('').substring(0,2)}
                          </div>
                          <div>
                            <div className="text-[10px] font-black text-slate-800 uppercase tracking-tight">{u.name}</div>
                            <div className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{u.department}</div>
                          </div>
                        </div>
                      ))}
                      {!campaign.assignees?.length && <span className="text-[9px] text-slate-400 uppercase mt-2">Brak Liderów</span>}
                   </div>
                 </div>

                 {/* Assets Placeholder -> Real Implementation */}
                 <div>
                   <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-6 flex items-center"><Folder className="w-4 h-4 mr-3" /> Baza Plików POSM</h4>
                   
                   <input type="file" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
                   
                   <button 
                     onClick={() => fileInputRef.current && fileInputRef.current.click()} 
                     disabled={isUploading || currentUser?.department === 'HANDLOWCY'}
                     className="w-full p-6 mb-4 border-2 border-dashed border-slate-200 rounded-[1.5rem] text-[10px] font-black text-slate-400 uppercase tracking-widest hover:border-indigo-400 hover:text-indigo-600 transition-colors bg-slate-50 hover:bg-white flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                   >
                     {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin text-indigo-500" /> : "+ Prześlij Wsad / Grafiki"}
                   </button>
                   
                   <div className="space-y-3">
                     {campaign.assets?.map(asset => (
                       <a 
                         key={asset.id} 
                         href={asset.fileUrl} 
                         target="_blank" 
                         rel="noreferrer"
                         className="flex items-center p-4 bg-slate-50 border border-slate-100 rounded-[1rem] hover:bg-white hover:shadow-md transition-all group"
                       >
                         <div className="w-8 h-8 rounded-sm bg-indigo-50 text-indigo-500 flex items-center justify-center mr-4 group-hover:scale-110 transition-transform">
                           <Folder className="w-4 h-4" />
                         </div>
                         <div className="flex-1 min-w-0">
                           <p className="text-[11px] font-black text-slate-800 truncate">{asset.fileName}</p>
                           <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">Wgrane przez: {asset.uploader?.name}</p>
                         </div>
                       </a>
                     ))}
                     {(!campaign.assets || campaign.assets.length === 0) && (
                       <p className="text-[9px] text-slate-400 uppercase text-center py-4">Brak załączonych plików</p>
                     )}
                 </div>

               </div>
               </div>

            </div>
          </div>

          {/* Chat Panel (Right Side) */}
          <div className="w-[400px] border-l border-slate-100 bg-[#f8fafc] flex flex-col min-h-0 shrink-0">
               <UniversalChat 
                 mode="campaign" 
                 targetId={campaign.id} 
                 currentUser={currentUser} 
                 socket={socket} 
                 title="Kanał Promocji" 
                 subtitle={`Szybka Komunikacja`} 
               />
          </div>

        </div>
      </div>
    </div>
  );
};

export default CampaignDetailsModal;
