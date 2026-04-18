import React, { useState, useEffect } from 'react';
import { Search, ShieldCheck, Mail, ArrowRight, TrendingUp, X, Loader2, Star, UserPlus, ExternalLink, Edit2, Trash2, Send, MessageSquare, Briefcase, FileText, Check, AlertTriangle } from 'lucide-react';
import axios from 'axios';

const InfluencerCrmView = ({ currentUser, API_URL, token }) => {
   // Lifecycle Kanban: Zgodnie z etykietami - Nawiązanie -> Umowa -> Paczka (Przesłana do logistyki) -> Zapłacono Prowizję
   const columns = ["NAWIAZANIE", "UMOWA", "PACZKA", "ZAPLACONO"];

   const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
   const [searchQuery, setSearchQuery] = useState("");
   const [isSearching, setIsSearching] = useState(false);
   const [searchResults, setSearchResults] = useState([]);

   const [huntPrompt, setHuntPrompt] = useState("");
   const [isHunting, setIsHunting] = useState(false);
   
   const [allInfluencers, setAllInfluencers] = useState([]);
   const [isLoadingRepository, setIsLoadingRepository] = useState(true);
   const [isCatalogOpen, setIsCatalogOpen] = useState(false);
   const [selectedCreator, setSelectedCreator] = useState(null);

   const [deals, setDeals] = useState([]);
   const [isSavingDeal, setIsSavingDeal] = useState(false);
   
   const [generatedBrief, setGeneratedBrief] = useState(null);
   const [isGeneratingBrief, setIsGeneratingBrief] = useState(false);

   // Stany do CRUD i Zakładek
   const [activeTab, setActiveTab] = useState('INFO'); // INFO, DEALS, NOTES
   const [isEditing, setIsEditing] = useState(false);
   const [editForm, setEditForm] = useState({});
   const [noteContent, setNoteContent] = useState("");
   const [isDeleting, setIsDeleting] = useState(false);

   const fetchRepository = async () => {
       try {
           setIsLoadingRepository(true);
           const res = await axios.get(`${API_URL}/api/influencers/all`, {
               headers: { Authorization: `Bearer ${token}` }
           });
           setAllInfluencers(res.data);
       } catch (err) {
           console.error("Błąd pobierania Repozytorium:", err);
       } finally {
           setIsLoadingRepository(false);
       }
   };
   useEffect(() => {
       fetchRepository();
       fetchDeals();
   }, []);
   
   const fetchDeals = async () => {
       try {
           const res = await axios.get(`${API_URL}/api/influencers/deals`, { headers: { Authorization: `Bearer ${token}` } });
           setDeals(res.data);
       } catch (err) { console.error("Error fetching deals", err); }
   };

   const handleAddToPipeline = async () => {
       if (!selectedCreator) return;
       setIsSavingDeal(true);
       try {
           await axios.post(`${API_URL}/api/influencers/deals`, { influencerId: selectedCreator.id }, { headers: { Authorization: `Bearer ${token}` } });
           fetchDeals();
           setSelectedCreator(null);
           setIsCatalogOpen(false);
       } catch (err) {
           alert(err.response?.data?.error || "Błąd podczas zapinania deala.");
       } finally {
           setIsSavingDeal(false);
       }
   };
   
   const handleGenerateBrief = async () => {
       setIsGeneratingBrief(true);
       try {
           await new Promise(res => setTimeout(res, 2000));
           const text = `Cześć ${selectedCreator?.name}!\n\nWypatrzyliśmy Twój wspaniały profil. Twoje zaangażowanie (ER: ${selectedCreator?.engagementRate}%) idealnie matchuje się wektorowo z naszą najnowszą kampanią produktową.\n\nChcielibyśmy zaprosić Cię do współpracy w trybie natychmiastowym (48h).\nRekomendowany w systemie model w oparciu o Twój zasięg to: ${selectedCreator?.preferredCollab || "BARTER"}.\n\nDaj znać czy akceptujesz brief!\n\nPozdrawiamy, Team Nexus ERP`;
           setGeneratedBrief(text);
       } finally {
           setIsGeneratingBrief(false);
       }
   };
   
   const handleSaveEdit = async () => {
       try {
           setIsSavingDeal(true);
           const res = await axios.put(`${API_URL}/api/influencers/${selectedCreator.id}`, editForm, { headers: { Authorization: `Bearer ${token}` } });
           // Zachowaj powiązane notatki i deale podczas aktualizacji głownej encji
           setSelectedCreator({ ...selectedCreator, ...res.data, notes: selectedCreator.notes, deals: selectedCreator.deals });
           fetchRepository();
           setIsEditing(false);
       } catch (err) { alert("Błąd edycji profilu"); } finally { setIsSavingDeal(false); }
   };

   const handleDeleteCreator = async () => {
       if (!window.confirm("BANGER ALERT: Czy na pewno chcesz skasować tego influencera i usunąć cały jego dziennik relacji?")) return;
       setIsDeleting(true);
       try {
           await axios.delete(`${API_URL}/api/influencers/${selectedCreator.id}`, { headers: { Authorization: `Bearer ${token}` } });
           fetchRepository();
           setSelectedCreator(null);
       } catch (err) { alert("Błąd usuwania"); } finally { setIsDeleting(false); }
   };

   const handleAddNote = async () => {
       if (!noteContent.trim()) return;
       try {
           const res = await axios.post(`${API_URL}/api/influencers/${selectedCreator.id}/notes`, { content: noteContent }, { headers: { Authorization: `Bearer ${token}` } });
           setSelectedCreator({ ...selectedCreator, notes: [res.data, ...(selectedCreator.notes || [])] });
           setNoteContent("");
           fetchRepository();
       } catch (err) { alert("Błąd dodawania notatki"); }
   };

   const openEditMode = () => {
       setEditForm({
           name: selectedCreator.name,
           email: selectedCreator.email || "",
           minRate: selectedCreator.minRate || 0,
           maxRate: selectedCreator.maxRate || 0,
           niche: selectedCreator.demographicData?.niche || "",
           preferredCollab: selectedCreator.preferredCollab,
           socialUrl: selectedCreator.socialUrl || "",
           engagementRate: selectedCreator.engagementRate || 0
       });
       setIsEditing(true);
   };
   
   const handleSearchAI = async () => {
       if (!searchQuery.trim()) return;
       setIsSearching(true);
       setSearchResults([]);
       try {
           const res = await axios.post(`${API_URL}/api/influencers/discovery`, 
               { query: searchQuery },
               { headers: { Authorization: `Bearer ${token}` } }
           );
           setSearchResults(res.data);
       } catch (err) {
           console.error("AI Search Error:", err);
           alert("Błąd połączenia z silnikiem Gemini LLM. Upewnij się, że klucz API jest w środowisku i serwer zrestartowany.");
       } finally {
           setIsSearching(false);
       }
   };

   const handleHuntInfluencers = async () => {
       if (!huntPrompt.trim()) return;
       setIsHunting(true);
       try {
           const res = await axios.post(`${API_URL}/api/influencers/hunt`,
               { prompt: huntPrompt },
               { headers: { Authorization: `Bearer ${token}` } }
           );
           alert(`Generative AI pomyślnie wyłowił i wprowadził: ${res.data.count} profili! Sprawdź tabelę Repozytorium.`);
           setHuntPrompt("");
           fetchRepository(); // Odśwież siatkę po udanym polowaniu!
       } catch (err) {
           console.error("AI Hunter Error:", err);
           alert(err.response?.data?.error || "Wystąpił błąd podczas poszukiwań AI.");
       } finally {
           setIsHunting(false);
       }
   };

   return (
      <div className="flex-1 flex flex-col p-10 bg-[#f8fafc] h-full relative overflow-hidden">
         <div className="flex items-center justify-between mb-8 shrink-0">
             <div>
                 <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Enterprise Influencer CRM</h2>
                 <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mt-1">Smart Discovery & Lifecycle Workflows | U-Shape ROI Analytics</p>
             </div>
             
             <div className="flex items-center space-x-4 w-full justify-end">
                 <div className="flex flex-1 max-w-2xl items-center bg-white border-2 border-slate-200 rounded-xl overflow-hidden shadow-sm focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-100 transition-all">
                     <span className="pl-4 pr-2 text-indigo-400 group-focus-within:text-indigo-600 transition-colors"><Star className="w-5 h-5 fill-current" /></span>
                     <input 
                         type="text" 
                         value={huntPrompt}
                         onChange={(e) => setHuntPrompt(e.target.value)}
                         placeholder="Zleć AI wyszukanie... np. Znajdź mi 10 makijażystek do barteru..." 
                         className="py-3 px-2 text-[12px] font-bold text-slate-700 w-full outline-none placeholder:text-slate-400"
                     />
                     <button 
                         onClick={handleHuntInfluencers}
                         disabled={isHunting || !huntPrompt.trim()}
                         className="px-6 py-4 bg-indigo-50 text-indigo-700 hover:text-indigo-900 border-l border-indigo-100 text-[11px] font-black uppercase tracking-widest transition-colors flex items-center disabled:opacity-50 disabled:grayscale relative group"
                     >
                        {isHunting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin"/> Szukam...</> : 'Rozpocznij Polowanie AI (Zasil Bazę)'}
                        {/* Wymuszony glow na przycisku dla UX */}
                        <div className="absolute inset-0 bg-indigo-500 blur-xl opacity-0 group-hover:opacity-20 transition-opacity"></div>
                     </button>
                 </div>

                 <button onClick={() => setIsSearchModalOpen(true)} className="px-6 py-4 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl flex items-center transition-all hover:bg-slate-800 hover:-translate-y-1">
                    <Search className="w-4 h-4 mr-3 text-indigo-400" /> Przeszukaj Twoją Bazę (Vector NLP)
                 </button>
             </div>
         </div>

         {/* Widok Repozytorium (Siatka Twórców) - SCHOWANY DO PRZYCISKU */}
         <div className="mb-6 flex-shrink-0 flex items-center justify-between bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
             <div className="flex items-center">
                 <ShieldCheck className="w-6 h-6 mr-3 text-indigo-500" />
                 <div>
                     <h3 className="font-black text-[13px] text-slate-800 uppercase tracking-widest">Katalog Repozytorium (PIM)</h3>
                     <p className="text-[10px] font-bold text-slate-500 uppercase">Obecnie wyłowionych twórców w systemie AI: <span className="text-indigo-600">{allInfluencers.length}</span></p>
                 </div>
             </div>
             <button 
                 onClick={() => setIsCatalogOpen(true)}
                 className="px-6 py-3 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-sm hover:bg-indigo-100 transition-colors flex items-center"
             >
                Otwórz Inteligenty Katalog 
             </button>
         </div>

         {/* FULLSCREEN MODAL KATALOGU (A'LA NANOINFLU) */}
         {isCatalogOpen && (
             <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[9999] flex justify-center items-center">
                 <div className="bg-[#f8fafc] w-[95vw] h-[90vh] rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden relative">
                     {/* Header Katalogu */}
                     <div className="px-8 py-6 bg-white border-b border-slate-200 flex justify-between items-center shrink-0">
                         <div>
                            <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Katalog Twórców</h2>
                            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-1">Zarządzanie budżetem, weryfikacja bazy i stawki twórców</p>
                         </div>
                         <button onClick={() => {setIsCatalogOpen(false); setSelectedCreator(null);}} className="p-3 bg-slate-100 hover:bg-rose-100 hover:text-rose-600 rounded-full transition-colors">
                             <X className="w-6 h-6" />
                         </button>
                     </div>
                     
                     {/* Zawartość Katalogu (Siatka Odkrywcza) */}
                     <div className="flex-1 overflow-y-auto p-8 custom-scrollbar relative">
                         {isLoadingRepository ? (
                             <div className="flex justify-center items-center h-full"><Loader2 className="w-12 h-12 text-indigo-500 animate-spin" /></div>
                         ) : (
                             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                 {allInfluencers.map(inf => (
                                     <div 
                                        key={inf.id} 
                                        onClick={() => {setSelectedCreator(inf); setGeneratedBrief(null);}}
                                        className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-xl hover:border-indigo-400 transition-all cursor-pointer group flex flex-col"
                                     >
                                         <div className="h-24 bg-slate-100 relative w-full flex items-center justify-center overflow-hidden">
                                            {inf.avatarUrl ? (
                                                <img src={inf.avatarUrl} alt="avatar" className="w-full h-full object-cover opacity-90 group-hover:scale-110 transition-transform duration-500" />
                                            ) : (
                                                <div className="w-16 h-16 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-400 font-black text-xl z-10">
                                                    {inf.name.charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent"></div>
                                            <span className="absolute bottom-3 left-4 text-white text-[9px] font-black uppercase tracking-widest bg-black/30 px-2 py-1 rounded backdrop-blur-sm">{inf.platform}</span>
                                         </div>
                                         <div className="p-5 flex-1 flex flex-col">
                                            <h4 className="text-[14px] font-black text-slate-800 truncate">{inf.name}</h4>
                                            <div className="flex items-center gap-2">
                                                <p className="text-[11px] font-bold text-indigo-500 truncate">{inf.handle}</p>
                                                {inf.socialUrl && (
                                                    <a href={inf.socialUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-slate-400 hover:text-indigo-500 transition-colors">
                                                        <ExternalLink className="w-3 h-3" />
                                                    </a>
                                                )}
                                            </div>
                                            
                                            <div className="mt-4 flex flex-wrap gap-2">
                                                <span className="text-[9px] font-black bg-slate-100 text-slate-600 px-2 py-1 rounded-sm">{(inf.followers / 1000).toFixed(1)}K Obserw.</span>
                                                <span className={`text-[9px] font-black px-2 py-1 rounded-sm ${inf.preferredCollab === 'BARTER' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                                                    {inf.preferredCollab || "BARTER"}
                                                </span>
                                                <span className="text-[9px] font-black bg-indigo-50 text-indigo-600 px-2 py-1 rounded-sm border border-indigo-100 flex items-center"><ShieldCheck className="w-3 h-3 mr-1" /> AI Match: {((inf.authenticityScore || 0.82) * 100).toFixed(1)}%</span>
                                            </div>
                                         </div>
                                     </div>
                                 ))}
                             </div>
                         )}
                     </div>

                     {/* DRAWER BOCZNY - Karta Szczegółów Twórcy */}
                     {selectedCreator && (
                         <div className="absolute top-0 right-0 bottom-0 w-[450px] bg-white shadow-[0_0_40px_rgba(0,0,0,0.1)] border-l border-slate-200 z-50 flex flex-col transform transition-transform animate-in slide-in-from-right-8 duration-300">
                             <div className="h-48 bg-slate-900 relative">
                                 {selectedCreator.avatarUrl && <img src={selectedCreator.avatarUrl} className="w-full h-full object-cover opacity-50" alt="" />}
                                 <button onClick={() => setSelectedCreator(null)} className="absolute top-4 right-4 p-2 bg-white/20 hover:bg-white/40 text-white rounded-full transition-all backdrop-blur-md">
                                     <X className="w-5 h-5" />
                                 </button>
                                 <div className="absolute -bottom-10 left-8">
                                     {selectedCreator.avatarUrl ? (
                                         <img src={selectedCreator.avatarUrl} className="w-24 h-24 rounded-full border-4 border-white shadow-xl object-cover" alt="" />
                                     ) : (
                                         <div className="w-24 h-24 rounded-full border-4 border-white shadow-xl bg-indigo-100 flex items-center justify-center text-indigo-500 font-black text-3xl">
                                             {selectedCreator.name.charAt(0)}
                                         </div>
                                     )}
                                 </div>
                                 <div className="absolute -bottom-5 right-6">
                                     <button disabled={isSavingDeal} onClick={handleAddToPipeline} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-full shadow-lg border-4 border-white text-[10px] font-black uppercase tracking-widest flex items-center transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 z-50">
                                         {isSavingDeal ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-2" />} Do Pipelinu
                                     </button>
                                 </div>
                             </div>

                             <div className="flex-1 p-6 overflow-y-auto custom-scrollbar flex flex-col min-h-0">
                                 <div className="flex justify-between items-start mb-4">
                                     <div>
                                        <h3 className="text-2xl font-black text-slate-800">{selectedCreator.name}</h3>
                                        <div className="flex items-center gap-2 mt-1">
                                            <p className="text-[12px] font-bold text-indigo-500">{selectedCreator.handle}</p>
                                            {selectedCreator.socialUrl && (
                                                <a href={selectedCreator.socialUrl} target="_blank" rel="noreferrer" className="flex items-center text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full transition-colors group">
                                                    Zobacz profil <ExternalLink className="w-3 h-3 ml-1 group-hover:scale-110" />
                                                </a>
                                            )}
                                        </div>
                                     </div>
                                     <span className="text-[10px] font-black uppercase tracking-widest bg-slate-100 text-slate-600 px-3 py-1.5 rounded-full">{selectedCreator.platform}</span>
                                 </div>

                                 <div className="flex border-b border-slate-200 mb-6 shrink-0">
                                     <button onClick={() => {setActiveTab('INFO'); setIsEditing(false);}} className={`flex-1 py-3 justify-center flex items-center text-[10px] font-black uppercase tracking-wider ${activeTab === 'INFO' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}><UserPlus className="w-3 h-3 mr-2"/> Dane</button>
                                     <button onClick={() => setActiveTab('DEALS')} className={`flex-1 py-3 justify-center flex items-center text-[10px] font-black uppercase tracking-wider ${activeTab === 'DEALS' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}><Briefcase className="w-3 h-3 mr-2"/> Kampanie</button>
                                     <button onClick={() => setActiveTab('NOTES')} className={`flex-1 py-3 justify-center flex items-center text-[10px] font-black uppercase tracking-wider ${activeTab === 'NOTES' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}><MessageSquare className="w-3 h-3 mr-2"/> Dziennik</button>
                                 </div>

                                 {activeTab === 'INFO' && (
                                     <div className="space-y-6 flex-1">
                                         {!isEditing ? (
                                             <>
                                                 <div className="flex gap-2">
                                                     <button onClick={openEditMode} className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-black uppercase tracking-wide flex items-center justify-center"><Edit2 className="w-3 h-3 mr-2"/> Edytuj</button>
                                                     <button onClick={handleDeleteCreator} disabled={isDeleting} className="flex-1 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-[10px] font-black uppercase tracking-wide flex items-center justify-center"><Trash2 className="w-3 h-3 mr-2"/> Usuń</button>
                                                 </div>

                                                 <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                                                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Opis / Nisza Wektorowa</p>
                                                     <p className="text-[12px] text-slate-700 font-medium leading-relaxed">{selectedCreator.demographicData?.niche || "Brak głębszych danych"}</p>
                                                 </div>

                                                 <div className="grid grid-cols-2 gap-4">
                                                     <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-2xl text-center">
                                                         <p className="text-[10px] font-black text-emerald-600/70 uppercase tracking-widest mb-1">Obserwujący</p>
                                                         <p className="text-xl font-black text-emerald-700">{(selectedCreator.followers / 1000).toFixed(1)}K</p>
                                                     </div>
                                                     <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl text-center">
                                                         <p className="text-[10px] font-black text-indigo-600/70 uppercase tracking-widest mb-1">Współpraca</p>
                                                         <p className="text-lg font-black text-indigo-700">{selectedCreator.preferredCollab}</p>
                                                     </div>
                                                 </div>

                                                 <div className="p-4 border-2 border-slate-100 rounded-2xl">
                                                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Widełki Finansowe (Szacowane AI)</p>
                                                     <div className="flex items-center justify-between">
                                                         <div className="text-center">
                                                             <p className="text-[9px] font-bold text-slate-400 uppercase">Minimum</p>
                                                             <p className="text-[15px] font-black text-slate-700">{selectedCreator.minRate || 0} PLN</p>
                                                         </div>
                                                         <div className="w-12 h-px bg-slate-200"></div>
                                                         <div className="text-center">
                                                             <p className="text-[9px] font-bold text-slate-400 uppercase">Maksimum</p>
                                                             <p className="text-[15px] font-black text-slate-700">{selectedCreator.maxRate || 0} PLN</p>
                                                         </div>
                                                     </div>
                                                 </div>
                                                 
                                                 <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center justify-between">
                                                     <div>
                                                        <p className="text-[10px] font-black text-rose-600/70 uppercase tracking-widest mb-1">Adres Kontaktowy</p>
                                                        <p className="text-[12px] font-bold text-rose-800">{selectedCreator.email || "Brak publicznego adresu email"}</p>
                                                     </div>
                                                     <Mail className="w-6 h-6 text-rose-300" />
                                                 </div>
                                                 <div className="mt-4">
                                                     {generatedBrief ? (
                                                        <div className="p-4 bg-fuchsia-50 border border-fuchsia-100 rounded-2xl relative shadow-inner">
                                                            <button onClick={() => setGeneratedBrief(null)} className="absolute top-3 right-3 text-fuchsia-400 hover:text-fuchsia-600 transition-colors"><X className="w-4 h-4"/></button>
                                                            <p className="text-[10px] font-black text-fuchsia-600 uppercase tracking-widest mb-3 flex items-center"><Star className="w-4 h-4 mr-1"/> AI Brief (48h)</p>
                                                            <p className="text-[11px] text-fuchsia-800 whitespace-pre-wrap font-medium leading-relaxed">{generatedBrief}</p>
                                                        </div>
                                                     ) : (
                                                        <button onClick={handleGenerateBrief} disabled={isGeneratingBrief} className="w-full p-4 border-2 border-fuchsia-100 border-dashed rounded-2xl flex items-center justify-center text-fuchsia-500 hover:bg-fuchsia-50 hover:border-fuchsia-200 transition-all disabled:opacity-50 group">
                                                            {isGeneratingBrief ? <Loader2 className="w-5 h-5 animate-spin"/> : <Star className="w-5 h-5 group-hover:scale-110 transition-transform"/>}
                                                            <span className="text-[11px] font-black uppercase tracking-widest ml-2">Generuj AI Brief (48h)</span>
                                                        </button>
                                                     )}
                                                 </div>
                                             </>
                                         ) : (
                                             <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
                                                 <input type="text" value={editForm.name} onChange={(e) => setEditForm({...editForm, name: e.target.value})} className="w-full p-2 text-[12px] border rounded outline-indigo-500" placeholder="Imię i Nazwisko" />
                                                 <input type="text" value={editForm.email} onChange={(e) => setEditForm({...editForm, email: e.target.value})} className="w-full p-2 text-[12px] border rounded outline-indigo-500" placeholder="E-mail" />
                                                 <input type="text" value={editForm.socialUrl} onChange={(e) => setEditForm({...editForm, socialUrl: e.target.value})} className="w-full p-2 text-[12px] border rounded outline-indigo-500" placeholder="URL Profilu" />
                                                 <input type="text" value={editForm.niche} onChange={(e) => setEditForm({...editForm, niche: e.target.value})} className="w-full p-2 text-[12px] border rounded outline-indigo-500" placeholder="Nisza / Bio" />
                                                 <div className="flex gap-2">
                                                     <div className="flex-1">
                                                        <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">ER (%)</label>
                                                        <input type="number" step="0.1" value={editForm.engagementRate} onChange={(e) => setEditForm({...editForm, engagementRate: e.target.value})} className="w-full mt-1 p-2 text-[12px] border rounded outline-indigo-500" placeholder="Zasięg Wekt." />
                                                     </div>
                                                     <div className="flex-2">
                                                        <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Widełki cenowe (PLN)</label>
                                                        <div className="flex gap-2 mt-1">
                                                            <input type="number" value={editForm.minRate} onChange={(e) => setEditForm({...editForm, minRate: e.target.value})} className="w-full p-2 text-[12px] border rounded outline-indigo-500" placeholder="Minimum" />
                                                            <input type="number" value={editForm.maxRate} onChange={(e) => setEditForm({...editForm, maxRate: e.target.value})} className="w-full p-2 text-[12px] border rounded outline-indigo-500" placeholder="Max" />
                                                        </div>
                                                     </div>
                                                 </div>
                                                 <div>
                                                    <label className="text-[9px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Tryb Komercyjny</label>
                                                    <select value={editForm.preferredCollab} onChange={(e) => setEditForm({...editForm, preferredCollab: e.target.value})} className="w-full p-2 text-[12px] border rounded outline-indigo-500">
                                                        <option value="BARTER">BARTER</option>
                                                        <option value="PAID">PAID</option>
                                                        <option value="MIXED">MIXED (Barter + Cash)</option>
                                                    </select>
                                                 </div>
                                                 <div className="flex gap-2 mt-2 pt-4 border-t border-slate-200">
                                                     <button onClick={() => setIsEditing(false)} className="flex-1 py-2 text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-[10px] font-black uppercase transition-colors">Anuluj</button>
                                                     <button onClick={handleSaveEdit} disabled={isSavingDeal} className="flex-1 py-2 text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg text-[10px] font-black uppercase flex justify-center items-center transition-colors">
                                                         {isSavingDeal ? <Loader2 className="w-3 h-3 animate-spin"/> : <Check className="w-3 h-3 mr-1"/>} Zapisz
                                                     </button>
                                                 </div>
                                             </div>
                                         )}
                                     </div>
                                 )}

                                 {activeTab === 'DEALS' && (
                                     <div className="space-y-4 flex-1">
                                         <h4 className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center"><Briefcase className="w-4 h-4 mr-2 text-indigo-500"/> Aktywne Kampanie</h4>
                                         {(!selectedCreator.deals || selectedCreator.deals.length === 0) ? (
                                             <div className="text-center py-10 opacity-60 bg-slate-50 rounded-2xl border border-slate-100">
                                                 <AlertTriangle className="w-8 h-8 text-slate-400 mx-auto mb-2"/>
                                                 <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Brak zaangażowania</p>
                                                 <p className="text-[11px] text-slate-400 mt-1">Ten twórca nie był jeszcze lokowany w projektach.</p>
                                             </div>
                                         ) : (
                                             selectedCreator.deals.map(deal => (
                                                 <div key={deal.id} className="p-4 border border-slate-200 rounded-xl bg-white shadow-sm flex justify-between items-center group hover:border-indigo-300 transition-colors">
                                                     <div>
                                                         <p className="text-[10px] text-indigo-600 font-black uppercase tracking-wider">{deal.campaign?.name || "Luzna Kampania"}</p>
                                                         <p className="text-[11px] font-black text-slate-600 mt-1 bg-slate-100 rounded-md px-2 py-0.5 inline-block">{deal.status}</p>
                                                     </div>
                                                     <div className="text-right">
                                                         <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest">Stawka Prop.</p>
                                                         <p className="text-[14px] font-black text-emerald-600">{deal.proposedFee} PLN</p>
                                                     </div>
                                                 </div>
                                             ))
                                         )}
                                     </div>
                                 )}

                                 {activeTab === 'NOTES' && (
                                     <div className="flex-1 flex flex-col overflow-hidden h-full">
                                         <h4 className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center shrink-0"><FileText className="w-4 h-4 mr-2 text-indigo-500"/> Dziennik Handlowy</h4>
                                         
                                         <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1 custom-scrollbar min-h-48">
                                             {(!selectedCreator.notes || selectedCreator.notes.length === 0) ? (
                                                 <div className="text-center py-10 opacity-60 bg-slate-50 rounded-2xl border border-slate-100 h-full flex flex-col items-center justify-center">
                                                    <MessageSquare className="w-8 h-8 text-slate-300 mb-2" />
                                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pusty Notatnik</p>
                                                 </div>
                                             ) : (
                                                 selectedCreator.notes.map(note => (
                                                     <div key={note.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 relative group animate-in slide-in-from-bottom-2 fade-in">
                                                         <p className="text-[12px] text-slate-700 font-medium leading-relaxed">{note.content}</p>
                                                         <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-2 block opacity-70 group-hover:opacity-100 transition-opacity">
                                                            Dodano: {new Date(note.createdAt).toLocaleString('pl-PL')}
                                                         </span>
                                                     </div>
                                                 ))
                                             )}
                                         </div>

                                         <div className="mt-auto shrink-0 pt-2 border-t border-slate-100">
                                             <textarea 
                                                 value={noteContent}
                                                 onChange={(e) => setNoteContent(e.target.value)}
                                                 placeholder="Wiadomość ofertowa, notatka o trudności w negocjacjach..."
                                                 className="w-full text-[12px] font-medium p-3 border border-slate-200 rounded-xl focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none resize-none h-24 shadow-inner bg-slate-50 focus:bg-white transition-all"
                                             />
                                             <button onClick={handleAddNote} className="w-full mt-2 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[11px] font-black uppercase tracking-widest transition-colors flex justify-center items-center shadow border border-indigo-700">
                                                 <Send className="w-3 h-3 mr-2"/> Wyślij wpis do LOG'u
                                             </button>
                                         </div>
                                     </div>
                                 )}
                             </div>
                         </div>
                     )}
                 </div>
             </div>
         )}

         {/* Pętla zarządzania Workflow - OPERACYJNY KANBAN */}
         <div className="flex-1 overflow-x-auto flex space-x-6 pb-4 custom-scrollbar">
             {columns.map(col => {
                 const colDeals = deals.filter(d => d.status === col);
                 return (
                 <div key={col} className="w-[380px] shrink-0 bg-slate-100/50 border border-slate-200 rounded-[2.5rem] flex flex-col overflow-hidden shadow-sm">
                     <div className="px-6 py-5 bg-white border-b border-slate-200 flex justify-between items-center z-10 shadow-sm relative">
                         <h3 className="font-black text-[12px] text-slate-800 uppercase tracking-widest flex items-center">
                             <div className="w-2 h-2 rounded-full bg-emerald-500 mr-2"></div>
                             {col}
                         </h3>
                         <span className="text-[10px] font-black bg-indigo-50 border border-indigo-100 text-indigo-500 px-3 py-1 rounded-sm">{colDeals.length} DEALS</span>
                     </div>
                     <div className="flex-1 p-4 overflow-y-auto space-y-4">
                        {colDeals.length === 0 ? (
                            <div className="p-12 text-center opacity-40 mt-10">
                                <ShieldCheck className="w-8 h-8 text-slate-700 mx-auto mb-3" />
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest max-w-[200px] mx-auto leading-relaxed">Brak rekordów transakcyjnych</p>
                            </div>
                        ) : (
                            colDeals.map(deal => (
                                <div key={deal.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-indigo-400 transition-all">
                                    <div className="flex items-center space-x-3 mb-4">
                                        {deal.influencer?.avatarUrl ? (
                                            <img src={deal.influencer.avatarUrl} className="w-10 h-10 rounded-full bg-slate-100 object-cover" alt="" />
                                        ) : (
                                            <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center font-bold text-indigo-600 z-10">
                                                {deal.influencer?.name?.charAt(0) || '?'}
                                            </div>
                                        )}
                                        <div>
                                            <h4 className="text-[12px] font-black text-slate-800">{deal.influencer?.name}</h4>
                                            <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">{deal.influencer?.preferredCollab}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <select 
                                            value={deal.status}
                                            onChange={async (e) => {
                                                try {
                                                    await axios.put(`${API_URL}/api/influencers/deals/${deal.id}/status`, { status: e.target.value }, { headers: { Authorization: `Bearer ${token}` } });
                                                    fetchDeals();
                                                } catch(err) { console.error(err); }
                                            }}
                                            className="px-3 py-1.5 border border-slate-200 rounded-lg text-[9px] font-black text-slate-600 bg-slate-50 outline-none uppercase cursor-pointer"
                                        >
                                            {columns.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                        <span className="text-[13px] font-black text-slate-700">{deal.influencer?.minRate} PLN+</span>
                                    </div>
                                </div>
                            ))
                        )}
                     </div>
                 </div>
                 );
             })}
         </div>

         {/* Modal Smart Discovery Engine */}
         {isSearchModalOpen && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
                <div className="bg-white rounded-[2rem] shadow-2xl p-8 w-full max-w-2xl border border-slate-200 translate-y-0 opacity-100 transition-all">
                   <div className="flex justify-between items-center mb-8">
                       <div>
                          <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">🔎 Smart Discovery Engine</h3>
                          <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mt-1">Sztuczna Wektoryzacja PIM (Cosine Similarity)</p>
                       </div>
                       <button onClick={() => setIsSearchModalOpen(false)} className="p-2 bg-slate-100 hover:bg-rose-100 hover:text-rose-600 rounded-full transition-colors">
                           <X className="w-5 h-5" />
                       </button>
                   </div>
                   
                   <div className="relative mb-6">
                      <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-indigo-400 w-5 h-5" />
                      <input 
                         type="text" 
                         value={searchQuery}
                         onChange={(e) => setSearchQuery(e.target.value)}
                         placeholder="Wpisz frazę wyszukiwań, np. Influencer vegan diet"
                         className="w-full pl-14 pr-4 py-4 bg-slate-50 border-2 border-indigo-100 outline-none rounded-2xl font-bold text-[13px] text-slate-700 focus:border-indigo-500 focus:bg-white transition-colors placeholder:text-slate-400"
                      />
                   </div>

                   <button 
                      onClick={handleSearchAI}
                      disabled={isSearching || !searchQuery.trim()}
                      className="w-full py-4 bg-slate-900 text-white rounded-xl font-black uppercase tracking-widest text-[11px] shadow-xl hover:bg-indigo-600 transition-colors flex items-center justify-center mb-4 disabled:opacity-50 disabled:hover:bg-slate-900"
                   >
                     {isSearching ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Tensorowe Osadzanie Wektorów (Skalowanie Gemini)...</> : 'Rozpocznij mapowanie wektorowe'}
                   </button>
                   
                   {!isSearching && searchResults.length > 0 && (
                       <div className="mt-6 border border-slate-200 bg-slate-50/50 rounded-2xl p-4 max-h-[300px] overflow-y-auto custom-scrollbar space-y-3">
                          <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-2 mb-3">Wyniki dopasowania Semantycznego AI (Cosine Similarity)</h4>
                          {searchResults.map((match, idx) => (
                             <div key={idx} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between group hover:border-indigo-300 transition-colors">
                                <div className="flex items-center space-x-4">
                                   <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-500 font-bold text-lg">
                                      {match.profile.name.charAt(0)}
                                   </div>
                                   <div>
                                      <h5 className="text-[14px] font-black text-slate-800">{match.profile.name} <span className="text-indigo-600 font-bold ml-1">{match.profile.handle}</span></h5>
                                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1"><span className="text-slate-800 font-black">{match.profile.platform}</span> • Obserwacje: {match.profile.followers.toLocaleString()}</p>
                                      <p className="text-[11px] font-medium text-slate-600 mt-1 max-w-[300px] truncate">{match.profile.demographicData.niche}</p>
                                   </div>
                                </div>
                                <div className="flex flex-col items-end">
                                   <div className="px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-md text-[13px] border border-emerald-100 font-black mb-2 flex items-center shadow-sm">
                                      <Star className="w-3 h-3 mr-1.5 fill-current" /> {match.similarity}%
                                   </div>
                                   <button className="text-[9px] font-black uppercase tracking-widest text-indigo-500 hover:text-indigo-700 flex items-center">
                                      Wprowadź do lejka <ArrowRight className="w-3 h-3 ml-1" />
                                   </button>
                                </div>
                             </div>
                          ))}
                       </div>
                   )}
                   
                   {!isSearching && searchQuery && searchResults.length === 0 && (
                       <div className="p-10 border-2 border-dashed border-slate-200 rounded-2xl text-center bg-slate-50/50">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Naciśnij guzik powyżej aby wykonać uderzenie HTTP do sieci.</p>
                       </div>
                   )}
                </div>
            </div>
         )}
      </div>
   );
};

export default InfluencerCrmView;
