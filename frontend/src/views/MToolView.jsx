import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Search, Loader2, Upload, Maximize2, Trash2, Edit3, Save, X, Image as ImageIcon, Briefcase, Plus, Instagram, CalendarDays, LayoutDashboard, Target, CheckCircle2, Megaphone, Calculator, Users, Leaf, PackageSearch, Filter, Menu, ChevronLeft } from 'lucide-react';
import InfluencerCrmView from './InfluencerCrmView';
import { OfferOptimizerView } from './OfferOptimizer/OfferOptimizerView';

const POST_TYPES = ['Zdjęcie', 'Rozbudowana Karuzela', 'Rolka (Reels)', 'Insta Story', 'Infografika'];
const STATUSES = ['Szkic', 'Do Akceptacji', 'Zatwierdzone', 'Opublikowane'];

const MToolView = ({ token, API_URL, currentUser, campaigns }) => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Navigation State
  const [activeSubTool, setActiveSubTool] = useState('SMI');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const handleToolSelect = (tool) => {
    setActiveSubTool(tool);
    setIsSidebarOpen(false);
  };

  // Filters state
  const [filters, setFilters] = useState({
    campaignName: '',
    brandLine: '',
    publishDate: '',
    postType: '',
    content: '',
    status: ''
  });
  // UI Toggles
  const [showFilters, setShowFilters] = useState(false);
  const [showAiOrchestrator, setShowAiOrchestrator] = useState(false);

  // Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [currentPost, setCurrentPost] = useState(null);

  // AI Auto-Orchestrator State
  const [smiAutoPrompt, setSmiAutoPrompt] = useState("");
  const [smiAutoCampaignId, setSmiAutoCampaignId] = useState("");
  const [isSmiAutoGenerating, setIsSmiAutoGenerating] = useState(false);

  // Upload State
  const [isUploading, setIsUploading] = useState(null); // trzyma ID posta
  const fileInputRef = useRef(null);

  // Lightbox State
  const [lightboxUrl, setLightboxUrl] = useState(null);

  // FotoAI State
  const [fotoAiFile, setFotoAiFile] = useState(null);
  const [fotoAiImage, setFotoAiImage] = useState(null);
  const [fotoAiPrompt, setFotoAiPrompt] = useState('');
  const [fotoAiNumResults, setFotoAiNumResults] = useState(4);
  const [isGeneratingFotoAi, setIsGeneratingFotoAi] = useState(false);
  const [fotoAiGenerated, setFotoAiGenerated] = useState([]);

  // B2B/B2C Advanced Calculator State
  const [products, setProducts] = useState([]);
  const [calcSelectedProduct, setCalcSelectedProduct] = useState('');
  const [calcQty, setCalcQty] = useState(100);
  const [calcMarginPercent, setCalcMarginPercent] = useState(35);
  
  const [calcMode, setCalcMode] = useState('B2B');
  const [calcVatRate, setCalcVatRate] = useState(23);
  const [calcMarketplaceComm, setCalcMarketplaceComm] = useState(12);
  const [calcAcos, setCalcAcos] = useState(8);
  const [calcReturnRate, setCalcReturnRate] = useState(5);
  const [calcFulfillment, setCalcFulfillment] = useState(6);
  const [calcRetroBonus, setCalcRetroBonus] = useState(5);
  const [calcTradeMarketing, setCalcTradeMarketing] = useState(2);
  const [calcFactoring, setCalcFactoring] = useState(1);

  // New Strategy State
  const [calcStrategy, setCalcStrategy] = useState('TARGET_MARGIN'); // 'TARGET_MARGIN' or 'FIXED_PRICE'
  const [calcFixedPrice, setCalcFixedPrice] = useState(100);


  // PIM Search Dropdown State
  const [pimSearchTerm, setPimSearchTerm] = useState('');
  const [isPimDropdownOpen, setIsPimDropdownOpen] = useState(false);
  const pimDropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (pimDropdownRef.current && !pimDropdownRef.current.contains(event.target)) {
        setIsPimDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredPimProducts = products.filter(p => {
    if(!pimSearchTerm) return true;
    const term = pimSearchTerm.toLowerCase();
    return (p.name && p.name.toLowerCase().includes(term)) || 
           (p.ean && p.ean.toLowerCase().includes(term)) || 
           (p.sku && p.sku.toLowerCase().includes(term));
  });

  // Overhead Cost State
  const [calcMonthlyFixedCosts, setCalcMonthlyFixedCosts] = useState(15000);
  const [calcMonthlySalesVolume, setCalcMonthlySalesVolume] = useState(5000);

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

  const calcOverheadUnit = calcMonthlySalesVolume > 0 ? (calcMonthlyFixedCosts / calcMonthlySalesVolume) : 0;
  const calcAiImageUnit = (selProd && calcQty > 0) ? ((selProd.aiImageCost || 0) / calcQty) : 0;
  const rawTcUnit = tcUnitBase + dynamicBdoEprCost + calcOverheadUnit + calcAiImageUnit;

  let calcSellingFeesPercent = 0;
  let calcFixedSellingFees = 0;
  let vatRateMultiplier = 1 + (parseFloat(calcVatRate)||0) / 100;
  
  if (calcMode === 'B2B') {
    calcSellingFeesPercent = (parseFloat(calcRetroBonus)||0) + (parseFloat(calcTradeMarketing)||0) + (parseFloat(calcFactoring)||0);
    vatRateMultiplier = 1; // B2B typically calculates strictly in Net
  } else {
    calcSellingFeesPercent = (parseFloat(calcMarketplaceComm)||0) + (parseFloat(calcAcos)||0) + (parseFloat(calcReturnRate)||0);
    calcFixedSellingFees = parseFloat(calcFulfillment)||0;
  }

  let finalPriceUnitNet = 0;
  let finalPriceUnitGross = 0;
  let displayFinalPriceUnit = 0;
  let profitUnit = 0;
  let actualMarginPercent = 0;

  if (calcStrategy === 'TARGET_MARGIN') {
     let calcDenominator = 0;
     if (calcMode === 'B2B') {
         calcDenominator = 1 - (calcSellingFeesPercent + calcMarginPercent) / 100;
     } else {
         // B2C: Prowizje Allegro są pobierane od kwoty BRUTTO!
         calcDenominator = 1 - (calcMarginPercent / 100) - (vatRateMultiplier * (calcSellingFeesPercent / 100));
     }
     
     finalPriceUnitNet = selProd && calcDenominator > 0 ? (rawTcUnit + calcFixedSellingFees) / calcDenominator : 0;
     finalPriceUnitGross = finalPriceUnitNet * vatRateMultiplier;
     displayFinalPriceUnit = calcMode === 'B2C' ? finalPriceUnitGross : finalPriceUnitNet;
     
     profitUnit = selProd && calcDenominator > 0 ? finalPriceUnitNet * (calcMarginPercent / 100) : 0;
     actualMarginPercent = calcMarginPercent;
  } else {
     // FIXED_PRICE Strategy
     displayFinalPriceUnit = parseFloat(calcFixedPrice) || 0;
     finalPriceUnitGross = calcMode === 'B2C' ? displayFinalPriceUnit : displayFinalPriceUnit * vatRateMultiplier;
     finalPriceUnitNet = calcMode === 'B2C' ? displayFinalPriceUnit / vatRateMultiplier : displayFinalPriceUnit;
     
     // B2C: Prowizje pobierane od ceny Brutto
     const variableSellingFeesUnit = calcMode === 'B2C' 
          ? finalPriceUnitGross * (calcSellingFeesPercent / 100)
          : finalPriceUnitNet * (calcSellingFeesPercent / 100);
          
     const totalCosts = rawTcUnit + calcFixedSellingFees + variableSellingFeesUnit;
     
     profitUnit = finalPriceUnitNet - totalCosts;
     actualMarginPercent = finalPriceUnitNet > 0 ? (profitUnit / finalPriceUnitNet) * 100 : 0;
  }

  const variableSellingFeesUnit = finalPriceUnitNet * (calcSellingFeesPercent / 100);
  const displayFinalPriceTotal = displayFinalPriceUnit * calcQty;
  const tcFullUnit = rawTcUnit + calcFixedSellingFees + variableSellingFeesUnit;
  const tcTotal = tcFullUnit * calcQty;

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

  const handleAddEcoMaterial = async () => {
    const name = window.prompt("Podaj nazwę nowej frakcji (np. Drewno (Palety/Skrzynie)):");
    if (!name) return;
    const rateStr = window.prompt("Podaj stawkę za kg w zł (np. 0.30):");
    if (!rateStr) return;
    const ratePerKg = parseFloat(rateStr.replace(',', '.'));
    if (isNaN(ratePerKg)) return alert("Nieprawidłowa stawka.");
    
    try {
      await axios.post(`${API_URL}/api/eco/materials`, { name, ratePerKg }, { headers: { Authorization: `Bearer ${token}` } });
      const res = await axios.get(`${API_URL}/api/eco/materials`, { headers: { Authorization: `Bearer ${token}` } });
      setEcoMaterials(res.data);
    } catch(e) { alert("Błąd zapisu frakcji"); }
  };

  const handleEditEcoMaterial = async (m) => {
    const rateStr = window.prompt(`Podaj nową stawkę za kg dla ${m.name} (obecnie: ${m.ratePerKg}):`, m.ratePerKg);
    if (!rateStr) return;
    const ratePerKg = parseFloat(rateStr.replace(',', '.'));
    if (isNaN(ratePerKg)) return alert("Nieprawidłowa stawka.");
    
    try {
      await axios.patch(`${API_URL}/api/eco/materials/${m.id}`, { name: m.name, ratePerKg }, { headers: { Authorization: `Bearer ${token}` } });
      const res = await axios.get(`${API_URL}/api/eco/materials`, { headers: { Authorization: `Bearer ${token}` } });
      setEcoMaterials(res.data);
    } catch(e) { alert("Błąd edycji frakcji"); }
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

  const handleSmiAutoGenerate = async () => {
      if (!smiAutoCampaignId) return alert('Wybierz kampanię docelową dla wygenerowania harmonogramu!');
      if (!smiAutoPrompt.trim()) return alert('Musisz wprowadzić prompt dla Agenta AI!');
      
      setIsSmiAutoGenerating(true);
      try {
          await axios.post(`${API_URL}/api/campaigns/${smiAutoCampaignId}/smi/auto`, {
              prompt: smiAutoPrompt
          }, { headers: { Authorization: `Bearer ${token}` } });
          alert("Harmonogram AI został pomyślnie wygenerowany!");
          setSmiAutoPrompt("");
          fetchPosts();
      } catch (err) {
          console.error("AI Auto-Orchestrator Error:", err);
          alert("Błąd podczas generowania harmonogramu przez AI.");
      } finally {
          setIsSmiAutoGenerating(false);
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
    <div className="flex-1 flex bg-gradient-to-b from-[#f8fafc] to-[#e2e8f0] overflow-hidden">
      {/* Przycisk otwierający sidebar, gdy jest zamknięty */}
      {!isSidebarOpen && (
        <button 
          onClick={() => setIsSidebarOpen(true)}
          className="absolute left-0 top-4 z-40 bg-white border-y border-r border-slate-200 rounded-r-lg shadow-sm p-2.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-50 transition-colors"
          title="Otwórz MTool HQ"
        >
          <Menu className="w-5 h-5" />
        </button>
      )}

      {/* Centrala MTool - Sidebar */}
      <div className={`${isSidebarOpen ? 'w-64 border-r' : 'w-0 border-r-0'} bg-slate-50 border-slate-200 shrink-0 flex flex-col z-30 relative transition-all duration-300 overflow-hidden`}>
         <div className="h-14 flex flex-col justify-center px-6 border-b border-slate-200 bg-white shrink-0 relative">
            <h2 className="text-sm font-semibold text-slate-800 flex items-center"><Target className="w-4 h-4 mr-2 text-indigo-600" /> MTool HQ</h2>
            <p className="text-[10px] font-medium text-slate-500 mt-0.5 whitespace-nowrap">Centrum Narzędzi Marketingo...</p>
            <button 
              onClick={() => setIsSidebarOpen(false)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
         </div>
         <div className="p-4 space-y-1.5 flex-1 overflow-y-auto custom-scrollbar">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3 mt-2 px-3">Aktywne Narzędzia</div>
            <button 
              onClick={() => handleToolSelect('SMI')}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-medium flex items-center transition-all whitespace-nowrap ${activeSubTool === 'SMI' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
            >
              <Instagram className={`w-4 h-4 mr-3 shrink-0 ${activeSubTool==='SMI'?'text-indigo-600':'text-slate-400'}`} /> Harmonogram SMI
            </button>
            <button 
              onClick={() => handleToolSelect('ECOBOM')}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-medium flex items-center transition-all whitespace-nowrap ${activeSubTool === 'ECOBOM' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
            >
              <Leaf className={`w-4 h-4 mr-3 shrink-0 ${activeSubTool==='ECOBOM'?'text-indigo-600':'text-slate-400'}`} /> ECO BOM (ROP/BDO)
            </button>

            <button 
              onClick={() => handleToolSelect('RESI_STUDIO')}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-medium flex items-center transition-all whitespace-nowrap ${activeSubTool === 'RESI_STUDIO' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
            >
              <PackageSearch className={`w-4 h-4 mr-3 shrink-0 ${activeSubTool==='RESI_STUDIO'?'text-indigo-600':'text-slate-400'}`} /> Resi Studio (Lokalnie)
            </button>
            <button 
              onClick={() => handleToolSelect('INFLUENCERS')}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-medium flex items-center transition-all whitespace-nowrap ${activeSubTool === 'INFLUENCERS' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
            >
              <Users className={`w-4 h-4 mr-3 shrink-0 ${activeSubTool==='INFLUENCERS'?'text-indigo-600':'text-slate-400'}`} /> Baza Influencerów
            </button>
            <button 
              onClick={() => handleToolSelect('CALCULATOR')}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-medium flex items-center transition-all whitespace-nowrap ${activeSubTool === 'CALCULATOR' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
            >
              <Calculator className={`w-4 h-4 mr-3 shrink-0 ${activeSubTool==='CALCULATOR'?'text-indigo-600':'text-slate-400'}`} /> Kalkulator Ofert
            </button>
            <button 
              onClick={() => handleToolSelect('OFFER_OPTIMIZER')}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-medium flex items-center transition-all whitespace-nowrap ${activeSubTool === 'OFFER_OPTIMIZER' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
            >
              <Target className={`w-4 h-4 mr-3 shrink-0 ${activeSubTool==='OFFER_OPTIMIZER'?'text-indigo-600':'text-slate-400'}`} /> Ofertowanie GEO (AI)
            </button>
            <div className="pt-6 pb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-3 flex items-center"><Loader2 className="w-3 h-3 mr-2 animate-spin"/> Wkrótce</div>
         </div>
         <div className="p-4 border-t border-slate-200 bg-white">
            <div className="text-[10px] font-medium text-slate-400 text-center uppercase tracking-wider">Wersja Modułu: 1.0</div>
         </div>
      </div>

      {/* Wybrany Pod-Moduł */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
         {activeSubTool === 'SMI' && (
            <div className="flex-1 flex flex-col bg-gradient-to-b from-[#f8fafc] to-[#e2e8f0] text-slate-900 font-sans overflow-hidden animate-in fade-in duration-300">
               <input type="file" ref={fileInputRef} className="hidden" accept="image/*,video/*" onChange={handleFileUpload} />

      {lightboxUrl && (
        <div className="fixed inset-0 bg-slate-900/90 z-[300] flex items-center justify-center p-4 backdrop-blur-md cursor-pointer" onClick={() => setLightboxUrl(null)}>
           <img src={lightboxUrl} className="max-w-[90vw] max-h-[90vh] object-contain rounded-sm shadow-2xl" />
        </div>
      )}

      {/* COMPACT HEADER WITH INCREASED CONTRAST */}
      <div className="bg-slate-200 border-b border-slate-300 shadow-inner shrink-0 z-20 flex flex-col p-3 px-5 md:py-3">
          {/* Top Row: Title & Action Buttons */}
          <div className="flex items-center justify-between gap-3">
              <div className="flex items-center shrink-0">
                  <div className="w-8 h-8 bg-indigo-50 rounded-md flex items-center justify-center text-indigo-600 mr-2 border border-indigo-100">
                      <Instagram className="w-4 h-4" />
                  </div>
                  <div>
                      <h1 className="text-sm font-bold text-slate-800 leading-tight">Globalny Harmonogram SMI</h1>
                      <p className="text-[10px] font-medium text-slate-500">MTool / Skin Care Korea</p>
                  </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                  <button 
                      onClick={() => setShowAiOrchestrator(!showAiOrchestrator)} 
                      className={`px-3 py-1.5 rounded-md text-[10px] font-bold flex items-center transition-all ${showAiOrchestrator ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                      title="AI Orkiestrator"
                  >
                      <Search className="w-3.5 h-3.5 mr-1.5" /> AI
                  </button>
                  <button 
                      onClick={() => setShowFilters(!showFilters)} 
                      className={`px-3 py-1.5 rounded-md text-[10px] font-bold flex items-center transition-all ${showFilters ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                      title="Filtry"
                  >
                      <Filter className="w-3.5 h-3.5 mr-1.5" /> Filtry
                  </button>
                  <div className="w-px h-5 bg-slate-200 mx-1"></div>
                  <button onClick={openNewPostForm} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-[10px] font-bold shadow-sm flex items-center transition-all">
                      <Plus className="w-3.5 h-3.5 mr-1.5" /> Dodaj Rzut
                  </button>
              </div>
          </div>

          {/* Collapsible Sections */}
          {showAiOrchestrator && (
              <div className="flex bg-white border border-slate-300 rounded-md overflow-hidden focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all p-0 mt-2 shadow-sm animate-in slide-in-from-top-2">
                  <span className="pl-3 pr-2 flex items-center text-slate-500"><Search className="w-3.5 h-3.5" /></span>
                  <input 
                      type="text" 
                      value={smiAutoPrompt}
                      onChange={(e) => setSmiAutoPrompt(e.target.value)}
                      placeholder="Opisz kampanię, np.: 'Rozpisz 5 postów na styczeń...'" 
                      className="py-1.5 px-2 w-full text-xs font-medium outline-none bg-transparent placeholder:text-slate-400 text-slate-800"
                  />
                  <div className="w-px h-4 bg-slate-300 self-center mx-1"></div>
                  <select 
                      value={smiAutoCampaignId}
                      onChange={(e) => setSmiAutoCampaignId(e.target.value)}
                      className="px-2 py-1.5 bg-transparent text-xs font-medium outline-none text-slate-700 w-36 shrink-0 cursor-pointer"
                  >
                      <option value="">-- Wybierz Kampanię --</option>
                      {campaigns?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button 
                      onClick={handleSmiAutoGenerate}
                      disabled={isSmiAutoGenerating || !smiAutoPrompt || !smiAutoCampaignId}
                      className="px-4 py-1.5 bg-indigo-100 text-indigo-700 hover:bg-indigo-200 border border-indigo-200 text-[10px] font-bold flex items-center transition-all disabled:opacity-50 rounded"
                  >
                      {isSmiAutoGenerating ? <><Loader2 className="w-3 h-3 mr-1 animate-spin"/> AI...</> : 'Generuj Automatycznie'}
                  </button>
              </div>
          )}

          {showFilters && (
              <div className="flex items-center gap-3 overflow-x-auto custom-scrollbar pb-2 mt-3 animate-in slide-in-from-top-2">
                 <input className="px-3 py-1.5 text-[11px] font-bold text-[#212529] bg-white border border-transparent rounded-md outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 shrink-0 w-32 shadow-sm placeholder:text-[#6C757D]" type="date" value={filters.publishDate} onChange={e=>handleFilterChange('publishDate', e.target.value)} />
                 <input className="px-3 py-1.5 text-[11px] font-bold text-[#212529] bg-white border border-transparent rounded-md outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 shrink-0 w-36 shadow-sm placeholder:text-[#6C757D]" placeholder="Kampania..." value={filters.campaignName} onChange={e=>handleFilterChange('campaignName', e.target.value)} />
                 <input className="px-3 py-1.5 text-[11px] font-bold text-[#212529] bg-white border border-transparent rounded-md outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 shrink-0 w-36 shadow-sm placeholder:text-[#6C757D]" placeholder="Odłam / Marka..." value={filters.brandLine} onChange={e=>handleFilterChange('brandLine', e.target.value)} />
                 <select className="px-3 py-1.5 text-[11px] font-bold text-[#212529] bg-white border border-transparent rounded-md outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 shrink-0 w-36 shadow-sm" value={filters.postType} onChange={e=>handleFilterChange('postType', e.target.value)}>
                   <option value="">Wszystkie Typy</option>
                   {POST_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                 </select>
                 <select className="px-3 py-1.5 text-[11px] font-bold text-[#212529] bg-white border border-transparent rounded-md outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 shrink-0 w-40 shadow-sm" value={filters.status} onChange={e=>handleFilterChange('status', e.target.value)}>
                   <option value="">Wszystkie Statusy</option>
                   {STATUSES.map(t=><option key={t} value={t}>{t}</option>)}
                 </select>
                 <input className="px-3 py-1.5 text-[11px] font-bold text-[#212529] bg-white border border-transparent rounded-md outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 shrink-0 w-40 shadow-sm placeholder:text-[#6C757D]" placeholder="Szukaj w treści..." value={filters.content} onChange={e=>handleFilterChange('content', e.target.value)} />
              </div>
          )}
      </div>

      {/* WORKSPACE BODY */}
      <div className="flex-1 flex overflow-hidden">
          
          {/* SLIDE-IN EDYTOR (1:1 Jak wcześniej) */}
           {isEditing && currentPost && (
             <div className="w-[450px] bg-white border-r border-slate-400 flex flex-col shrink-0 animate-in slide-in-from-left duration-300 shadow-[10px_0_30px_rgba(0,0,0,0.03)] z-10 relative">
               <div className="h-16 border-b border-slate-300 flex items-center justify-between px-6 bg-slate-50 shrink-0">
                  <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">{currentPost.id && !currentPost.id.startsWith('new-') ? 'Edytor Wpisu' : 'Nowy Wpis Rozpiski'}</h3>
                  <button onClick={() => setIsEditing(false)} className="text-slate-600 hover:text-red-500 transition-colors"><X className="w-4 h-4"/></button>
               </div>
               <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
                  <div>
                    <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1.5 flex items-center">Przypisz Kampanię</label>
                    <select className="w-full px-3 py-2.5 bg-slate-50 border border-slate-400 rounded-sm text-[11px] font-black focus:bg-white outline-none" value={currentPost.campaignId} onChange={e=>setCurrentPost({...currentPost, campaignId: e.target.value})} required>
                      <option value="">-- Wybierz kampanię --</option>
                      {campaigns?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1.5 flex items-center"><Target className="w-3 h-3 mr-1.5"/> Marka / Produkt (Linia)</label>
                    <input className="w-full px-3 py-2.5 bg-slate-50 border border-slate-400 rounded-sm text-[11px] font-black focus:bg-white focus:border-indigo-400 outline-none" value={currentPost.brandLine || ''} onChange={e=>setCurrentPost({...currentPost, brandLine: e.target.value})} placeholder="np. Trimay / Jelly Ko" required />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1.5 flex items-center"><CalendarDays className="w-3 h-3 mr-1.5"/> Data Emisji</label>
                      <input type="date" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-400 rounded-sm text-[11px] font-black focus:bg-white flex outline-none" value={currentPost.publishDate ? currentPost.publishDate.split('T')[0] : ''} onChange={e=>setCurrentPost({...currentPost, publishDate: e.target.value})} required />
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1.5 flex"><LayoutDashboard className="w-3 h-3 mr-1.5"/> Typ / Format</label>
                      <select className="w-full px-3 py-2.5 bg-slate-50 border border-slate-400 rounded-sm text-[10px] font-black focus:bg-white outline-none uppercase" value={currentPost.postType || ''} onChange={e=>setCurrentPost({...currentPost, postType: e.target.value})}>
                        {POST_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1.5">Kluczowy Opis / Treść (Copy)</label>
                    <textarea rows={6} className="w-full p-3 bg-slate-50 border border-slate-400 rounded-sm text-[11px] leading-relaxed resize-y focus:bg-white outline-none focus:border-indigo-400" value={currentPost.content || ''} onChange={e=>setCurrentPost({...currentPost, content: e.target.value})} placeholder="Cześć! Właśnie otwiera się..." />
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-1.5">Blok '# Hashtagów'</label>
                    <textarea rows={2} className="w-full p-3 bg-blue-50/50 border border-blue-100 rounded-sm text-[10px] text-blue-600 font-bold resize-none outline-none focus:border-blue-400" value={currentPost.hashtags || ''} onChange={e=>setCurrentPost({...currentPost, hashtags: e.target.value})} placeholder="#Trimy #KBeauty..." />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[8px] font-black text-slate-600 uppercase tracking-widest mb-1.5">Gdzie odsyłamy (Sklep)</label>
                      <input className="w-full px-3 py-2 bg-slate-50 border border-slate-400 rounded-sm text-[10px] font-black outline-none" value={currentPost.redirectUrl || ''} onChange={e=>setCurrentPost({...currentPost, redirectUrl: e.target.value})} placeholder="np. ZIKO DERMO" />
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
                    <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1.5 flex"><CheckCircle2 className="w-3 h-3 mr-1.5"/> Status Wpisu</label>
                    <select className="w-full px-3 py-2.5 bg-slate-50 border border-slate-400 rounded-sm text-[10px] font-black focus:bg-white outline-none uppercase" value={currentPost.status || ''} onChange={e=>setCurrentPost({...currentPost, status: e.target.value})}>
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
                <div className="flex items-center justify-center h-full text-slate-600 text-xs font-black uppercase tracking-widest"><Loader2 className="w-6 h-6 animate-spin mr-3"/> Wczytywanie danych układu...</div>
              ) : filteredPosts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full opacity-50">
                  <Megaphone className="w-16 h-16 text-indigo-200 mb-4" />
                  <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Karta jest pusta</h3>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-2">Brak wyników do wyświetlenia w tabeli</p>
                </div>
              ) : (
                <div className="min-w-[1800px] border border-slate-900 rounded-sm bg-white overflow-hidden m-6 shadow-md">
                   {/* KLASYCZNY NAGŁÓWEK TABELI (CIENKA CZARNA RAMKA) */}
                   <div className="sticky top-0 z-30 bg-[#E2E6EA] grid grid-cols-12 gap-0 border-b border-slate-900 text-[11px] font-black text-slate-900 uppercase tracking-wider">
                      <div className="col-span-1 text-center p-4 flex items-center justify-center border-r border-slate-900">Dodatek Media</div>
                      <div className="col-span-1 p-4 flex items-center border-r border-slate-900">Data / Kampania</div>
                      <div className="col-span-1 p-4 flex items-center border-r border-slate-900">Marka / Format</div>
                      <div className="col-span-3 p-4 flex items-center border-r border-slate-900">Struktura Copywritingu (Treść)</div>
                      <div className="col-span-2 p-4 flex items-center border-r border-slate-900">Blok Hashtagów</div>
                      <div className="col-span-2 p-4 flex items-center border-r border-slate-900">Dystrybucja / Budżet</div>
                      <div className="col-span-1 p-4 flex items-center border-r border-slate-900">Status</div>
                      <div className="col-span-1 p-4 flex items-center justify-center">Akcja</div>
                   </div>
                   
                   {/* WIERSZE Z CZARNYMI KRAWĘDZIAMI I ZEBRA-STRIPING */}
                   <div className="flex flex-col">
                     {filteredPosts.map((p, index) => {
                        const dateObj = new Date(p.publishDate);
                        const dayName = dateObj.toLocaleDateString('pl-PL', { weekday: 'long' });
                        const isDraft = p.status === 'Szkic';
                        const zebraClass = index % 2 === 0 ? 'bg-[#FFFFFF]' : 'bg-[#F8F9FA]';
                        
                        return (
                          <div key={p.id} className={`grid grid-cols-12 gap-0 border-b border-slate-900 transition-colors items-stretch last:border-b-0 hover:bg-[#E2E6EA] text-slate-900 ${zebraClass} ${isDraft ? 'opacity-80' : ''}`}>
                             
                             {/* Media (ZMODYFIKOWANE: Galeria WieloZdjęciowa) */}
                             <div className="col-span-1 p-4 flex items-center justify-center overflow-x-auto custom-scrollbar gap-2 border-r border-slate-900">
                               {isUploading === p.id && (
                                 <div className="w-16 h-16 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-center shrink-0">
                                   <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                                 </div>
                               )}
                               
                               {(p.mediaUrls || []).map((url, idx) => (
                                 <div key={idx} className="w-16 h-16 bg-slate-100 border border-slate-200 rounded-lg overflow-hidden relative group shrink-0 shadow-sm flex items-center justify-center">
                                    {(p.mediaTypes && p.mediaTypes[idx] === 'VIDEO') ? (
                                      <video src={url} className="w-full h-full object-cover" />
                                    ) : (
                                      <img src={url} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                                    )}
                                    {/* Sub-akcje per-plik */}
                                    <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5 p-1">
                                       <button onClick={(e) => { e.stopPropagation(); setLightboxUrl(url); }} className="w-full bg-white text-slate-800 hover:bg-indigo-500 hover:text-white rounded shadow-sm transition-colors text-[9px] font-bold uppercase tracking-wide py-0.5" title="Zobacz Powiększenie"><Maximize2 className="w-3 h-3 mx-auto"/></button>
                                       <button onClick={(e) => { e.stopPropagation(); handleRemoveMedia(p, url, idx); }} className="w-full bg-white text-slate-800 hover:bg-rose-500 hover:text-white rounded shadow-sm transition-colors text-[9px] font-bold uppercase tracking-wide py-0.5" title="Wyrzuć do kosza"><Trash2 className="w-3 h-3 mx-auto"/></button>
                                    </div>
                                 </div>
                               ))}

                               {/* Przycisk dodający kolejne/pierwsze zdjęcie */}
                               {(p.mediaUrls || []).length === 0 ? (
                                 <div className="w-16 h-16 border border-dashed border-slate-300 bg-slate-50 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-300 rounded-lg cursor-pointer transition-all flex flex-col items-center justify-center shrink-0" onClick={() => triggerUpload(p.id)}>
                                    <Upload className="w-4 h-4 mb-1" />
                                    <span className="text-[8px] font-semibold uppercase tracking-wider text-center">Wgraj<br/>Zasób</span>
                                 </div>
                               ) : (
                                 <div className="w-8 h-16 border border-dashed border-slate-300 bg-slate-50 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-300 rounded-lg cursor-pointer transition-all flex items-center justify-center shrink-0 tooltip" title="Dopnij kolejne zdjęcie/video" onClick={() => triggerUpload(p.id)}>
                                    <Plus className="w-4 h-4" />
                                 </div>
                               )}
                             </div>

                             {/* Data / Kampania */}
                             <div className="col-span-1 p-4 flex flex-col justify-center border-r border-slate-900">
                               <span className="text-sm font-bold text-slate-900">{dateObj.toLocaleDateString('pl-PL', {day:'2-digit', month:'2-digit'})}</span>
                               <span className="text-[10px] font-medium text-indigo-600 uppercase tracking-wider mt-0.5 mb-2">{dayName}</span>
                               <span className="text-[10px] font-semibold text-white px-2 py-0.5 rounded shadow-sm w-max" style={{ backgroundColor: p.campaign?.color?.replace('bg-', '') || '#6366f1'}}>{p.campaign?.name || 'BRAK'}</span>
                             </div>
                             
                             {/* Marka / Format */}
                             <div className="col-span-1 p-4 flex flex-col justify-center border-r border-slate-900">
                               <span className="text-xs font-bold text-slate-900 bg-slate-100 px-2 py-1 rounded-sm w-max mb-2 border border-slate-300">{p.brandLine}</span>
                               <span className="text-[10px] font-medium text-slate-500 flex items-center"><LayoutDashboard className="w-3.5 h-3.5 mr-1.5"/> {p.postType}</span>
                             </div>

                             {/* Treść */}
                             <div className="col-span-3 p-4 relative group border-r border-slate-900">
                               <div className="text-sm text-slate-900 font-medium whitespace-pre-wrap break-words leading-relaxed max-h-[140px] overflow-y-auto custom-scrollbar pr-3">
                                  {p.content}
                               </div>
                               {p.notes && (
                                 <div className="mt-3 p-2.5 bg-orange-50 border-l-2 border-orange-400 text-xs font-medium text-orange-800 rounded-r-md break-words">
                                   <span className="uppercase tracking-wider text-[10px] font-semibold block mb-1 opacity-80">Ustalenia / Uwagi</span>
                                   {p.notes}
                                 </div>
                               )}
                             </div>

                             {/* Hashtagi */}
                             <div className="col-span-2 p-4 flex items-center border-r border-slate-900">
                               <p className="text-xs font-bold text-slate-800 break-words whitespace-pre-wrap">{p.hashtags}</p>
                             </div>

                             {/* Odsyłacz / Budżet */}
                             <div className="col-span-2 p-4 flex flex-col space-y-4 justify-center border-r border-slate-900">
                               {p.redirectUrl && (
                                 <div className="break-words">
                                   <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Odsyłamy do:</span>
                                   <span className="text-xs font-bold text-slate-900">{p.redirectUrl}</span>
                                 </div>
                               )}
                               {p.adBudgetInfo && (
                                 <div className="bg-pink-50 p-2.5 border border-pink-100 rounded-lg shadow-sm">
                                   <span className="text-[10px] font-semibold text-pink-500 uppercase tracking-wider block mb-1">Media Budżet Plan:</span>
                                   <span className="text-xs font-semibold text-pink-700 block">{p.adBudgetInfo}</span>
                                 </div>
                               )}
                             </div>

                             {/* Status */}
                             <div className="col-span-1 p-4 flex items-center justify-center border-r border-slate-900">
                               <span className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-sm border ${
                                  p.status === 'Opublikowane' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                  p.status === 'Zatwierdzone' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                                  p.status === 'Do Akceptacji' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                                  'bg-slate-100 text-slate-600 border-slate-200'
                               }`}>
                                 {p.status}
                               </span>
                             </div>

                             {/* Akcje */}
                             <div className="col-span-1 p-4 flex items-center justify-end space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                               <button onClick={() => { setCurrentPost(p); setIsEditing(true); }} className="p-2 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-600 text-slate-500 rounded-lg transition-colors border border-slate-200 shadow-sm"><Edit3 className="w-4 h-4"/></button>
                               <button onClick={() => handleDelete(p.id, p.campaignId)} className="p-2 bg-slate-50 hover:bg-rose-50 hover:text-rose-600 text-slate-500 rounded-lg transition-colors border border-slate-200 shadow-sm"><Trash2 className="w-4 h-4"/></button>
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
            <div className="flex-1 flex flex-col bg-gradient-to-b from-[#f8fafc] to-[#e2e8f0] overflow-y-auto custom-scrollbar animate-in fade-in duration-300">
               <div className="bg-white border-b border-slate-400 shrink-0 z-20">
                  <div className="h-14 flex items-center justify-between px-8">
                     <div className="flex items-center">
                        <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-sm flex items-center justify-center shadow-lg text-white mr-5">
                           <Calculator className="w-6 h-6" />
                        </div>
                        <div>
                           <h1 className="text-xl font-black text-slate-800 uppercase tracking-tighter flex items-center">
                              MTool <span className="mx-3 text-slate-300">/</span> <span className="text-indigo-600">Kalkulator Ofert B2B</span>
                           </h1>
                           <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mt-1">Live Unit Economics (TC vs Profitability)</p>
                        </div>
                     </div>
                  </div>
               </div>

               <div className="flex-1 p-4 grid grid-cols-12 gap-4 max-w-[1600px] mx-auto w-full items-start">
                  {/* Sekcja Danych - Lewa */}
                  <div className="col-span-12 xl:col-span-4 space-y-6">
                     <div className="bg-white p-4 rounded-sm border border-slate-300 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 w-full left-0 h-1 bg-indigo-500 relative_top_bar"></div>
                        <div className="flex items-center justify-between mb-6">
                           <h3 className="text-[11px] font-black text-slate-600 uppercase tracking-[0.2em] flex items-center"><Target className="w-4 h-4 mr-2"/> Wytyczne Oferty</h3>
                           <div className="flex bg-slate-100 p-1 rounded-sm">
                             <button onClick={()=>setCalcMode('B2B')} className={`px-4 py-1 text-[10px] font-black uppercase tracking-widest rounded-sm transition-all ${calcMode==='B2B'?'bg-white text-indigo-600 shadow-sm':'text-slate-600'}`}>B2B Wektor</button>
                             <button onClick={()=>setCalcMode('B2C')} className={`px-4 py-1 text-[10px] font-black uppercase tracking-widest rounded-sm transition-all ${calcMode==='B2C'?'bg-white text-indigo-600 shadow-sm':'text-slate-600'}`}>B2C Rynek</button>
                           </div>
                        </div>
                        
                        <div className="space-y-5">
                           <div ref={pimDropdownRef} className="relative z-20">
                              <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest mb-2 block">Obiekt / Produkt z PIM (Wyszukiwanie EAN/SKU)</label>
                              <div className="relative">
                                 <input 
                                   type="text" 
                                   className="w-full p-4 pl-12 bg-slate-50 border border-slate-400 rounded-sm text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 transition-colors"
                                   placeholder="Wpisz nazwę, EAN lub SKU..."
                                   value={pimSearchTerm}
                                   onChange={(e) => {
                                      setPimSearchTerm(e.target.value);
                                      setIsPimDropdownOpen(true);
                                   }}
                                   onFocus={() => {
                                      if(calcSelectedProduct) setPimSearchTerm(''); // Clear to search again if focused
                                      setIsPimDropdownOpen(true);
                                   }}
                                 />
                                 <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                 {calcSelectedProduct && (
                                     <button 
                                         className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-500 transition-colors"
                                         onClick={() => {
                                            setCalcSelectedProduct('');
                                            setPimSearchTerm('');
                                         }}
                                     >
                                        <X className="w-4 h-4" />
                                     </button>
                                 )}
                              </div>
                              {isPimDropdownOpen && (
                                 <div className="absolute z-50 w-full mt-1 bg-white border border-slate-300 rounded-sm shadow-[0_10px_40px_rgba(0,0,0,0.1)] max-h-60 overflow-y-auto custom-scrollbar">
                                    {filteredPimProducts.length > 0 ? (
                                       filteredPimProducts.map(p => (
                                          <div 
                                             key={p.id} 
                                             className={`p-3 cursor-pointer hover:bg-indigo-50 transition-colors border-b border-slate-100 last:border-b-0 ${calcSelectedProduct === p.id ? 'bg-indigo-50' : ''}`}
                                             onMouseDown={(e) => {
                                                e.preventDefault(); // Prevent input blur before click
                                                setCalcSelectedProduct(p.id);
                                                setPimSearchTerm(`[${p.sku}] ${p.name}`);
                                                setIsPimDropdownOpen(false);
                                             }}
                                          >
                                             <div className="text-[11px] font-black text-slate-800 line-clamp-1">{p.brand?.name || ''} {p.name}</div>
                                             <div className="text-[9px] font-bold text-slate-500 mt-0.5 uppercase tracking-widest">EAN: {p.ean || 'Brak'} | SKU: {p.sku}</div>
                                          </div>
                                       ))
                                    ) : (
                                       <div className="p-4 text-center text-[10px] font-bold text-slate-500 uppercase tracking-widest">Brak wyników wyszukiwania</div>
                                    )}
                                 </div>
                              )}
                           </div>

                           <div className="grid grid-cols-2 gap-4">
                              <div>
                                 <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest mb-2 block">Zamówienie (Szt.)</label>
                                 <input type="number" min="1" className="w-full p-4 bg-slate-50 border border-slate-400 rounded-sm text-lg font-black text-slate-800 outline-none tabular-nums focus:border-indigo-500" value={calcQty} onChange={e=>setCalcQty(parseInt(e.target.value)||0)} />
                              </div>
                              <div>
                                 <label className="text-[10px] font-black text-emerald-700 uppercase tracking-widest mb-2 block">Strategia Ceny</label>
                                 <select className="w-full p-4 bg-emerald-50 border border-emerald-200 rounded-sm text-xs font-black text-emerald-700 outline-none focus:border-emerald-500 transition-colors" value={calcStrategy} onChange={e=>setCalcStrategy(e.target.value)}>
                                   <option value="TARGET_MARGIN">Oblicz Cenę z Marży (%)</option>
                                   <option value="FIXED_PRICE">Oblicz Zysk z Przewidywanej Ceny</option>
                                 </select>
                              </div>
                           </div>
                           
                           {calcStrategy === 'TARGET_MARGIN' ? (
                              <div className="bg-emerald-50/50 p-4 rounded-sm border border-emerald-100">
                                 <label className="text-[10px] font-black text-emerald-700 uppercase tracking-widest mb-2 block text-center">Narzuć Marżę Handlową (%)</label>
                                 <input type="number" min="1" max="99" className="w-full p-4 bg-white border border-emerald-200 rounded-sm text-xl font-black text-emerald-700 outline-none tabular-nums focus:border-emerald-500 text-center shadow-sm" value={calcMarginPercent} onChange={e=>setCalcMarginPercent(parseFloat(e.target.value)||0)} />
                                 <div className="pt-4">
                                   <input type="range" min="1" max="99" className="w-full accent-indigo-500" value={calcMarginPercent} onChange={e=>setCalcMarginPercent(parseFloat(e.target.value)||0)}/>
                                   <div className="flex justify-between text-[9px] font-black text-slate-600 mt-1 uppercase"><span>1%</span><span>Kalkuluje docelową cenę</span><span>99%</span></div>
                                 </div>
                              </div>
                           ) : (
                              <div className="bg-indigo-50/50 p-4 rounded-sm border border-indigo-100">
                                 <label className="text-[10px] font-black text-indigo-700 uppercase tracking-widest mb-2 block text-center">Sztywna Cena dla Klienta ({calcMode === 'B2C' ? 'BRUTTO' : 'NETTO'} PLN)</label>
                                 <input type="number" min="1" step="0.01" className="w-full p-4 bg-white border border-indigo-200 rounded-sm text-xl font-black text-indigo-700 outline-none tabular-nums focus:border-indigo-500 text-center shadow-sm" value={calcFixedPrice} onChange={e=>setCalcFixedPrice(parseFloat(e.target.value)||0)} />
                                 <div className="mt-3 text-center text-[10px] uppercase font-bold text-slate-500">
                                    Dynamiczna Marża: <span className={`${actualMarginPercent < 0 ? 'text-rose-500' : 'text-emerald-500'} font-black text-sm ml-1`}>{actualMarginPercent.toFixed(1)}%</span>
                                 </div>
                              </div>
                           )}
                        </div>
                     </div>

                     {/* Moduł Kosztów Stałych (Overhead) */}
                     <div className="bg-white p-6 rounded-sm border border-slate-300 shadow-sm relative">
                        <div className="flex items-center justify-between mb-4">
                           <h3 className="text-[10px] font-black text-amber-600 uppercase tracking-[0.2em] flex items-center">Rozbicie Kosztów Stałych (Overhead)</h3>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                           <div>
                              <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Ryczałt Firmy / Miesiąc (PLN)</label>
                              <input type="number" step="100" className="w-full p-3 bg-slate-50 border border-slate-400 rounded-sm text-xs font-bold text-slate-700 outline-none focus:border-amber-500" value={calcMonthlyFixedCosts} onChange={e=>setCalcMonthlyFixedCosts(parseFloat(e.target.value)||0)} />
                           </div>
                           <div>
                              <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Estymowana Sprzedaż / Miesiąc (Szt)</label>
                              <input type="number" min="1" className="w-full p-3 bg-slate-50 border border-slate-400 rounded-sm text-xs font-bold text-slate-700 outline-none focus:border-amber-500" value={calcMonthlySalesVolume} onChange={e=>setCalcMonthlySalesVolume(parseInt(e.target.value)||1)} />
                           </div>
                        </div>
                        <div className="mt-3 bg-amber-50 rounded-sm p-3 flex justify-between items-center border border-amber-100">
                           <span className="text-[9px] font-black text-amber-700 uppercase tracking-widest">Alokacja na 100% sztuk:</span>
                           <span className="text-sm font-black tabular-nums text-amber-600">{(calcMonthlySalesVolume > 0 ? (calcMonthlyFixedCosts / calcMonthlySalesVolume) : 0).toFixed(2)} PLN / Szt</span>
                        </div>
                     </div>

                     {/* Dynamiczne opcje na podstawie trybu */}
                     <div className="bg-white p-6 rounded-sm border border-slate-300 shadow-sm relative">
                        {calcMode === 'B2B' ? (
                           <div>
                              <h3 className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] mb-4">SLA / Koszty B2B</h3>
                              <div className="grid grid-cols-3 gap-3">
                                 <div>
                                    <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Retro (%)</label>
                                    <input type="number" className="w-full p-2 bg-slate-50 border border-slate-400 rounded-sm text-xs font-bold text-slate-700 outline-none" value={calcRetroBonus} onChange={e=>setCalcRetroBonus(e.target.value)} />
                                 </div>
                                 <div>
                                    <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Gazetka (%)</label>
                                    <input type="number" className="w-full p-2 bg-slate-50 border border-slate-400 rounded-sm text-xs font-bold text-slate-700 outline-none" value={calcTradeMarketing} onChange={e=>setCalcTradeMarketing(e.target.value)} />
                                 </div>
                                 <div>
                                    <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Skonto (%)</label>
                                    <input type="number" className="w-full p-2 bg-slate-50 border border-slate-400 rounded-sm text-xs font-bold text-slate-700 outline-none" value={calcFactoring} onChange={e=>setCalcFactoring(e.target.value)} />
                                 </div>
                              </div>
                           </div>
                        ) : (
                           <div>
                              <h3 className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] mb-4">Koszty Marketplace B2C</h3>
                              <div className="grid grid-cols-2 gap-3 mb-3">
                                 <div>
                                    <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Prowizja (%)</label>
                                    <input type="number" className="w-full p-2 bg-slate-50 border border-slate-400 rounded-sm text-xs font-bold text-slate-700 outline-none" value={calcMarketplaceComm} onChange={e=>setCalcMarketplaceComm(e.target.value)} />
                                 </div>
                                 <div>
                                    <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Koszty ACoS Ads (%)</label>
                                    <input type="number" className="w-full p-2 bg-slate-50 border border-slate-400 rounded-sm text-xs font-bold text-slate-700 outline-none" value={calcAcos} onChange={e=>setCalcAcos(e.target.value)} />
                                 </div>
                              </div>
                              <div className="grid grid-cols-3 gap-3">
                                 <div>
                                    <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Zwroty (%)</label>
                                    <input type="number" className="w-full p-2 bg-slate-50 border border-slate-400 rounded-sm text-xs font-bold text-slate-700 outline-none" value={calcReturnRate} onChange={e=>setCalcReturnRate(e.target.value)} />
                                 </div>
                                 <div>
                                    <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Pick&Pack (PLN)</label>
                                    <input type="number" className="w-full p-2 bg-slate-50 border border-slate-400 rounded-sm text-xs font-bold text-slate-700 outline-none" value={calcFulfillment} onChange={e=>setCalcFulfillment(e.target.value)} />
                                 </div>
                                 <div>
                                    <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Stawka VAT (%)</label>
                                    <select className="w-full p-2 bg-slate-50 border border-slate-400 rounded-sm text-xs font-bold text-slate-700 outline-none" value={calcVatRate} onChange={e=>setCalcVatRate(e.target.value)}>
                                       <option value="23">23%</option>
                                       <option value="8">8%</option>
                                       <option value="5">5%</option>
                                       <option value="0">0%</option>
                                    </select>
                                 </div>
                              </div>
                           </div>
                        )}
                     </div>
                     
                     {/* Informacja statyczna z PJM */}
                     {selProd && (
                        <div className="bg-slate-900 border border-slate-800 p-4 rounded-sm text-white shadow-2xl relative overflow-hidden">
                           <div className="absolute top-8 -right-4 text-slate-700 opacity-20 pointer-events-none"><Briefcase className="w-24 h-24"/></div>
                           <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600 mb-6 border-b border-slate-700 pb-2">Baza PIM - {selProd.sku}</h3>
                           <div className="space-y-4">
                             <div className="flex justify-between items-center text-xs">
                               <span className="font-bold text-slate-600">Stock (Zapas AI):</span>
                               <span className={`font-black uppercase tracking-wider ${selProd.stock < calcQty ? 'text-rose-500' : 'text-emerald-400'}`}>{selProd.stock} SZT</span>
                             </div>
                             <div className="flex justify-between items-center text-xs">
                               <span className="font-bold text-slate-600">Cena Detal BaseLinker:</span>
                               <span className="font-black text-white bg-slate-800 px-3 py-1 rounded-sm">{selProd.salePrice.toFixed(2)} PLN</span>
                             </div>
                           </div>
                           {selProd.stock < calcQty && (
                             <div className="mt-6 p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] font-black uppercase tracking-widest rounded-sm leading-relaxed mix-blend-screen">
                               UWAGA: Nakład przewyższa zasoby! Może być konieczny import przed potwierdzeniem zlecenia.
                             </div>
                           )}
                        </div>
                     )}
                  </div>

                  {/* Wyniki Obliczeń - Prawa */}
                  <div className="col-span-12 xl:col-span-8">
                     {!selProd ? (
                        <div className="w-full h-full min-h-[400px] border-2 border-dashed border-slate-400 rounded-sm flex flex-col items-center justify-center p-6 text-center">
                           <div className="w-24 h-24 bg-slate-50 rounded-sm border border-slate-300 flex items-center justify-center mb-6 shadow-sm"><Calculator className="w-10 h-10 text-indigo-200" /></div>
                           <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter mb-2">Brak Kalibracji</h3>
                           <p className="text-[11px] font-bold text-slate-600 uppercase tracking-widest max-w-sm leading-relaxed">Wybierz produkt z lewego panelu, aby silnik Nexus Engine zasymulował ofertę B2B uwzględniając cła, podatki BDO i wysyłki.</p>
                        </div>
                     ) : (
                        <div className="grid grid-cols-2 gap-4">
                           {/* Panel TC Kosztowy */}
                           <div className="col-span-2 lg:col-span-1 bg-white p-4 rounded-sm border border-slate-300 shadow-sm flex flex-col">
                              <h3 className="text-[10px] font-black text-rose-500 uppercase tracking-[0.2em] mb-6 flex items-center justify-between">
                                <span>Struktura Kosztów TC</span>
                                <span className="bg-rose-50 px-3 py-1 pb-1 rounded-sm border border-rose-100 text-[8px]">WYDATEK FIRMY</span>
                              </h3>
                              <div className="space-y-4 text-xs font-black uppercase tracking-widest">
                                 <div className="flex justify-between items-center text-slate-500"><span className="text-slate-600">Zakup + Cło (Baza)</span> <span className="tabular-nums text-slate-800">{(selProd.basePrice * calcQty).toFixed(2)} zł</span></div>
                                 <div className="flex justify-between items-center text-slate-500"><span className="text-slate-600">Logistyka Zewn. (Inbound)</span> <span className="tabular-nums text-slate-800">{(selProd.inboundTransportCost * calcQty).toFixed(2)} zł</span></div>
                                 <div className="flex justify-between items-center text-slate-500"><span className="text-slate-600">Materiały Pakowe</span> <span className="tabular-nums text-slate-800">{(selProd.packagingCost * calcQty).toFixed(2)} zł</span></div>
                                 <div className="flex justify-between items-center text-slate-500"><span className="text-slate-600">Haracz Środowiskowy BDO (Z BOM)</span> <span className="tabular-nums text-rose-500">{(dynamicBdoEprCost * calcQty).toFixed(2)} zł</span></div>
                                 <div className="flex justify-between items-center text-slate-500"><span className="text-slate-600">Logistyka Kraj. (Outbound)</span> <span className="tabular-nums text-slate-800">{(selProd.outboundTransportCost * calcQty).toFixed(2)} zł</span></div>
                                 <div className="flex justify-between items-center text-slate-500"><span className="text-slate-600 text-amber-500">Koszty Operacyjne (Overhead Firmy)</span> <span className="tabular-nums text-amber-600 shadow-sm bg-amber-50 px-1 rounded">{(calcOverheadUnit * calcQty).toFixed(2)} zł</span></div>
                                 <div className="flex justify-between items-center text-slate-500"><span className="text-slate-600 text-purple-500">Zdjęcia AI (API Claid)</span> <span className="tabular-nums text-purple-600">{(selProd.aiImageCost || 0).toFixed(2)} zł</span></div>
                                 <hr className="my-2 border-slate-300" />
                                 {calcMode === 'B2B' ? (
                                    <div className="flex justify-between items-center text-slate-500"><span className="text-slate-600">Koszty Sprzedaży B2B (Retro)</span> <span className="tabular-nums text-rose-500">{variableSellingFeesUnit ? (variableSellingFeesUnit * calcQty).toFixed(2) : '0.00'} zł</span></div>
                                 ) : (
                                    <>
                                       <div className="flex justify-between items-center text-slate-500"><span className="text-slate-600">Fulfilment FBA (Stały)</span> <span className="tabular-nums text-slate-800">{calcFixedSellingFees ? (calcFixedSellingFees * calcQty).toFixed(2) : '0.00'} zł</span></div>
                                       <div className="flex justify-between items-center text-slate-500"><span className="text-slate-600">Prowizje i Ads (Zmienne)</span> <span className="tabular-nums text-rose-500">{variableSellingFeesUnit ? (variableSellingFeesUnit * calcQty).toFixed(2) : '0.00'} zł</span></div>
                                    </>
                                 )}
                              </div>
                              <div className="mt-auto pt-6 border-t border-slate-300 flex justify-between items-end">
                                 <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest leading-none block">Total Cost (Razem)</div>
                                 <div className="text-2xl font-black tabular-nums text-slate-800 underline decoration-rose-300 decoration-4 -underline-offset-4">{tcTotal.toFixed(2)} zł</div>
                              </div>
                           </div>

                           {/* Panel Zysku / Propozycji */}
                           <div className="col-span-2 lg:col-span-1 bg-white p-4 rounded-sm border border-slate-300 shadow-sm flex flex-col relative overflow-hidden">
                              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-sm blur-[3rem]"></div>
                              <h3 className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] mb-6 flex items-center justify-between">
                                <span>Projekcja Dochodów</span>
                                <span className="bg-emerald-50 px-3 py-1 pb-1 rounded-sm border border-emerald-100 text-[8px]">PROFIT WYNIKOWY</span>
                              </h3>
                              <div className="flex-1 flex flex-col justify-center space-y-6">
                                 <div>
                                   <div className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1 shadow-sm">Zysk Netto (Czysty Profit) na całości</div>
                                   <div className="text-3xl font-black tabular-nums text-emerald-500">{profitTotal.toFixed(2)} zł</div>
                                 </div>
                                 <div>
                                   <div className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1 shadow-sm">Czysty Zysk na Sztuce</div>
                                   <div className="text-xl font-black tabular-nums text-emerald-600/80">{profitUnit.toFixed(2)} zł</div>
                                 </div>
                              </div>
                           </div>

                           {/* Wniosek Finałowy (Pełna szerokość) */}
                           <div className="col-span-2 bg-gradient-to-br from-indigo-600 to-purple-700 p-5 rounded-sm text-white shadow-[0_20px_50px_rgba(79,70,229,0.3)] relative overflow-hidden">
                              <div className="absolute -right-10 -bottom-10 opacity-10 blur-sm pointer-events-none transform scale-[2]"><Calculator className="w-64 h-64 border-white/5" /></div>
                              <h3 className="text-[12px] font-black text-indigo-300 uppercase tracking-[0.3em] mb-4">Wynik Handlowy: Sugerowana Cena Sprzedaży</h3>
                              <div className="flex flex-col md:flex-row md:items-end md:justify-between relative z-10">
                                 <div className="text-6xl font-black tabular-nums tracking-tighter drop-shadow-xl">{displayFinalPriceTotal.toFixed(2)} <span className="text-3xl text-indigo-200">zł</span></div>
                                 <div className="mt-4 md:mt-0 text-right bg-white/10 backdrop-blur-md p-4 rounded-sm border border-white/20">
                                    <div className="text-[10px] font-black uppercase tracking-widest text-indigo-200 mb-1">Dla Klienta jako (Za Sztukę):</div>
                                    <div className="text-2xl font-black tabular-nums tracking-tight">{displayFinalPriceUnit.toFixed(2)} zł <span className="text-xs text-indigo-200 opacity-80">{calcMode==='B2C'?'BRUTTO':'NETTO'}</span></div>
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
            <div className="flex-1 flex flex-col bg-gradient-to-b from-[#f8fafc] to-[#e2e8f0] overflow-y-auto custom-scrollbar animate-in fade-in duration-300">
               <div className="bg-white border-b border-slate-400 shrink-0 z-20">
                  <div className="h-14 flex items-center justify-between px-8">
                     <div className="flex items-center">
                        <div className="w-12 h-12 bg-gradient-to-br from-lime-400 to-emerald-600 rounded-sm flex items-center justify-center shadow-lg text-white mr-5">
                           <Leaf className="w-6 h-6" />
                        </div>
                        <div>
                           <h1 className="text-xl font-black text-slate-800 uppercase tracking-tighter flex items-center">
                              MTool <span className="mx-3 text-slate-300">/</span> <span className="text-emerald-600">Nexus ECO BOM</span>
                           </h1>
                           <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mt-1">EPR / BDO / Lucid / PPWR Manager</p>
                        </div>
                     </div>
                  </div>
               </div>

               <div className="flex-1 p-4 grid grid-cols-12 gap-4 max-w-[1600px] mx-auto w-full items-start">
                  {/* Sekcja BDO - Lewa */}
                  <div className="col-span-12 xl:col-span-5 space-y-6">
                     <div className="bg-white p-4 rounded-sm border border-slate-300 shadow-sm relative overflow-hidden h-full min-h-[500px]">
                        <div className="absolute top-0 w-full left-0 h-1 bg-gradient-to-r from-lime-400 to-emerald-500 relative_top_bar"></div>
                        <h3 className="text-[11px] font-black text-emerald-600 bg-emerald-50 uppercase tracking-[0.2em] mb-6 flex items-center w-max p-2 px-4 rounded-sm"><Target className="w-4 h-4 mr-2"/> Stawki Organizacji Odzysku</h3>
                        
                        <div className="space-y-3 mb-6">
                           <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest leading-relaxed">Poniższe stawki za kilogram frakcji definiują twardy przelicznik środowiskowy Twojego przedsiębiorstwa.</p>
                        </div>

                        <div className="space-y-4">
                           {ecoMaterials.map(m => (
                             <div key={m.id} className="flex justify-between items-center p-4 bg-slate-50 border border-slate-300 rounded-sm group hover:border-emerald-200 transition-colors">
                                 <div>
                                    <div className="text-[12px] font-black text-slate-700">{m.name}</div>
                                    <div className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">ID Frakcji: {m.id.split('-')[0]}</div>
                                 </div>
                                 <div className="flex items-center space-x-3">
                                    <span className="text-xl font-black text-emerald-600 tabular-nums">{m.ratePerKg.toFixed(2)} zł<span className="text-[10px] text-emerald-400">/kg</span></span>
                                    <button onClick={() => handleEditEcoMaterial(m)} className="text-slate-300 hover:text-indigo-500 transition-colors"><Edit3 className="w-4 h-4"/></button>
                                 </div>
                             </div>
                           ))}
                           <button onClick={handleAddEcoMaterial} className="w-full p-4 border-2 border-dashed border-emerald-100 rounded-sm text-[10px] font-black text-emerald-500 uppercase tracking-widest hover:bg-emerald-50 transition-colors flex items-center justify-center">
                              <Plus className="w-4 h-4 mr-2"/> Dodaj nową frakcję cennika
                           </button>
                        </div>
                     </div>
                  </div>

                  {/* Wyniki - Prawa */}
                  <div className="col-span-12 xl:col-span-7">
                     <div className="bg-white p-4 rounded-sm border border-slate-300 shadow-sm relative overflow-hidden min-h-[500px]">
                        <h3 className="text-[11px] font-black text-slate-600 uppercase tracking-[0.2em] mb-6 flex items-center"><PackageSearch className="w-4 h-4 mr-2 text-indigo-400"/> Drzewo BOM Produktu (Opakowania)</h3>
                        
                        <div className="mb-8">
                           <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest mb-2 block">Szukaj Indeksu PIM (Do kalibracji BOM)</label>
                           
                           <div className="flex space-x-4 mb-3">
                               <input type="text" placeholder="Szukaj po EAN, SKU lub nazwie..." className="w-1/3 p-4 bg-white border border-slate-400 rounded-sm text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 shadow-sm" value={bomSearch} onChange={e => setBomSearch(e.target.value)} />
                               <select className="w-2/3 p-4 bg-slate-50 border border-slate-400 rounded-sm text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 transition-colors shadow-sm" value={bomSelectedProduct} onChange={e=>{setBomSelectedProduct(e.target.value); loadProductBom(e.target.value);}}>
                                  <option value="">-- Wybierz produkt PIM z wyników wyszukiwania --</option>
                                  {products.filter(p => !bomSearch || (p.name?.toLowerCase().includes(bomSearch.toLowerCase()) || p.ean?.toLowerCase().includes(bomSearch.toLowerCase()) || p.sku?.toLowerCase().includes(bomSearch.toLowerCase()))).slice(0, 100).map(p => <option key={p.id} value={p.id}>{p.brand?.name || ''} {p.name} [{p.sku}]</option>)}
                               </select>
                           </div>
                        </div>

                        {!bomSelectedProduct ? (
                           <div className="w-full h-48 border-2 border-dashed border-slate-300 rounded-sm flex flex-col items-center justify-center text-center opacity-50">
                              <Leaf className="w-10 h-10 text-slate-300 mb-3" />
                              <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Brak kalibracji - oczekiwanie na model</p>
                           </div>
                        ) : (
                           <div className="space-y-6">
                              {/* Lista obecnych powiązań */}
                              <div>
                                 <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-widest mb-3 border-b border-slate-300 pb-2">Struktura opakowaniowa (Receptura)</h4>
                                 {ecoLoading ? (
                                    <div className="text-[10px] text-slate-600 font-bold uppercase tracking-widest flex items-center"><Loader2 className="w-4 h-4 mr-2 animate-spin"/> Pobieranie struktury z bazy PIM...</div>
                                 ) : bomElements.length === 0 ? (
                                    <div className="p-4 bg-orange-50 border border-orange-100 text-orange-600 text-[10px] font-black uppercase tracking-widest rounded-sm">Ten indeks nie ma sprecyzowanych żadnych materiałów pakowych! Ekologia w Kalkulatorze B2B wyniesie 0 PLN.</div>
                                 ) : (
                                    <div className="space-y-2">
                                       {bomElements.map(b => (
                                          <div key={b.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-sm border border-slate-400">
                                             <div className="flex items-center">
                                                <div className="w-8 h-8 rounded-sm bg-white flex items-center justify-center shadow-sm mr-3 border border-slate-300"><Leaf className="w-3 h-3 text-emerald-500"/></div>
                                                <div>
                                                   <div className="text-[11px] font-black text-slate-700">{b.material.name}</div>
                                                   <div className="text-[9px] font-bold text-slate-600">Podstawa opłaty: {b.material.ratePerKg.toFixed(2)} PLN/kg</div>
                                                </div>
                                             </div>
                                             <div className="flex items-center space-x-6">
                                                <div className="text-right">
                                                   <div className="text-sm font-black tabular-nums text-slate-800">{b.weightGrams} <span className="text-[10px] text-slate-600">gram</span></div>
                                                   <div className="text-[9px] font-black text-rose-500">+ {((b.weightGrams/1000) * b.material.ratePerKg).toFixed(4)} PLN (do haraczu)</div>
                                                </div>
                                                <button onClick={() => handleRemoveBom(b.id)} className="text-slate-600 hover:text-rose-500 transition-colors tooltip"><Trash2 className="w-4 h-4"/></button>
                                             </div>
                                          </div>
                                       ))}
                                    </div>
                                 )}
                              </div>

                              {/* Form dodawania */}
                              <div className="p-5 bg-indigo-50 border border-indigo-100 rounded-sm">
                                 <h4 className="text-[10px] font-black text-indigo-800 uppercase tracking-widest mb-4">Dodaj Komponent Odpadowy do Drzewa</h4>
                                 <div className="grid grid-cols-12 gap-4">
                                    <div className="col-span-6">
                                       <select className="w-full p-3 bg-white border border-indigo-100 rounded-sm text-[10px] font-black text-slate-700 outline-none uppercase" value={newBomMaterialId} onChange={e=>setNewBomMaterialId(e.target.value)}>
                                          <option value="">-- Wybierz Frakcję z Listy Celnej --</option>
                                          {ecoMaterials.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
                                       </select>
                                    </div>
                                    <div className="col-span-3">
                                       <input type="number" step="0.1" placeholder="Waga (Gramy)" className="w-full p-3 bg-white border border-indigo-100 rounded-sm text-[11px] font-black text-slate-800 outline-none text-center" value={newBomWeight} onChange={e=>setNewBomWeight(e.target.value)}/>
                                    </div>
                                    <div className="col-span-3">
                                       <button onClick={handleAddBom} className="w-full p-3 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest rounded-sm transition-all h-full shadow-lg">Powiąż</button>
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
            <div className="flex-1 flex overflow-hidden animate-in fade-in zoom-in-95 duration-500 bg-white">
                <InfluencerCrmView currentUser={currentUser} API_URL={API_URL} token={token} />
            </div>
         )}
          {activeSubTool === 'RESI_STUDIO' && (
             <div className="flex-1 flex flex-col w-full h-full bg-gradient-to-b from-[#f8fafc] to-[#e2e8f0] animate-in fade-in duration-300 relative">
               <div className="absolute inset-0 z-10 w-full h-full flex items-center justify-center bg-white pointer-events-none">
                 <div className="text-center">
                    <Loader2 className="w-10 h-10 animate-spin text-slate-300 mx-auto mb-4" />
                    <p className="text-[11px] font-black text-slate-600 uppercase tracking-widest">Wczytywanie Studio AI...</p>
                 </div>
               </div>
               <iframe 
                  src={`/resi/index.html?token=${token}&apiUrl=${API_URL}`} 
                  className="w-full h-full border-0 relative z-20 bg-transparent"
                  sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-downloads"
               ></iframe>
             </div>
          )}
          {activeSubTool === 'OFFER_OPTIMIZER' && (
             <div className="flex-1 flex overflow-y-auto animate-in fade-in zoom-in-95 duration-500 bg-gradient-to-b from-[#f8fafc] to-[#e2e8f0]">
                 <OfferOptimizerView />
             </div>
          )}
      </div>
    </div>
  );
};

export default MToolView;
