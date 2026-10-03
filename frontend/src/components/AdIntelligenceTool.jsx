import React, { useState, useEffect, useRef } from 'react';
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
    Flame,
    Edit3,
    RefreshCw,
    RotateCcw,
    X,
    Package,
    DollarSign,
    UploadCloud,
    FileUp,
    FileText,
    Trash2
} from 'lucide-react';

const AdIntelligenceTool = ({ token, API_URL, campaigns }) => {
    // Krok 0: Produkty z PIM
    const [productsList, setProductsList] = useState([]);
    const [isLoadingProducts, setIsLoadingProducts] = useState(false);
    const [productSearch, setProductSearch] = useState('');
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);

    // Krok 1: Stan wejściowy skanera (zgodny z rynkiem polskim, max 300 rekordów)
    const [query, setQuery] = useState('');
    const [brandName, setBrandName] = useState('');
    const [brandUsp, setBrandUsp] = useState('');
    const [brandProof, setBrandProof] = useState('');
    const [customProductImgUrl, setCustomProductImgUrl] = useState('');
    const [isUploadingMaterial, setIsUploadingMaterial] = useState(false);
    const [uploadedMaterial, setUploadedMaterial] = useState(null);
    const [isUploadingModalMaterial, setIsUploadingModalMaterial] = useState(false);
    const mainFileInputRef = useRef(null);
    const modalFileInputRef = useRef(null);

    const [scanLimit, setScanLimit] = useState(100);
    const [apifyToken, setApifyToken] = useState('');
    const [apifyDatasetId, setApifyDatasetId] = useState('');
    const [customDatasetJson, setCustomDatasetJson] = useState('');
    const [showDatasetInput, setShowDatasetInput] = useState(false);
    const [showAdvancedApify, setShowAdvancedApify] = useState(false);

    // Krok 2: Stan analizy i syntezy
    const [isScanning, setIsScanning] = useState(false);
    const [scanData, setScanData] = useState(null);
    const [selectedAngleTab, setSelectedAngleTab] = useState(0);

    // Krok 3: Stan generacji assetów multimedialnych
    const [isGeneratingAssets, setIsGeneratingAssets] = useState(false);
    const [generatedAssets, setGeneratedAssets] = useState([]);

    // Krok 4: HITL Studio - Modal edycji i re-renderu kreacji
    const [editingAsset, setEditingAsset] = useState(null);
    const [isReRendering, setIsReRendering] = useState(false);

    // Krok 5: Eksport do Harmonogramu SMI
    const [selectedCampaignId, setSelectedCampaignId] = useState(campaigns && campaigns.length > 0 ? campaigns[0].id : '');
    const [isExporting, setIsExporting] = useState(false);
    const [exportSuccessMessage, setExportSuccessMessage] = useState(null);

    // Lightbox / Video Modal
    const [activeMediaModal, setActiveMediaModal] = useState(null);

    // Pobieranie listy produktów z PIM przy montowaniu komponentu
    useEffect(() => {
        fetchProductsFromPim();
    }, []);

    const fetchProductsFromPim = async (searchTerm = '') => {
        setIsLoadingProducts(true);
        try {
            const res = await axios.get(`${API_URL}/api/ad-intelligence/products`, {
                params: { search: searchTerm },
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data && res.data.success) {
                const prods = res.data.products || [];
                setProductsList(prods);
                // Celowo NIE wybieramy automatycznie żadnego produktu z bazy PIM.
                // Formularz pozostaje czysty i gotowy do wpisania dowolnego produktu/kategorii spoza PIM.
            }
        } catch (err) {
            console.error('Błąd pobierania produktów z PIM:', err);
        } finally {
            setIsLoadingProducts(false);
        }
    };

    // Obsługa wyboru produktu z PIM
    const handleSelectProduct = (prod) => {
        if (!prod) return;
        setSelectedProduct(prod);
        setIsProductDropdownOpen(false);

        // Automatyczne wypełnienie parametrów skanera danymi produktu
        if (prod.name) setQuery(prod.name);
        if (prod.brand?.name) {
            setBrandName(prod.brand.name);
        } else {
            const extractedBrand = prod.name ? prod.name.split(' ')[0] : 'Nasza Marka';
            setBrandName(extractedBrand);
        }

        if (prod.imageUrl) {
            setCustomProductImgUrl(prod.imageUrl);
        }

        if (prod.features) {
            const featText = typeof prod.features === 'string' ? prod.features : JSON.stringify(prod.features);
            setBrandUsp(`Unikalna formuła: ${featText.replace(/[{"}\[\]]/g, ' ').trim().substring(0, 120)}`);
        } else if (prod.descriptionHtml) {
            const cleanDesc = prod.descriptionHtml.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
            setBrandUsp(cleanDesc.substring(0, 120) || 'Wysoka wydajność, niezawodna jakość i sprawdzona formuła');
        } else {
            setBrandUsp('Wysoka wydajność, profesjonalny standard i konkurencyjna cena rynkowa');
        }

        const priceStr = prod.salePrice ? `Cena: ${Number(prod.salePrice).toFixed(2)} zł. ` : '';
        const eanStr = prod.ean ? `EAN: ${prod.ean}. ` : '';
        setBrandProof(`${priceStr}${eanStr}Oficjalna dystrybucja, gwarancja jakości, zgodność z normami UE i GPSR.`);
    };

    const handleClearSelectedProduct = () => {
        setSelectedProduct(null);
        setCustomProductImgUrl('');
        setUploadedMaterial(null);
        if (mainFileInputRef.current) mainFileInputRef.current.value = '';
    };

    // Wgrywanie pliku z komputera (zdjęcie, wideo, packshot)
    const handleFileUpload = async (event, isModal = false) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        if (isModal) {
            setIsUploadingModalMaterial(true);
        } else {
            setIsUploadingMaterial(true);
        }

        try {
            const res = await axios.post(`${API_URL}/api/ad-intelligence/upload-material`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    Authorization: `Bearer ${token}`
                }
            });

            if (res.data && res.data.success) {
                const uploadedUrl = res.data.url;
                if (isModal) {
                    setEditingAsset(prev => ({
                        ...prev,
                        editProductImg: uploadedUrl
                    }));
                } else {
                    setCustomProductImgUrl(uploadedUrl);
                    setUploadedMaterial({
                        originalName: res.data.originalName,
                        size: res.data.size,
                        mediaType: res.data.mediaType,
                        url: uploadedUrl
                    });
                }
            } else {
                alert('Błąd podczas wgrywania pliku: ' + (res.data?.error || 'Nieznany błąd'));
            }
        } catch (err) {
            console.error('Błąd uploadu pliku z dysku:', err);
            alert('Nie udało się wgrać pliku: ' + (err.response?.data?.error || err.message));
        } finally {
            if (isModal) {
                setIsUploadingModalMaterial(false);
                if (modalFileInputRef.current) modalFileInputRef.current.value = '';
            } else {
                setIsUploadingMaterial(false);
                if (mainFileInputRef.current) mainFileInputRef.current.value = '';
            }
        }
    };

    // Całkowite wyczyszczenie formularza i przywrócenie stanu początkowego
    const handleResetForm = () => {
        setSelectedProduct(null);
        setProductSearch('');
        setQuery('');
        setBrandName('');
        setBrandUsp('');
        setBrandProof('');
        setCustomProductImgUrl('');
        setUploadedMaterial(null);
        setCustomDatasetJson('');
        setApifyDatasetId('');
        setScanData(null);
        setGeneratedAssets([]);
        setExportSuccessMessage(null);
        if (mainFileInputRef.current) mainFileInputRef.current.value = '';
    };

    // Bezpieczne rozwiązywanie adresu URL mediów (Supabase CDN vs ścieżka lokalna vs Base64)
    const resolveMediaUrl = (asset) => {
        if (!asset) return '';
        // 1. Jeśli dostępny jest inline Base64 data URI, renderuj natychmiast
        if (asset.base64DataUrl) return asset.base64DataUrl;

        const url = asset.mediaUrl || asset.localUrl;
        if (!url) return '';

        // 2. Jeśli to pełny URL (Supabase CDN https:// lub Base64)
        if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
            return url;
        }

        // 3. Względna ścieżka lokalna serwera Express
        return `${API_URL}${url.startsWith('/') ? '' : '/'}${url}`;
    };

    // Uruchomienie skanera i analizy Gemini (rynek PL, max 300 rekordów)
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

        // Rygorystyczny limit dla rynku polskiego (max 300)
        const safeLimit = Math.min(Math.max(parseInt(scanLimit) || 100, 1), 300);

        try {
            const res = await axios.post(`${API_URL}/api/ad-intelligence/scan`, {
                query,
                dataset: parsedDataset,
                apifyToken: apifyToken.trim() || null,
                apifyDatasetId: apifyDatasetId.trim() || null,
                brandProfile: {
                    name: brandName,
                    usp: brandUsp,
                    proof: brandProof,
                    customProductImgUrl: customProductImgUrl.trim() || (selectedProduct?.imageUrl || null)
                },
                productId: selectedProduct ? selectedProduct.id : null,
                limit: safeLimit
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

    // Uruchomienie generacji fizycznych assetów (Statyki z packshotem + Reels)
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
                brandProfile: { 
                    name: brandName,
                    usp: brandUsp,
                    proof: brandProof,
                    customProductImgUrl: customProductImgUrl.trim() || (selectedProduct?.imageUrl || null)
                },
                productId: selectedProduct ? selectedProduct.id : null
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

    // Otwarcie modalnego studia korekty HITL dla wybranej kreacji
    const handleOpenEditModal = (asset, index) => {
        setEditingAsset({
            ...asset,
            assetIndex: index,
            editHeadline: asset.headline || '',
            editSubheadline: asset.subheadline || '',
            editContent: asset.content || '',
            editCta: 'Sprawdź Ofertę',
            editHashtags: asset.hashtags || '',
            editBudget: asset.adBudgetInfo || '250 zł',
            editProductImg: asset.productImageUrl || (selectedProduct?.imageUrl || ''),
            editScenes: Array.isArray(asset.scenes) ? JSON.parse(JSON.stringify(asset.scenes)) : []
        });
    };

    // Zapisanie korekty lokalnie w liście assetów
    const handleSaveEditingAssetLocally = () => {
        if (!editingAsset) return;

        const updated = [...generatedAssets];
        const current = updated[editingAsset.assetIndex];

        updated[editingAsset.assetIndex] = {
            ...current,
            headline: editingAsset.editHeadline,
            subheadline: editingAsset.editSubheadline,
            content: editingAsset.editContent,
            hashtags: editingAsset.editHashtags,
            adBudgetInfo: editingAsset.editBudget,
            productImageUrl: editingAsset.editProductImg,
            scenes: editingAsset.editScenes
        };

        setGeneratedAssets(updated);
        setEditingAsset(null);
    };

    // Ponowne wyrenderowanie kreacji przez silnik Sharp / FFmpeg (HITL Re-Render)
    const handleReRenderEditingAsset = async () => {
        if (!editingAsset) return;
        setIsReRendering(true);

        const briefPayload = {
            id: editingAsset.id,
            headline: editingAsset.editHeadline,
            subheadline: editingAsset.editSubheadline,
            body_copy: editingAsset.editContent,
            cta_text: editingAsset.editCta,
            badge_text: '⭐ 4.9/5 | 100% Czyste Składniki',
            suggested_budget: editingAsset.editBudget,
            hashtags: editingAsset.editHashtags,
            productImageUrl: editingAsset.editProductImg,
            type: editingAsset.mediaType === 'video' ? 'REELS' : 'STATIC',
            format: editingAsset.format,
            scenes: editingAsset.editScenes
        };

        try {
            const res = await axios.post(`${API_URL}/api/ad-intelligence/re-render-asset`, {
                brief: briefPayload,
                brandProfile: { name: brandName },
                productId: selectedProduct ? selectedProduct.id : null
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.data && res.data.success && res.data.asset) {
                const newAsset = res.data.asset;
                const updated = [...generatedAssets];
                updated[editingAsset.assetIndex] = newAsset;
                setGeneratedAssets(updated);

                // Zaktualizuj widok w modalu
                setEditingAsset(prev => ({
                    ...prev,
                    ...newAsset,
                    mediaUrl: newAsset.mediaUrl,
                    base64DataUrl: newAsset.base64DataUrl
                }));
                alert('Kreacja została pomyślnie zrekomponowana i wyrenderowana! ✅');
            } else {
                alert('Błąd re-renderowania: ' + (res.data?.error || 'Nieznany błąd'));
            }
        } catch (err) {
            console.error('Błąd re-renderowania:', err);
            alert('Wystąpił błąd podczas re-renderu: ' + (err.response?.data?.error || err.message));
        } finally {
            setIsReRendering(false);
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

    // Lista zdjęć z produktu wybranego z PIM
    const availableProductImages = selectedProduct ? [
        ...(selectedProduct.imageUrl ? [selectedProduct.imageUrl] : []),
        ...(Array.isArray(selectedProduct.images) ? selectedProduct.images : [])
    ] : [];

    return (
        <div className="flex-1 flex flex-col bg-slate-100 overflow-y-auto custom-scrollbar p-6 space-y-6 text-slate-800">
            
            {/* MODAL PODGLĄDU MEDIÓW (LIGHTBOX) */}
            {activeMediaModal && (
                <div className="fixed inset-0 bg-slate-950/85 z-[400] flex items-center justify-center p-4 backdrop-blur-md" onClick={() => setActiveMediaModal(null)}>
                    <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden max-w-lg w-full shadow-2xl relative" onClick={e => e.stopPropagation()}>
                        <div className="p-3 bg-slate-800 border-b border-slate-700 flex justify-between items-center text-white">
                            <span className="text-xs font-bold flex items-center truncate max-w-[85%]">
                                {activeMediaModal.mediaType === 'video' ? <Video className="w-4 h-4 mr-2 text-pink-400 shrink-0" /> : <ImageIcon className="w-4 h-4 mr-2 text-indigo-400 shrink-0" />}
                                {activeMediaModal.headline || 'Podgląd kreacji'}
                            </span>
                            <button onClick={() => setActiveMediaModal(null)} className="text-slate-400 hover:text-white font-bold text-sm">✕</button>
                        </div>
                        <div className="flex justify-center items-center bg-black p-4 min-h-[300px]">
                            {activeMediaModal.mediaType === 'video' ? (
                                <video 
                                    src={resolveMediaUrl(activeMediaModal)} 
                                    controls 
                                    autoPlay 
                                    className="max-h-[75vh] rounded-lg shadow-lg aspect-[9/16]" 
                                />
                            ) : (
                                <img 
                                    src={resolveMediaUrl(activeMediaModal)} 
                                    className="max-h-[75vh] object-contain rounded-lg shadow-lg" 
                                    alt="Kreacja" 
                                />
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL HITL: KOREKTA I RE-RENDER KREACJI */}
            {editingAsset && (
                <div className="fixed inset-0 bg-slate-950/85 z-[500] flex items-center justify-center p-4 backdrop-blur-md">
                    <div className="bg-white border border-slate-300 rounded-2xl overflow-hidden max-w-4xl w-full shadow-2xl flex flex-col max-h-[90vh]">
                        {/* Header Modalu */}
                        <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center border-b border-slate-800">
                            <div className="flex items-center gap-2">
                                <Edit3 className="w-5 h-5 text-indigo-400" />
                                <div>
                                    <h2 className="text-sm font-black uppercase tracking-wider">
                                        Studio Korekty HITL (Human-In-The-Loop)
                                    </h2>
                                    <p className="text-[11px] text-slate-400">
                                        Dopracuj nagłówki, treść, wybierz właściwe zdjęcie z PIM i zrekomponuj kreację
                                    </p>
                                </div>
                            </div>
                            <button 
                                onClick={() => setEditingAsset(null)}
                                className="text-slate-400 hover:text-white font-bold text-lg p-1"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Ciało Modalu (2 Kolumny: Podgląd + Edycja) */}
                        <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-12 gap-6">
                            
                            {/* Lewa Kolumna: Podgląd wygenerowanego assetu */}
                            <div className="md:col-span-5 flex flex-col items-center bg-slate-900 rounded-xl p-4 border border-slate-800">
                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-3 self-start">
                                    Aktualny podgląd pliku
                                </span>
                                
                                <div className="w-full flex justify-center items-center relative rounded-lg overflow-hidden bg-black/60 min-h-[260px]">
                                    {editingAsset.mediaType === 'video' ? (
                                        <video 
                                            src={resolveMediaUrl(editingAsset)} 
                                            controls 
                                            className="max-h-[380px] rounded-lg aspect-[9/16]" 
                                        />
                                    ) : (
                                        <img 
                                            src={resolveMediaUrl(editingAsset)} 
                                            className="max-h-[380px] object-contain rounded-lg shadow-xl" 
                                            alt="Podgląd edytowany" 
                                        />
                                    )}
                                </div>

                                <div className="mt-4 w-full text-center">
                                    <button
                                        onClick={handleReRenderEditingAsset}
                                        disabled={isReRendering}
                                        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-md flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                                    >
                                        {isReRendering ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                Przeliczanie & Re-renderowanie...
                                            </>
                                        ) : (
                                            <>
                                                <RefreshCw className="w-4 h-4" />
                                                Przelicz i Re-renderuj Kreację (Sharp/FFmpeg)
                                            </>
                                        )}
                                    </button>
                                    <p className="text-[10px] text-slate-400 mt-1">
                                        Wypala nowy cień i nakłada aktualny tekst z PIM
                                    </p>
                                </div>
                            </div>

                            {/* Prawa Kolumna: Pola edycji */}
                            <div className="md:col-span-7 space-y-4 text-xs">
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">
                                        Główny Nagłówek (Headline)
                                    </label>
                                    <input 
                                        type="text"
                                        value={editingAsset.editHeadline}
                                        onChange={e => setEditingAsset({ ...editingAsset, editHeadline: e.target.value })}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-bold text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                                    />
                                </div>

                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">
                                        Podtytuł / Dowód Liczbowy (Subheadline)
                                    </label>
                                    <input 
                                        type="text"
                                        value={editingAsset.editSubheadline}
                                        onChange={e => setEditingAsset({ ...editingAsset, editSubheadline: e.target.value })}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-700 focus:bg-white focus:border-indigo-500 outline-none"
                                    />
                                </div>

                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">
                                        Treść posta / Scenariusz (Body Copy)
                                    </label>
                                    <textarea 
                                        rows={4}
                                        value={editingAsset.editContent}
                                        onChange={e => setEditingAsset({ ...editingAsset, editContent: e.target.value })}
                                        className="w-full p-3 bg-slate-50 border border-slate-300 rounded-lg font-normal text-slate-800 focus:bg-white focus:border-indigo-500 outline-none leading-relaxed"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">
                                            Przycisk CTA
                                        </label>
                                        <input 
                                            type="text"
                                            value={editingAsset.editCta}
                                            onChange={e => setEditingAsset({ ...editingAsset, editCta: e.target.value })}
                                            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-semibold outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">
                                            Budżet Testowy
                                        </label>
                                        <input 
                                            type="text"
                                            value={editingAsset.editBudget}
                                            onChange={e => setEditingAsset({ ...editingAsset, editBudget: e.target.value })}
                                            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-semibold outline-none"
                                        />
                                    </div>
                                </div>

                                {/* Wybór zdjęcia / packshotu lub wgranie z komputera */}
                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
                                            Packshot / Materiał Wizualny Kreacji
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() => modalFileInputRef.current?.click()}
                                            disabled={isUploadingModalMaterial}
                                            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition-colors"
                                        >
                                            {isUploadingModalMaterial ? (
                                                <><Loader2 className="w-3 h-3 animate-spin"/> Wgrywanie...</>
                                            ) : (
                                                <><UploadCloud className="w-3 h-3"/> Wgraj własny plik z dysku</>
                                            )}
                                        </button>
                                        <input 
                                            type="file"
                                            ref={modalFileInputRef}
                                            onChange={(e) => handleFileUpload(e, true)}
                                            accept="image/*,video/*"
                                            className="hidden"
                                        />
                                    </div>

                                    {availableProductImages.length > 0 ? (
                                        <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                                            {availableProductImages.map((imgUrl, i) => (
                                                <div 
                                                    key={i}
                                                    onClick={() => setEditingAsset({ ...editingAsset, editProductImg: imgUrl })}
                                                    className={`w-14 h-14 rounded-lg overflow-hidden border-2 cursor-pointer shrink-0 transition-all ${editingAsset.editProductImg === imgUrl ? 'border-indigo-600 ring-2 ring-indigo-300 scale-105' : 'border-slate-300 hover:border-slate-400 opacity-70 hover:opacity-100'}`}
                                                >
                                                    <img src={imgUrl} className="w-full h-full object-cover" alt="Packshot thumbnail" />
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-[11px] text-slate-400 italic">Brak galerii zdjęć w PIM. Możesz wgrać własny plik powyżej lub podać URL.</p>
                                    )}

                                    <div className="mt-2 flex gap-2">
                                        <input 
                                            type="text"
                                            value={editingAsset.editProductImg || ''}
                                            onChange={e => setEditingAsset({ ...editingAsset, editProductImg: e.target.value })}
                                            placeholder="URL lub ścieżka do zdjęcia/packshotu..."
                                            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded text-xs font-mono outline-none focus:bg-white focus:border-indigo-500"
                                        />
                                    </div>
                                </div>

                                {/* Edycja scen dla formatu Reels */}
                                {editingAsset.mediaType === 'video' && Array.isArray(editingAsset.editScenes) && editingAsset.editScenes.length > 0 && (
                                    <div className="space-y-2 pt-2 border-t border-slate-200">
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
                                            Napisy ekranowe poszczególnych scen Reels (1-4)
                                        </span>
                                        {editingAsset.editScenes.map((sc, sIdx) => (
                                            <div key={sIdx} className="flex items-center gap-2">
                                                <span className="text-[10px] font-mono font-bold text-slate-500 w-16 shrink-0">
                                                    Scena {sIdx + 1}:
                                                </span>
                                                <input 
                                                    type="text"
                                                    value={sc.onscreen_text || ''}
                                                    onChange={e => {
                                                        const updatedScenes = [...editingAsset.editScenes];
                                                        updatedScenes[sIdx] = { ...updatedScenes[sIdx], onscreen_text: e.target.value };
                                                        setEditingAsset({ ...editingAsset, editScenes: updatedScenes });
                                                    }}
                                                    className="w-full px-2.5 py-1 bg-slate-50 border border-slate-300 rounded text-xs outline-none"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Stopka Modalu z Przyciskami */}
                        <div className="px-6 py-3 bg-slate-100 border-t border-slate-200 flex justify-between items-center">
                            <span className="text-[11px] text-slate-500">
                                Wprowadzone zmiany zostaną przypisane do eksportu do SMI.
                            </span>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setEditingAsset(null)}
                                    className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold transition-all"
                                >
                                    Anuluj
                                </button>
                                <button
                                    onClick={handleSaveEditingAssetLocally}
                                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all flex items-center gap-1.5"
                                >
                                    <CheckCircle2 className="w-4 h-4" />
                                    Zastosuj i Zapisz Zmiany
                                </button>
                            </div>
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
                            PIM Connected
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-700 uppercase tracking-widest border border-purple-200">
                            HITL Studio
                        </span>
                    </div>
                    <h1 className="text-xl font-black text-slate-900 flex items-center">
                        <Sparkles className="w-5 h-5 mr-2 text-indigo-600" /> Ad Intelligence & Creative Studio
                    </h1>
                    <p className="text-xs text-slate-500 mt-1">
                        Skaner reklam konkurencji, ocena Time-Decay (Gemini 3.8 Flash), synteza 28 hooków (Gemini 3.1 Pro) oraz montaż kreacji z packshotami produktów z bazy PIM (Sharp Shadow Baking + FFmpeg Reels).
                    </p>
                </div>
            </div>

            {/* SELEKTOR PRODUKTU Z PIM */}
            <div className="bg-white border border-slate-300 rounded-xl p-6 shadow-sm space-y-4">
                <div className="border-b border-slate-200 pb-3 flex justify-between items-center">
                    <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center">
                        <Package className="w-4 h-4 mr-2 text-indigo-600" /> 1. Powiąż z Produktem z Bazy PIM (Nexus ERP) — Opcjonalnie
                    </h2>
                    {selectedProduct && (
                        <button 
                            onClick={handleClearSelectedProduct}
                            className="text-[11px] font-bold text-red-500 hover:text-red-700 flex items-center"
                        >
                            ✕ Odłącz produkt
                        </button>
                    )}
                </div>

                {!selectedProduct ? (
                    <div className="space-y-3">
                        <p className="text-[11px] text-slate-500">
                            Wybór produktu z bazy PIM jest opcjonalny. Pozwala automatycznie załadować dane i zdjęcia z katalogu ERP. Możesz również pominąć ten krok i wprowadzić dowolny produkt rynkowy poniżej.
                        </p>
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                                <input 
                                    type="text"
                                    value={productSearch}
                                    onChange={e => {
                                        setProductSearch(e.target.value);
                                        fetchProductsFromPim(e.target.value);
                                    }}
                                    onFocus={() => setIsProductDropdownOpen(true)}
                                    placeholder="Wyszukaj produkt po nazwie, SKU lub EAN z PIM..."
                                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold focus:bg-white focus:border-indigo-500 outline-none"
                                />
                            </div>
                            <button
                                onClick={() => setIsProductDropdownOpen(!isProductDropdownOpen)}
                                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold transition-all"
                            >
                                {isProductDropdownOpen ? 'Zwiń listę' : 'Przeglądaj katalog'}
                            </button>
                        </div>

                        {/* Dropdown z listą produktów */}
                        {isProductDropdownOpen && (
                            <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 bg-white shadow-lg custom-scrollbar">
                                {isLoadingProducts ? (
                                    <div className="p-4 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                                        <Loader2 className="w-4 h-4 animate-spin" /> Ładowanie produktów z PIM...
                                    </div>
                                ) : productsList.length === 0 ? (
                                    <div className="p-4 text-center text-xs text-slate-500">
                                        Nie znaleziono produktów w PIM dla podanej frazy.
                                    </div>
                                ) : (
                                    productsList.map(prod => (
                                        <div 
                                            key={prod.id}
                                            onClick={() => handleSelectProduct(prod)}
                                            className="p-3 hover:bg-indigo-50 cursor-pointer flex items-center justify-between transition-colors text-xs"
                                        >
                                            <div className="flex items-center gap-3">
                                                {prod.imageUrl ? (
                                                    <img src={prod.imageUrl} className="w-9 h-9 object-cover rounded border border-slate-200" alt="" />
                                                ) : (
                                                    <div className="w-9 h-9 rounded bg-slate-100 flex items-center justify-center text-slate-400">
                                                        <Package className="w-4 h-4" />
                                                    </div>
                                                )}
                                                <div>
                                                    <span className="font-bold text-slate-900 block">{prod.name}</span>
                                                    <span className="text-[10px] text-slate-500">SKU: {prod.sku} • EAN: {prod.ean} • Marka: {prod.brand?.name || 'Brak'}</span>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <span className="font-bold text-emerald-600 block">{prod.salePrice ? `${Number(prod.salePrice).toFixed(2)} zł` : 'Brak ceny'}</span>
                                                <span className="text-[10px] text-indigo-600 font-semibold">Wybierz →</span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    /* Karta aktywnie wybranego produktu */
                    <div className="bg-indigo-50/60 border border-indigo-200 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            {selectedProduct.imageUrl || (selectedProduct.images && selectedProduct.images[0]) ? (
                                <img 
                                    src={selectedProduct.imageUrl || selectedProduct.images[0]} 
                                    className="w-16 h-16 object-cover rounded-lg border-2 border-indigo-300 shadow-sm" 
                                    alt={selectedProduct.name} 
                                />
                            ) : (
                                <div className="w-16 h-16 rounded-lg bg-indigo-100 border-2 border-indigo-300 flex items-center justify-center text-indigo-600">
                                    <Package className="w-6 h-6" />
                                </div>
                            )}
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="px-2 py-0.5 rounded text-[9px] font-black bg-indigo-600 text-white uppercase">
                                        Połączono z PIM
                                    </span>
                                    <span className="text-[11px] font-bold text-slate-500">SKU: {selectedProduct.sku}</span>
                                </div>
                                <h3 className="text-sm font-black text-slate-900 mt-0.5">{selectedProduct.name}</h3>
                                <p className="text-[11px] text-slate-600">
                                    Cena: <strong className="text-emerald-700">{selectedProduct.salePrice ? `${Number(selectedProduct.salePrice).toFixed(2)} zł` : 'Nie ustalono'}</strong> • Dostępne zdjęcia w galerii: <strong>{availableProductImages.length}</strong>
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={() => setIsProductDropdownOpen(true)}
                                className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg text-xs font-bold text-slate-700 shadow-sm transition-all"
                            >
                                Zmień produkt
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* KROK 2: KONFIGURACJA SKANERA I PROFILU MARKI */}
            <div className="bg-white border border-slate-300 rounded-xl p-6 shadow-sm space-y-4">
                <div className="border-b border-slate-200 pb-3 flex flex-wrap justify-between items-center gap-2">
                    <div className="flex items-center gap-2">
                        <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center">
                            <Search className="w-4 h-4 mr-2 text-indigo-600" /> 2. Parametry Skanera Rynku & Pozycjonowania
                        </h2>
                        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-200 uppercase">
                            Rynek PL (Polska)
                        </span>
                    </div>
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={handleResetForm}
                            title="Wyczyść wszystkie pola formularza"
                            className="text-[11px] font-bold text-slate-500 hover:text-rose-600 transition-colors flex items-center gap-1 bg-slate-100 hover:bg-rose-50 px-2.5 py-1 rounded-md border border-slate-200 hover:border-rose-200"
                        >
                            <RotateCcw className="w-3.5 h-3.5" /> Wyczyść formularz
                        </button>
                        <span className="text-slate-300">|</span>
                        <button 
                            onClick={() => setShowAdvancedApify(!showAdvancedApify)}
                            className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
                        >
                            {showAdvancedApify ? 'Ukryj Apify' : '⚙️ Apify API / Dataset ID'}
                        </button>
                        <span className="text-slate-300">|</span>
                        <button 
                            onClick={() => setShowDatasetInput(!showDatasetInput)}
                            className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
                        >
                            {showDatasetInput ? 'Ukryj wklejanie JSON' : '+ Wklej własny JSON'}
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                    <div className="md:col-span-6">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">Słowa kluczowe / Kategoria rynku PL</label>
                        <input 
                            type="text"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="np. Cif mleczko czyszczące / odświeżacz powietrza / płyn do prania"
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold focus:bg-white focus:border-indigo-500 outline-none"
                        />
                    </div>
                    <div className="md:col-span-3">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">Nazwa Marki / Produktu</label>
                        <input 
                            type="text"
                            value={brandName}
                            onChange={e => setBrandName(e.target.value)}
                            placeholder="np. Felce Azzurra / Cif / MIL MIL"
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold focus:bg-white focus:border-indigo-500 outline-none"
                        />
                    </div>
                    <div className="md:col-span-3">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">
                            Liczba reklam (Rynek PL: max 300)
                        </label>
                        <input 
                            type="number"
                            min="10"
                            max="300"
                            value={scanLimit}
                            onChange={e => {
                                const val = parseInt(e.target.value);
                                setScanLimit(isNaN(val) ? '' : Math.min(300, Math.max(1, val)));
                            }}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-indigo-700 focus:bg-white focus:border-indigo-500 outline-none"
                        />
                    </div>

                    <div className="md:col-span-6">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">Główna Obietnica & USP Marki</label>
                        <input 
                            type="text"
                            value={brandUsp}
                            onChange={e => setBrandUsp(e.target.value)}
                            placeholder="np. Włoska formuła, certyfikowane składniki, wysoka wydajność"
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold focus:bg-white focus:border-indigo-500 outline-none"
                        />
                    </div>
                    <div className="md:col-span-6">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">Twarde Dowody & Social Proof</label>
                        <input 
                            type="text"
                            value={brandProof}
                            onChange={e => setBrandProof(e.target.value)}
                            placeholder="np. Certyfikat UE, badania jakościowe, oficjalna dystrybucja"
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold focus:bg-white focus:border-indigo-500 outline-none"
                        />
                    </div>

                    <div className="md:col-span-12">
                        <div className="flex flex-wrap justify-between items-center mb-1 gap-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                                Packshot / Materiał Wizualny (URL lub Wgraj Plik z Komputera)
                            </label>
                            <span className="text-[10px] text-slate-400">
                                Obsługa zdjęć (PNG, JPG, WEBP) i wideo (MP4, MOV) do 50 MB
                            </span>
                        </div>

                        {/* Ukryty input do wgrywania plików z komputera */}
                        <input 
                            type="file" 
                            ref={mainFileInputRef}
                            onChange={(e) => handleFileUpload(e, false)}
                            accept="image/*,video/*"
                            className="hidden" 
                        />

                        <div className="flex flex-col sm:flex-row gap-2">
                            <div className="flex-1 flex gap-2">
                                <input 
                                    type="text"
                                    value={customProductImgUrl}
                                    onChange={e => {
                                        setCustomProductImgUrl(e.target.value);
                                        setUploadedMaterial(null);
                                    }}
                                    placeholder="Wklej URL zdjęcia https://... LUB wgraj bezpośrednio z dysku →"
                                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono focus:bg-white focus:border-indigo-500 outline-none"
                                />
                                {customProductImgUrl && (
                                    <div className="w-9 h-9 rounded border border-slate-300 overflow-hidden bg-white shrink-0 flex items-center justify-center p-0.5 shadow-sm relative group">
                                        {uploadedMaterial?.mediaType === 'video' || customProductImgUrl.match(/\.(mp4|mov|webm)$/i) ? (
                                            <Video className="w-5 h-5 text-pink-600" />
                                        ) : (
                                            <img src={customProductImgUrl} alt="Podgląd" className="w-full h-full object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
                                        )}
                                    </div>
                                )}
                            </div>

                            <button
                                type="button"
                                onClick={() => mainFileInputRef.current?.click()}
                                disabled={isUploadingMaterial}
                                className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 shrink-0 shadow-sm disabled:opacity-50"
                            >
                                {isUploadingMaterial ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                                        Wgrywanie z dysku...
                                    </>
                                ) : (
                                    <>
                                        <UploadCloud className="w-4 h-4 text-indigo-600" />
                                        Wgraj z komputera
                                    </>
                                )}
                            </button>
                        </div>

                        {/* Pasek statusu wgranego pliku z dysku */}
                        {uploadedMaterial && (
                            <div className="mt-2 p-2 bg-indigo-50/70 border border-indigo-200 rounded-lg flex items-center justify-between text-xs animate-in fade-in">
                                <div className="flex items-center gap-2 overflow-hidden">
                                    <span className="p-1 bg-indigo-600 text-white rounded shrink-0">
                                        {uploadedMaterial.mediaType === 'video' ? <Video className="w-3.5 h-3.5" /> : <ImageIcon className="w-3.5 h-3.5" />}
                                    </span>
                                    <div className="truncate">
                                        <span className="font-bold text-slate-800">{uploadedMaterial.originalName}</span>
                                        <span className="text-[10px] text-slate-500 ml-2">({(uploadedMaterial.size / 1024).toFixed(0)} KB • Zapisano)</span>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setUploadedMaterial(null);
                                        setCustomProductImgUrl('');
                                        if (mainFileInputRef.current) mainFileInputRef.current.value = '';
                                    }}
                                    className="text-slate-400 hover:text-rose-600 p-1 transition-colors shrink-0"
                                    title="Usuń plik"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {showAdvancedApify && (
                    <div className="pt-3 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in">
                        <div>
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">
                                Apify Dataset ID (Opcjonalnie - bezpośrednie ID zbioru)
                            </label>
                            <input 
                                type="text"
                                value={apifyDatasetId}
                                onChange={e => setApifyDatasetId(e.target.value)}
                                placeholder="np. xL9... (ID z Apify Storage > Datasets)"
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono outline-none focus:bg-white focus:border-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">
                                Apify API Token (Opcjonalnie - nadpisanie domyślnego tokenu)
                            </label>
                            <input 
                                type="password"
                                value={apifyToken}
                                onChange={e => setApifyToken(e.target.value)}
                                placeholder="apify_api_..."
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono outline-none focus:bg-white focus:border-indigo-500"
                            />
                        </div>
                    </div>
                )}

                {showDatasetInput && (
                    <div className="pt-2 animate-in fade-in">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">Wklej tablicę JSON reklam z Apify / Meta Ad Library</label>
                        <textarea 
                            rows={4}
                            value={customDatasetJson}
                            onChange={e => setCustomDatasetJson(e.target.value)}
                            placeholder='[ { "headline": "...", "copy": "...", "startDate": "2026-07-01" } ]'
                            className="w-full p-3 bg-slate-50 border border-slate-300 rounded-lg font-mono text-[11px] outline-none focus:bg-white focus:border-indigo-500"
                        />
                    </div>
                )}

                <div className="pt-2 flex justify-between items-center">
                    <span className="text-[11px] text-slate-500">
                        Skaner analizuje do <strong>{scanLimit || 100}</strong> autentycznych reklam na rynku polskim (PL).
                    </span>
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

            {/* KROK 3: WYNIKI SKANOWANIA (TOP WINNERS & MARKET INSIGHTS) */}
            {scanData && (
                scanData.totalScanned === 0 ? (
                    <div className="bg-amber-50 border border-amber-300 rounded-xl p-6 shadow-sm text-slate-800 space-y-3 animate-in fade-in duration-300">
                        <div className="flex items-center gap-2 text-amber-800 font-black text-sm">
                            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                            <span>Brak aktywnych reklam w bibliotece dla zapytania: "{query}" na rynku polskim (PL)</span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">
                            Zgodnie z polityką <strong>Zero-Fake Data</strong>, system nie generuje sztucznych atrap ani halucynacji konkurencji. Aby przeprowadzić analizę rynkową:
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                            <div className="bg-white p-3.5 rounded-lg border border-amber-200">
                                <span className="font-bold text-xs text-indigo-700 block mb-1">1. Poszerz frazę</span>
                                <span className="text-[11px] text-slate-600">Zamiast wąskiego SKU, podaj ogólną kategorię, np. "odświeżacz powietrza", "płyn do prania" lub nazwę marki.</span>
                            </div>
                            <div className="bg-white p-3.5 rounded-lg border border-amber-200">
                                <span className="font-bold text-xs text-indigo-700 block mb-1">2. Podłącz Apify Dataset</span>
                                <span className="text-[11px] text-slate-600">Rozwiń opcję "Apify API / Dataset ID" i wprowadź ID gotowego zbioru pobranego z aktora Facebook Ads Scraper.</span>
                            </div>
                            <div className="bg-white p-3.5 rounded-lg border border-amber-200">
                                <span className="font-bold text-xs text-indigo-700 block mb-1">3. Wklej JSON</span>
                                <span className="text-[11px] text-slate-600">Skorzystaj z opcji "+ Wklej własny JSON", by przetworzyć wyeksportowaną listę reklam konkurencji.</span>
                            </div>
                        </div>
                    </div>
                ) : (
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
                                    <Layers className="w-4 h-4 mr-2 text-indigo-600" /> Matryca 28 Haczyków (Zoptymalizowanych pod Twój Produkt)
                                </h2>
                                <span className="text-xs font-bold text-indigo-600">Gemini 3.1 Pro Thinking</span>
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
                            <div className="pt-4 border-t border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                                <span className="text-xs text-slate-500 font-medium">
                                    Gotowe briefy do zmontowania: {scanData.strategy.static_ad_briefs?.length || 0} statyków + {scanData.strategy.reels_briefs?.length || 0} Reels
                                    {selectedProduct && <strong className="text-indigo-600 ml-1">z fizycznym packshotem {selectedProduct.name}</strong>}
                                </span>
                                <button
                                    onClick={handleGenerateAssets}
                                    disabled={isGeneratingAssets}
                                    className="px-6 py-2.5 bg-pink-600 hover:bg-pink-700 text-white rounded-lg text-xs font-bold shadow-md flex items-center transition-all disabled:opacity-50"
                                >
                                    {isGeneratingAssets ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            Komponowanie Packshotów & Montaż Reels (FFmpeg)...
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="w-4 h-4 mr-2" />
                                            Wygeneruj Gotowe Kreacje (Statyki Sharp + Reels FFmpeg)
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )
        )}

            {/* KROK 4: WYGENEROWANE ASSETY (STATYKI & REELS) Z PRZYCISKIEM KOREKTY HITL */}
            {generatedAssets.length > 0 && (
                <div className="bg-white border border-slate-300 rounded-xl p-6 shadow-sm space-y-6 animate-in fade-in duration-300">
                    <div className="border-b border-slate-200 pb-3 flex justify-between items-center">
                        <div>
                            <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center">
                                <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-600" /> Gotowe Kreacje Multimedialne ({generatedAssets.length} sztuk)
                            </h2>
                            <p className="text-xs text-slate-500">Materiały zsynchronizowane z CDN Supabase oraz kopią lokalną. Kliknij "Edytuj / Korekta (HITL)", aby zmienić copy, packshot lub sceny.</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {generatedAssets.map((asset, idx) => (
                            <div key={asset.id || idx} className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
                                <div>
                                    {/* Podgląd Mediów */}
                                    <div 
                                        className="h-64 bg-slate-900 relative cursor-pointer group flex items-center justify-center overflow-hidden"
                                        onClick={() => setActiveMediaModal(asset)}
                                    >
                                        {asset.mediaType === 'video' ? (
                                            <video 
                                                src={resolveMediaUrl(asset)} 
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform" 
                                            />
                                        ) : (
                                            <img 
                                                src={resolveMediaUrl(asset)} 
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

                                        <div className="absolute top-2 left-2 flex gap-1.5">
                                            <span className="px-2 py-0.5 rounded text-[9px] font-black bg-slate-900/80 text-white uppercase backdrop-blur-sm">
                                                {asset.format}
                                            </span>
                                            {asset.productImageUrl && (
                                                <span className="px-2 py-0.5 rounded text-[9px] font-black bg-indigo-600/90 text-white uppercase backdrop-blur-sm">
                                                    PIM Packshot
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Treść i Copy */}
                                    <div className="p-4 space-y-2">
                                        <h3 className="text-xs font-black text-slate-900 leading-snug">
                                            {asset.headline}
                                        </h3>
                                        {asset.subheadline && (
                                            <p className="text-[11px] font-bold text-indigo-700">
                                                {asset.subheadline}
                                            </p>
                                        )}
                                        <p className="text-[11px] text-slate-600 line-clamp-3 whitespace-pre-line">
                                            {asset.content}
                                        </p>
                                        <div className="text-[10px] text-indigo-600 font-bold">
                                            {asset.hashtags}
                                        </div>
                                    </div>
                                </div>

                                <div className="p-4 pt-2 border-t border-slate-200 flex justify-between items-center text-[10px]">
                                    <span className="text-slate-500">Budżet: <strong className="text-slate-800">{asset.adBudgetInfo}</strong></span>
                                    
                                    {/* Przycisk Studia Korekty HITL */}
                                    <button
                                        onClick={() => handleOpenEditModal(asset, idx)}
                                        className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-md font-bold flex items-center gap-1 transition-all"
                                    >
                                        <Edit3 className="w-3.5 h-3.5" /> Edytuj / HITL
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* KROK 5: EKSPORT DO HARMONOGRAMU SMI */}
                    <div className="bg-slate-50 border border-indigo-200 rounded-xl p-5 flex flex-col md:flex-row items-center justify-between gap-4">
                        <div>
                            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center">
                                <Send className="w-4 h-4 mr-2 text-indigo-600" /> Eksport do Harmonogramu SMI (Nexus ERP)
                            </h3>
                            <p className="text-[11px] text-slate-600 mt-0.5">
                                Przenieś wygenerowane i dopracowane kreacje wprost do kalendarza postów w statusie "Do Akceptacji".
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
