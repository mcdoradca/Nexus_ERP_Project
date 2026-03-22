import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Search, Loader2, Upload, Maximize2, Trash2, Edit3, Save, X, Image as ImageIcon, Briefcase, Plus, Instagram, CalendarDays, LayoutDashboard, Target, CheckCircle2, Megaphone } from 'lucide-react';

const POST_TYPES = ['Zdjęcie', 'Rozbudowana Karuzela', 'Rolka (Reels)', 'Insta Story', 'Infografika'];
const STATUSES = ['Szkic', 'Do Akceptacji', 'Zatwierdzone', 'Opublikowane'];

const MToolView = ({ token, API_URL, currentUser, campaigns }) => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters state
  const [filters, setFilters] = useState({
    campaignName: '',
    brandLine: '',
    publishDate: '',
    postType: '',
    content: '',
    status: ''
  });

  // Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [currentPost, setCurrentPost] = useState(null);

  // Upload State
  const [isUploading, setIsUploading] = useState(null); // trzyma ID posta
  const fileInputRef = useRef(null);

  // Lightbox State
  const [lightboxUrl, setLightboxUrl] = useState(null);

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/campaigns/smi/all`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPosts(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filteredPosts = posts.filter(p => {
    const matchCampaign = !filters.campaignName || p.campaign?.name.toLowerCase().includes(filters.campaignName.toLowerCase());
    const matchBrand = !filters.brandLine || p.brandLine?.toLowerCase().includes(filters.brandLine.toLowerCase());
    const matchDate = !filters.publishDate || p.publishDate?.includes(filters.publishDate);
    const matchType = !filters.postType || p.postType?.toLowerCase().includes(filters.postType.toLowerCase());
    const matchContent = !filters.content || p.content?.toLowerCase().includes(filters.content.toLowerCase()) || p.hashtags?.toLowerCase().includes(filters.content.toLowerCase());
    const matchStatus = !filters.status || p.status?.toLowerCase().includes(filters.status.toLowerCase());
    return matchCampaign && matchBrand && matchDate && matchType && matchContent && matchStatus;
  });

  const handleFilterChange = (key, value) => setFilters(prev => ({ ...prev, [key]: value }));

  const handleSave = async (e) => {
    e.preventDefault();
    if (currentUser?.department === 'HANDLOWCY') return alert("Tylko Marketing i Zarząd mogą edytować harmonogram SMI.");
    if (!currentPost.campaignId) return alert("Musisz wybrać kampanię do której należy wpis!");
    
    try {
      if (currentPost.id && !currentPost.id.startsWith('new-')) {
        await axios.patch(`${API_URL}/api/campaigns/${currentPost.campaignId}/smi/${currentPost.id}`, currentPost, { headers: { Authorization: `Bearer ${token}` } });
      } else {
        await axios.post(`${API_URL}/api/campaigns/${currentPost.campaignId}/smi`, currentPost, { headers: { Authorization: `Bearer ${token}` } });
      }
      setIsEditing(false);
      setCurrentPost(null);
      fetchPosts();
    } catch (err) {
      console.error(err);
      alert("Błąd zapisu posta.");
    }
  };

  const handleDelete = async (postId, campaignId) => {
    if (currentUser?.department === 'HANDLOWCY') return alert("Odmowa dostępu");
    if (!window.confirm("Na pewno chcesz usunąć ten rzut z harmonogramu?")) return;
    try {
      await axios.delete(`${API_URL}/api/campaigns/${campaignId}/smi/${postId}`, { headers: { Authorization: `Bearer ${token}` } });
      fetchPosts();
    } catch (err) {
      console.error(err);
      alert("Błąd przy usuwaniu.");
    }
  };

  const openNewPostForm = () => {
    setCurrentPost({
      id: `new-${Date.now()}`,
      campaignId: campaigns && campaigns.length > 0 ? campaigns[0].id : '',
      brandLine: '', publishDate: new Date().toISOString().split('T')[0], postType: 'Zdjęcie',
      content: '', hashtags: '', notes: '', redirectUrl: '', adBudgetInfo: '', status: 'Szkic', mediaUrl: null
    });
    setIsEditing(true);
  };

  const triggerUpload = (postId) => {
    setEditingPostIdForUpload(postId);
    fileInputRef.current?.click();
  };

  const [editingPostIdForUpload, setEditingPostIdForUpload] = useState(null);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !editingPostIdForUpload) return;
    
    const post = posts.find(p => p.id === editingPostIdForUpload);
    if (!post || post.id.startsWith('new-')) return alert("Wgrać plik możesz tylko do już ZAPISANEGO rzutu. Zapisz wpis najpierw.");

    const formData = new FormData();
    formData.append('file', file);

    setIsUploading(editingPostIdForUpload);
    try {
      await axios.post(`${API_URL}/api/campaigns/${post.campaignId}/smi/${post.id}/media`, formData, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
      });
      fetchPosts();
    } catch (err) {
      console.error(err);
      alert("Błąd uploadu mediów.");
    } finally {
      setIsUploading(null);
      e.target.value = null; // reset
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-[#f8fafc] text-slate-900 font-sans overflow-hidden">
      
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*,video/*" onChange={handleFileUpload} />

      {lightboxUrl && (
        <div className="fixed inset-0 bg-slate-900/90 z-[300] flex items-center justify-center p-4 backdrop-blur-md cursor-pointer" onClick={() => setLightboxUrl(null)}>
           <img src={lightboxUrl} className="max-w-[90vw] max-h-[90vh] object-contain rounded-md shadow-2xl" />
        </div>
      )}

      {/* HEADER Z FILTRAMI (Odtworzony z pierwotnej idei) */}
      <div className="bg-white border-b border-slate-200 shrink-0 z-20">
        <div className="h-20 flex items-center justify-between px-8">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-sm flex items-center justify-center shadow-lg text-white mr-5">
                <Instagram className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-black text-slate-800 uppercase tracking-tighter flex items-center">
                  MTool <span className="mx-3 text-slate-300">/</span> <span className="text-indigo-600">Globalny Harmonogram SMI</span>
                </h1>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Struktura danych "Skin Care Korea"</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <button onClick={openNewPostForm} className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-sm text-[10px] font-black uppercase tracking-widest shadow-xl flex items-center transition-all">
                  <Plus className="w-4 h-4 mr-2" /> Dodaj Rzut Treści
              </button>
            </div>
        </div>

        {/* PASEK FILTRÓW */}
        <div className="px-8 py-3 bg-slate-50 flex items-center space-x-4 border-t border-slate-100 overflow-x-auto">
           <div className="flex items-center"><Search className="w-4 h-4 text-slate-400 mr-2"/><span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mr-2">Filtry:</span></div>
           <input className="px-3 py-1.5 text-[10px] bg-white border border-slate-200 rounded-sm outline-none font-bold" placeholder="Data..." type="date" value={filters.publishDate} onChange={e=>handleFilterChange('publishDate', e.target.value)} />
           <input className="px-3 py-1.5 text-[10px] bg-white border border-slate-200 rounded-sm outline-none font-bold placeholder:font-normal" placeholder="Kampania..." value={filters.campaignName} onChange={e=>handleFilterChange('campaignName', e.target.value)} />
           <input className="px-3 py-1.5 text-[10px] bg-white border border-slate-200 rounded-sm outline-none font-bold placeholder:font-normal" placeholder="Odłam / Marka..." value={filters.brandLine} onChange={e=>handleFilterChange('brandLine', e.target.value)} />
           <select className="px-3 py-1.5 text-[10px] bg-white border border-slate-200 rounded-sm outline-none font-bold uppercase" value={filters.postType} onChange={e=>handleFilterChange('postType', e.target.value)}>
             <option value="">Wszystkie Typy</option>
             {POST_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
           </select>
           <select className="px-3 py-1.5 text-[10px] bg-white border border-slate-200 rounded-sm outline-none font-bold uppercase" value={filters.status} onChange={e=>handleFilterChange('status', e.target.value)}>
             <option value="">Wszystkie Statusy</option>
             {STATUSES.map(t=><option key={t} value={t}>{t}</option>)}
           </select>
           <input className="px-3 py-1.5 text-[10px] bg-white border border-slate-200 rounded-sm outline-none font-bold placeholder:font-normal" placeholder="Słowo z Treści..." value={filters.content} onChange={e=>handleFilterChange('content', e.target.value)} />
        </div>
      </div>

      {/* WORKSPACE BODY */}
      <div className="flex-1 flex overflow-hidden">
          
          {/* SLIDE-IN EDYTOR (1:1 Jak wcześniej) */}
           {isEditing && currentPost && (
             <div className="w-[450px] bg-white border-r border-slate-200 flex flex-col shrink-0 animate-in slide-in-from-left duration-300 shadow-[10px_0_30px_rgba(0,0,0,0.03)] z-10 relative">
               <div className="h-16 border-b border-slate-100 flex items-center justify-between px-6 bg-slate-50 shrink-0">
                  <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">{currentPost.id && !currentPost.id.startsWith('new-') ? 'Edytor Wpisu' : 'Nowy Wpis Rozpiski'}</h3>
                  <button onClick={() => setIsEditing(false)} className="text-slate-400 hover:text-red-500 transition-colors"><X className="w-4 h-4"/></button>
               </div>
               <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center">Przypisz Kampanię</label>
                    <select className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-sm text-[11px] font-black focus:bg-white outline-none" value={currentPost.campaignId} onChange={e=>setCurrentPost({...currentPost, campaignId: e.target.value})} required>
                      <option value="">-- Wybierz kampanię --</option>
                      {campaigns?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center"><Target className="w-3 h-3 mr-1.5"/> Marka / Produkt (Linia)</label>
                    <input className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-sm text-[11px] font-black focus:bg-white focus:border-indigo-400 outline-none" value={currentPost.brandLine || ''} onChange={e=>setCurrentPost({...currentPost, brandLine: e.target.value})} placeholder="np. Trimay / Jelly Ko" required />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center"><CalendarDays className="w-3 h-3 mr-1.5"/> Data Emisji</label>
                      <input type="date" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-sm text-[11px] font-black focus:bg-white flex outline-none" value={currentPost.publishDate ? currentPost.publishDate.split('T')[0] : ''} onChange={e=>setCurrentPost({...currentPost, publishDate: e.target.value})} required />
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex"><LayoutDashboard className="w-3 h-3 mr-1.5"/> Typ / Format</label>
                      <select className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-black focus:bg-white outline-none uppercase" value={currentPost.postType || ''} onChange={e=>setCurrentPost({...currentPost, postType: e.target.value})}>
                        {POST_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Kluczowy Opis / Treść (Copy)</label>
                    <textarea rows={6} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-sm text-[11px] leading-relaxed resize-y focus:bg-white outline-none focus:border-indigo-400" value={currentPost.content || ''} onChange={e=>setCurrentPost({...currentPost, content: e.target.value})} placeholder="Cześć! Właśnie otwiera się..." />
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-1.5">Blok '# Hashtagów'</label>
                    <textarea rows={2} className="w-full p-3 bg-blue-50/50 border border-blue-100 rounded-sm text-[10px] text-blue-600 font-bold resize-none outline-none focus:border-blue-400" value={currentPost.hashtags || ''} onChange={e=>setCurrentPost({...currentPost, hashtags: e.target.value})} placeholder="#Trimy #KBeauty..." />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Gdzie odsyłamy (Sklep)</label>
                      <input className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-black outline-none" value={currentPost.redirectUrl || ''} onChange={e=>setCurrentPost({...currentPost, redirectUrl: e.target.value})} placeholder="np. ZIKO DERMO" />
                    </div>
                    <div>
                      <label className="text-[8px] font-black text-pink-500 uppercase tracking-widest mb-1.5">Budżet Posta</label>
                      <input className="w-full px-3 py-2 bg-pink-50/50 border border-pink-100 rounded-sm text-[10px] font-black text-pink-700 outline-none" value={currentPost.adBudgetInfo || ''} onChange={e=>setCurrentPost({...currentPost, adBudgetInfo: e.target.value})} placeholder="np. 400 zł Stories" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-orange-400 uppercase tracking-widest mb-1.5">Uwagi wewn.</label>
                    <textarea rows={2} className="w-full p-3 bg-orange-50 border border-orange-100 rounded-sm text-[10px] font-bold text-orange-800 resize-none outline-none focus:border-orange-400" value={currentPost.notes || ''} onChange={e=>setCurrentPost({...currentPost, notes: e.target.value})} placeholder="np. Zamiast prosto z Seulu dajmy..." />
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex"><CheckCircle2 className="w-3 h-3 mr-1.5"/> Status Wpisu</label>
                    <select className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-black focus:bg-white outline-none uppercase" value={currentPost.status || ''} onChange={e=>setCurrentPost({...currentPost, status: e.target.value})}>
                      {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <button type="submit" className="w-full py-4 bg-slate-900 hover:bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-sm transition-all flex items-center justify-center mt-4">
                     <Save className="w-4 h-4 mr-2" /> Zapisz wpis
                  </button>
               </form>
             </div>
           )}

           {/* MAIN TABULAR GRID (Z "SKIN CARE KOREA" EXCELA 1:1) Z DODANYMI ZAWINRYMI TREŚCIAMI */}
           <div className="flex-1 bg-white overflow-auto p-8 relative custom-scrollbar">
              {loading ? (
                <div className="flex items-center justify-center h-full text-slate-400 text-xs font-black uppercase tracking-widest"><Loader2 className="w-6 h-6 animate-spin mr-3"/> Wczytywanie danych układu...</div>
              ) : filteredPosts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full opacity-50">
                  <Megaphone className="w-16 h-16 text-indigo-200 mb-4" />
                  <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Karta jest pusta</h3>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-2">Brak wyników do wyświetlenia w tabeli</p>
                </div>
              ) : (
                <div className="min-w-[1550px]">
                   {/* KLASYCZNY NAGŁÓWEK TABELI 1:1 JAK EXCEL W SmiWorkspaceModal */}
                   <div className="grid grid-cols-12 gap-4 pb-4 border-b-2 border-slate-900 mb-4 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">
                      <div className="col-span-1 text-center">Dodatek Media</div>
                      <div className="col-span-1">Data / Kampania</div>
                      <div className="col-span-1">Marka / Format</div>
                      <div className="col-span-3">Struktura Copywritingu (Treść)</div>
                      <div className="col-span-2">Blok Hashtagów</div>
                      <div className="col-span-2">Dystrybucja / Budżet</div>
                      <div className="col-span-1">Status</div>
                      <div className="col-span-1 text-right">Akcja</div>
                   </div>
                   
                   {/* WIERSZE */}
                   <div className="space-y-4">
                     {filteredPosts.map(p => {
                        const dateObj = new Date(p.publishDate);
                        const dayName = dateObj.toLocaleDateString('pl-PL', { weekday: 'long' });
                        const isDraft = p.status === 'Szkic';
                        
                        return (
                          <div key={p.id} className={`grid grid-cols-12 gap-4 p-4 rounded-sm border transition-shadow items-start ${isDraft ? 'bg-slate-50/50 border-slate-200 border-dashed' : 'bg-white border-slate-100 shadow-sm hover:shadow-lg'}`}>
                             
                             {/* Media (NOWE: Kliknij aby powiększyć) */}
                             <div className="col-span-1 flex justify-center">
                               <div className="w-[65px] h-[65px] bg-slate-100 border border-slate-200 rounded-sm overflow-hidden relative group cursor-pointer flex items-center justify-center" onClick={() => p.mediaUrl ? setLightboxUrl(p.mediaUrl) : triggerUpload(p.id)}>
                                  {isUploading === p.id ? (
                                    <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                                  ) : p.mediaUrl ? (
                                    <>
                                      {p.mediaType === 'VIDEO' ? (
                                        <video src={p.mediaUrl} className="w-full h-full object-cover" />
                                      ) : (
                                        <img src={p.mediaUrl} className="w-full h-full object-cover hover:scale-110 transition-transform" />
                                      )}
                                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"><Maximize2 className="w-4 h-4"/></div>
                                    </>
                                  ) : (
                                    <div className="text-slate-300 group-hover:text-indigo-500 transition-colors tooltip flex flex-col items-center">
                                      <Upload className="w-4 h-4" />
                                      <span className="text-[6px] font-black uppercase tracking-widest mt-1">Wgraj</span>
                                    </div>
                                  )}
                               </div>
                             </div>

                             {/* Data / Kampania */}
                             <div className="col-span-1 flex flex-col">
                               <span className="text-[12px] font-black text-slate-800">{dateObj.toLocaleDateString('pl-PL', {day:'2-digit', month:'2-digit'})}</span>
                               <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest mt-0.5 capitalize mb-2">{dayName}</span>
                               <span className="text-[8px] font-black uppercase text-white px-1.5 py-0.5 rounded-sm line-clamp-1 w-max" style={{ backgroundColor: p.campaign?.color?.replace('bg-', '') || '#6366f1'}}>{p.campaign?.name || 'BRAK'}</span>
                             </div>
                             
                             {/* Marka / Format */}
                             <div className="col-span-1 flex flex-col">
                               <span className="text-[10px] font-black text-slate-900 uppercase tracking-tight break-words bg-slate-100 p-1.5 rounded-sm inline-block w-max mb-2 max-w-[100px] truncate">{p.brandLine}</span>
                               <span className="text-[8px] font-bold text-slate-500 uppercase flex items-center"><LayoutDashboard className="w-3 h-3 mr-1"/> {p.postType}</span>
                             </div>

                             {/* Treść (Naprawione zawinięcie, elastyczne bloki) */}
                             <div className="col-span-3 relative group">
                               {/* POPRAWKA: break-words, whitespace-pre-wrap, overflow ukryty ale pozwala na scrool w ramce lub rozciaga wgniatajac sie w grid */}
                               <div className="text-[11px] text-slate-700 font-medium whitespace-pre-wrap break-words leading-relaxed max-h-[120px] overflow-y-auto custom-scrollbar pr-2">
                                  {p.content}
                               </div>
                               {p.notes && (
                                 <div className="mt-3 p-1.5 bg-orange-50 border-l-2 border-orange-400 text-[9px] font-bold text-orange-800 rounded-r-sm break-words">
                                   <span className="uppercase tracking-widest text-[7px] block mb-0.5 opacity-70">Ustalenia / Uwagi</span>
                                   {p.notes}
                                 </div>
                               )}
                             </div>

                             {/* Hashtagi */}
                             <div className="col-span-2">
                               <p className="text-[10px] font-bold text-blue-500 break-words whitespace-pre-wrap">{p.hashtags}</p>
                             </div>

                             {/* Odsyłacz / Budżet */}
                             <div className="col-span-2 flex flex-col space-y-3">
                               {p.redirectUrl && (
                                 <div className="break-words">
                                   <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Odsyłamy do:</span>
                                   <span className="text-[9px] font-black text-slate-800">{p.redirectUrl}</span>
                                 </div>
                               )}
                               {p.adBudgetInfo && (
                                 <div className="bg-pink-50 p-1.5 border border-pink-100 rounded-sm">
                                   <span className="text-[7px] font-black text-pink-400 uppercase tracking-widest block mb-0.5">Media Budżet Plan:</span>
                                   <span className="text-[9px] font-black text-pink-700 block">{p.adBudgetInfo}</span>
                                 </div>
                               )}
                             </div>

                             {/* Status */}
                             <div className="col-span-1 flex flex-col items-start pt-1">
                               <span className={`px-2.5 py-1 text-[8px] font-black uppercase tracking-widest rounded-sm ${
                                  p.status === 'Opublikowane' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                                  p.status === 'Zatwierdzone' ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' :
                                  p.status === 'Do Akceptacji' ? 'bg-orange-100 text-orange-700 border border-orange-200' :
                                  'bg-slate-200 text-slate-600'
                               }`}>
                                 {p.status}
                               </span>
                             </div>

                             {/* Akcje */}
                             <div className="col-span-1 flex items-start justify-end space-x-2 pt-1">
                               <button onClick={() => { setCurrentPost(p); setIsEditing(true); }} className="p-2 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-600 text-slate-400 rounded-sm transition-colors border border-slate-100"><Edit3 className="w-4 h-4"/></button>
                               <button onClick={() => handleDelete(p.id, p.campaignId)} className="p-2 bg-slate-50 hover:bg-red-50 hover:text-red-500 text-slate-400 rounded-sm transition-colors border border-slate-100"><Trash2 className="w-4 h-4"/></button>
                             </div>
                          </div>
                        )
                     })}
                   </div>
                   {/* KONIEC WIERSZY */}

                </div>
              )}
           </div>
      </div>
    </div>
  );
};

export default MToolView;
