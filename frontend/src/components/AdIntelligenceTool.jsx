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
    Trash2,
    ExternalLink
} from 'lucide-react';

// Komponent do prezentacji i błyskawicznego kopiowania (1-klik) promptów AI w 100% po polsku
// Przystosowany do: Nano Banana, OmniGen / Liblib, Google Flow, Kling AI, TikTok / Reels UGC, Makro Detale
const AiPromptsViewer = ({ prompts, defaultExpanded = false }) => {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const [activeKey, setActiveKey] = useState('nano_banana_packshot');
    const [copiedKey, setCopiedKey] = useState(null);

    if (!prompts || typeof prompts !== 'object' || Object.keys(prompts).length === 0) return null;

    const promptConfigs = [
        { 
            key: 'nano_banana_packshot', 
            icon: '🍌', 
            name: 'Nano Banana', 
            tool: 'Nano Banana / Flux.1 / Midjourney',
            badge: 'Packshot Studyjny E-commerce'
        },
        { 
            key: 'omni_rich_content', 
            icon: '📦', 
            name: 'OmniGen', 
            tool: 'OmniGen / Liblib AI',
            badge: 'Rich Content A+ (1:1)'
        },
        { 
            key: 'reels_video_flow', 
            icon: '🎬', 
            name: 'Google Flow', 
            tool: 'Google Flow / Kling / Runway',
            badge: 'Wideo Reels 9:16 (Motion)'
        },
        { 
            key: 'story_tiktok_viral', 
            icon: '📱', 
            name: 'TikTok Viral', 
            tool: 'TikTok / Stories 9:16',
            badge: 'Natywny UGC Hook'
        },
        { 
            key: 'macro_details', 
            icon: '🔬', 
            name: 'Makro Detal', 
            tool: 'Nano Banana / Flux Macro',
            badge: 'Zbliżenie Składników & Etykiety'
        }
    ];

    const currentText = prompts[activeKey] || Object.values(prompts)[0] || '';

    const handleCopy = (text, key) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2500);
    };

    return (
        <div className="mt-3 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 border border-slate-800 rounded-xl p-3 text-white shadow-md">
            <div className="flex flex-wrap justify-between items-center gap-2">
                <button
                    type="button"
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex items-center gap-2 text-left hover:opacity-90 transition-opacity"
                >
                    <span className="p-1 bg-amber-400/20 text-amber-400 rounded-md">
                        <Sparkles className="w-3.5 h-3.5" />
                    </span>
                    <div>
                        <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-black uppercase tracking-wider text-amber-400">
                                Prompty AI (100% Polski)
                            </span>
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-400/10 text-amber-300 font-bold border border-amber-400/30">
                                5 Generatorów
                            </span>
                        </div>
                        <p className="text-[9px] text-slate-400">
                            Nano Banana • OmniGen • Google Flow • Kling • TikTok
                        </p>
                    </div>
                </button>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => handleCopy(currentText, activeKey)}
                        className={`px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-sm ${
                            copiedKey === activeKey
                                ? 'bg-emerald-600 text-white ring-2 ring-emerald-400'
                                : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                        }`}
                        title="Kliknij, aby skopiować prompt do schowka"
                    >
                        {copiedKey === activeKey ? (
                            <><CheckCircle2 className="w-3 h-3" /> Skopiowano!</>
                        ) : (
                            <><Copy className="w-3 h-3" /> Kopiuj Prompt</>
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="text-[10px] text-slate-400 hover:text-white px-1.5 py-0.5"
                    >
                        {isExpanded ? 'Zwiń ▲' : 'Rozwiń ▼'}
                    </button>
                </div>
            </div>

            {isExpanded && (
                <div className="mt-3 pt-2.5 border-t border-slate-800 animate-in fade-in duration-200">
                    {/* Przyciski wyboru promptu */}
                    <div className="flex gap-1.5 overflow-x-auto pb-2 custom-scrollbar">
                        {promptConfigs.map(cfg => {
                            const val = prompts[cfg.key];
                            if (!val) return null;
                            const isActive = activeKey === cfg.key;
                            return (
                                <button
                                    key={cfg.key}
                                    type="button"
                                    onClick={() => setActiveKey(cfg.key)}
                                    className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1.5 shrink-0 transition-all ${
                                        isActive 
                                            ? 'bg-amber-400 text-slate-950 shadow-md ring-1 ring-amber-300 font-black' 
                                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                                    }`}
                                >
                                    <span>{cfg.icon}</span>
                                    <span>{cfg.name}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Treść promptu do wklejenia */}
                    <div className="mt-2 bg-slate-950 rounded-lg p-2.5 border border-slate-800/80">
                        <div className="flex justify-between items-center gap-2 mb-1.5 text-[10px] text-slate-400">
                            <span className="font-bold text-amber-300">
                                {promptConfigs.find(c => c.key === activeKey)?.tool}
                            </span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                                {promptConfigs.find(c => c.key === activeKey)?.badge}
                            </span>
                        </div>
                        <p className="text-[11px] text-slate-200 font-sans leading-relaxed select-all whitespace-pre-wrap max-h-36 overflow-y-auto custom-scrollbar pr-1">
                            {currentText}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

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
    const [brandDna, setBrandDna] = useState('');
    const [customProductImgUrl, setCustomProductImgUrl] = useState('');
    const [isUploadingMaterial, setIsUploadingMaterial] = useState(false);
    const [uploadedMaterial, setUploadedMaterial] = useState(null);
    const [isUploadingModalMaterial, setIsUploadingModalMaterial] = useState(false);
    const [isEnrichingProduct, setIsEnrichingProduct] = useState(false);
    const [enrichSuccessMessage, setEnrichSuccessMessage] = useState(null);
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

        const dnaInitial = prod.features 
            ? `Klimat: Nowoczesna, czysta estetyka ${prod.name}. ${typeof prod.features === 'string' ? prod.features : JSON.stringify(prod.features)}. Odbiorca: Klienci poszukujący sprawdzonych rezultatów. Emocje: Spokój, pewność wyboru i zaufanie.`
            : `Klimat: Sprawdzona jakość marki ${prod.brand?.name || 'Nexus'}. Odbiorca: Konsumenci ceniący skuteczność i transparentność. Emocje: Satysfakcja i pewność.`;
        setBrandDna(dnaInitial);
    };

    const handleClearSelectedProduct = () => {
        setSelectedProduct(null);
        setBrandDna('');
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

    // Autonomiczne odnajdywanie oficjalnej strony i danych produktu przez Agenta OSINT (Google Search)
    const handleAutoEnrichProduct = async () => {
        const targetName = (brandName || query || '').trim();
        if (!targetName) {
            alert('Wpisz najpierw nazwę marki lub produktu w polu poniżej, aby Agent mógł odnaleźć informacje w sieci.');
            return;
        }

        setIsEnrichingProduct(true);
        setEnrichSuccessMessage(null);

        try {
            const res = await axios.post(`${API_URL}/api/ad-intelligence/enrich-product`, {
                name: targetName
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.data && res.data.success && res.data.enrichedData) {
                const d = res.data.enrichedData;
                if (d.brandName) setBrandName(d.brandName);
                if (d.usp) setBrandUsp(d.usp);
                if (d.proof) setBrandProof(d.proof);
                if (d.brandDna) setBrandDna(d.brandDna);
                if (d.suggestedQuery && !query) setQuery(d.suggestedQuery);
                if (d.imageUrl && !customProductImgUrl && !selectedProduct) setCustomProductImgUrl(d.imageUrl);
                
                const siteInfo = d.website ? ` (Oficjalna strona: ${d.website})` : '';
                setEnrichSuccessMessage(`✓ Agenci AI odnaleźli produkt w sieci i zbadali DNA marki! Kategoria: ${d.category}${siteInfo}`);
            } else {
                alert('Nie udało się odnaleźć szczegółowych danych: ' + (res.data?.error || 'Brak danych'));
            }
        } catch (err) {
            console.error('Błąd podczas autouzupełniania z sieci:', err);
            alert('Błąd agenta OSINT: ' + (err.response?.data?.error || err.message));
        } finally {
            setIsEnrichingProduct(false);
        }
    };

    // Bezpośrednia natychmiastowa generacja strategii z profilu produktu (z pominięciem skanera konkurencji)
    const handleStartDirectGeneration = async () => {
        setIsScanning(true);
        setScanData(null);
        setGeneratedAssets([]);
        setExportSuccessMessage(null);

        try {
            const res = await axios.post(`${API_URL}/api/ad-intelligence/scan`, {
                query: query || brandName || (selectedProduct?.name || 'Produkt'),
                directGeneration: true,
                brandProfile: {
                    name: brandName || (selectedProduct?.brand?.name || 'Nasza Marka'),
                    usp: brandUsp,
                    proof: brandProof,
                    brandDna: brandDna,
                    customProductImgUrl: customProductImgUrl.trim() || (selectedProduct?.imageUrl || null)
                },
                productId: selectedProduct ? selectedProduct.id : null
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.data && res.data.success) {
                setScanData(res.data);
            } else {
                alert('Błąd bezpośredniej generacji: ' + (res.data?.error || 'Nieznany błąd'));
            }
        } catch (err) {
            console.error('Błąd bezpośredniej generacji:', err);
            alert('Wystąpił błąd: ' + (err.response?.data?.error || err.message));
        } finally {
            setIsScanning(false);
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
        setBrandDna('');
        setCustomProductImgUrl('');
        setUploadedMaterial(null);
        setCustomDatasetJson('');
        setApifyDatasetId('');
        setScanData(null);
        setGeneratedAssets([]);
        setExportSuccessMessage(null);
        setEnrichSuccessMessage(null);
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
                    brandDna: brandDna,
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
                brandProfile: { name: brandName, brandDna: brandDna },
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

                                {/* Prompty AI dla edytowanego assetu */}
                                <AiPromptsViewer 
                                    prompts={editingAsset.production_prompts 
                                        || (editingAsset.mediaType === 'video' 
                                            ? scanData?.strategy?.reels_briefs?.[Math.max(0, editingAsset.assetIndex - (scanData?.strategy?.static_ad_briefs?.length || 0))]?.production_prompts
                                            : scanData?.strategy?.static_ad_briefs?.[editingAsset.assetIndex]?.production_prompts)
                                        || scanData?.strategy?.static_ad_briefs?.[0]?.production_prompts}
                                    defaultExpanded={true}
                                />
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
                        <div className="flex justify-between items-center mb-1">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Nazwa Marki / Produktu</label>
                            <button
                                type="button"
                                onClick={handleAutoEnrichProduct}
                                disabled={isEnrichingProduct || (!brandName && !query)}
                                className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition-colors disabled:opacity-50"
                                title="Agent odnajdzie oficjalną stronę producenta i uzupełni USP, dowody oraz opis"
                            >
                                {isEnrichingProduct ? (
                                    <><Loader2 className="w-3 h-3 animate-spin text-indigo-600" /> Szukam w sieci...</>
                                ) : (
                                    <><Sparkles className="w-3 h-3 text-indigo-600" /> Odnajdź w sieci</>
                                )}
                            </button>
                        </div>
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
                            <label className="text-[10px] font-black text-purple-700 uppercase tracking-wider flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                                DNA, Klimat & Estetyka Marki (Styl Wizualny, Półka Cenowa, Odbiorca & Emocje)
                            </label>
                            <span className="text-[10px] text-purple-700 font-bold bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                                🧬 Zbierane autonomicznie przez Agenta DNA z witryny www i profilu
                            </span>
                        </div>
                        <textarea 
                            rows={2}
                            value={brandDna}
                            onChange={e => setBrandDna(e.target.value)}
                            placeholder="np. Klimat: Pastelowy, owocowo-botaniczny minimalizm e-Fiore. Jasne, miękkie światło dzienne, soczystość owoców jeżyn i witaminy C. Odbiorca: Kobiety poszukujące naturalnego rozświetlenia i energii. Emocje: Radość, lekkość, świeżość, promienny blask bez ciężkich i ciemnych podestów."
                            className="w-full px-3 py-2 bg-purple-50/30 border border-purple-200 rounded-lg text-xs font-medium focus:bg-white focus:border-purple-500 outline-none leading-relaxed custom-scrollbar text-slate-800"
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

                {enrichSuccessMessage && (
                    <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-lg text-emerald-800 text-xs font-medium flex items-center justify-between animate-in fade-in">
                        <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>{enrichSuccessMessage}</span>
                        </div>
                        <button type="button" onClick={() => setEnrichSuccessMessage(null)} className="text-emerald-600 hover:text-emerald-900 font-bold ml-2">✕</button>
                    </div>
                )}

                <div className="pt-2 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <span className="text-[11px] text-slate-500">
                        Skaner analizuje do <strong>{scanLimit || 100}</strong> autentycznych reklam na rynku polskim (PL).
                    </span>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={handleStartDirectGeneration}
                            disabled={isScanning || (!brandName && !query && !selectedProduct)}
                            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-md flex items-center transition-all disabled:opacity-50"
                            title="Generuj 4 kąty, 28 haczyków i kreacje natychmiast z profilu produktu bez czekania na skaner konkurencji"
                        >
                            {isScanning ? (
                                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                            ) : (
                                <Flame className="w-4 h-4 mr-1.5 text-amber-300" />
                            )}
                            ⚡ Generuj Własne Kreacje Bezpośrednio
                        </button>

                        <button
                            type="button"
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
            </div>

            {/* KROK 3: WYNIKI SKANOWANIA & MATRYCA STRATEGII */}
            {scanData && (
                <div className="space-y-6 animate-in fade-in duration-300">
                    {/* Baner informacyjny przy 0 zeskanowanych reklamach (Zero-Fake lub Tryb Bezpośredni) */}
                    {scanData.totalScanned === 0 ? (
                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 shadow-sm text-slate-800 space-y-1.5">
                            <div className="flex items-center gap-2 text-blue-900 font-black text-sm">
                                <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
                                <span>{scanData.notice || `Strategia oraz 28 haczyków zostały wygenerowane bezpośrednio dla Twojego produktu!`}</span>
                            </div>
                            <p className="text-[11px] text-slate-600">
                                Poniżej znajduje się kompletna strategia perswazji, 4 psychologiczne kąty, 28 haczyków oraz gotowe briefy. Kliknij <strong>„Wygeneruj Gotowe Kreacje”</strong>, aby fizycznie złożyć statyki i Reels z Twoim packshotem.
                            </p>
                        </div>
                    ) : (
                        <>
                            {/* Insights Box */}
                            {/* Insights Box - Pełna i Nieograniczona Analiza Rynkowa */}
                            <div className="bg-slate-900 text-white rounded-xl p-6 shadow-md border border-slate-800 space-y-5">
                                <div className="flex flex-wrap items-center justify-between pb-3 border-b border-slate-800 gap-2">
                                    <span className="text-xs font-black uppercase tracking-widest text-indigo-400 flex items-center">
                                        <TrendingUp className="w-4 h-4 mr-2" /> Pełna Analiza Rynkowa (Zeskanowano: {scanData.totalScanned} reklam)
                                    </span>
                                    <div className="flex items-center gap-2 text-[10px] text-slate-400">
                                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-bold">Polska (PL)</span>
                                        <span>•</span>
                                        <span>Silnik: Gemini 3.8 Flash + Gemini 3.1 Pro Swarm</span>
                                    </div>
                                </div>

                                {/* Executive Summary */}
                                {scanData.marketInsights?.executive_summary && (
                                    <div className="p-3.5 bg-indigo-950/60 border border-indigo-500/30 rounded-lg text-xs leading-relaxed text-indigo-100 flex items-start gap-2.5">
                                        <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                        <div>
                                            <strong className="text-amber-300 block mb-0.5 uppercase tracking-wide text-[10px]">Synteza Strategiczna Rynku PL:</strong>
                                            {scanData.marketInsights.executive_summary}
                                        </div>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                                    {/* Dominujące Haczyki */}
                                    <div className="bg-slate-800/60 p-4 rounded-lg border border-indigo-500/30 flex flex-col">
                                        <span className="font-bold text-indigo-400 flex items-center mb-2.5 text-xs">
                                            <Flame className="w-3.5 h-3.5 mr-1.5 text-indigo-400" /> Dominujące Haczyki w Polsce:
                                        </span>
                                        <ul className="list-disc pl-4 space-y-1.5 text-slate-300 text-[11px] leading-relaxed flex-1">
                                            {(scanData.marketInsights?.dominant_hooks || []).map((h, i) => (
                                                <li key={i} className="hover:text-white transition-colors">{h}</li>
                                            ))}
                                        </ul>
                                    </div>

                                    {/* Czerwony Ocean (Przesycone) */}
                                    <div className="bg-slate-800/60 p-4 rounded-lg border border-red-500/30 flex flex-col">
                                        <span className="font-bold text-red-400 flex items-center mb-2.5 text-xs">
                                            <AlertTriangle className="w-3.5 h-3.5 mr-1.5 text-red-400" /> Przesycone Komunikaty (Czerwony Ocean):
                                        </span>
                                        <ul className="list-disc pl-4 space-y-1.5 text-slate-300 text-[11px] leading-relaxed flex-1">
                                            {(scanData.marketInsights?.saturated_claims || []).map((c, i) => (
                                                <li key={i} className="hover:text-white transition-colors">{c}</li>
                                            ))}
                                        </ul>
                                    </div>

                                    {/* Błękitny Ocean (Luki) */}
                                    <div className="bg-slate-800/60 p-4 rounded-lg border border-emerald-500/30 flex flex-col">
                                        <span className="font-bold text-emerald-400 flex items-center mb-2.5 text-xs">
                                            <ShieldCheck className="w-3.5 h-3.5 mr-1.5 text-emerald-400" /> Luki Rynkowe i Przewagi (Błękitny Ocean):
                                        </span>
                                        <ul className="list-disc pl-4 space-y-1.5 text-slate-300 text-[11px] leading-relaxed flex-1">
                                            {(scanData.marketInsights?.blue_ocean_angles || []).map((b, i) => (
                                                <li key={i} className="hover:text-white transition-colors">{b}</li>
                                            ))}
                                        </ul>
                                    </div>

                                    {/* Oferty i Struktura Cenowa */}
                                    {scanData.marketInsights?.pricing_and_offers && scanData.marketInsights.pricing_and_offers.length > 0 && (
                                        <div className="bg-slate-800/60 p-4 rounded-lg border border-amber-500/30 flex flex-col">
                                            <span className="font-bold text-amber-400 flex items-center mb-2.5 text-xs">
                                                <DollarSign className="w-3.5 h-3.5 mr-1.5 text-amber-400" /> Strategie Cenowe i Oferty:
                                            </span>
                                            <ul className="list-disc pl-4 space-y-1.5 text-slate-300 text-[11px] leading-relaxed flex-1">
                                                {scanData.marketInsights.pricing_and_offers.map((p, i) => (
                                                    <li key={i} className="hover:text-white transition-colors">{p}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {/* Triggery i Obiekcje Konsumentów */}
                                    {scanData.marketInsights?.audience_triggers && scanData.marketInsights.audience_triggers.length > 0 && (
                                        <div className="bg-slate-800/60 p-4 rounded-lg border border-cyan-500/30 flex flex-col md:col-span-2 lg:col-span-2">
                                            <span className="font-bold text-cyan-400 flex items-center mb-2.5 text-xs">
                                                <Layers className="w-3.5 h-3.5 mr-1.5 text-cyan-400" /> Psychologiczne Triggery & Obiekcje Klientów w Polsce:
                                            </span>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                {scanData.marketInsights.audience_triggers.map((t, i) => (
                                                    <div key={i} className="p-2 bg-slate-900/80 rounded border border-slate-700/60 text-[11px] text-slate-300 flex items-start gap-1.5">
                                                        <span className="text-cyan-400 font-bold shrink-0">▸</span>
                                                        <span>{t}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Zwycięzcy Konkurencji (Top Winners wg Time-Decay) */}
                            {scanData.topWinners && scanData.topWinners.length > 0 && (
                                <div className="bg-white border border-slate-300 rounded-xl p-6 shadow-sm space-y-4">
                                    <div className="border-b border-slate-200 pb-3 flex flex-wrap justify-between items-center gap-2">
                                        <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center">
                                            <Flame className="w-4 h-4 mr-2 text-amber-500" /> Zwycięskie Kreacje Konkurencji (Top Winners z długim czasem emisji)
                                        </h2>
                                        <span className="text-xs text-slate-500 font-semibold">Wyselekcjonowano {scanData.topWinners.length} benchmarków</span>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {scanData.topWinners.map((ad, idx) => (
                                            <div key={ad.id || idx} className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between hover:shadow-md transition-all">
                                                <div className="space-y-2.5">
                                                    <div className="flex justify-between items-center text-[10px]">
                                                        <span className="font-black px-2 py-0.5 rounded bg-amber-100 text-amber-800 flex items-center">
                                                            <Clock className="w-3 h-3 mr-1" /> {ad.activeDays} dni emisji
                                                        </span>
                                                        <span className="font-bold text-slate-600 bg-slate-200 px-2 py-0.5 rounded">
                                                            Score: {ad.overallWinningScore}/10
                                                        </span>
                                                    </div>

                                                    {/* Reklamodawca i Nazwa Produktu */}
                                                    <div className="flex flex-col gap-0.5">
                                                        <span className="text-[10px] font-black uppercase text-indigo-700 tracking-wider">
                                                            {ad.advertiser || 'Konkurent rynkowy'}
                                                        </span>
                                                        {ad.productName && (
                                                            <span className="text-[11px] font-bold text-slate-800 flex items-center gap-1">
                                                                📦 {ad.productName}
                                                            </span>
                                                        )}
                                                    </div>

                                                    <h3 className="text-xs font-black text-slate-900 leading-snug">
                                                        "{ad.extractedHook}"
                                                    </h3>
                                                    <p className="text-[11px] text-slate-600 line-clamp-3 leading-relaxed">
                                                        {ad.copy}
                                                    </p>

                                                    {/* Bezpośrednie linki do reklamy i produktu */}
                                                    {(ad.adUrl || ad.productUrl || ad.snapshotUrl) && (
                                                        <div className="pt-2 flex flex-wrap gap-2 text-[10px] font-bold">
                                                            {(ad.adUrl || ad.snapshotUrl) && (
                                                                <a 
                                                                    href={ad.adUrl || ad.snapshotUrl} 
                                                                    target="_blank" 
                                                                    rel="noreferrer" 
                                                                    className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-md border border-indigo-200 transition-colors"
                                                                >
                                                                    <ExternalLink className="w-3 h-3" /> Zobacz reklamę ↗
                                                                </a>
                                                            )}
                                                            {ad.productUrl && (
                                                                <a 
                                                                    href={ad.productUrl} 
                                                                    target="_blank" 
                                                                    rel="noreferrer" 
                                                                    className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-md border border-emerald-200 transition-colors"
                                                                >
                                                                    🛍️ Oferta / Sklep ↗
                                                                </a>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="mt-3 pt-2.5 border-t border-slate-200 text-[10px] text-slate-500">
                                                    <span className="font-bold text-indigo-600">Dlaczego działa:</span> {ad.whyItWorks}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* 28 HACZYKÓW & KĄTY PSYCHOLOGICZNE - RENDEROWANE ZAWSZE GDY DOSTĘPNA STRATEGIA */}
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

                                        {/* Prompt Director AI - 100% Polski dla generatorów obrazu i wideo */}
                                        <AiPromptsViewer 
                                            prompts={asset.production_prompts 
                                                || (asset.mediaType === 'video' 
                                                    ? scanData?.strategy?.reels_briefs?.[Math.max(0, idx - (scanData?.strategy?.static_ad_briefs?.length || 0))]?.production_prompts
                                                    : scanData?.strategy?.static_ad_briefs?.[idx]?.production_prompts)
                                                || scanData?.strategy?.static_ad_briefs?.[0]?.production_prompts}
                                        />
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
