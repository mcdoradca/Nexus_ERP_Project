import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { TitleValidator } from './components/HitlReviewer/TitleValidator';
import { StrictWysiwyg } from './components/HitlReviewer/StrictWysiwyg';
import { TileSimulator } from './components/HitlReviewer/TileSimulator';
import { ImageUploadBox } from './components/SingleAuctionFetcher/ImageUploadBox';
import { PhotographicAuditorCard } from './components/VisionFeedback/PhotographicAuditorCard';
import { Rocket, ShieldAlert, Cpu, Type, X, Download, RefreshCw, Save, Send, Database, Box, Tag, Layers, TrendingUp, Search } from 'lucide-react';

const ImageModal = ({ url, onClose }) => {
    const [imgError, setImgError] = useState(false);
    const [useDirectUrl, setUseDirectUrl] = useState(false);
    
    useEffect(() => {
        setImgError(false);
        setUseDirectUrl(false);
    }, [url]);
    
    if (!url) return null;

    const token = localStorage.getItem('token') || localStorage.getItem('aps_token') || '';
    const proxyUrl = url.startsWith('http') ? `${import.meta.env.PROD ? '' : `http://${window.location.hostname}:3001`}/api/offer-optimizer/proxy-image?url=${encodeURIComponent(url)}&token=${token}` : url;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4" onClick={onClose}>
            <div className="relative max-w-5xl w-full h-full flex flex-col items-center justify-center" onClick={e => e.stopPropagation()}>
                <button onClick={onClose} className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white rounded-xl p-2 transition-colors">
                    <X className="w-6 h-6" />
                </button>
                {!imgError ? (
                    <img 
                        src={useDirectUrl ? url : proxyUrl} 
                        alt="Powiększenie" 
                        className="max-w-full max-h-[80vh] object-contain shadow-2xl rounded-xl" 
                        onError={() => {
                            if (!useDirectUrl && url.startsWith('http')) {
                                setUseDirectUrl(true);
                            } else {
                                setImgError(true);
                            }
                        }}
                    />
                ) : (
                    <div className="flex flex-col items-center text-center text-slate-400 p-8 border border-slate-700 rounded-xl bg-slate-900/50">
                        <ShieldAlert className="w-16 h-16 mb-4 text-rose-500/50" />
                        <span className="text-sm font-bold uppercase tracking-widest leading-relaxed">
                            Podgląd niedostępny<br/>(Link źródłowy wygasł lub został zablokowany przez serwer CORS)
                        </span>
                    </div>
                )}
                <div className="mt-8 flex space-x-4">
                    <button 
                        onClick={async () => {
                            try {
                                if (url.startsWith('data:image/')) {
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = 'nexus_lifestyle.jpg';
                                    document.body.appendChild(a);
                                    a.click();
                                    document.body.removeChild(a);
                                    return;
                                }

                                const API_URL = import.meta.env.PROD ? '' : 'http://localhost:3001';
                                const token = localStorage.getItem('token') || localStorage.getItem('aps_token') || '';
                                const res = await fetch(`${API_URL}/api/offer-optimizer/proxy-image?url=${encodeURIComponent(url)}`, {
                                    headers: { 'Authorization': `Bearer ${token}` }
                                });
                                
                                if (!res.ok) throw new Error("Proxy fetch failed");

                                const blob = await res.blob();
                                const blobUrl = window.URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = blobUrl;
                                a.download = 'nexus_image.jpg';
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                window.URL.revokeObjectURL(blobUrl);
                            } catch (e) {
                                alert("Błąd pobierania zdjęcia: " + e.message);
                            }
                        }}
                        className="flex items-center px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest text-xs rounded-lg shadow-lg transition-colors"
                    >
                        <Download className="w-4 h-4 mr-2" /> Pobierz na dysk
                    </button>
                </div>
            </div>
        </div>
    );
};

export const OfferOptimizerView = ({ socket }) => {
    // Mode State
    const [isDashboardActive, setIsDashboardActive] = useState(false);
    const [productData, setProductData] = useState(null); // Pełny obiekt z backendu (PIM)

    // Stany dla Ofert
    const [liveTitle, setLiveTitle] = useState("");
    const [liveEan, setLiveEan] = useState("");
    
    // Sztywny content dla edytora
    const [editorHtml, setEditorHtml] = useState({
        opis1: "", opis2: "", opis3: "", opis4: "", opis5: ""
    });
    const [editorKey, setEditorKey] = useState(0); 
    const [visionTickets, setVisionTickets] = useState([]);
    const [viewingImageUrl, setViewingImageUrl] = useState(null);
    
    // Stany operacyjne
    const [isRegeneratingTitle, setIsRegeneratingTitle] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isSavingDraft, setIsSavingDraft] = useState(false);

    // Stany dla dynamicznych cech (PIM Data)
    const [pimData, setPimData] = useState({
        weight: 0, length: 0, width: 0, height: 0, taxRate: 0, stock: 0, stockErpUnits: 0, stockWmsUnits: 0,
        features: {}, allegroCategoryId: ''
    });

    // OSINT / Allegro Parametry
    const [categorySchema, setCategorySchema] = useState(null);
    const [brands, setBrands] = useState([]);

    useEffect(() => {
        const token = localStorage.getItem('token') || localStorage.getItem('aps_token') || '';
        const API_URL = import.meta.env.PROD ? '' : 'http://localhost:3001';
        if (token) {
            axios.get(`${API_URL}/api/brands`, { headers: { Authorization: `Bearer ${token}` } })
                .then(res => setBrands(res.data))
                .catch(err => console.error("Blad pobierania marek", err));
        }
    }, []);

    useEffect(() => {
        const token = localStorage.getItem('token') || localStorage.getItem('aps_token') || '';
        const API_URL = import.meta.env.PROD ? '' : 'http://localhost:3001';
        
        if (pimData.allegroCategoryId && token) {
            axios.get(`${API_URL}/api/categories/${pimData.allegroCategoryId}`, { headers: { Authorization: `Bearer ${token}` } })
                .then(res => setCategorySchema(res.data))
                .catch(() => setCategorySchema(null));
        } else {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setCategorySchema(null);
        }
    }, [pimData.allegroCategoryId]);

    const safeImages = visionTickets.map(t => {
        const url = t.replacedUrl || t.originalUrl;
        return (url && (url.startsWith('http') || url.startsWith('data:image'))) ? url : null;
    });
    const getImage = (index) => {
        const url = safeImages[index];
        const token = localStorage.getItem('token') || localStorage.getItem('aps_token') || '';
        if (url) {
            return url.startsWith('http') ? `${import.meta.env.PROD ? '' : `http://${window.location.hostname}:3001`}/api/offer-optimizer/proxy-image?url=${encodeURIComponent(url)}&token=${token}` : url;
        }
        return `data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22800%22%20height%3D%22600%22%20viewBox%3D%220%200%20800%20600%22%3E%3Crect%20width%3D%22800%22%20height%3D%22600%22%20fill%3D%22%231e293b%22%2F%3E%3Ctext%20x%3D%22400%22%20y%3D%22300%22%20font-family%3D%22Arial%22%20font-size%3D%2224%22%20font-weight%3D%22bold%22%20fill%3D%22%2364748b%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%3EZdj%C4%99cie%20nr%20${index+1}%3C%2Ftext%3E%3C%2Fsvg%3E`;
    };

    const allegroSections = [];
    let imageCounter = 1;

    if (editorHtml.opis1 && editorHtml.opis1.trim() !== '') {
         allegroSections.push({ items: [ { type: 'TEXT', content: editorHtml.opis1 }, { type: 'IMAGE', content: getImage(imageCounter++) } ] });
    }
    if (editorHtml.opis2 && editorHtml.opis2.trim() !== '') {
         allegroSections.push({ items: [ { type: 'TEXT', content: editorHtml.opis2 }, { type: 'IMAGE', content: getImage(imageCounter++) } ] });
    }
    if (editorHtml.opis3 && editorHtml.opis3.trim() !== '') {
         allegroSections.push({ items: [ { type: 'TEXT', content: editorHtml.opis3 }, { type: 'IMAGE', content: getImage(imageCounter++) } ] });
    }
    if (editorHtml.opis4 && editorHtml.opis4.trim() !== '') {
         allegroSections.push({ items: [ { type: 'TEXT', content: editorHtml.opis4 }, { type: 'IMAGE', content: getImage(imageCounter++) } ] });
    }
    if (editorHtml.opis5 && editorHtml.opis5.trim() !== '') {
         allegroSections.push({ items: [ { type: 'TEXT', content: editorHtml.opis5 }, { type: 'IMAGE', content: getImage(imageCounter++) } ] });
    }

    // Pozostałe zdjęcia z galerii dystrybuowane od pierwszego nieskonsumowanego indeksu
    let nextImageIndex = imageCounter;
    while(nextImageIndex < safeImages.length) {
         if (nextImageIndex + 1 < safeImages.length) {
              allegroSections.push({ items: [ { type: 'IMAGE', content: getImage(nextImageIndex) }, { type: 'IMAGE', content: getImage(nextImageIndex+1) } ] });
              nextImageIndex += 2;
         } else {
              allegroSections.push({ items: [ { type: 'IMAGE', content: getImage(nextImageIndex) } ] });
              nextImageIndex += 1;
         }
    }

    const handleAnalysisComplete = (res) => {
        setProductData(res);
        setIsDashboardActive(true);

        const draft = res.finalDraft || {};

        if(draft.title) setLiveTitle(draft.title);
        if(res.ean) setLiveEan(res.ean);
        
        setPimData({
            weight: res.weight || 0,
            length: res.length || 0,
            width: res.width || 0,
            height: res.height || 0,
            taxRate: res.taxRate || 0,
            stock: res.stock || 0,
            stockErpUnits: res.stockErpUnits || 0,
            stockWmsUnits: res.stockWmsUnits || 0,
            features: res.features || {},
            allegroCategoryId: res.allegroCategoryId || '',
            sku: res.sku || '',
            brandId: res.brandId || '',
            subiektId: res.subiektId || '',
            status: res.status || 'Aktywny',
            videoUrl: res.videoUrl || '',
            basePrice: res.basePrice || 0,
            salePrice: res.salePrice || 0,
            inboundTransportCost: res.inboundTransportCost || 0,
            packagingCost: res.packagingCost || 0,
            bdoEprCost: res.bdoEprCost || 0,
            outboundTransportCost: res.outboundTransportCost || 0
        });

        let htmlData = { opis1: '', opis2: '', opis3: '', opis4: '', opis5: '' };
        if (draft.htmlContent) {
            if (typeof draft.htmlContent === 'string') {
                htmlData.opis1 = draft.htmlContent;
            } else if (typeof draft.htmlContent === 'object') {
                htmlData = {
                    opis1: draft.htmlContent.opis1 || '',
                    opis2: draft.htmlContent.opis2 || '',
                    opis3: draft.htmlContent.opis3 || '',
                    opis4: draft.htmlContent.opis4 || '',
                    opis5: draft.htmlContent.opis5 || ''
                };
            }
        } else if (draft.opis1 !== undefined) {
            htmlData = {
                opis1: draft.opis1 || '',
                opis2: draft.opis2 || '',
                opis3: draft.opis3 || '',
                opis4: draft.opis4 || '',
                opis5: draft.opis5 || ''
            };
        }
        setEditorHtml(htmlData);
        setEditorKey(prev => prev + 1);
        
        if (draft.images) {
            const mappedImages = draft.images.map(img => ({
                ...img,
                sourcePreviewUrl: res.sourcePreviewUrl
            }));
            while (mappedImages.length < 7) {
                mappedImages.push({
                    originalUrl: `Wymagane nowe zdjęcie (Lifestylowe nr ${mappedImages.length})`,
                    alerts: ["Pusty slot - wygeneruj Lifestyle AI"],
                    isCompliant: false
                });
            }
            setVisionTickets(mappedImages);
        }
    };

    const handlePimChange = (field, value) => {
        setPimData(prev => ({ ...prev, [field]: value }));
    };

    const handleFeatureChange = (key, value) => {
        setPimData(prev => ({
            ...prev,
            features: { ...prev.features, [key]: value }
        }));
    };

    const handleRegenerateTitle = async () => { /* ... (zostawiamy stary kod API) ... */
        if (!liveEan || isRegeneratingTitle) return;
        setIsRegeneratingTitle(true);
        try {
            const token = localStorage.getItem('token') || localStorage.getItem('aps_token') || '';
            const API_URL = import.meta.env.PROD ? '' : 'http://localhost:3001';
            const res = await fetch(`${API_URL}/api/offer-optimizer/regenerate-title`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ ean: liveEan, currentTitle: liveTitle })
            });
            const data = await res.json();
            if (res.ok && data.title) {
                setLiveTitle(data.title);
            } else {
                alert("Błąd: " + (data.error || "Nie udało się odświeżyć tytułu."));
            }
        } catch {
            alert("Błąd komunikacji z serwerem regeneracji.");
        }
        setIsRegeneratingTitle(false);
    };

    const compileDraftData = () => {
        return {
            title: liveTitle,
            htmlContent: {
                opis1: editorHtml.opis1 || '',
                opis2: editorHtml.opis2 || '',
                opis3: editorHtml.opis3 || '',
                opis4: editorHtml.opis4 || '',
                opis5: editorHtml.opis5 || ''
            },
            images: visionTickets
                .filter(t => {
                    const url = t.replacedUrl || t.originalUrl;
                    return url && (url.startsWith('http') || url.startsWith('data:image'));
                })
                .map(t => ({
                    url: t.replacedUrl || t.originalUrl,
                    originalUrl: t.originalUrl,
                    replacedUrl: t.replacedUrl || null,
                    isCompliant: t.isCompliant !== undefined ? t.isCompliant : true,
                    alerts: t.alerts || []
                })),
            // Dodajemy zedytowane dane PIM
            weight: parseFloat(pimData.weight) || 0,
            length: parseFloat(pimData.length) || 0,
            width: parseFloat(pimData.width) || 0,
            height: parseFloat(pimData.height) || 0,
            taxRate: parseFloat(pimData.taxRate) || 0,
            stock: parseInt(pimData.stock) || 0,
            stockErpUnits: parseInt(pimData.stockErpUnits) || 0,
            stockWmsUnits: parseInt(pimData.stockWmsUnits) || 0,
            allegroCategoryId: pimData.allegroCategoryId,
            features: pimData.features,
            sku: pimData.sku,
            brandId: pimData.brandId,
            subiektId: pimData.subiektId,
            status: pimData.status,
            videoUrl: pimData.videoUrl,
            basePrice: parseFloat(pimData.basePrice) || 0,
            salePrice: parseFloat(pimData.salePrice) || 0,
            inboundTransportCost: parseFloat(pimData.inboundTransportCost) || 0,
            packagingCost: parseFloat(pimData.packagingCost) || 0,
            bdoEprCost: parseFloat(pimData.bdoEprCost) || 0,
            outboundTransportCost: parseFloat(pimData.outboundTransportCost) || 0
        };
    };

    const handleSaveDraft = async () => { /* ... (zostawiamy stary kod API) ... */
        if (!liveEan) return;
        setIsSavingDraft(true);
        try {
            const token = localStorage.getItem('token') || localStorage.getItem('aps_token') || '';
            const API_URL = import.meta.env.PROD ? '' : 'http://localhost:3001';
            const res = await fetch(`${API_URL}/api/offer-optimizer/save-draft`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ ean: liveEan, draftData: compileDraftData() })
            });
            if (res.ok) {
                alert("Kopia robocza została bezpiecznie zapisana w bazie!");
            } else {
                const data = await res.json();
                alert("Błąd zapisu: " + data.error);
            }
        } catch (e) {
            alert("Błąd komunikacji z serwerem: " + e.message);
        }
        setIsSavingDraft(false);
    };

    const handleExportToBaselinker = async () => { /* ... (zostawiamy stary kod API) ... */
        if (!liveEan) return;
        setIsExporting(true);
        try {
            const token = localStorage.getItem('token') || localStorage.getItem('aps_token') || '';
            const API_URL = import.meta.env.PROD ? '' : 'http://localhost:3001';
            const res = await fetch(`${API_URL}/api/offer-optimizer/export-baselinker`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ ean: liveEan, draftData: compileDraftData() })
            });
            const data = await res.json();
            if (res.ok) {
                alert("Sukces! " + data.message);
            } else {
                alert("Błąd eksportu: " + data.error);
            }
        } catch (e) {
            alert("Błąd połączenia z serwerem: " + e.message);
        }
        setIsExporting(false);
    };

    if (!isDashboardActive) {
        return (
            <div className="w-full min-h-screen bg-slate-950 flex items-center justify-center p-4">
                <div className="w-full max-w-4xl">
                    <ImageUploadBox onAnalysisComplete={handleAnalysisComplete} socket={socket} />
                </div>
            </div>
        );
    }

    return (
        <div className="w-full min-h-screen bg-slate-100 text-slate-900 p-4 xl:p-8 space-y-6 pb-32">
            
            {/* Header / Top Bar */}
            <div className="flex flex-col lg:flex-row items-center justify-between bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-2xl">
                <div className="flex items-center space-x-6">
                    <div className="bg-indigo-500/20 w-16 h-16 rounded-xl flex items-center justify-center border border-indigo-500/30 shadow-inner shadow-indigo-500/20">
                        <Cpu className="w-8 h-8 text-indigo-400" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black text-white tracking-tight">{productData?.name || "Karta Produktu PIM"}</h1>
                        <div className="flex items-center space-x-4 mt-2">
                            <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded-md text-xs font-bold uppercase tracking-widest flex items-center">
                                <span className="w-2 h-2 bg-emerald-500 rounded-full mr-2 animate-pulse"></span> Gotowy
                            </span>
                            <span className="text-slate-500 font-mono text-sm border-l border-slate-700 pl-4">{liveEan}</span>
                            <span className="text-slate-500 font-mono text-sm border-l border-slate-700 pl-4">ID: {productData?.baselinkerId || 'BRAK'}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Nowy Układ Unified Product View - Architektura kaskadowa z podziałem sekcji 2 */}
            <div className="space-y-6">
                
                {/* 1. Tytuł */}
                <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 flex items-center">
                            <Type className="w-4 h-4 mr-2 text-indigo-400" /> Weryfikacja Tytułu
                        </h2>
                        <button onClick={handleRegenerateTitle} disabled={isRegeneratingTitle} className="text-[10px] uppercase font-bold text-indigo-400 hover:text-indigo-300 flex items-center transition-colors">
                            <RefreshCw className={`w-3 h-3 mr-1 ${isRegeneratingTitle ? 'animate-spin' : ''}`} /> Odśwież
                        </button>
                    </div>
                    <input 
                        type="text" 
                        value={liveTitle}
                        onChange={(e) => setLiveTitle(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 text-white font-bold text-xl px-4 py-4 rounded-xl outline-none focus:border-indigo-500 transition-all mb-4" 
                    />
                    <TitleValidator initialTitle={liveTitle} onValidate={(_, text) => { setLiveTitle(text); }} />
                </div>

                {/* 2. Vision AI i Symulator + Geo/AEO */}
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                    {/* Lewa kolumna: Vision AI i Symulator */}
                    <div className="xl:col-span-5 flex flex-col space-y-6 h-full">
                        {/* Vision AI */}
                        <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl flex flex-col">
                            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 mb-6 flex items-center justify-between">
                                <span className="flex items-center"><Search className="w-4 h-4 mr-2 text-indigo-400" /> Audyt Multimodalny (Vision AI)</span>
                                <span className="bg-indigo-500/10 text-indigo-400 px-2 py-1 rounded-md text-[10px]">
                                    {visionTickets.filter(v => v.isCompliant || v.replacedUrl).length} / {visionTickets.length} Poprawne
                                </span>
                            </h2>
                            <div className="grid grid-cols-1 gap-6 flex-grow content-start">
                                {visionTickets.map((ticket, i) => (
                                    <PhotographicAuditorCard 
                                        key={i} index={i} ean={liveEan} imageObj={ticket} primaryImageObj={visionTickets[0]}
                                        onImageReplace={(newUrl) => {
                                            const updated = [...visionTickets]; updated[i].replacedUrl = newUrl; setVisionTickets(updated);
                                        }} 
                                        onImageDelete={() => {
                                            const updated = [...visionTickets];
                                            updated[i] = { originalUrl: `Wymagane nowe zdjęcie (nr ${i + 1})`, alerts: ["Pusty slot"], isCompliant: false, replacedUrl: null };
                                            setVisionTickets(updated);
                                        }}
                                        onView={(url) => setViewingImageUrl(url)}
                                    />
                                ))}
                            </div>
                            <button 
                                onClick={() => setVisionTickets([...visionTickets, { originalUrl: '', isCompliant: false, alerts: ["Upuść zdjęcie"] }])}
                                className="mt-6 w-full py-4 border border-dashed border-slate-700 rounded-xl flex items-center justify-center text-slate-500 font-bold hover:border-indigo-500 hover:text-indigo-400 transition-all text-xs uppercase tracking-widest flex-shrink-0"
                            >
                                + Dodaj Slot Zdjęcia
                            </button>
                        </div>

                        {/* Symulator przeniesiony na lewo i powiększony o 50% */}
                        <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl overflow-hidden h-[600px] relative flex-shrink-0 flex flex-col">
                            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 mb-4 flex items-center flex-shrink-0">
                                <Box className="w-4 h-4 mr-2 text-indigo-400" /> Symulator Układu Kafelków
                            </h2>
                            <div className="relative flex-grow w-full overflow-y-auto overflow-x-hidden custom-scrollbar bg-slate-50 rounded-lg border border-slate-700 p-2">
                                <div className="origin-top-left scale-[1.05] w-[95%] mx-auto">
                                    <TileSimulator customSections={allegroSections} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Prawa kolumna: GEO/AEO */}
                    <div className="xl:col-span-7 flex flex-col h-full">
                        <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl flex flex-col flex-grow">
                            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 mb-6 flex items-center flex-shrink-0">
                                <Database className="w-4 h-4 mr-2 text-indigo-400" /> Moduły Sprzedażowe (GEO/AEO)
                            </h2>
                            <div className="space-y-6 overflow-y-auto pr-2 custom-scrollbar flex-grow" style={{ minHeight: '600px' }}>
                                {[
                                    { key: 'opis1', label: 'Moduł 1: Mocne Strony' },
                                    { key: 'opis2', label: 'Moduł 2: Główny Opis' },
                                    { key: 'opis3', label: 'Moduł 3: Detale' },
                                    { key: 'opis4', label: 'Moduł 4: Specyfikacja' },
                                    { key: 'opis5', label: 'Moduł 5: INCI / Bezpieczeństwo' }
                                ].map((sec) => (
                                    <div key={`${editorKey}-${sec.key}`}>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">{sec.label}</label>
                                        <div className="bg-slate-50 rounded-lg overflow-hidden border border-slate-700">
                                            <StrictWysiwyg 
                                                initialContent={editorHtml[sec.key] || ""} 
                                                onChange={html => setEditorHtml(prev => ({ ...prev, [sec.key]: html }))} 
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* 3. OSINT */}
                <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl">
                    <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 mb-6 flex items-center justify-between">
                        <span className="flex items-center"><Tag className="w-4 h-4 mr-2 text-indigo-400" /> Parametry Cech (OSINT)</span>
                        {categorySchema && <span className="bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded text-[9px]">Schema: {categorySchema.name}</span>}
                    </h2>

                    <div className="mb-4 space-y-2">
                        <label className="text-[10px] uppercase font-bold text-slate-600 block">ID Kategorii Allegro (Data Quality)</label>
                        <input type="text" placeholder="Np. 257745" value={pimData.allegroCategoryId || ''} onChange={e => handlePimChange('allegroCategoryId', e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:border-indigo-500 outline-none" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 max-h-64 overflow-y-auto custom-scrollbar pr-2">
                        {categorySchema?.parameters ? categorySchema.parameters.map(param => {
                            const isRequired = param.required;
                            const val = (pimData.features || {})[param.name] || '';
                            return (
                            <div key={param.id} className="border border-slate-800 p-2 rounded-lg bg-slate-950">
                                <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1 flex justify-between">
                                    <span>{param.name}</span> {isRequired && <span className="text-[8px] text-rose-500">Wymagane</span>}
                                </label>
                                {param.dictionary && param.dictionary.length > 0 ? (
                                    <select className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white outline-none" value={val} onChange={e => handleFeatureChange(param.name, e.target.value)}>
                                        <option value="">Wybierz...</option>
                                        {param.dictionary.map(d => <option key={d.id} value={d.value}>{d.value}</option>)}
                                    </select>
                                ) : (
                                    <input type="text" value={val} onChange={e => handleFeatureChange(param.name, e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white outline-none" />
                                )}
                            </div>
                            );
                        }) : Object.entries(pimData.features || {}).map(([key, val]) => (
                            <div key={key}>
                                <label className="text-[10px] uppercase font-bold text-slate-600 block mb-1">{key}</label>
                                <input type="text" value={val} onChange={e => handleFeatureChange(key, e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:border-indigo-500 outline-none transition-colors" />
                            </div>
                        ))}
                        {!categorySchema?.parameters && Object.keys(pimData.features || {}).length === 0 && (
                            <div className="text-xs text-slate-500 text-center py-4 italic xl:col-span-3">Brak wygenerowanych cech.</div>
                        )}
                    </div>
                </div>

                {/* 4. Identyfikacja PIM */}
                <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl">
                    <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 mb-6 flex items-center">
                        <Tag className="w-4 h-4 mr-2 text-indigo-400" /> Identyfikacja PIM
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-600 block mb-1">SKU</label>
                            <input type="text" value={pimData.sku || ''} onChange={e => handlePimChange('sku', e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none font-mono" />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-600 block mb-1">Marka</label>
                            <select value={pimData.brandId || ''} onChange={e => handlePimChange('brandId', e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none">
                                <option value="">Wybierz markę...</option>
                                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-600 block mb-1">ID Subiekt</label>
                            <input type="text" value={pimData.subiektId || ''} onChange={e => handlePimChange('subiektId', e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none" />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-600 block mb-1">Status</label>
                            <select value={pimData.status || 'Aktywny'} onChange={e => handlePimChange('status', e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none">
                                <option value="Aktywny">Aktywny</option>
                                <option value="Szkic">Szkic</option>
                                <option value="Archiwalny">Archiwalny</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* 5. Logistyka i Gabaryty */}
                <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl">
                    <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 mb-6 flex items-center">
                        <Box className="w-4 h-4 mr-2 text-indigo-400" /> Logistyka i Gabaryty
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-600 block mb-1">Waga (kg)</label>
                            <input type="number" step="0.01" value={pimData.weight} onChange={e => handlePimChange('weight', e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none transition-colors" />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-600 block mb-1">VAT (%)</label>
                            <input type="number" value={pimData.taxRate} onChange={e => handlePimChange('taxRate', e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none transition-colors" />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-600 block mb-1">Długość (cm)</label>
                            <input type="number" value={pimData.length} onChange={e => handlePimChange('length', e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none transition-colors" />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-600 block mb-1">Szerokość (cm)</label>
                            <input type="number" value={pimData.width} onChange={e => handlePimChange('width', e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none transition-colors" />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-600 block mb-1">Wysokość (cm)</label>
                            <input type="number" value={pimData.height} onChange={e => handlePimChange('height', e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none transition-colors" />
                        </div>
                    </div>
                </div>

                {/* 6. Unit Economics */}
                <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl">
                    <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 mb-6 flex items-center">
                        <TrendingUp className="w-4 h-4 mr-2 text-indigo-400" /> Unit Economics
                    </h2>
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div>
                                <label className="text-[10px] uppercase font-bold text-slate-600 block mb-1">Zakup Netto</label>
                                <input type="number" step="0.01" value={pimData.basePrice || 0} onChange={e => handlePimChange('basePrice', e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none" />
                            </div>
                            <div>
                                <label className="text-[10px] uppercase font-bold text-slate-600 block mb-1">Dostawa Inbound</label>
                                <input type="number" step="0.01" value={pimData.inboundTransportCost || 0} onChange={e => handlePimChange('inboundTransportCost', e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none" />
                            </div>
                            <div>
                                <label className="text-[10px] uppercase font-bold text-slate-600 block mb-1">Opakowania</label>
                                <input type="number" step="0.01" value={pimData.packagingCost || 0} onChange={e => handlePimChange('packagingCost', e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none" />
                            </div>
                            <div>
                                <label className="text-[10px] uppercase font-bold text-slate-600 block mb-1">Podatek BDO</label>
                                <input type="number" step="0.01" value={pimData.bdoEprCost || 0} onChange={e => handlePimChange('bdoEprCost', e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none" />
                            </div>
                        </div>
                        <div className="border-t border-slate-800 pt-4 mt-2">
                            <label className="text-[10px] uppercase font-black text-indigo-400 block mb-1">Cena Sprzedaży Detal.</label>
                            <input type="number" step="0.01" value={pimData.salePrice || 0} onChange={e => handlePimChange('salePrice', e.target.value)} className="w-full bg-indigo-950 border border-indigo-800 rounded-lg px-3 py-2 text-lg font-black text-white focus:border-indigo-500 outline-none" />
                        </div>
                    </div>
                </div>

                {/* 7. Architektura Zapasów */}
                <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl">
                    <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 mb-6 flex items-center">
                        <Layers className="w-4 h-4 mr-2 text-indigo-400" /> Architektura Zapasów
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="flex justify-between items-center bg-slate-950 p-3 rounded-lg border border-slate-800">
                            <span className="text-xs font-bold text-slate-400">Główny Zapas (PIM)</span>
                            <input type="number" value={pimData.stock || 0} onChange={e => handlePimChange('stock', e.target.value)} className="w-20 bg-slate-900 border border-slate-800 rounded-md px-2 py-1 text-sm font-mono text-white text-right outline-none focus:border-indigo-500" />
                        </div>
                        <div className="flex justify-between items-center bg-slate-950 p-3 rounded-lg border border-slate-800 opacity-70">
                            <span className="text-xs font-bold text-slate-400">Magazyn ERP</span>
                            <span className="text-sm font-mono text-indigo-400">{pimData.stockErpUnits} szt.</span>
                        </div>
                        <div className="flex justify-between items-center bg-slate-950 p-3 rounded-lg border border-slate-800 opacity-70">
                            <span className="text-xs font-bold text-slate-400">Magazyn WMS</span>
                            <span className="text-sm font-mono text-emerald-400">{pimData.stockWmsUnits} szt.</span>
                        </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-800">
                        <label className="text-[10px] uppercase font-bold text-slate-600 block mb-1">Wideo URL (Opcjonalnie)</label>
                        <input type="text" placeholder="https://youtube.com/..." value={pimData.videoUrl || ''} onChange={e => handlePimChange('videoUrl', e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:border-indigo-500 outline-none" />
                    </div>
                </div>

            </div>

            {/* Pływający pasek akcji */}
            <div className="fixed bottom-0 left-0 right-0 bg-slate-950/80 backdrop-blur-xl border-t border-slate-800 p-4 shadow-2xl flex justify-end space-x-4 px-8 z-50">
                <button 
                    onClick={() => setIsDashboardActive(false)}
                    className="flex items-center px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold uppercase tracking-wider text-xs rounded-lg transition-all"
                >
                    <X className="w-4 h-4 mr-2" /> Anuluj / Wróć
                </button>
                <button 
                    onClick={handleSaveDraft} disabled={isSavingDraft}
                    className="flex items-center px-6 py-3 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-white font-bold uppercase tracking-wider text-xs rounded-lg transition-all"
                >
                    <Save className={`w-4 h-4 mr-2 ${isSavingDraft ? 'animate-pulse text-indigo-400' : 'text-slate-400'}`} />
                    {isSavingDraft ? "Zapisywanie..." : "Zapisz do PIM"}
                </button>
                <button 
                    onClick={handleExportToBaselinker} disabled={isExporting}
                    className="flex items-center px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest text-xs rounded-lg shadow-lg shadow-indigo-500/20 transition-all hover:-translate-y-0.5"
                >
                    {isExporting ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                    {isExporting ? "Eksport w toku..." : "Eksportuj z BaseLinker"}
                </button>
            </div>

            <ImageModal url={viewingImageUrl} onClose={() => setViewingImageUrl(null)} />
        </div>
    );
};
