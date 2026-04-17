import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Search, Loader2, Upload, Maximize2, Trash2, Edit3, Save, X, Image as ImageIcon, Briefcase, Plus, Instagram, CalendarDays, LayoutDashboard, Target, CheckCircle2, Megaphone, Calculator, Users, Leaf, PackageSearch } from 'lucide-react';

const POST_TYPES = ['Zdjęcie', 'Rozbudowana Karuzela', 'Rolka (Reels)', 'Insta Story', 'Infografika'];
const STATUSES = ['Szkic', 'Do Akceptacji', 'Zatwierdzone', 'Opublikowane'];

const MToolView = ({ token, API_URL, currentUser, campaigns }) => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Navigation State
  const [activeSubTool, setActiveSubTool] = useState('SMI');

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

  // FotoAI State
  const [fotoAiImage, setFotoAiImage] = useState(null);
  const [fotoAiStyle, setFotoAiStyle] = useState('Minimalistyczne Studio');
  const [isGeneratingFotoAi, setIsGeneratingFotoAi] = useState(false);
  const [fotoAiGenerated, setFotoAiGenerated] = useState([]);

  // B2B Calculator State
  const [products, setProducts] = useState([]);
  const [calcSelectedProduct, setCalcSelectedProduct] = useState('');
  const [calcQty, setCalcQty] = useState(100);
  const [calcMarginPercent, setCalcMarginPercent] = useState(35);

  // ECO BOM State
  const [ecoMaterials, setEcoMaterials] = useState([]);
  const [ecoLoading, setEcoLoading] = useState(false);
  const [bomSelectedProduct, setBomSelectedProduct] = useState('');
  const [bomElements, setBomElements] = useState([]);
  const [newBomMaterialId, setNewBomMaterialId] = useState('');
  const [newBomWeight, setNewBomWeight] = useState('');
  const [bomSearch, setBomSearch] = useState('');

  // Computed Values for Kalkulator (Using dynamic BOM if available)
  const selProd = products.find(p => p.id === calcSelectedProduct);
  const tcUnitBase = selProd ? (selProd.basePrice + selProd.inboundTransportCost + selProd.packagingCost + selProd.outboundTransportCost) : 0;
  // If we had dynamic boms calculated, we could use them, but we fetch them asynchronously below.
  const [dynamicBdoEprCost, setDynamicBdoEprCost] = useState(0);

  const tcUnit = tcUnitBase + dynamicBdoEprCost;
  const tcTotal = tcUnit * calcQty;
  const finalPriceUnit = selProd ? (tcUnit / (1 - (calcMarginPercent/100))) : 0;
  const finalPriceTotal = finalPriceUnit * calcQty;
  const profitUnit = finalPriceUnit - tcUnit;
  const profitTotal = profitUnit * calcQty;

  useEffect(() => {
    fetchPosts();
    // Pre-fetch ECO config for globally replacing default values
    axios.get(`${API_URL}/api/eco/materials`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setEcoMaterials(res.data)).catch(console.error);
  }, []);

  useEffect(() => {
    if ((activeSubTool === 'CALCULATOR' || activeSubTool === 'ECOBOM') && products.length === 0) {
      axios.get(`${API_URL}/api/products`, { headers: { Authorization: `Bearer ${token}` } })
        .then(res => setProducts(res.data))
        .catch(console.error);
    }
  }, [activeSubTool, API_URL, token, products.length]);

  // Hook for B2B Calc to fetch dynamic BOM
  useEffect(() => {
    if (calcSelectedProduct) {
       axios.get(`${API_URL}/api/products/${calcSelectedProduct}/bom`, { headers: { Authorization: `Bearer ${token}` } })
         .then(res => {
            const boms = res.data;
            let dynamicCost = 0;
            boms.forEach(b => {
               // weightGrams is per item. Rate is per KG. So rate * (grams / 1000)
               dynamicCost += (b.weightGrams / 1000) * b.material.ratePerKg;
            });
            setDynamicBdoEprCost(dynamicCost);
         }).catch(err => {
            console.error(err);
            // Fallback to static if failed
            const fallb = products.find(p => p.id === calcSelectedProduct);
            if(fallb) setDynamicBdoEprCost(fallb.bdoEprCost);
         });
    } else {
       setDynamicBdoEprCost(0);
    }
  }, [calcSelectedProduct]);

  // ECO BOM Handler
  const loadProductBom = async (pid) => {
    setBomElements([]);
    if (!pid) return;
    try {
      setEcoLoading(true);
      const res = await axios.get(`${API_URL}/api/products/${pid}/bom`, { headers: { Authorization: `Bearer ${token}` } });
      setBomElements(res.data);
    } catch(e) { console.error(e); } finally { setEcoLoading(false); }
  };

  const handleAddBom = async () => {
    if(!newBomMaterialId || !newBomWeight || parseFloat(newBomWeight)<=0) return alert("Podaj materiał i gramaturę!");
    try {
      await axios.post(`${API_URL}/api/products/${bomSelectedProduct}/bom`, { materialId: newBomMaterialId, weightGrams: newBomWeight }, { headers: { Authorization: `Bearer ${token}` } });
      setNewBomWeight(''); setNewBomMaterialId('');
      loadProductBom(bomSelectedProduct);
    } catch(e) { console.error(e); alert("Błąd! Może nałożono już tę frakcję?"); }
  };

  const handleRemoveBom = async (bomId) => {
    try {
      await axios.delete(`${API_URL}/api/products/${bomSelectedProduct}/bom/${bomId}`, { headers: { Authorization: `Bearer ${token}` } });
      loadProductBom(bomSelectedProduct);
    } catch(e) { console.error(e); }
  };

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

  const handleRemoveMedia = async (post, urlToRemove, indexToRemove) => {
    if (currentUser?.department === 'HANDLOWCY') return alert("Odmowa dostępu do usuwania materiałów.");
    if (!window.confirm("Potwierdź trwałe usunięcie wybranego załącznika z chmury. Komórka zostanie zaktualizowana.")) return;
    try {
      const newUrls = (post.mediaUrls || []).filter((u, i) => i !== indexToRemove);
      const newTypes = (post.mediaTypes || []).filter((t, i) => i !== indexToRemove);
      await axios.patch(`${API_URL}/api/campaigns/${post.campaignId}/smi/${post.id}`, { mediaUrls: newUrls, mediaTypes: newTypes }, { headers: { Authorization: `Bearer ${token}` } });
      fetchPosts();
    } catch (err) {
      console.error(err);
      alert("Błąd przy usuwaniu załącznika graficznego z bazy.");
    }
  };

  const openNewPostForm = () => {
    setCurrentPost({
      id: `new-${Date.now()}`,
      campaignId: campaigns && campaigns.length > 0 ? campaigns[0].id : '',
      brandLine: '', publishDate: new Date().toISOString().split('T')[0], postType: 'Zdjęcie',
      content: '', hashtags: '', notes: '', redirectUrl: '', adBudgetInfo: '', status: 'Szkic', mediaUrls: [], mediaTypes: []
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
    <div className="flex-1 flex bg-[#f8fafc] overflow-hidden">
      {/* Centrala MTool - Sidebar */}
      <div className="w-64 bg-white border-r border-slate-200 shrink-0 flex flex-col shadow-[10px_0_30px_rgba(0,0,0,0.02)] z-30 relative">
         <div className="h-20 flex flex-col justify-center px-6 border-b border-slate-100 bg-gradient-to-br from-indigo-600 to-purple-700 shrink-0">
            <h2 className="text-[16px] font-black text-white uppercase tracking-tighter flex items-center"><Target className="w-5 h-5 mr-3 opacity-80" /> MTool HQ</h2>
            <p className="text-[8px] font-black text-indigo-200 uppercase tracking-widest mt-0.5">Centrum Narzędzi Marketingo...</p>
         </div>
         <div className="p-4 space-y-2 flex-1 overflow-y-auto custom-scrollbar">
            <div className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 mt-2 px-2">Aktywne Narzędzia</div>
            <button 
              onClick={() => setActiveSubTool('SMI')}
              className={`w-full text-left px-4 py-3 rounded-sm text-[11px] font-black uppercase tracking-widest flex items-center transition-all ${activeSubTool === 'SMI' ? 'bg-indigo-50 text-indigo-600 shadow-sm border border-indigo-100' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <Instagram className={`w-4 h-4 mr-3 ${activeSubTool==='SMI'?'text-indigo-500':'text-slate-400'}`} /> Harmonogram SMI
            </button>
            <button 
              onClick={() => setActiveSubTool('ECOBOM')}
              className={`w-full text-left px-4 py-3 rounded-sm text-[11px] font-black uppercase tracking-widest flex items-center transition-all ${activeSubTool === 'ECOBOM' ? 'bg-indigo-50 text-indigo-600 shadow-sm border border-indigo-100' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <Leaf className={`w-4 h-4 mr-3 ${activeSubTool==='ECOBOM'?'text-indigo-500':'text-lime-500'}`} /> ECO BOM (ROP/BDO)
            </button>
            <button 
              onClick={() => setActiveSubTool('FOTOAI')}
              className={`w-full text-left px-4 py-3 rounded-sm text-[11px] font-black uppercase tracking-widest flex items-center transition-all mt-2 ${activeSubTool === 'FOTOAI' ? 'bg-indigo-50 text-indigo-600 shadow-sm border border-indigo-100' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <ImageIcon className={`w-4 h-4 mr-3 ${activeSubTool==='FOTOAI'?'text-indigo-500':'text-slate-400'}`} /> FotoAI (Generator)
            </button>
            <div className="pt-6 pb-2 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] px-2 flex items-center"><Loader2 className="w-3 h-3 mr-2 animate-spin"/> Wkrótce</div>
            <button 
              onClick={() => setActiveSubTool('CALCULATOR')}
              className={`w-full text-left px-4 py-3 rounded-sm text-[11px] font-black uppercase tracking-widest flex items-center transition-all ${activeSubTool === 'CALCULATOR' ? 'bg-indigo-50 text-indigo-600 shadow-sm border border-indigo-100' : 'text-slate-400 hover:bg-slate-50 opacity-70'}`}
            >
              <Calculator className={`w-4 h-4 mr-3 ${activeSubTool==='CALCULATOR'?'text-indigo-500':'text-slate-300'}`} /> Kalkulator Ofert
            </button>
            <button 
              onClick={() => setActiveSubTool('INFLUENCERS')}
              className={`w-full text-left px-4 py-3 rounded-sm text-[11px] font-black uppercase tracking-widest flex items-center transition-all ${activeSubTool === 'INFLUENCERS' ? 'bg-indigo-50 text-indigo-600 shadow-sm border border-indigo-100' : 'text-slate-400 hover:bg-slate-50 opacity-70'}`}
            >
              <Users className={`w-4 h-4 mr-3 ${activeSubTool==='INFLUENCERS'?'text-indigo-500':'text-slate-300'}`} /> Baza Influencerów
            </button>
         </div>
         <div className="p-4 border-t border-slate-100 bg-slate-50">
            <div className="text-[10px] font-bold text-slate-500 text-center uppercase tracking-widest">Wersja Modułu: 1.0</div>
         </div>
      </div>

      {/* Wybrany Pod-Moduł */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
         {activeSubTool === 'SMI' && (
            <div className="flex-1 flex flex-col bg-[#f8fafc] text-slate-900 font-sans overflow-hidden animate-in fade-in duration-300">
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

           {/* MAIN TABULAR GRID (Z "SKIN CARE KOREA" EXCELA 1:1) Z DODANYMI ZAWINRYMI TREŚCIAMI I CZARNYMI LINIAMI */}
           <div className="flex-1 bg-white overflow-auto relative custom-scrollbar">
              {loading ? (
                <div className="flex items-center justify-center h-full text-slate-400 text-xs font-black uppercase tracking-widest"><Loader2 className="w-6 h-6 animate-spin mr-3"/> Wczytywanie danych układu...</div>
              ) : filteredPosts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full opacity-50">
                  <Megaphone className="w-16 h-16 text-indigo-200 mb-4" />
                  <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Karta jest pusta</h3>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-2">Brak wyników do wyświetlenia w tabeli</p>
                </div>
              ) : (
                <div className="min-w-[1550px] border-l border-r border-black">
                   {/* KLASYCZNY NAGŁÓWEK TABELI ZABLOKOWANY PODCZAS SCROLL (STICKY) I TWARDE LINIE */}
                   <div className="sticky top-0 z-30 bg-slate-200 grid grid-cols-12 gap-0 border-b-2 border-t-2 border-black text-[9px] font-black text-slate-800 uppercase tracking-[0.2em] shadow-sm">
                      <div className="col-span-1 text-center p-3 border-r border-black flex items-center justify-center">Dodatek Media</div>
                      <div className="col-span-1 p-3 border-r border-black flex items-center">Data / Kampania</div>
                      <div className="col-span-1 p-3 border-r border-black flex items-center">Marka / Format</div>
                      <div className="col-span-3 p-3 border-r border-black flex items-center">Struktura Copywritingu (Treść)</div>
                      <div className="col-span-2 p-3 border-r border-black flex items-center">Blok Hashtagów</div>
                      <div className="col-span-2 p-3 border-r border-black flex items-center">Dystrybucja / Budżet</div>
                      <div className="col-span-1 p-3 border-r border-black flex items-center">Status</div>
                      <div className="col-span-1 p-3 flex items-center justify-end">Akcja</div>
                   </div>
                   
                   {/* WIERSZE Z CZARNYMI KRAWĘDZIAMI */}
                   <div className="flex flex-col">
                     {filteredPosts.map(p => {
                        const dateObj = new Date(p.publishDate);
                        const dayName = dateObj.toLocaleDateString('pl-PL', { weekday: 'long' });
                        const isDraft = p.status === 'Szkic';
                        
                        return (
                          <div key={p.id} className={`grid grid-cols-12 gap-0 border-b border-black transition-colors items-stretch ${isDraft ? 'bg-slate-50 opacity-80' : 'bg-white hover:bg-slate-50'}`}>
                             
                             {/* Media (ZMODYFIKOWANE: Galeria WieloZdjęciowa) */}
                             <div className="col-span-1 p-3 border-r border-black flex items-center justify-start overflow-x-auto custom-scrollbar gap-2">
                               {isUploading === p.id && (
                                 <div className="w-[65px] h-[65px] bg-slate-50 border border-slate-200 rounded-sm flex items-center justify-center shrink-0">
                                   <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                                 </div>
                               )}
                               
                               {(p.mediaUrls || []).map((url, idx) => (
                                 <div key={idx} className="w-[65px] h-[65px] bg-slate-100 border border-slate-300 rounded-sm overflow-hidden relative group shrink-0 shadow-sm flex items-center justify-center">
                                    {(p.mediaTypes && p.mediaTypes[idx] === 'VIDEO') ? (
                                      <video src={url} className="w-full h-full object-cover" />
                                    ) : (
                                      <img src={url} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                                    )}
                                    {/* Sub-akcje per-plik */}
                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5 p-1">
                                       <button onClick={(e) => { e.stopPropagation(); setLightboxUrl(url); }} className="w-full bg-white text-slate-800 hover:bg-indigo-500 hover:text-white rounded-sm shadow-sm transition-colors text-[9px] font-black uppercase tracking-widest py-0.5 tooltip" title="Zobacz Powiększenie"><Maximize2 className="w-3 h-3 mx-auto"/></button>
                                       <button onClick={(e) => { e.stopPropagation(); handleRemoveMedia(p, url, idx); }} className="w-full bg-white text-slate-800 hover:bg-rose-500 hover:text-white rounded-sm shadow-sm transition-colors text-[9px] font-black uppercase tracking-widest py-0.5 tooltip" title="Wyrzuć do kosza"><Trash2 className="w-3 h-3 mx-auto"/></button>
                                    </div>
                                 </div>
                               ))}

                               {/* Przycisk dodający kolejne/pierwsze zdjęcie niezależnie czy galeria pusta czy pełna */}
                               {(p.mediaUrls || []).length === 0 ? (
                                 <div className="w-[65px] h-[65px] border border-dashed border-slate-300 bg-slate-50 text-slate-400 hover:bg-indigo-50 hover:text-indigo-500 hover:border-indigo-300 rounded-sm cursor-pointer transition-all flex flex-col items-center justify-center shrink-0" onClick={() => triggerUpload(p.id)}>
                                    <Upload className="w-4 h-4 mb-1" />
                                    <span className="text-[6px] font-black uppercase tracking-widest text-center">Wgraj<br/>Zasób</span>
                                 </div>
                               ) : (
                                 <div className="w-[30px] h-[65px] border border-dashed border-slate-300 bg-slate-50 text-slate-400 hover:bg-indigo-50 hover:text-indigo-500 hover:border-indigo-300 rounded-sm cursor-pointer transition-all flex items-center justify-center shrink-0 tooltip" title="Dopnij kolejne zdjęcie/video" onClick={() => triggerUpload(p.id)}>
                                    <Plus className="w-4 h-4" />
                                 </div>
                               )}
                             </div>

                             {/* Data / Kampania */}
                             <div className="col-span-1 p-3 border-r border-black flex flex-col justify-start">
                               <span className="text-[12px] font-black text-slate-800">{dateObj.toLocaleDateString('pl-PL', {day:'2-digit', month:'2-digit'})}</span>
                               <span className="text-[9px] font-bold text-indigo-600 uppercase tracking-widest mt-0.5 capitalize mb-2">{dayName}</span>
                               <span className="text-[8px] font-black uppercase text-white px-1.5 py-0.5 rounded-sm line-clamp-1 w-max shadow-sm" style={{ backgroundColor: p.campaign?.color?.replace('bg-', '') || '#6366f1'}}>{p.campaign?.name || 'BRAK'}</span>
                             </div>
                             
                             {/* Marka / Format */}
                             <div className="col-span-1 p-3 border-r border-black flex flex-col justify-start">
                               <span className="text-[10px] font-black text-slate-900 uppercase tracking-tight break-words bg-slate-200 p-1.5 rounded-sm inline-block w-max mb-2 max-w-[100px] truncate shadow-sm">{p.brandLine}</span>
                               <span className="text-[8px] font-bold text-slate-600 uppercase flex items-center"><LayoutDashboard className="w-3 h-3 mr-1"/> {p.postType}</span>
                             </div>

                             {/* Treść (Naprawione zawinięcie, elastyczne bloki) */}
                             <div className="col-span-3 p-3 border-r border-black relative group">
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
                             <div className="col-span-2 p-3 border-r border-black">
                               <p className="text-[10px] font-bold text-blue-600 break-words whitespace-pre-wrap">{p.hashtags}</p>
                             </div>

                             {/* Odsyłacz / Budżet */}
                             <div className="col-span-2 p-3 border-r border-black flex flex-col space-y-3">
                               {p.redirectUrl && (
                                 <div className="break-words">
                                   <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-0.5">Odsyłamy do:</span>
                                   <span className="text-[9px] font-black text-slate-900">{p.redirectUrl}</span>
                                 </div>
                               )}
                               {p.adBudgetInfo && (
                                 <div className="bg-pink-100 p-1.5 border border-pink-200 rounded-sm shadow-sm">
                                   <span className="text-[7px] font-black text-pink-500 uppercase tracking-widest block mb-0.5">Media Budżet Plan:</span>
                                   <span className="text-[9px] font-black text-pink-800 block">{p.adBudgetInfo}</span>
                                 </div>
                               )}
                             </div>

                             {/* Status */}
                             <div className="col-span-1 p-3 border-r border-black flex flex-col items-start justify-start">
                               <span className={`px-2.5 py-1 text-[8px] font-black uppercase tracking-widest rounded-sm shadow-sm border ${
                                  p.status === 'Opublikowane' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                                  p.status === 'Zatwierdzone' ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' :
                                  p.status === 'Do Akceptacji' ? 'bg-orange-100 text-orange-700 border border-orange-200' :
                                  'bg-slate-200 text-slate-600'
                               }`}>
                                 {p.status}
                               </span>
                             </div>

                             {/* Akcje */}
                             <div className="col-span-1 p-3 flex items-start justify-end space-x-2">
                               <button onClick={() => { setCurrentPost(p); setIsEditing(true); }} className="p-2 bg-slate-100 hover:bg-indigo-100 hover:text-indigo-600 text-slate-500 rounded-sm transition-colors border border-slate-300 shadow-sm"><Edit3 className="w-4 h-4"/></button>
                               <button onClick={() => handleDelete(p.id, p.campaignId)} className="p-2 bg-slate-100 hover:bg-red-100 hover:text-red-600 text-slate-500 rounded-sm transition-colors border border-slate-300 shadow-sm"><Trash2 className="w-4 h-4"/></button>
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
       )}
         
         {activeSubTool === 'CALCULATOR' && (
            <div className="flex-1 flex flex-col bg-[#f8fafc] overflow-y-auto custom-scrollbar animate-in fade-in duration-300">
               <div className="bg-white border-b border-slate-200 shrink-0 z-20">
                  <div className="h-20 flex items-center justify-between px-8">
                     <div className="flex items-center">
                        <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-sm flex items-center justify-center shadow-lg text-white mr-5">
                           <Calculator className="w-6 h-6" />
                        </div>
                        <div>
                           <h1 className="text-xl font-black text-slate-800 uppercase tracking-tighter flex items-center">
                              MTool <span className="mx-3 text-slate-300">/</span> <span className="text-indigo-600">Kalkulator Ofert B2B</span>
                           </h1>
                           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Live Unit Economics (TC vs Profitability)</p>
                        </div>
                     </div>
                  </div>
               </div>

               <div className="flex-1 p-8 grid grid-cols-12 gap-8 max-w-[1600px] mx-auto w-full items-start">
                  {/* Sekcja Danych - Lewa */}
                  <div className="col-span-12 xl:col-span-4 space-y-6">
                     <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 w-full left-0 h-1 bg-indigo-500 relative_top_bar"></div>
                        <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6 flex items-center"><Target className="w-4 h-4 mr-2"/> Wytyczne Oferty</h3>
                        
                        <div className="space-y-5">
                           <div>
                              <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest mb-2 block">Obiekt / Produkt z PIM</label>
                              <select className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 transition-colors" value={calcSelectedProduct} onChange={e=>setCalcSelectedProduct(e.target.value)}>
                                 <option value="">-- Wybierz indeks PIM --</option>
                                 {products.map(p => <option key={p.id} value={p.id}>{p.brand?.name || ''} {p.name} [{p.sku}]</option>)}
                              </select>
                           </div>

                           <div className="grid grid-cols-2 gap-4">
                              <div>
                                 <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest mb-2 block">Zamówienie (Szt.)</label>
                                 <input type="number" min="1" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-lg font-black text-slate-800 outline-none tabular-nums focus:border-indigo-500" value={calcQty} onChange={e=>setCalcQty(parseInt(e.target.value)||0)} />
                              </div>
                              <div>
                                 <label className="text-[10px] font-black text-emerald-700 uppercase tracking-widest mb-2 block">Narzuć Marżę (%)</label>
                                 <input type="number" min="1" max="99" className="w-full p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-lg font-black text-emerald-700 outline-none tabular-nums focus:border-emerald-500 text-center" value={calcMarginPercent} onChange={e=>setCalcMarginPercent(parseFloat(e.target.value)||0)} />
                              </div>
                           </div>
                           
                           {/* Range Slider Marży */}
                           <div className="pt-2">
                             <input type="range" min="1" max="99" className="w-full accent-indigo-500" value={calcMarginPercent} onChange={e=>setCalcMarginPercent(parseFloat(e.target.value)||0)}/>
                             <div className="flex justify-between text-[9px] font-black text-slate-400 mt-1 uppercase"><span>1%</span><span>Target: 35-50%</span><span>99%</span></div>
                           </div>
                        </div>
                     </div>
                     
                     {/* Informacja statyczna z PJM */}
                     {selProd && (
                        <div className="bg-slate-900 border border-slate-800 p-8 rounded-[2rem] text-white shadow-2xl relative">
                           <div className="absolute top-8 right-8 text-slate-700"><Briefcase className="w-12 h-12"/></div>
                           <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-6 border-b border-slate-700 pb-2">Baza PIM - {selProd.sku}</h3>
                           <div className="space-y-4">
                             <div className="flex justify-between items-center text-xs">
                               <span className="font-bold text-slate-400">Stock (Zapas AI):</span>
                               <span className={`font-black uppercase tracking-wider ${selProd.stock < calcQty ? 'text-rose-500' : 'text-emerald-400'}`}>{selProd.stock} SZT</span>
                             </div>
                             <div className="flex justify-between items-center text-xs">
                               <span className="font-bold text-slate-400">Cena Detal BaseLinker:</span>
                               <span className="font-black text-white bg-slate-800 px-3 py-1 rounded-md">{selProd.salePrice.toFixed(2)} PLN</span>
                             </div>
                           </div>
                           {selProd.stock < calcQty && (
                             <div className="mt-6 p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] font-black uppercase tracking-widest rounded-lg leading-relaxed mix-blend-screen">
                               UWAGA: Nakład przewyższa zasoby! Może być konieczny import przed potwierdzeniem zlecenia.
                             </div>
                           )}
                        </div>
                     )}
                  </div>

                  {/* Wyniki Obliczeń - Prawa */}
                  <div className="col-span-12 xl:col-span-8">
                     {!selProd ? (
                        <div className="w-full h-full min-h-[400px] border-2 border-dashed border-slate-200 rounded-[2.5rem] flex flex-col items-center justify-center p-12 text-center">
                           <div className="w-24 h-24 bg-slate-50 rounded-[2rem] border border-slate-100 flex items-center justify-center mb-6 shadow-sm"><Calculator className="w-10 h-10 text-indigo-200" /></div>
                           <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter mb-2">Brak Kalibracji</h3>
                           <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest max-w-sm leading-relaxed">Wybierz produkt z lewego panelu, aby silnik Nexus Engine zasymulował ofertę B2B uwzględniając cła, podatki BDO i wysyłki.</p>
                        </div>
                     ) : (
                        <div className="grid grid-cols-2 gap-8">
                           {/* Panel TC Kosztowy */}
                           <div className="col-span-2 lg:col-span-1 bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col">
                              <h3 className="text-[10px] font-black text-rose-500 uppercase tracking-[0.2em] mb-6 flex items-center justify-between">
                                <span>Struktura Kosztów TC</span>
                                <span className="bg-rose-50 px-3 py-1 pb-1 rounded-sm border border-rose-100 text-[8px]">WYDATEK FIRMY</span>
                              </h3>
                              <div className="space-y-4 text-xs font-black uppercase tracking-widest">
                                 <div className="flex justify-between items-center text-slate-500"><span className="text-slate-400">Zakup + Cło (Baza)</span> <span className="tabular-nums text-slate-800">{(selProd.basePrice * calcQty).toFixed(2)} zł</span></div>
                                 <div className="flex justify-between items-center text-slate-500"><span className="text-slate-400">Logistyka Zewn. (Inbound)</span> <span className="tabular-nums text-slate-800">{(selProd.inboundTransportCost * calcQty).toFixed(2)} zł</span></div>
                                 <div className="flex justify-between items-center text-slate-500"><span className="text-slate-400">Materiały Pakowe</span> <span className="tabular-nums text-slate-800">{(selProd.packagingCost * calcQty).toFixed(2)} zł</span></div>
                                 <div className="flex justify-between items-center text-slate-500 focus:outline-none"><span className="text-slate-400">Haracz Środowiskowy BDO (Z BOM)</span> <span className="tabular-nums text-rose-500">{(dynamicBdoEprCost * calcQty).toFixed(2)} zł</span></div>
                                 <div className="flex justify-between items-center text-slate-500"><span className="text-slate-400">Logistyka Kraj. (Outbound)</span> <span className="tabular-nums text-slate-800">{(selProd.outboundTransportCost * calcQty).toFixed(2)} zł</span></div>
                              </div>
                              <div className="mt-auto pt-6 border-t border-slate-100 flex justify-between items-end">
                                 <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none block">Total Cost (Paczka)</div>
                                 <div className="text-2xl font-black tabular-nums text-slate-800 underline decoration-rose-300 decoration-4 -underline-offset-4">{tcTotal.toFixed(2)} zł</div>
                              </div>
                           </div>

                           {/* Panel Zysku / Propozycji */}
                           <div className="col-span-2 lg:col-span-1 bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col relative overflow-hidden">
                              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-[3rem]"></div>
                              <h3 className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] mb-6 flex items-center justify-between">
                                <span>Projekcja Dochodów</span>
                                <span className="bg-emerald-50 px-3 py-1 pb-1 rounded-sm border border-emerald-100 text-[8px]">PROFIT WYNIKOWY</span>
                              </h3>
                              <div className="flex-1 flex flex-col justify-center space-y-6">
                                 <div>
                                   <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 shadow-sm">Zysk Netto (Czysty Profit) na całości</div>
                                   <div className="text-3xl font-black tabular-nums text-emerald-500">{profitTotal.toFixed(2)} zł</div>
                                 </div>
                                 <div>
                                   <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 shadow-sm">Czysty Zysk na Sztuce</div>
                                   <div className="text-xl font-black tabular-nums text-emerald-600/80">{profitUnit.toFixed(2)} zł</div>
                                 </div>
                              </div>
                           </div>

                           {/* Wniosek Finałowy (Pełna szerokość) */}
                           <div className="col-span-2 bg-gradient-to-br from-indigo-600 to-purple-700 p-10 rounded-[2rem] text-white shadow-[0_20px_50px_rgba(79,70,229,0.3)] relative overflow-hidden">
                              <div className="absolute -right-10 -bottom-10 opacity-10 blur-sm pointer-events-none transform scale-[2]"><Calculator className="w-64 h-64 border-white/5" /></div>
                              <h3 className="text-[12px] font-black text-indigo-300 uppercase tracking-[0.3em] mb-4">Wynik Handlowy: Sugerowana Cena Sprzedaży</h3>
                              <div className="flex flex-col md:flex-row md:items-end md:justify-between relative z-10">
                                 <div className="text-6xl font-black tabular-nums tracking-tighter drop-shadow-xl">{finalPriceTotal.toFixed(2)} <span className="text-3xl text-indigo-200">zł</span></div>
                                 <div className="mt-4 md:mt-0 text-right bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/20">
                                    <div className="text-[10px] font-black uppercase tracking-widest text-indigo-200 mb-1">Dla Klienta jako (Za Sztukę):</div>
                                    <div className="text-2xl font-black tabular-nums tracking-tight">{finalPriceUnit.toFixed(2)} zł</div>
                                 </div>
                              </div>
                           </div>
                        </div>
                     )}
                  </div>
               </div>
            </div>
         )}
         
         {activeSubTool === 'ECOBOM' && (
            <div className="flex-1 flex flex-col bg-[#f8fafc] overflow-y-auto custom-scrollbar animate-in fade-in duration-300">
               <div className="bg-white border-b border-slate-200 shrink-0 z-20">
                  <div className="h-20 flex items-center justify-between px-8">
                     <div className="flex items-center">
                        <div className="w-12 h-12 bg-gradient-to-br from-lime-400 to-emerald-600 rounded-sm flex items-center justify-center shadow-lg text-white mr-5">
                           <Leaf className="w-6 h-6" />
                        </div>
                        <div>
                           <h1 className="text-xl font-black text-slate-800 uppercase tracking-tighter flex items-center">
                              MTool <span className="mx-3 text-slate-300">/</span> <span className="text-emerald-600">Nexus ECO BOM</span>
                           </h1>
                           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">EPR / BDO / Lucid / PPWR Manager</p>
                        </div>
                     </div>
                  </div>
               </div>

               <div className="flex-1 p-8 grid grid-cols-12 gap-8 max-w-[1600px] mx-auto w-full items-start">
                  {/* Sekcja BDO - Lewa */}
                  <div className="col-span-12 xl:col-span-5 space-y-6">
                     <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm relative overflow-hidden h-full min-h-[500px]">
                        <div className="absolute top-0 w-full left-0 h-1 bg-gradient-to-r from-lime-400 to-emerald-500 relative_top_bar"></div>
                        <h3 className="text-[11px] font-black text-emerald-600 bg-emerald-50 uppercase tracking-[0.2em] mb-6 flex items-center w-max p-2 px-4 rounded-lg"><Target className="w-4 h-4 mr-2"/> Stawki Organizacji Odzysku</h3>
                        
                        <div className="space-y-3 mb-6">
                           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">Poniższe stawki za kilogram frakcji definiują twardy przelicznik środowiskowy Twojego przedsiębiorstwa.</p>
                        </div>

                        <div className="space-y-4">
                           {ecoMaterials.map(m => (
                             <div key={m.id} className="flex justify-between items-center p-4 bg-slate-50 border border-slate-100 rounded-xl group hover:border-emerald-200 transition-colors">
                                 <div>
                                    <div className="text-[12px] font-black text-slate-700">{m.name}</div>
                                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">ID Frakcji: {m.id.split('-')[0]}</div>
                                 </div>
                                 <div className="flex items-center space-x-3">
                                    <span className="text-xl font-black text-emerald-600 tabular-nums">{m.ratePerKg.toFixed(2)} zł<span className="text-[10px] text-emerald-400">/kg</span></span>
                                    <button className="text-slate-300 hover:text-indigo-500 transition-colors"><Edit3 className="w-4 h-4"/></button>
                                 </div>
                             </div>
                           ))}
                           <button className="w-full p-4 border-2 border-dashed border-emerald-100 rounded-xl text-[10px] font-black text-emerald-500 uppercase tracking-widest hover:bg-emerald-50 transition-colors flex items-center justify-center">
                              <Plus className="w-4 h-4 mr-2"/> Dodaj nową frakcję cennika
                           </button>
                        </div>
                     </div>
                  </div>

                  {/* Wyniki - Prawa */}
                  <div className="col-span-12 xl:col-span-7">
                     <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm relative overflow-hidden min-h-[500px]">
                        <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6 flex items-center"><PackageSearch className="w-4 h-4 mr-2 text-indigo-400"/> Drzewo BOM Produktu (Opakowania)</h3>
                        
                        <div className="mb-8">
                           <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest mb-2 block">Szukaj Indeksu PIM (Do kalibracji BOM)</label>
                           
                           <div className="flex space-x-4 mb-3">
                               <input type="text" placeholder="Szukaj po EAN, SKU lub nazwie..." className="w-1/3 p-4 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 shadow-sm" value={bomSearch} onChange={e => setBomSearch(e.target.value)} />
                               <select className="w-2/3 p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 transition-colors shadow-sm" value={bomSelectedProduct} onChange={e=>{setBomSelectedProduct(e.target.value); loadProductBom(e.target.value);}}>
                                  <option value="">-- Wybierz produkt PIM z wyników wyszukiwania --</option>
                                  {products.filter(p => !bomSearch || (p.name?.toLowerCase().includes(bomSearch.toLowerCase()) || p.ean?.toLowerCase().includes(bomSearch.toLowerCase()) || p.sku?.toLowerCase().includes(bomSearch.toLowerCase()))).slice(0, 100).map(p => <option key={p.id} value={p.id}>{p.brand?.name || ''} {p.name} [{p.sku}]</option>)}
                               </select>
                           </div>
                        </div>

                        {!bomSelectedProduct ? (
                           <div className="w-full h-48 border-2 border-dashed border-slate-100 rounded-2xl flex flex-col items-center justify-center text-center opacity-50">
                              <Leaf className="w-10 h-10 text-slate-300 mb-3" />
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Brak kalibracji - oczekiwanie na model</p>
                           </div>
                        ) : (
                           <div className="space-y-6">
                              {/* Lista obecnych powiązań */}
                              <div>
                                 <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-widest mb-3 border-b border-slate-100 pb-2">Struktura opakowaniowa (Receptura)</h4>
                                 {ecoLoading ? (
                                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest flex items-center"><Loader2 className="w-4 h-4 mr-2 animate-spin"/> Pobieranie struktury z bazy PIM...</div>
                                 ) : bomElements.length === 0 ? (
                                    <div className="p-4 bg-orange-50 border border-orange-100 text-orange-600 text-[10px] font-black uppercase tracking-widest rounded-xl">Ten indeks nie ma sprecyzowanych żadnych materiałów pakowych! Ekologia w Kalkulatorze B2B wyniesie 0 PLN.</div>
                                 ) : (
                                    <div className="space-y-2">
                                       {bomElements.map(b => (
                                          <div key={b.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-200">
                                             <div className="flex items-center">
                                                <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm mr-3 border border-slate-100"><Leaf className="w-3 h-3 text-emerald-500"/></div>
                                                <div>
                                                   <div className="text-[11px] font-black text-slate-700">{b.material.name}</div>
                                                   <div className="text-[9px] font-bold text-slate-400">Podstawa opłaty: {b.material.ratePerKg.toFixed(2)} PLN/kg</div>
                                                </div>
                                             </div>
                                             <div className="flex items-center space-x-6">
                                                <div className="text-right">
                                                   <div className="text-sm font-black tabular-nums text-slate-800">{b.weightGrams} <span className="text-[10px] text-slate-400">gram</span></div>
                                                   <div className="text-[9px] font-black text-rose-500">+ {((b.weightGrams/1000) * b.material.ratePerKg).toFixed(4)} PLN (do haraczu)</div>
                                                </div>
                                                <button onClick={() => handleRemoveBom(b.id)} className="text-slate-400 hover:text-rose-500 transition-colors tooltip"><Trash2 className="w-4 h-4"/></button>
                                             </div>
                                          </div>
                                       ))}
                                    </div>
                                 )}
                              </div>

                              {/* Form dodawania */}
                              <div className="p-5 bg-indigo-50 border border-indigo-100 rounded-2xl">
                                 <h4 className="text-[10px] font-black text-indigo-800 uppercase tracking-widest mb-4">Dodaj Komponent Odpadowy do Drzewa</h4>
                                 <div className="grid grid-cols-12 gap-4">
                                    <div className="col-span-6">
                                       <select className="w-full p-3 bg-white border border-indigo-100 rounded-xl text-[10px] font-black text-slate-700 outline-none uppercase" value={newBomMaterialId} onChange={e=>setNewBomMaterialId(e.target.value)}>
                                          <option value="">-- Wybierz Frakcję z Listy Celnej --</option>
                                          {ecoMaterials.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
                                       </select>
                                    </div>
                                    <div className="col-span-3">
                                       <input type="number" step="0.1" placeholder="Waga (Gramy)" className="w-full p-3 bg-white border border-indigo-100 rounded-xl text-[11px] font-black text-slate-800 outline-none text-center" value={newBomWeight} onChange={e=>setNewBomWeight(e.target.value)}/>
                                    </div>
                                    <div className="col-span-3">
                                       <button onClick={handleAddBom} className="w-full p-3 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all h-full shadow-lg">Powiąż</button>
                                    </div>
                                 </div>
                              </div>
                           </div>
                        )}
                     </div>
                  </div>
               </div>
            </div>
         )}
         
         {activeSubTool === 'INFLUENCERS' && (
            <div className="flex-1 flex flex-col items-center justify-center bg-[#f8fafc] p-10 animate-in fade-in zoom-in-95 duration-500">
              <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mb-6 shadow-xl border border-slate-100">
                <Users className="w-10 h-10 text-indigo-400" />
              </div>
              <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Baza Influencerów</h2>
              <p className="text-sm font-bold text-slate-400 max-w-sm text-center mt-3 leading-relaxed">Zaawansowany zbiór profili twórców uwzględniający historyczne wyniki zasięgowe oraz wydane im paczki PR.</p>
              <div className="mt-8 px-6 py-2 bg-indigo-50 border border-indigo-100 text-indigo-600 text-[10px] font-black uppercase tracking-widest rounded-full shadow-sm">
                 Wkrótce Dostępne
              </div>
            </div>
         )}
         
         {activeSubTool === 'FOTOAI' && (
            <div className="flex-1 flex flex-col bg-[#f8fafc] overflow-y-auto custom-scrollbar animate-in fade-in duration-300">
              <div className="bg-white border-b border-slate-200 shrink-0 z-20">
                <div className="h-20 flex items-center justify-between px-8">
                    <div className="flex items-center">
                      <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-fuchsia-600 rounded-sm flex items-center justify-center shadow-lg text-white mr-5">
                        <ImageIcon className="w-6 h-6" />
                      </div>
                      <div>
                        <h1 className="text-xl font-black text-slate-800 uppercase tracking-tighter flex items-center">
                          MTool <span className="mx-3 text-slate-300">/</span> <span className="text-indigo-600">FotoAI Studio</span>
                        </h1>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Sztuczna Inteligencja Scenerii Produktowych</p>
                      </div>
                    </div>
                </div>
              </div>

              <div className="flex-1 p-8 grid grid-cols-12 gap-8 max-w-[1600px] mx-auto w-full">
                {/* Panel Boczny Konfiguracji (Lewa) */}
                <div className="col-span-12 xl:col-span-4 space-y-6">
                   <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-[0_15px_50px_rgba(0,0,0,0.03)] focus-within:ring-4 focus-within:ring-indigo-500/10 transition-all">
                      <h3 className="text-[10px] font-black text-indigo-600 bg-indigo-50 uppercase tracking-[0.2em] mb-6 p-3 rounded-lg flex items-center"><Upload className="w-4 h-4 mr-2"/> Krok 1: Kadr Referencyjny (Produkt)</h3>
                      {fotoAiImage ? (
                        <div className="relative w-full aspect-square rounded-[2rem] overflow-hidden group border border-slate-200 shadow-inner">
                          <img src={fotoAiImage} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center backdrop-blur-sm">
                             <button onClick={() => { setFotoAiImage(null); setFotoAiGenerated([]); }} className="px-6 py-4 bg-white text-rose-500 text-[10px] font-black uppercase tracking-widest rounded-xl shadow-2xl flex items-center hover:scale-105 active:scale-95 transition-all"><Trash2 className="w-4 h-4 mr-2"/> Usuń i wgraj nowy kadr</button>
                          </div>
                        </div>
                      ) : (
                        <div 
                           className="w-full aspect-square rounded-[2rem] border-2 border-dashed border-indigo-200 bg-indigo-50/50 hover:bg-indigo-50 flex flex-col items-center justify-center cursor-pointer transition-all group hover:border-indigo-400"
                           onClick={() => {
                             const input = document.createElement('input');
                             input.type = 'file';
                             input.accept = 'image/*';
                             input.onchange = (e) => {
                               if (e.target.files[0]) {
                                 setFotoAiImage(URL.createObjectURL(e.target.files[0]));
                                 setFotoAiGenerated([]);
                               }
                             };
                             input.click();
                           }}
                        >
                           <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center shadow-[0_10px_30px_rgba(99,102,241,0.15)] group-hover:scale-110 group-hover:rotate-3 transition-all mb-6 group-hover:bg-indigo-600 group-hover:text-white text-indigo-500">
                             <Upload className="w-8 h-8" />
                           </div>
                           <p className="text-sm font-black text-indigo-800 uppercase tracking-tight">Eksplorator / Drag & Drop</p>
                           <p className="text-[10px] font-bold text-indigo-400 mt-2 text-center px-8 uppercase tracking-widest leading-relaxed">Wymagany format HD.<br/>Białe tło lub przezroczystość alfa.</p>
                        </div>
                      )}
                   </div>

                   <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-[0_15px_50px_rgba(0,0,0,0.03)]">
                      <h3 className="text-[10px] font-black text-fuchsia-600 bg-fuchsia-50 uppercase tracking-[0.2em] mb-6 p-3 rounded-lg flex items-center"><Target className="w-4 h-4 mr-2"/> Krok 2: Kod Promptu / Środowisko</h3>
                      <div className="grid grid-cols-2 gap-3">
                         {[
                           { name: 'Pure White (Sklep)', icon: '🤍' },
                           { name: 'Marmurowe Spa', icon: '✨' },
                           { name: 'Natura & Rośliny', icon: '🌿' },
                           { name: 'Słoneczna Plaża', icon: '🏖️' },
                           { name: 'Neon Cyberpunk', icon: '🟣' },
                           { name: 'Cień i Światło', icon: '🌗' }
                         ].map(style => (
                           <div 
                             key={style.name}
                             onClick={() => setFotoAiStyle(style.name)}
                             className={`p-4 rounded-[1.25rem] border-2 cursor-pointer transition-all flex flex-col items-center justify-center text-center h-24 shadow-sm group hover:scale-[1.02] active:scale-[0.98] ${fotoAiStyle === style.name ? 'border-fuchsia-500 bg-fuchsia-50/50 relative overflow-hidden' : 'border-slate-100 hover:border-fuchsia-200 bg-white'}`}
                           >
                             {fotoAiStyle === style.name && <div className="absolute top-0 right-0 w-8 h-8 bg-fuchsia-500 flex items-center justify-center rounded-bl-xl shadow-md"><CheckCircle2 className="w-4 h-4 text-white" /></div>}
                             <span className="text-2xl mb-2 drop-shadow-sm group-hover:scale-110 transition-transform">{style.icon}</span>
                             <span className={`text-[9px] font-black uppercase tracking-widest leading-tight ${fotoAiStyle === style.name ? 'text-fuchsia-700' : 'text-slate-500'}`}>{style.name}</span>
                           </div>
                         ))}
                      </div>
                   </div>

                   <button 
                     disabled={!fotoAiImage || !fotoAiStyle || isGeneratingFotoAi}
                     onClick={() => {
                       setIsGeneratingFotoAi(true);
                       setFotoAiGenerated([]);
                       setTimeout(() => {
                         const mocks = Array.from({length: 10}).map((_, i) => `https://picsum.photos/seed/${Math.random()}/800/800`);
                         setFotoAiGenerated(mocks);
                         setIsGeneratingFotoAi(false);
                       }, 4500);
                     }}
                     className="w-full py-6 bg-slate-900 text-white rounded-[2rem] text-[11px] font-black uppercase tracking-[0.2em] hover:bg-slate-800 hover:scale-[1.02] shadow-[0_20px_40px_rgba(0,0,0,0.15)] transition-all disabled:opacity-50 disabled:hover:scale-100 disabled:hover:bg-slate-900 disabled:shadow-none flex items-center justify-center active:scale-95 group border-2 border-transparent focus:border-indigo-400 outline-none"
                   >
                     {isGeneratingFotoAi ? (
                        <><Loader2 className="w-5 h-5 mr-3 animate-spin"/> Syntezowanie AI...</>
                     ) : (
                        <><ImageIcon className="w-5 h-5 mr-3 group-hover:scale-125 transition-transform"/> Generuj Warianty HD</>
                     )}
                   </button>
                </div>

                {/* Sekcja Wyników (Prawa) */}
                <div className="col-span-12 xl:col-span-8 flex flex-col min-h-[700px]">
                   <div className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-[0_15px_50px_rgba(0,0,0,0.03)] h-full flex flex-col relative overflow-hidden">
                      {isGeneratingFotoAi && (
                           <div className="absolute inset-0 bg-white/90 backdrop-blur-xl z-30 flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-700">
                              <div className="relative flex items-center justify-center mb-8">
                                 <div className="absolute w-40 h-40 border-4 border-indigo-100 rounded-full animate-ping opacity-60"></div>
                                 <div className="absolute w-56 h-56 border-2 border-fuchsia-50 rounded-full animate-[spin_3s_linear_infinite]"></div>
                                 <div className="w-24 h-24 bg-gradient-to-tr from-indigo-500 to-fuchsia-500 rounded-3xl flex items-center justify-center shadow-2xl animate-pulse">
                                    <ImageIcon className="w-10 h-10 text-white" />
                                 </div>
                              </div>
                              <h4 className="text-2xl font-black text-slate-800 uppercase tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-fuchsia-600">Model Przetwarza Żądanie</h4>
                              <p className="text-[10px] font-black text-slate-400 tracking-[0.3em] uppercase mt-3">Skalowanie Tensorowe w chmurze...</p>
                              <div className="mt-12 w-80 h-3 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200">
                                 <div className="h-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 rounded-full w-[0%] animate-[progress_4.5s_ease-out_forwards]"></div>
                              </div>
                           </div>
                       )}

                      <div className="flex items-center justify-between mb-8 pb-6 border-b border-slate-100 shrink-0 relative z-20">
                         <h3 className="text-[12px] font-black text-slate-800 uppercase tracking-[0.2em] flex items-center"><ImageIcon className="w-5 h-5 mr-3 text-emerald-500"/> Siatka Wynikowa AI</h3>
                         {fotoAiGenerated.length > 0 && <span className="bg-emerald-50 text-emerald-600 px-5 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest border border-emerald-100 flex items-center shadow-sm animate-in slide-in-from-right"><CheckCircle2 className="w-4 h-4 mr-2"/> Wygenerowano Pomyślnie</span>}
                      </div>

                      <div className="flex-1 relative z-20 overflow-y-auto custom-scrollbar -mr-4 pr-4">
                         {fotoAiGenerated.length > 0 ? (
                           <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                              {fotoAiGenerated.map((url, i) => (
                                <div key={i} className="aspect-square bg-slate-100 rounded-[1.5rem] overflow-hidden group relative shadow-md border border-slate-200 hover:shadow-2xl hover:shadow-indigo-500/20 transition-all duration-300 transform hover:-translate-y-1">
                                   <img src={url} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                                   <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-all flex flex-col justify-end p-4 backdrop-blur-[2px]">
                                      <div className="space-y-2 translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                                        <button onClick={() => setLightboxUrl(url)} className="w-full py-2.5 bg-white text-slate-900 rounded-lg text-[9px] font-black uppercase tracking-[0.1em] hover:bg-indigo-500 hover:text-white transition-colors shadow-lg active:scale-95 flex items-center justify-center"><Maximize2 className="w-3 h-3 mr-2"/> Zbliżenie</button>
                                        <button className="w-full py-2.5 bg-indigo-600 text-white rounded-lg text-[9px] font-black uppercase tracking-[0.1em] hover:bg-emerald-500 transition-colors shadow-lg active:scale-95 flex items-center justify-center"><Instagram className="w-3 h-3 mr-2"/> Do MTool Hub</button>
                                      </div>
                                   </div>
                                   <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-md text-slate-900 w-8 h-8 flex items-center justify-center rounded-lg text-[10px] font-black shadow-md border border-slate-200/50">V{i+1}</div>
                                </div>
                              ))}
                           </div>
                         ) : (
                           <div className="w-full h-full flex flex-col items-center justify-center opacity-40">
                              <div className="w-32 h-32 bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2rem] flex items-center justify-center mb-6 shadow-inner"><ImageIcon className="w-12 h-12 text-slate-300" /></div>
                              <h4 className="text-2xl font-black text-slate-800 uppercase tracking-tighter mb-3">Model W Stanie Uśpienia</h4>
                              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.2em] text-center max-w-md leading-relaxed">Agent AI czeka na plik wejściowy oraz wytyczne środowiskowe. Załącz produkt, aby rozpocząć proces.</p>
                           </div>
                         )}
                      </div>
                   </div>
                </div>
              </div>
            </div>
          )}
      </div>
    </div>
  );
};

export default MToolView;
