import React, { useState } from 'react';
import axios from 'axios';
import { 
    Search, 
    Sparkles, 
    Video, 
    Image as ImageIcon, 
    Clock, 
    TrendingUp, 
    CheckCircle2, 
    Copy, 
    Play, 
    Send, 
    Loader2, 
    AlertTriangle, 
    Layers, 
    ShieldCheck, 
    ChevronRight,
    Flame
} from 'lucide-react';

const AdIntelligenceTool = ({ token, API_URL, campaigns }) => {
    // Krok 1: Stan wejściowy skanera
    const [query, setQuery] = useState('Kosmetyki do pielęgnacji / K-Beauty');
    const [brandName, setBrandName] = useState('Skin Care Korea');
    const [brandUsp, setBrandUsp] = useState('Włoska i koreańska technologia liposomowa, czyste INCI bez alkoholu i parabenów');
    const [brandProof, setBrandProof] = useState('Ponad 12 000 klientek, badania aplikacyjne pod nadzorem dermatologów, ocena 4.9/5');
    const [customDatasetJson, setCustomDatasetJson] = useState('');
    const [showDatasetInput, setShowDatasetInput] = useState(false);

    // Krok 2: Stan analizy i syntezy
    const [isScanning, setIsScanning] = useState(false);
    const [scanData, setScanData] = useState(null);
    const [selectedAngleTab, setSelectedAngleTab] = useState(0);

    // Krok 3: Stan generacji assetów multimedialnych
    const [isGeneratingAssets, setIsGeneratingAssets] = useState(false);
    const [generatedAssets, setGeneratedAssets] = useState([]);

    // Krok 4: Eksport do Harmonogramu SMI
    const [selectedCampaignId, setSelectedCampaignId] = useState(campaigns && campaigns.length > 0 ? campaigns[0].id : '');
    const [isExporting, setIsExporting] = useState(false);
    const [exportSuccessMessage, setExportSuccessMessage] = useState(null);

    // Lightbox / Video Modal
    const [activeMediaModal, setActiveMediaModal] = useState(null);

    // Uruchomienie skanera i analizy Gemini
    const handleStartScan = async () => {
        setIsScanning(true);
        setScanData(null);
        setGeneratedAssets([]);
        setExportSuccessMessage(null);

        let parsedDataset = null;
        if (customDatasetJson.trim()) {
            try {
                parsedDataset = JSON.parse(customDatasetJson);
            } catch (err) {
                alert('Niepoprawny format JSON wklejonego datasetu. Zostanie użyty domyślny skaner OSINT.');
            }
        }

        try {
            const res = await axios.post(`${API_URL}/api/ad-intelligence/scan`, {
                query,
                dataset: parsedDataset,
                brandProfile: {
                    name: brandName,
                    usp: brandUsp,
                    proof: brandProof
                },
                limit: 50
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.data && res.data.success) {
                setScanData(res.data);
            } else {
                alert('Błąd skanowania: ' + (res.data?.error || 'Nieznany błąd'));
            }
        } catch (err) {
            console.error('Błąd skanowania rynku:', err);
            alert('Wystąpił błąd podczas analizy: ' + (err.response?.data?.error || err.message));
        } finally {
            setIsScanning(false);
        }
    };

    // Uruchomienie generacji fizycznych assetów (Statyki + Reels)
    const handleGenerateAssets = async () => {
        if (!scanData || !scanData.strategy) return;
        setIsGeneratingAssets(true);

        const briefsToGenerate = [
            ...(scanData.strategy.static_ad_briefs || []).map(b => ({ type: 'STATIC', brief: b })),
            ...(scanData.strategy.reels_briefs || []).map(b => ({ type: 'REELS', brief: b }))
        ];

        try {
            const res = await axios.post(`${API_URL}/api/ad-intelligence/generate-assets`, {
                briefs: briefsToGenerate,
                brandProfile: { name: brandName }
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.data && res.data.success) {
                setGeneratedAssets(res.data.generatedAssets || []);
            } else {
                alert('Błąd generowania assetów: ' + (res.data?.error || 'Nieznany błąd'));
            }
        } catch (err) {
            console.error('Błąd generowania assetów:', err);
            alert('Wystąpił błąd: ' + (err.response?.data?.error || err.message));
        } finally {
            setIsGeneratingAssets(false);
        }
    };

    // Eksport do Harmonogramu SMI (tabela SmiPost)
    const handleExportToSmi = async () => {
        if (!selectedCampaignId) {
            return alert('Wybierz docelową kampanię przed eksportem!');
        }
        if (generatedAssets.length === 0) {
            return alert('Najpierw wygeneruj kreacje, aby móc je wyeksportować do harmonogramu.');
        }

        setIsExporting(true);
        try {
            const res = await axios.post(`${API_URL}/api/ad-intelligence/export-smi`, {
                campaignId: selectedCampaignId,
                brandName: brandName,
                items: generatedAssets
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.data && res.data.success) {
                setExportSuccessMessage(`Pomyślnie utworzono ${res.data.count} postów w Harmonogramie SMI kampanii "${res.data.campaignName}"! Status: "Do Akceptacji".`);
            } else {
                alert('Błąd eksportu: ' + (res.data?.error || 'Nieznany błąd'));
            }
        } catch (err) {
            console.error('Błąd eksportu:', err);
            alert('Nie udało się wyeksportować do SMI: ' + (err.response?.data?.error || err.message));
        } finally {
            setIsExporting(false);
        }
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        alert('Skopiowano do schowka: ' + text.substring(0, 40) + '...');
    };

    return (
        <div className="flex-1 flex flex-col bg-slate-100 overflow-y-auto custom-scrollbar p-6 space-y-6 text-slate-800">
            
            {/* Modal podglądu mediów (Wideo / Obraz) */}
            {activeMediaModal && (
                <div className="fixed inset-0 bg-slate-950/85 z-[400] flex items-center justify-center p-4 backdrop-blur-md" onClick={() => setActiveMediaModal(null)}>
                    <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden max-w-lg w-full shadow-2xl relative" onClick={e => e.stopPropagation()}>
                        <div className="p-3 bg-slate-800 border-b border-slate-700 flex justify-between items-center text-white">
                            <span className="text-xs font-bold flex items-center">
                                {activeMediaModal.mediaType === 'video' ? <Video className="w-4 h-4 mr-2 text-pink-400" /> : <ImageIcon className="w-4 h-4 mr-2 text-indigo-400" />}
                                {activeMediaModal.headline || 'Podgląd kreacji'}
                            </span>
                            <button onClick={() => setActiveMediaModal(null)} className="text-slate-400 hover:text-white font-bold text-sm">✕</button>
                        </div>
                        <div className="flex justify-center items-center bg-black p-4">
                            {activeMediaModal.mediaType === 'video' ? (
                                <video 
                                    src={`${API_URL}${activeMediaModal.mediaUrl}`} 
                                    controls 
                                    autoPlay 
                                    className="max-h-[75vh] rounded-lg shadow-lg aspect-[9/16]" 
                                />
                            ) : (
                                <img 
                                    src={`${API_URL}${activeMediaModal.mediaUrl}`} 
                                    className="max-h-[75vh] object-contain rounded-lg shadow-lg" 
                                    alt="Kreacja" 
                                />
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* HEADER MODUŁU */}
            <div className="bg-white border border-slate-300 rounded-xl p-6 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-700 uppercase tracking-widest border border-indigo-200">
                            Multi-Agent Swarm
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-700 uppercase tracking-widest border border-emerald-200">
                            Zero Placeholders
                        </span>
                    </div>
                    <h1 className="text-xl font-black text-slate-900 flex items-center">
                        <Sparkles className="w-5 h-5 mr-2 text-indigo-600" /> Ad Intelligence & Creative Studio
                    </h1>
                    <p className="text-xs text-slate-500 mt-1">
                        Skaner reklam konkurencji, analiza Time-Decay (Gemini 3.8 Flash), synteza 28 hooków (Gemini 3.1 Pro) oraz montaż kreacji (Imagen 3 / Sharp / FFmpeg).
                    </p>
                </div>
            </div>

            {/* KROK 1: FORMULARZ SKANERA */}
            <div className="bg-white border border-slate-300 rounded-xl p-6 shadow-sm space-y-4">
                <div className="border-b border-slate-200 pb-3 flex justify-between items-center">
                    <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center">
                        <Search className="w-4 h-4 mr-2 text-indigo-600" /> 1. Konfiguracja Skanera Rynku & Profilu Marki
                    </h2>
                    <button 
                        onClick={() => setShowDatasetInput(!showDatasetInput)}
                        className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
                    >
                        {showDatasetInput ? 'Ukryj wklejanie JSON' : '+ Wklej własny dataset (Apify/Meta JSON)'}
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">Słowa kluczowe / Nisza konkurencji</label>
                        <input 
                            type="text"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="np. Kosmetyki nawilżające / Pielęgnacja twarzy"
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold focus:bg-white focus:border-indigo-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">Nazwa Twojej Marki (w Nexus ERP)</label>
                        <input 
                            type="text"
                            value={brandName}
                            onChange={e => setBrandName(e.target.value)}
                            placeholder="np. Skin Care Korea"
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold focus:bg-white focus:border-indigo-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">Główna Obietnica & USP Marki</label>
                        <input 
                            type="text"
                            value={brandUsp}
                            onChange={e => setBrandUsp(e.target.value)}
                            placeholder="np. Włoska formuła liposomowa, czyste INCI"
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold focus:bg-white focus:border-indigo-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">Twarde Dowody & Social Proof</label>
                        <input 
                            type="text"
                            value={brandProof}
                            onChange={e => setBrandProof(e.target.value)}
                            placeholder="np. Badania kliniczne, ponad 12 000 klientek"
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold focus:bg-white focus:border-indigo-500 outline-none"
                        />
                    </div>
                </div>

                {showDatasetInput && (
                    <div className="pt-2 animate-in fade-in">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">Opcjonalnie: Wklej tablicę JSON reklam z Apify / Meta Ad Library</label>
                        <textarea 
                            rows={4}
                            value={customDatasetJson}
                            onChange={e => setCustomDatasetJson(e.target.value)}
                            placeholder='[ { "headline": "...", "copy": "...", "startDate": "2026-07-01" } ]'
                            className="w-full p-3 bg-slate-50 border border-slate-300 rounded-lg font-mono text-[11px] outline-none focus:bg-white focus:border-indigo-500"
                        />
                    </div>
                )}

                <div className="pt-2 flex justify-end">
                    <button
                        onClick={handleStartScan}
                        disabled={isScanning || !query}
                        className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-md flex items-center transition-all disabled:opacity-50"
                    >
                        {isScanning ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Skanowanie rynku & Audyt Gemini...
                            </>
                        ) : (
                            <>
                                <Sparkles className="w-4 h-4 mr-2" />
                                Zeskanuj Rynek & Uruchom Gemini Swarm
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* KROK 2: WYNIKI SKANOWANIA (TOP WINNERS & MARKET INSIGHTS) */}
            {scanData && (
                <div className="space-y-6 animate-in fade-in duration-300">
                    
                    {/* Insights Box */}
                    <div className="bg-slate-900 text-white rounded-xl p-6 shadow-md border border-slate-800">
                        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
                            <span className="text-xs font-black uppercase tracking-widest text-indigo-400 flex items-center">
                                <TrendingUp className="w-4 h-4 mr-2" /> Analiza Rynkowa (Zeskanowano: {scanData.totalScanned} reklam)
                            </span>
                            <span className="text-[11px] font-bold text-slate-400">Silnik: Gemini 3.8 Flash + Gemini 3.1 Pro</span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                            <div className="bg-slate-800/60 p-4 rounded-lg border border-red-500/20">
                                <span className="font-bold text-red-400 flex items-center mb-2">
                                    <AlertTriangle className="w-3.5 h-3.5 mr-1.5" /> Przesycone komunikaty (Czerwony Ocean):
                                </span>
                                <ul className="list-disc pl-5 space-y-1 text-slate-300 text-[11px]">
                                    {(scanData.marketInsights?.saturated_claims || []).map((c, i) => <li key={i}>{c}</li>)}
                                </ul>
                            </div>
                            <div className="bg-slate-800/60 p-4 rounded-lg border border-emerald-500/20">
                                <span className="font-bold text-emerald-400 flex items-center mb-2">
                                    <ShieldCheck className="w-3.5 h-3.5 mr-1.5" /> Luki Rynkowe (Błękitny Ocean):
                                </span>
                                <ul className="list-disc pl-5 space-y-1 text-slate-300 text-[11px]">
                                    {(scanData.marketInsights?.blue_ocean_angles || []).map((b, i) => <li key={i}>{b}</li>)}
                                </ul>
                            </div>
                        </div>
                    </div>

                    {/* Zwycięzcy Konkurencji (Top Winners wg Time-Decay) */}
                    <div className="bg-white border border-slate-300 rounded-xl p-6 shadow-sm space-y-4">
                        <div className="border-b border-slate-200 pb-3 flex justify-between items-center">
                            <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center">
                                <Flame className="w-4 h-4 mr-2 text-amber-500" /> Zwycięskie Kreacje Konkurencji (Top Winners z długim czasem emisji)
                            </h2>
                            <span className="text-xs text-slate-500 font-semibold">Wyselekcjonowano {scanData.topWinners?.length} benchmarków</span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {(scanData.topWinners || []).map((ad, idx) => (
                                <div key={ad.id || idx} className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-col justify-between hover:shadow-md transition-all">
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center text-[10px]">
                                            <span className="font-black px-2 py-0.5 rounded bg-amber-100 text-amber-800 flex items-center">
                                                <Clock className="w-3 h-3 mr-1" /> {ad.activeDays} dni emisji
                                            </span>
                                            <span className="font-bold text-slate-600 bg-slate-200 px-2 py-0.5 rounded">
                                                Score: {ad.overallWinningScore}/10
                                            </span>
                                        </div>
                                        <h3 className="text-xs font-black text-slate-900 leading-snug">
                                            "{ad.extractedHook}"
                                        </h3>
                                        <p className="text-[11px] text-slate-600 line-clamp-3">
                                            {ad.copy}
                                        </p>
                                    </div>
                                    <div className="mt-3 pt-2 border-t border-slate-200 text-[10px] text-slate-500">
                                        <span className="font-bold text-indigo-600">Dlaczego działa:</span> {ad.whyItWorks}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 28 HACZYKÓW & KĄTY PSYCHOLOGICZNE */}
                    {scanData.strategy && (
                        <div className="bg-white border border-slate-300 rounded-xl p-6 shadow-sm space-y-4">
                            <div className="border-b border-slate-200 pb-3 flex justify-between items-center">
                                <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center">
                                    <Layers className="w-4 h-4 mr-2 text-indigo-600" /> Matryca 28 Haczyków (Zgodnych z Twoją Marką)
                                </h2>
                                <span className="text-xs font-bold text-indigo-600">Gemini 3.1 Pro Strategy</span>
                            </div>

                            {/* Angle Tabs */}
                            <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                                {(scanData.strategy.angles || []).map((angle, idx) => (
                                    <button
                                        key={angle.id}
                                        onClick={() => setSelectedAngleTab(idx)}
                                        className={`px-4 py-2 rounded-lg text-xs font-bold shrink-0 transition-all ${selectedAngleTab === idx ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                    >
                                        Kąt {angle.id}: {angle.name}
                                    </button>
                                ))}
                            </div>

                            {/* Hooks list for selected angle */}
                            <div className="space-y-2 pt-2">
                                {(scanData.strategy.hooks_28 || [])
                                    .filter(h => h.angle_id === (scanData.strategy.angles[selectedAngleTab]?.id || 'A1'))
                                    .map(hook => (
                                        <div key={hook.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between gap-3 text-xs">
                                            <div className="flex items-center gap-3">
                                                <span className="font-mono font-bold text-slate-400">#{hook.id}</span>
                                                <span className="font-bold text-slate-800">{hook.hook_text}</span>
                                                <span className="px-2 py-0.5 rounded text-[9px] font-black bg-indigo-50 text-indigo-600 border border-indigo-100 uppercase">
                                                    {hook.format}
                                                </span>
                                            </div>
                                            <button 
                                                onClick={() => copyToClipboard(hook.hook_text)}
                                                className="text-slate-400 hover:text-indigo-600 transition-colors shrink-0" 
                                                title="Kopiuj"
                                            >
                                                <Copy className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                            </div>

                            {/* Action to Generate Assets */}
                            <div className="pt-4 border-t border-slate-200 flex justify-between items-center">
                                <span className="text-xs text-slate-500 font-medium">
                                    Gotowe briefy: {scanData.strategy.static_ad_briefs?.length || 0} statyków + {scanData.strategy.reels_briefs?.length || 0} Reels
                                </span>
                                <button
                                    onClick={handleGenerateAssets}
                                    disabled={isGeneratingAssets}
                                    className="px-6 py-2.5 bg-pink-600 hover:bg-pink-700 text-white rounded-lg text-xs font-bold shadow-md flex items-center transition-all disabled:opacity-50"
                                >
                                    {isGeneratingAssets ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            Generowanie Statyków & Montaż Reels (FFmpeg)...
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="w-4 h-4 mr-2" />
                                            Wygeneruj Gotowe Kreacje (Statyki Imagen/Sharp + Reels FFmpeg)
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* KROK 3: WYGENEROWANE ASSETY (STATYKI & REELS) */}
            {generatedAssets.length > 0 && (
                <div className="bg-white border border-slate-300 rounded-xl p-6 shadow-sm space-y-6 animate-in fade-in duration-300">
                    <div className="border-b border-slate-200 pb-3 flex justify-between items-center">
                        <div>
                            <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center">
                                <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-600" /> Gotowe Kreacje Multimedialne ({generatedAssets.length} sztuk)
                            </h2>
                            <p className="text-xs text-slate-500">Materiały wyrenderowane lokalnie (statyki PNG 1080x1080 + wideo Reels MP4 9:16)</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {generatedAssets.map((asset, idx) => (
                            <div key={asset.id || idx} className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col justify-between">
                                <div>
                                    {/* Podgląd Mediów */}
                                    <div 
                                        className="h-64 bg-slate-900 relative cursor-pointer group flex items-center justify-center overflow-hidden"
                                        onClick={() => setActiveMediaModal(asset)}
                                    >
                                        {asset.mediaType === 'video' ? (
                                            <video 
                                                src={`${API_URL}${asset.mediaUrl}`} 
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform" 
                                            />
                                        ) : (
                                            <img 
                                                src={`${API_URL}${asset.mediaUrl}`} 
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform" 
                                                alt="Podgląd" 
                                            />
                                        )}
                                        
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <span className="px-3 py-1.5 rounded-full bg-white text-slate-900 font-bold text-xs flex items-center shadow-lg">
                                                {asset.mediaType === 'video' ? <Play className="w-3.5 h-3.5 mr-1" /> : <Search className="w-3.5 h-3.5 mr-1" />}
                                                Powiększ
                                            </span>
                                        </div>

                                        <div className="absolute top-2 left-2">
                                            <span className="px-2 py-0.5 rounded text-[9px] font-black bg-slate-900/80 text-white uppercase backdrop-blur-sm">
                                                {asset.format}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Treść i Copy */}
                                    <div className="p-4 space-y-2">
                                        <h3 className="text-xs font-black text-slate-900 leading-snug">
                                            {asset.headline}
                                        </h3>
                                        <p className="text-[11px] text-slate-600 line-clamp-3 whitespace-pre-line">
                                            {asset.content}
                                        </p>
                                        <div className="text-[10px] text-indigo-600 font-bold">
                                            {asset.hashtags}
                                        </div>
                                    </div>
                                </div>

                                <div className="p-4 pt-2 border-t border-slate-200 flex justify-between items-center text-[10px] text-slate-500">
                                    <span>Budżet: <strong className="text-slate-800">{asset.adBudgetInfo}</strong></span>
                                    <span className="text-emerald-600 font-bold">Gotowe do publikacji</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* KROK 4: EKSPORT DO HARMONOGRAMU SMI */}
                    <div className="bg-slate-50 border border-indigo-200 rounded-xl p-5 flex flex-col md:flex-row items-center justify-between gap-4">
                        <div>
                            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center">
                                <Send className="w-4 h-4 mr-2 text-indigo-600" /> Eksport do Harmonogramu SMI (Nexus ERP)
                            </h3>
                            <p className="text-[11px] text-slate-600 mt-0.5">
                                Przenieś wygenerowane kreacje wprost do kalendarza postów w statusie "Do Akceptacji".
                            </p>
                        </div>

                        <div className="flex items-center gap-3 w-full md:w-auto">
                            <select 
                                value={selectedCampaignId}
                                onChange={e => setSelectedCampaignId(e.target.value)}
                                className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold outline-none text-slate-800 cursor-pointer min-w-[200px]"
                            >
                                <option value="">-- Wybierz Kampanię --</option>
                                {(campaigns || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>

                            <button
                                onClick={handleExportToSmi}
                                disabled={isExporting || !selectedCampaignId}
                                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm flex items-center transition-all disabled:opacity-50 shrink-0"
                            >
                                {isExporting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
                                Eksportuj do Harmonogramu SMI
                            </button>
                        </div>
                    </div>

                    {exportSuccessMessage && (
                        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-800 flex items-center animate-in fade-in">
                            <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-600 shrink-0" />
                            {exportSuccessMessage}
                        </div>
                    )}
                </div>
            )}

        </div>
    );
};

export default AdIntelligenceTool;
