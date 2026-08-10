import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { TitleValidator } from './components/HitlReviewer/TitleValidator';
import { StrictWysiwyg } from './components/HitlReviewer/StrictWysiwyg';
import { TileSimulator } from './components/HitlReviewer/TileSimulator';
import { ImageUploadBox } from './components/SingleAuctionFetcher/ImageUploadBox';
import { PhotographicAuditorCard } from './components/VisionFeedback/PhotographicAuditorCard';
import { 
  Rocket, ShieldAlert, Cpu, Type, X, Download, RefreshCw, Save, Send, Database, Box, Tag, Layers, TrendingUp, Search,
  Hash, CloudLightning, Loader2, Package, Image, PlayCircle, FileText, CheckCircle2, Zap,
  Target, DollarSign, Plus, Trash2, Cloud, ChevronLeft, ChevronRight, AlertTriangle
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? window.location.origin : 'http://localhost:3001');

// Wklejenie komponentu ImageModal (ze starego OfferOptimizerView)
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

                                const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? window.location.origin : 'http://localhost:3001');
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



export const UnifiedProductPipelineView = ({ 
  socket, 
  currentUser,
  token,
  editingProduct, 
  setEditingProduct,
  onClose,
  fetchAppGlobalData
}) => {
    // === STANY PIM ===
    const [newProductForm, setNewProductForm] = useState({
        ean: '', sku: '', name: '', brandId: '', stock: 0, salePrice: 0, basePrice: 0, 
        inboundTransportCost: 0, packagingCost: 0, bdoEprCost: 0, outboundTransportCost: 0, 
        status: 'Aktywny', subiektId: '', baselinkerId: '',
        weight: 0, length: 0, width: 0, height: 0, taxRate: 23,
        images: [], videoUrl: '', descriptionHtml: '', features: {}, 
        stockErpUnits: 0, stockWmsUnits: 0
    });
    const [autofillEanLoading, setAutofillEanLoading] = useState(false);
    const [fetchBaselinkerIdLoading, setFetchBaselinkerIdLoading] = useState(false);
    const [brandSearchTerm, setBrandSearchTerm] = useState('');
    const [isBrandDropdownOpen, setIsBrandDropdownOpen] = useState(false);
    const [categorySchema, setCategorySchema] = useState(null);
    const [brands, setBrands] = useState([]);
    
    // === STANY PIPELINE (OFFER OPTIMIZER) ===
    const [isDashboardActive, setIsDashboardActive] = useState(false);
    const [productData, setProductData] = useState(null); 

    const [liveTitle, setLiveTitle] = useState("");
    const [liveEan, setLiveEan] = useState("");
    const [editorHtml, setEditorHtml] = useState({ sekcja1: "", sekcja2: "", sekcja3: "", sekcja4: "", sekcja5: "", sekcja6: "", sekcja7: "Jesteśmy bezpośrednim importerem znanych, włoskich marek. Oferowany asortyment sprowadzamy prosto z Włoch i posiadamy go fizycznie w naszym polskim magazynie, co umożliwia natychmiastową wysyłkę." });
    const [editorKey, setEditorKey] = useState(0); 
    const [visionTickets, setVisionTickets] = useState([]);
    const [viewingImageUrl, setViewingImageUrl] = useState(null);
    const [pipelineStatus, setPipelineStatus] = useState('IDLE');
    const [pipelineStep, setPipelineStep] = useState('');
    
    // NOWE STANY WIZUALIZACJI AGENTA
    const [pipelinePhase, setPipelinePhase] = useState('');
    const [activeNodes, setActiveNodes] = useState([]);
    const [nodeStatuses, setNodeStatuses] = useState({});
    const [pipelineLogs, setPipelineLogs] = useState([]);
    const [hitlAlert, setHitlAlert] = useState(null);
    const [accumulatedHitlOverrides, setAccumulatedHitlOverrides] = useState([]);
    
    const [isRegeneratingTitle, setIsRegeneratingTitle] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isSavingDraft, setIsSavingDraft] = useState(false);
    const [showExportConfirm, setShowExportConfirm] = useState(false);
    const [isPimCollapsed, setIsPimCollapsed] = useState(false);
    
    // NOWE STANY EKSPORTU BASELINKER
    const [isValidatingExport, setIsValidatingExport] = useState(false);
    const [exportValidationResult, setExportValidationResult] = useState(null);

    const brandDropdownRef = useRef(null);

    const handleCreateBrandInline = async (name) => {
        if(!name) return;
        try {
            const brandRes = await axios.post(`${API_URL}/api/brands`, { name: name.trim() }, { headers: { Authorization: `Bearer ${token}` } });
            setBrands(prev => [...prev, brandRes.data]); 
            setNewProductForm(prev => ({ ...prev, brandId: brandRes.data.id }));
            setBrandSearchTerm(brandRes.data.name);
            setIsBrandDropdownOpen(false);
        } catch(err) { alert('Błąd tworzenia marki'); }
    };
    // Ładowanie marek
    useEffect(() => {
        axios.get(`${API_URL}/api/brands`, { headers: { Authorization: `Bearer ${token}` } })
            .then(res => setBrands(res.data))
            .catch(err => console.error("Błąd ładowania marek", err));
    }, [token]);

    // Inicjalizacja PIM (Edycja)
    useEffect(() => {
        if (editingProduct) {
            axios.get(`${API_URL}/api/products/${editingProduct}`, { headers: { Authorization: `Bearer ${token}` } })
                .then(res => {
                    const p = res.data;
                    let calcBdo = parseFloat(p.bdoEprCost) || 0;
                    if (p.bomElements && p.bomElements.length > 0) {
                        calcBdo = 0;
                        p.bomElements.forEach(b => { calcBdo += (parseFloat(b.weightGrams) / 1000) * parseFloat(b.material.ratePerKg); });
                    }
                    setNewProductForm({ ...p, bdoEprCost: parseFloat(calcBdo.toFixed(4)) });
                    setBrandSearchTerm(p.brand ? p.brand.name : '');
                    
                    // Odzyskanie danych prawego panelu
                    let fallbackImages = [];
                    if (p.imageUrl && typeof p.imageUrl === 'string' && p.imageUrl.trim() !== '') {
                        fallbackImages.push(p.imageUrl);
                    }
                    if (Array.isArray(p.images) && p.images.length > 0) {
                        p.images.forEach(img => {
                            if (img && typeof img === 'string' && img.trim() !== '' && !fallbackImages.includes(img)) {
                                fallbackImages.push(img);
                            }
                        });
                    }
                    const fallbackTickets = fallbackImages.map(img => ({ originalUrl: img }));

                    if (p.offerDraft) {
                        setLiveTitle(p.offerDraft.title || p.name || "");
                        setEditorHtml({
                            ...(p.offerDraft.htmlContent || {}),
                            sekcja7: (p.offerDraft.htmlContent && p.offerDraft.htmlContent.sekcja7 !== undefined) ? p.offerDraft.htmlContent.sekcja7 : "Jesteśmy bezpośrednim importerem znanych, włoskich marek. Oferowany asortyment sprowadzamy prosto z Włoch i posiadamy go fizycznie w naszym polskim magazynie, co umożliwia natychmiastową wysyłkę."
                        });
                        const draftTickets = p.offerDraft.visionTickets || p.offerDraft.images || [];
                        setVisionTickets(draftTickets.length > 0 ? draftTickets : fallbackTickets);
                    } else {
                        setLiveTitle(p.name || "");
                        if (p.descriptionHtml) {
                            setEditorHtml({ sekcja1: p.descriptionHtml, sekcja2: "", sekcja3: "", sekcja4: "", sekcja5: "", sekcja6: "", sekcja7: "Jesteśmy bezpośrednim importerem znanych, włoskich marek. Oferowany asortyment sprowadzamy prosto z Włoch i posiadamy go fizycznie w naszym polskim magazynie, co umożliwia natychmiastową wysyłkę." });
                        }
                        setVisionTickets(fallbackTickets);
                    }
                    setLiveEan(p.ean || "");
                    setEditorKey(prev => prev + 1);
                })
                .catch(err => alert("Błąd wczytywania produktu"));
        }
    }, [editingProduct, token]);

    useEffect(() => {
        if (newProductForm?.allegroCategoryId && token) {
            axios.get(`${API_URL}/api/categories/${newProductForm.allegroCategoryId}`, { headers: { Authorization: `Bearer ${token}` } })
                .then(res => setCategorySchema(res.data))
                .catch(err => setCategorySchema(null));
        } else {
            setCategorySchema(null);
        }
    }, [newProductForm?.allegroCategoryId, token]);

    // WebSocket listener for EAN Pipeline progress
    useEffect(() => {
        if (!socket) return;
        const handler = (data) => {
            if (data.ean && String(data.ean) !== String(liveEan).trim()) return;

            if (data.type === 'PIPELINE_COMPLETE') {
                setPipelineStatus('SUCCESS');
                if (data.result) {
                    setEditorHtml(prev => ({
                        ...(data.result.editorHtml || {}),
                        sekcja7: prev.sekcja7 !== undefined ? prev.sekcja7 : "Jesteśmy bezpośrednim importerem znanych, włoskich marek. Oferowany asortyment sprowadzamy prosto z Włoch i posiadamy go fizycznie w naszym polskim magazynie, co umożliwia natychmiastową wysyłkę."
                    }));
                    setLiveTitle(data.result.title || "");
                    setVisionTickets(data.result.visionTickets || []);
                    setNewProductForm(prev => ({
                        ...prev,
                        features: data.result.features || prev.features || {},
                        aeoContent: data.result.aeoContent || prev.aeoContent || '',
                        offerDraft: {
                            title: data.result.title || "",
                            htmlContent: {
                                ...(data.result.editorHtml || {}),
                                sekcja7: (prev.offerDraft && prev.offerDraft.htmlContent && prev.offerDraft.htmlContent.sekcja7 !== undefined) ? prev.offerDraft.htmlContent.sekcja7 : "Jesteśmy bezpośrednim importerem znanych, włoskich marek. Oferowany asortyment sprowadzamy prosto z Włoch i posiadamy go fizycznie w naszym polskim magazynie, co umożliwia natychmiastową wysyłkę."
                            },
                            images: data.result.visionTickets || []
                        }
                    }));
                    setEditorKey(prev => prev + 1);
                }
            } else if (data.type === 'PIPELINE_ERROR') {
                setPipelineStatus('ERROR');
                alert('Błąd potoku EAN: ' + (data.error || 'Wystąpił nieoczekiwany błąd.'));
            } else if (data.type === 'PIPELINE_HITL_ALERT') {
                setPipelineStatus('HITL_PAUSED');
                setHitlAlert({ node: data.node, alert: data.alert, candidates: data.candidates });
            } else if (data.type === 'PIPELINE_STATUS') {
                if (data.payload) {
                    setPipelinePhase(data.payload.current_phase || '');
                    setActiveNodes(data.payload.active_nodes || []);
                    setNodeStatuses(data.payload.node_status || {});
                    
                    if (data.payload.extracted_data) {
                        setNewProductForm(prev => {
                            const updatedFeatures = { ...prev.features };
                            let hasChanges = false;
                            
                            if (data.payload.extracted_data.inci && data.payload.extracted_data.inci.value && updatedFeatures['INCI'] !== data.payload.extracted_data.inci.value) {
                                updatedFeatures['INCI'] = data.payload.extracted_data.inci.value;
                                updatedFeatures['Skład'] = data.payload.extracted_data.inci.value;
                                hasChanges = true;
                            }
                            
                            return hasChanges ? { ...prev, features: updatedFeatures } : prev;
                        });
                    }
                }
            } else if (data.type === 'PIPELINE_LOG') {
                setPipelineLogs(prev => {
                    const newLogs = [...prev, { time: new Date().toLocaleTimeString(), agentId: data.agentId || 'System', msg: data.message }];
                    return newLogs.slice(-100);
                });
            }
        };
        socket.on('nexus-notification', handler);
        return () => socket.off('nexus-notification', handler);
    }, [socket, liveEan]);

    // Handle Create Product
    const handleCreateProduct = async (e) => {
        if(e) e.preventDefault();
        try {
            if (!newProductForm.name || !newProductForm.sku || !newProductForm.brandId) {
                throw new Error("Wypełnij wymagane pola: Nazwa, SKU i Marka przed zapisaniem.");
            }
            let savedProduct;
            if (editingProduct) {
                const res = await axios.patch(`${API_URL}/api/products/${editingProduct}`, newProductForm, { headers: { Authorization: `Bearer ${token}` } });
                savedProduct = res.data;
                alert('Zaktualizowano kartotekę PIM.');
            } else {
                const res = await axios.post(`${API_URL}/api/products`, newProductForm, { headers: { Authorization: `Bearer ${token}` } });
                savedProduct = res.data;
                setEditingProduct(savedProduct.id);
                alert('Utworzono nową kartotekę PIM.');
            }
            if (fetchAppGlobalData) fetchAppGlobalData();
            return savedProduct;
        } catch (error) {
            console.error("Błąd zapisu produktu", error);
            alert("Błąd zapisu produktu: " + (error.response?.data?.error || error.message));
            throw error;
        }
    };

    // Trigger Supervisor Pipeline
    const handleRegenerateTitle = async () => {
        if (!liveEan || isRegeneratingTitle) return;
        setIsRegeneratingTitle(true);
        try {
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
        } finally {
            setIsRegeneratingTitle(false);
        }
    };

    const handleTriggerPipelineFromScratch = () => {
        setAccumulatedHitlOverrides([]);
        handleTriggerPipeline(null, true);
    };

    const handleTriggerPipeline = async (hitlOverrides = null, forceRestart = false) => {
        try {
            // Najpierw zapisujemy formularz PIM
            const savedProd = await handleCreateProduct();
            if (!savedProd || !savedProd.ean) {
                alert("Produkt musi posiadać kod EAN, aby uruchomić EAN Pipeline.");
                return;
            }
            
            const payload = { ean: savedProd.ean };
            if (Array.isArray(hitlOverrides)) payload.hitlOverrides = hitlOverrides;
            if (forceRestart) payload.forceRestart = true;

            // Startujemy Pipeline
            const response = await fetch(`${API_URL}/api/offer-optimizer/pipeline/trigger`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || "Nie udało się uruchomić AI Agenta");
            }

            const data = await response.json();
            alert("Agent Supervisor rozpoczął pracę! Obserwuj postępy w prawej kolumnie.");
            
            // Przejście do widoku aktywnego pipeline
            setLiveEan(savedProd.ean);
            setIsDashboardActive(true);
            setPipelineStatus('THINKING');
            setPipelineLogs([]);
            setPipelinePhase('INICJALIZACJA SYSTEMU');
            setActiveNodes([]);
            setNodeStatuses({});
            setHitlAlert(null);
        } catch (error) {
            console.error(error);
            alert(error.message);
        }
    };

    const handleSaveDraft = async () => {
        setIsSavingDraft(true);
        try {
            const draftData = {
                title: liveTitle,
                htmlContent: editorHtml,
                images: visionTickets,
                sku: newProductForm.sku,
                brandId: newProductForm.brandId,
                subiektId: newProductForm.subiektId,
                baselinkerId: newProductForm.baselinkerId,
                status: newProductForm.status,
                videoUrl: newProductForm.videoUrl,
                weight: newProductForm.weight,
                length: newProductForm.length,
                width: newProductForm.width,
                height: newProductForm.height,
                taxRate: newProductForm.taxRate,
                stock: newProductForm.stock,
                stockErpUnits: newProductForm.stockErpUnits,
                stockWmsUnits: newProductForm.stockWmsUnits,
                allegroCategoryId: newProductForm.allegroCategoryId,
                features: newProductForm.features,
                basePrice: newProductForm.basePrice,
                salePrice: newProductForm.salePrice,
                inboundTransportCost: newProductForm.inboundTransportCost,
                packagingCost: newProductForm.packagingCost,
                bdoEprCost: newProductForm.bdoEprCost,
                outboundTransportCost: newProductForm.outboundTransportCost
            };
            
            await axios.post(`${API_URL}/api/offer-optimizer/save-draft`, {
                ean: liveEan,
                draftData
            }, { headers: { Authorization: `Bearer ${token}` } });
            
            alert('Sukces! Szkic i dane PIM zostały zapisane w systemie.');
            if (fetchAppGlobalData) fetchAppGlobalData();
        } catch (err) {
            console.error(err);
            alert('Błąd zapisu: ' + (err.response?.data?.error || err.message));
        } finally {
            setIsSavingDraft(false);
        }
    };

    const handleValidateExport = async () => {
        setIsValidatingExport(true);
        try {
            const draftData = {
                title: liveTitle,
                htmlContent: editorHtml,
                images: visionTickets
            };
            const res = await axios.post(`${API_URL}/api/offer-optimizer/validate-baselinker-export`, {
                ean: liveEan,
                draftData
            }, { headers: { Authorization: `Bearer ${token}` } });
            
            setExportValidationResult(res.data);
            setShowExportConfirm(true);
        } catch (err) {
            console.error(err);
            alert('Błąd walidacji eksportu: ' + (err.response?.data?.error || err.message));
        } finally {
            setIsValidatingExport(false);
        }
    };

    const handleConfirmExport = async () => {
        setIsExporting(true);
        try {
            const draftData = {
                title: exportValidationResult ? exportValidationResult.title : liveTitle,
                htmlContent: exportValidationResult ? exportValidationResult.sections : editorHtml,
                images: visionTickets,
                features: exportValidationResult ? exportValidationResult.parameters : {},
                agentPayload: exportValidationResult ? exportValidationResult.agentPayload : null
            };
            const res = await axios.post(`${API_URL}/api/offer-optimizer/export-baselinker`, {
                ean: liveEan,
                draftData
            }, { headers: { Authorization: `Bearer ${token}` } });
            
            alert(res.data.message || 'Zlecono eksport i akceptację MDM! PIM -> BaseLinker.');
            setShowExportConfirm(false);
            if (fetchAppGlobalData) fetchAppGlobalData();
        } catch (err) {
            console.error(err);
            alert('Błąd eksportu: ' + (err.response?.data?.error || err.message));
        } finally {
            setIsExporting(false);
        }
    };

    // === TUTAJ PRZENIESIONO PRZYCISK GENERUJ AEO ===
    const handleGenerateAEO = async () => {
        if (!editingProduct) {
            alert("Zapisz najpierw produkt, aby wygenerować AEO.");
            return;
        }
        try {
            const btn = document.getElementById('btn_generate_aeo_hub');
            const prevHtml = btn.innerHTML;
            btn.innerHTML = '<span class="animate-spin mr-2">⏳</span> Generuję...';
            btn.disabled = true;
            
            await axios.post(`${API_URL}/api/products/${editingProduct}/aeo`, {}, { headers: { Authorization: `Bearer ${token}` }});
            if (fetchAppGlobalData) await fetchAppGlobalData();
            alert('Sukces! Treść AEO (pod wyszukiwarki AI) została wygenerowana.');
            
            // Odśwież widok
            const res = await axios.get(`${API_URL}/api/products/${editingProduct}`, { headers: { Authorization: `Bearer ${token}` } });
            setNewProductForm(prev => ({ ...prev, aeoContent: res.data.aeoContent }));
            
            btn.innerHTML = prevHtml;
            btn.disabled = false;
        } catch (err) {
            alert('Błąd generowania AEO: ' + err.message);
            const btn = document.getElementById('btn_generate_aeo_hub');
            if(btn) { btn.innerHTML = '<CloudLightning className="w-4 h-4 mr-2" /> Generuj AEO'; btn.disabled = false; }
        }
    };

    const handleAutofillEAN = async () => {
        if (!newProductForm.ean) return alert('Zeskanuj lub wpisz kod EAN do wyszukania.');
        setAutofillEanLoading(true);
        try {
            const res = await axios.get(`${API_URL}/api/products/autofill/${newProductForm.ean}`, { headers: { Authorization: `Bearer ${token}` } });
            const { name, brand, sku, price, stock, baselinkerId, imageUrl, weight, length, width, height, taxRate, images, descriptionHtml, features, videoUrl, stockErpUnits, stockWmsUnits, allegroCategoryId, existingProductId } = res.data;
            
            if (existingProductId) {
                setEditingProduct(existingProductId);
            }
            
            let matchedBrandId = newProductForm.brandId;
            if (brand && typeof brand === 'string') {
                const cleanBrand = brand.toLowerCase().trim();
                const matchedBrand = brands.find(b => b.name.toLowerCase().trim() === cleanBrand);
                
                if (matchedBrand) {
                    matchedBrandId = matchedBrand.id;
                } else {
                    try {
                        const brandRes = await axios.post(`${API_URL}/api/brands`, { name: brand.trim() }, { headers: { Authorization: `Bearer ${token}` } });
                        matchedBrandId = brandRes.data.id;
                        setBrands(prev => [...prev, brandRes.data]); 
                        if (fetchAppGlobalData) fetchAppGlobalData(); 
                    } catch (be) { console.error('Błąd auto-tworzenia marki', be); }
                }
            }
            
            if(matchedBrandId) {
                const b = brands.find(x => x.id === matchedBrandId) || {name: brand};
                setBrandSearchTerm(b.name);
            } else {
                setBrandSearchTerm(brand || '');
            }
            
            setNewProductForm(prev => ({
                ...prev,
                name: name || prev.name,
                sku: sku || prev.sku,
                salePrice: price || prev.salePrice,
                stock: stock !== undefined ? stock : prev.stock,
                baselinkerId: baselinkerId || prev.baselinkerId,
                brandId: matchedBrandId || prev.brandId,
                imageUrl: imageUrl || prev.imageUrl,
                weight: weight !== undefined ? weight : prev.weight,
                length: length !== undefined ? length : prev.length,
                width: width !== undefined ? width : prev.width,
                height: height !== undefined ? height : prev.height,
                taxRate: taxRate !== undefined ? taxRate : prev.taxRate,
                images: images || prev.images,
                descriptionHtml: descriptionHtml || prev.descriptionHtml,
                features: features || prev.features,
                videoUrl: videoUrl || prev.videoUrl,
                stockErpUnits: stockErpUnits !== undefined ? stockErpUnits : prev.stockErpUnits,
                stockWmsUnits: stockWmsUnits !== undefined ? stockWmsUnits : prev.stockWmsUnits,
                allegroCategoryId: allegroCategoryId || prev.allegroCategoryId
            }));
        } catch (err) {
            const debugInfo = err.response?.data?.debug;
            console.log('--- BASELINKER DEBUG INFO ---', debugInfo);
            alert(`Brak EAN w bazach lub BaseLinker odmówił dostępu.\nSprawdź konsolę (F12) by zobaczyć co odpowiedział serwer bazy!`);
        } finally {
            setAutofillEanLoading(false);
        }
    };

    const handleFetchBaselinkerId = async () => {
        if (!newProductForm.ean || !newProductForm.sku) {
            return alert('Zarówno EAN, jak i SKU muszą być uzupełnione, aby pobrać BaseLinker ID.');
        }
        setFetchBaselinkerIdLoading(true);
        try {
            const res = await axios.get(`${API_URL}/api/products/baselinker-id?ean=${encodeURIComponent(newProductForm.ean)}&sku=${encodeURIComponent(newProductForm.sku)}`, { headers: { Authorization: `Bearer ${token}` } });
            if (res.data.productId) {
                setNewProductForm(prev => ({...prev, baselinkerId: res.data.productId.toString()}));
            }
        } catch (err) {
            console.error('Błąd pobierania BaseLinker ID:', err);
            alert('Błąd pobierania ID. ' + (err.response?.data?.error || err.message));
        } finally {
            setFetchBaselinkerIdLoading(false);
        }
    };

    const labelClass = "text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 block";
    const inputClass = "w-full bg-slate-50 border border-slate-300 text-slate-800 text-sm font-bold rounded-sm px-4 py-3 focus:outline-none focus:border-indigo-500 transition-colors shadow-inner";

    const filteredBrands = brands.filter(b => b.name && b.name.toLowerCase().includes((brandSearchTerm || '').toLowerCase()));

    return (
        <div className="flex-1 flex flex-col p-4 bg-slate-900 h-full w-full relative min-h-0 overflow-hidden">
            <div className="bg-slate-800 rounded-lg shadow-xl mb-4 shrink-0 flex items-center justify-between p-4 border border-slate-700">
                <div className="flex items-center">
                    <div className="w-10 h-10 bg-indigo-500/20 rounded-lg flex items-center justify-center mr-4 border border-indigo-500/30">
                        <Rocket className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-white uppercase tracking-tighter">Unified Product Pipeline</h2>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Karta PIM & Supervisor Agent Hub</p>
                    </div>
                </div>
                <div className="flex space-x-3">
                    <button onClick={onClose} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-md text-xs font-bold uppercase transition-colors">
                        Wróć do Katalogu
                    </button>
                    <button onClick={handleTriggerPipelineFromScratch} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-xs font-bold uppercase transition-colors flex items-center shadow-[0_0_15px_rgba(79,70,229,0.4)]">
                        <Cpu className="w-4 h-4 mr-2" /> Zapisz PIM i Uruchom Agenta
                    </button>
                </div>
            </div>

            
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-10 pb-32">
                
                {/* === SUPERVISOR AGENT PIPELINE === */}
                {pipelineStatus === 'HITL_PAUSED' ? (
                    <div className="flex flex-col space-y-6">
                        <div className="bg-red-950/40 border border-red-700 rounded-lg p-6 flex flex-col items-center justify-center space-y-4 text-center">
                            <AlertTriangle className="w-12 h-12 text-red-500" />
                            <h3 className="text-xl font-bold text-red-400">Wymagana interwencja człowieka (HITL)</h3>
                            <p className="text-red-200">
                                Węzeł <strong>{hitlAlert?.node || 'UNKNOWN'}</strong> zgłosił brak krytycznych danych/błąd walidacji:
                            </p>
                            <div className="font-mono text-white bg-red-900/50 px-4 py-2 rounded max-w-2xl whitespace-pre-wrap break-words border border-red-800">
                                {hitlAlert?.alert || 'Brak dodatkowych informacji.'}
                            </div>
                            {hitlAlert?.alert?.includes('OSINT_CONFLICTING_INCI_MAX_RETRYS') && hitlAlert?.candidates && hitlAlert.candidates.length > 0 && (
                                <div className="mt-4 w-full max-w-2xl bg-slate-900 rounded p-4 border border-slate-700">
                                    <h4 className="text-white font-bold mb-2 text-left">Wybierz właściwy skład INCI (zostanie skopiowany do formularza PIM poniżej):</h4>
                                    <div className="flex flex-col space-y-3 text-left">
                                        {hitlAlert.candidates.map((cand, idx) => (
                                            <div key={idx} className="flex items-start p-3 border border-slate-600 rounded bg-slate-800">
                                                <input 
                                                    type="radio" 
                                                    id={`cand-${idx}`} 
                                                    name="inci-candidate" 
                                                    className="mt-1 mr-3"
                                                    onChange={() => {
                                                        setNewProductForm(prev => {
                                                            const updatedFeatures = { ...prev.features };
                                                            updatedFeatures['INCI'] = cand;
                                                            updatedFeatures['Skład'] = cand;
                                                            return { ...prev, features: updatedFeatures };
                                                        });
                                                    }}
                                                />
                                                <label htmlFor={`cand-${idx}`} className="text-slate-300 text-sm cursor-pointer whitespace-pre-wrap flex-1">
                                                    <span className="font-bold text-indigo-400">Wersja {idx + 1}:</span><br/>
                                                    {cand}
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                    <p className="text-xs text-slate-400 mt-3 text-left">Wybierz jeden z powyższych składów. Następnie kliknij "Zatwierdź brak i kontynuuj".</p>
                                </div>
                            )}
                            <p className="text-red-300 text-sm max-w-md pt-2">
                                Potok został wstrzymany zgodnie z polityką bezpieczeństwa. Możesz uzupełnić dane w systemie i spróbować ponownie, lub wymusić kontynuację pomimo braków.
                            </p>
                            <div className="flex space-x-4 pt-4">
                                <button onClick={() => setPipelineStatus('THINKING')} className="px-4 py-2 bg-slate-800 text-slate-300 rounded hover:bg-slate-700 transition font-bold border border-slate-600">
                                    Przerwij
                                </button>
                                <button onClick={() => {
                                    const newOverrides = [...new Set([...accumulatedHitlOverrides, hitlAlert?.node])].filter(Boolean);
                                    setAccumulatedHitlOverrides(newOverrides);
                                    handleTriggerPipeline(newOverrides);
                                }} className="px-6 py-2 bg-red-600 text-white font-bold rounded hover:bg-red-500 shadow-lg shadow-red-900/50 transition">
                                    Zatwierdź brak i kontynuuj
                                </button>
                            </div>
                        </div>
                    </div>
                ) : pipelineStatus === 'THINKING' ? (
                    
                            <div className="flex flex-col h-full space-y-6">
                                <div className="bg-slate-900 border border-slate-700 rounded-lg p-6">
                                    <h4 className="text-sm font-bold text-indigo-400 mb-2 uppercase tracking-widest flex items-center">
                                        <Loader2 className="w-5 h-5 mr-3 animate-spin" /> {pipelinePhase || 'Inicjalizacja Systemu...'}
                                    </h4>
                                    <div className="flex flex-wrap gap-3 mt-4">
                                        {activeNodes.map(node => (
                                            <div key={node} className="px-3 py-1.5 bg-indigo-500/20 border border-indigo-500/50 text-indigo-300 text-xs font-bold rounded-md animate-pulse">
                                                {node.replace(/_/g, ' ')}
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-4 text-xs text-slate-500 font-mono flex flex-wrap gap-4">
                                        {Object.entries(nodeStatuses).map(([node, status]) => (
                                            <div key={node} className={`flex items-center space-x-1 ${status === 'COMPLETED' ? 'text-emerald-400' : status === 'IN_PROGRESS' ? 'text-indigo-400' : 'text-slate-500'}`}>
                                                {status === 'COMPLETED' && <CheckCircle2 className="w-3 h-3" />}
                                                {status === 'IN_PROGRESS' && <Loader2 className="w-3 h-3 animate-spin" />}
                                                <span>{node.split('_').pop()}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex-1 bg-[#0a0a0a] rounded-lg border border-slate-700 p-4 font-mono text-[11px] overflow-y-auto flex flex-col custom-scrollbar shadow-inner">
                                    <div className="text-slate-500 mb-3 uppercase tracking-widest text-[9px] border-b border-slate-800 pb-2 flex justify-between">
                                        <span>Terminal Agenta (Live Logs)</span>
                                        <span>{pipelineLogs.length} Zdarzeń</span>
                                    </div>
                                    <div className="flex-1 overflow-y-auto flex flex-col space-y-1 pb-4">
                                        {pipelineLogs.map((log, i) => (
                                            <div key={i} className="flex space-x-3 hover:bg-slate-800/30 px-1 py-0.5 rounded transition-colors">
                                                <span className="text-slate-600 shrink-0">[{log.time}]</span>
                                                <span className="text-indigo-400 shrink-0 font-bold">[{log.agentId}]</span>
                                                <span className="text-emerald-400 break-words">
                                                    {typeof log.msg === 'object' ? JSON.stringify(log.msg) : log.msg}
                                                </span>
                                            </div>
                                        ))}
                                        {pipelineLogs.length === 0 && <div className="text-slate-600 italic mt-2">Oczekiwanie na strumień zdarzeń z węzłów Swarm...</div>}
                                    </div>
                                </div>
                            </div>
                        
                ) : (
                    <div className="space-y-8">
                        {/* 1. Tytuł */}
                        <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl">
                            <TitleValidator liveTitle={liveTitle} setLiveTitle={setLiveTitle} isRegeneratingTitle={isRegeneratingTitle} handleRegenerateTitle={handleRegenerateTitle} />
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
                                            {visionTickets && visionTickets.length > 0 ? `${visionTickets.filter(v => v.isCompliant || v.replacedUrl).length} / ${visionTickets.length} Poprawne` : '0 / 0'}
                                        </span>
                                    </h2>
                                    <div className="grid grid-cols-1 gap-6 flex-grow content-start">
                                        {visionTickets && visionTickets.length > 0 ? visionTickets.map((ticket, i) => (
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
                                        )) : (
                                            <div className="text-center text-slate-500 text-sm py-4">Brak zdjęć do audytu.</div>
                                        )}
                                    </div>
                                    <button 
                                        onClick={() => setVisionTickets([...(visionTickets || []), { originalUrl: '', isCompliant: false, alerts: ["Upuść zdjęcie"] }])}
                                        className="mt-6 w-full py-4 border border-dashed border-slate-700 rounded-xl flex items-center justify-center text-slate-500 font-bold hover:border-indigo-500 hover:text-indigo-400 transition-all text-xs uppercase tracking-widest flex-shrink-0"
                                    >
                                        + Dodaj Slot Zdjęcia
                                    </button>
                                </div>

                                {/* Symulator przeniesiony na lewo i powiększony */}
                                <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl overflow-hidden h-[600px] relative flex-shrink-0 flex flex-col">
                                    <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 mb-4 flex items-center flex-shrink-0">
                                        <Box className="w-4 h-4 mr-2 text-indigo-400" /> Symulator Układu Kafelków
                                    </h2>
                                    <div className="relative flex-grow w-full overflow-y-auto overflow-x-hidden custom-scrollbar bg-slate-50 rounded-lg border border-slate-700 p-2">
                                        <div className="origin-top-left scale-[1.05] w-[95%] mx-auto">
                                            <TileSimulator customSections={[
                                                { items: [ { type: 'TEXT', content: editorHtml.sekcja1 }, { type: 'IMAGE', content: (visionTickets && visionTickets[0]) ? (visionTickets[0].replacedUrl || visionTickets[0].originalUrl) : '' } ] },
                                                { items: [ { type: 'TEXT', content: editorHtml.sekcja2 }, { type: 'IMAGE', content: (visionTickets && visionTickets[1]) ? (visionTickets[1].replacedUrl || visionTickets[1].originalUrl) : '' } ] },
                                                { items: [ { type: 'TEXT', content: editorHtml.sekcja3 }, { type: 'IMAGE', content: (visionTickets && visionTickets[2]) ? (visionTickets[2].replacedUrl || visionTickets[2].originalUrl) : '' } ] },
                                                { items: [ { type: 'TEXT', content: editorHtml.sekcja4 }, { type: 'IMAGE', content: (visionTickets && visionTickets[3]) ? (visionTickets[3].replacedUrl || visionTickets[3].originalUrl) : '' } ] },
                                                { items: [ { type: 'TEXT', content: editorHtml.sekcja5 }, { type: 'IMAGE', content: (visionTickets && visionTickets[4]) ? (visionTickets[4].replacedUrl || visionTickets[4].originalUrl) : '' } ] },
                                                { items: [ { type: 'TEXT', content: editorHtml.sekcja6 }, { type: 'IMAGE', content: (visionTickets && visionTickets[5]) ? (visionTickets[5].replacedUrl || visionTickets[5].originalUrl) : '' } ] }
                                            ]} />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Prawa kolumna: GEO/AEO (StrictWysiwyg) */}
                            <div className="xl:col-span-7 flex flex-col h-full">
                                <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl flex flex-col flex-grow">
                                    <div className="flex items-center justify-between mb-6 flex-shrink-0">
                                        <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 flex items-center">
                                            <Database className="w-4 h-4 mr-2 text-indigo-400" /> Moduły Sprzedażowe (GEO/AEO)
                                        </h2>
                                        <div className="flex items-center space-x-3">
                                            <button 
                                                onClick={handleSaveDraft} 
                                                disabled={isSavingDraft} 
                                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] uppercase font-black tracking-widest rounded-md transition-all shadow-md flex items-center disabled:opacity-50"
                                            >
                                                {isSavingDraft ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                                                Zapisz Szkic AI
                                            </button>
                                            <button 
                                                onClick={handleValidateExport}
                                                disabled={isValidatingExport}
                                                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-[10px] uppercase font-black tracking-widest rounded-md transition-all shadow-md flex items-center disabled:opacity-50"
                                            >
                                                {isValidatingExport ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                                                Eksport Baselinker
                                            </button>
                                        </div>
                                    </div>
                                    <div className="space-y-6 overflow-y-auto pr-2 custom-scrollbar flex-grow" style={{ minHeight: '600px' }}>
                                        {[
                                            { key: 'sekcja1', label: 'Moduł 1: Mocne Strony' },
                                            { key: 'sekcja2', label: 'Moduł 2: Główny Opis' },
                                            { key: 'sekcja3', label: 'Moduł 3: Detale' },
                                            { key: 'sekcja4', label: 'Moduł 4: Specyfikacja' },
                                            { key: 'sekcja5', label: 'Moduł 5: INCI / Bezpieczeństwo' },
                                            { key: 'sekcja6', label: 'Moduł 6: FAQ / Dodatkowe' },
                                            { key: 'sekcja7', label: 'Moduł 7: Reklama' }
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
                    </div>
                )}

                {/* === PIM DATA (ALL PREVIOUS LEFT-COLUMN SECTIONS) === */}
                <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 mt-12 overflow-hidden">
                    <div className="bg-slate-100 px-6 py-4 border-b border-slate-200">
                        <h3 className="text-lg font-black text-slate-800 uppercase tracking-widest flex items-center">
                            <Database className="w-5 h-5 mr-3 text-indigo-500" /> Dane Kartoteki PIM i Parametry
                        </h3>
                    </div>
                    <div className="p-8 space-y-12">
                        
                                        
                                        <div className="flex flex-col md:flex-row gap-6 mb-6">
                                           {/* Stabilna Główna Miniaturka */}
                                           {newProductForm.imageUrl && (
                                              <div className="w-40 shrink-0 bg-white border border-slate-200 rounded-sm p-3 shadow-sm flex flex-col items-center justify-center">
                                                 <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 block w-full text-center border-b border-slate-100 pb-2">Główna Miniatura</span>
                                                 <img src={newProductForm.imageUrl} alt="PIM Thumbnail" className="w-full h-auto object-contain rounded-sm" />
                                              </div>
                                           )}
                                           
                                           {/* Moduł API EAN */}
                                           <div className="flex-1 p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-sm flex flex-col justify-center">
                                              <label className="text-[10px] font-black text-indigo-800 uppercase tracking-widest mb-3 flex items-center"><CloudLightning className="w-4 h-4 mr-2"/> Automatyka Globalnej Sieci (EAN)</label>
                                              <div className="flex space-x-4 items-end">
                                                <input type="text" placeholder="Zeskanuj kod kreskowy tu..." className="flex-1 px-4 py-3 bg-white border border-blue-200 rounded-sm text-sm font-bold text-slate-800 focus:border-indigo-500 outline-none font-mono tracking-widest shadow-inner" value={newProductForm.ean} onChange={e => setNewProductForm({...newProductForm, ean: e.target.value})} />
                                                <button type="button" onClick={handleAutofillEAN} disabled={autofillEanLoading} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-widest rounded-sm shadow-md transition-all flex items-center shrink-0">
                                                  {autofillEanLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin"/> : <Search className="w-4 h-4 mr-2"/> } {autofillEanLoading ? 'Szukam...' : 'Interpoluj EAN'}
                                                </button>
                                              </div>
                                           </div>
                                        </div>
                        
                                        <div className="grid grid-cols-3 gap-5">
                                          <div className="col-span-3">
                                            <label className={labelClass}>Oficjalna Nazwa Handlowa *</label>
                                            <input required placeholder="Np. Nexus Core Ultra S1..." type="text" className={inputClass} value={newProductForm.name} onChange={e => setNewProductForm({...newProductForm, name: e.target.value})} />
                                          </div>
                                          <div>
                                            <label className={labelClass}>SKU (Identyfikator Wewnętrzny) *</label>
                                            <input required placeholder="NEX-XXX-001..." type="text" className={`${inputClass} font-mono`} value={newProductForm.sku} onChange={e => setNewProductForm({...newProductForm, sku: e.target.value})} />
                                          </div>
                                          <div>
                                            <label className={labelClass}>BaseLinker Product ID</label>
                                            <div className="flex space-x-2">
                                              <input placeholder="Puste = brak linku" type="text" className={`${inputClass} font-mono flex-1`} value={newProductForm.baselinkerId} onChange={e => setNewProductForm({...newProductForm, baselinkerId: e.target.value})} />
                                              <button type="button" onClick={handleFetchBaselinkerId} disabled={fetchBaselinkerIdLoading} className="px-4 py-3 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 disabled:opacity-50 rounded-sm transition-colors flex items-center justify-center shrink-0 border border-indigo-200 shadow-inner" title="Pobierz ID na podstawie EAN i SKU">
                                                {fetchBaselinkerIdLoading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Search className="w-4 h-4"/>}
                                              </button>
                                            </div>
                                          </div>
                                          <div ref={brandDropdownRef} className="relative z-30">
                                            <label className={labelClass}>Marka (Wybierz lub dodaj nową) *</label>
                                            <div className="relative">
                                               <input 
                                                 type="text" 
                                                 required
                                                 className={`${inputClass} pr-10`}
                                                 placeholder="Wpisz nazwę marki..."
                                                 value={brandSearchTerm}
                                                 onChange={(e) => {
                                                    setBrandSearchTerm(e.target.value);
                                                    setNewProductForm(prev => ({...prev, brandId: ''}));
                                                    setIsBrandDropdownOpen(true);
                                                 }}
                                                 onFocus={() => setIsBrandDropdownOpen(true)}
                                               />
                                               <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                            </div>
                                            {isBrandDropdownOpen && (
                                               <div className="absolute z-50 w-full mt-1 bg-white border border-slate-300 rounded-sm shadow-[0_10px_40px_rgba(0,0,0,0.1)] max-h-48 overflow-y-auto custom-scrollbar">
                                                  {filteredBrands.length > 0 ? (
                                                     filteredBrands.map(b => (
                                                        <div 
                                                           key={b.id} 
                                                           className={`p-3 cursor-pointer hover:bg-indigo-50 transition-colors border-b border-slate-100 last:border-b-0 ${newProductForm.brandId === b.id ? 'bg-indigo-50' : ''}`}
                                                           onMouseDown={(e) => {
                                                              e.preventDefault(); 
                                                              setNewProductForm(prev => ({...prev, brandId: b.id}));
                                                              setBrandSearchTerm(b.name);
                                                              setIsBrandDropdownOpen(false);
                                                           }}
                                                        >
                                                           <div className="text-xs font-bold text-slate-800">{b.name}</div>
                                                        </div>
                                                     ))
                                                  ) : (
                                                     <div className="p-3 text-center">
                                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Brak marki w bazie</span>
                                                        <button type="button" onMouseDown={(e) => { e.preventDefault(); handleCreateBrandInline(brandSearchTerm); }} className="w-full py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white rounded-sm text-[10px] font-black uppercase tracking-widest transition-colors flex items-center justify-center">
                                                          <Plus className="w-3 h-3 mr-2" /> Dodaj: "{brandSearchTerm}"
                                                        </button>
                                                     </div>
                                                  )}
                                               </div>
                                            )}
                                          </div>
                                          
                                          <div className="col-span-2 mt-4 p-5 bg-indigo-50/50 border border-indigo-100 rounded-sm">
                                             <label className="text-[10px] font-black text-indigo-700 uppercase tracking-widest mb-3 flex items-center">
                                                <Target className="w-4 h-4 mr-2" /> ID Kategorii Allegro (Data Quality Score)
                                             </label>
                                             <div className="flex space-x-4">
                                                <input type="text" placeholder="Np. 257745" className={`${inputClass} flex-1`} value={newProductForm.allegroCategoryId || ''} onChange={e => setNewProductForm({...newProductForm, allegroCategoryId: e.target.value})} />
                                                {editingProduct && (
                                                   <button type="button" onClick={async () => {
                                                      try {
                                                         const res = await axios.get(`${API_URL}/api/products/${editingProduct}/sync-category-bl`, { headers: { Authorization: `Bearer ${token}` } });
                                                         setNewProductForm(prev => ({...prev, allegroCategoryId: res.data.allegroCategoryId}));
                                                         alert("Pomyślnie dopasowano kategorię Allegro na podstawie kodu EAN oraz zsynchronizowano słownik.");
                                                      } catch (err) {
                                                         alert("Błąd: " + (err.response?.data?.error || err.message));
                                                      }
                                                   }} className="px-6 py-3 bg-white text-indigo-600 font-black text-[10px] uppercase tracking-widest rounded-sm border border-indigo-200 hover:bg-indigo-600 hover:text-white transition-all whitespace-nowrap shadow-sm">
                                                      Szukaj po EAN
                                                   </button>
                                                )}
                                             </div>
                                             <p className="text-[9px] text-indigo-500 mt-2 font-bold uppercase tracking-widest">
                                                Przypisanie ID pozwoli na dynamiczną ewaluację brakujących parametrów wymaganych do skutecznej syndykacji na Marketplace Allegro.
                                             </p>
                                          </div>
                                        </div>
                        
                                        {/* Nowa Sekcja: Logistyka i Gabaryty */}
                                        <div className="pt-10 border-t border-slate-300">
                                           <h4 className="text-sm font-black text-slate-800 uppercase tracking-[0.3em] mb-8 flex items-center">
                                             <Package className="w-5 h-5 mr-3 text-indigo-500" /> Logistyka i Gabaryty (PIM)
                                           </h4>
                                           <div className="grid grid-cols-5 gap-6">
                                             <div><label className={labelClass}>Waga (kg)</label><input type="number" step="0.01" className={inputClass} value={newProductForm.weight || 0} onChange={e => setNewProductForm({...newProductForm, weight: e.target.value})} /></div>
                                             <div><label className={labelClass}>Długość (cm)</label><input type="number" step="0.1" className={inputClass} value={newProductForm.length || 0} onChange={e => setNewProductForm({...newProductForm, length: e.target.value})} /></div>
                                             <div><label className={labelClass}>Szerokość (cm)</label><input type="number" step="0.1" className={inputClass} value={newProductForm.width || 0} onChange={e => setNewProductForm({...newProductForm, width: e.target.value})} /></div>
                                             <div><label className={labelClass}>Wysokość (cm)</label><input type="number" step="0.1" className={inputClass} value={newProductForm.height || 0} onChange={e => setNewProductForm({...newProductForm, height: e.target.value})} /></div>
                                             <div><label className={labelClass}>Stawka VAT (%)</label><input type="number" className={inputClass} value={newProductForm.taxRate || 23} onChange={e => setNewProductForm({...newProductForm, taxRate: e.target.value})} /></div>
                                           </div>
                                        </div>
                        
                                        {/* Nowa Sekcja: Stany Magazynowe Rozszerzone */}
                                        <div className="pt-10 border-t border-slate-300">
                                           <h4 className="text-sm font-black text-slate-800 uppercase tracking-[0.3em] mb-8 flex items-center">
                                             <Database className="w-5 h-5 mr-3 text-indigo-500" /> Architektura Zapasów
                                           </h4>
                                           <div className="flex space-x-6">
                                             <div className="flex-1 bg-slate-50 p-6 rounded-sm border border-slate-300">
                                                <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-2">Zapas Zintegrowany (Suma)</div>
                                                <div className="flex items-center">
                                                   <input type="number" className="w-24 bg-white border border-slate-400 rounded-sm px-3 py-1 font-black text-xl mr-2 outline-none focus:border-indigo-500" value={newProductForm.stock || 0} onChange={e => setNewProductForm({...newProductForm, stock: e.target.value})} />
                                                   <span className="text-sm text-slate-600 font-bold">szt.</span>
                                                </div>
                                             </div>
                                             <div className="flex-1 bg-indigo-50 p-6 rounded-sm border border-indigo-100 opacity-80 cursor-not-allowed">
                                                <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2">Własny ERP (NeS)</div>
                                                <div className="text-2xl font-black text-indigo-900">{newProductForm.stockErpUnits || 0} <span className="text-sm text-indigo-400">szt.</span></div>
                                             </div>
                                             <div className="flex-1 bg-emerald-50 p-6 rounded-sm border border-emerald-100 opacity-80 cursor-not-allowed">
                                                <div className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-2">Zewnętrzny WMS (Fulfillment)</div>
                                                <div className="text-2xl font-black text-emerald-900">{newProductForm.stockWmsUnits || 0} <span className="text-sm text-emerald-400">szt.</span></div>
                                             </div>
                                           </div>
                                        </div>
                        
                                        {/* Nowa Sekcja: Multimedia i Opis (Read Only) */}
                                        <div className="pt-10 border-t border-slate-300">
                                           <h4 className="text-sm font-black text-slate-800 uppercase tracking-[0.3em] mb-8 flex items-center">
                                             <Image className="w-5 h-5 mr-3 text-indigo-500" /> Multimedia i Dane Techniczne
                                           </h4>
                                           <div className="grid grid-cols-2 gap-5">
                                              <div>
                                                 <label className={labelClass}>Galeria BaseLinker ({newProductForm.images?.length || 0})</label>
                                                 {newProductForm.images && newProductForm.images.length > 0 ? (
                                                    <div className="grid grid-cols-4 gap-2 mt-4">
                                                       {(newProductForm.images || []).map((img, idx) => (
                                                           <div key={idx} className="aspect-square bg-white border border-slate-400 rounded-sm overflow-hidden shadow-sm">
                                                              <img src={img} alt="PIM" className="w-full h-full object-cover" />
                                                           </div>
                                                       ))}
                                                    </div>
                                                 ) : (
                                                    <div className="p-6 bg-slate-50 border border-slate-300 rounded-sm text-center text-slate-600 text-xs font-bold mt-4">
                                                       Brak zsynchronizowanych multimediów.
                                                    </div>
                                                 )}
                                                 {newProductForm.videoUrl && (
                                                     <div className="mt-4 p-4 bg-blue-50 border border-blue-100 rounded-sm text-blue-600 text-[10px] font-black uppercase tracking-widest flex items-center">
                                                         <PlayCircle className="w-4 h-4 mr-2" /> Wideo produktowe dostępne
                                                     </div>
                                                 )}
                                              </div>
                                              <div>
                                                 <label className={labelClass}>Opis HTML i Parametry</label>
                                                 <div className="space-y-4 mt-4">
                                                    <div className={`p-4 rounded-sm border flex flex-col justify-between ${newProductForm.descriptionHtml ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-slate-50 border-slate-300 text-slate-600'}`}>
                                                       <div className="flex items-center text-xs font-black uppercase tracking-widest justify-between w-full">
                                                          <div className="flex items-center">
                                                             <FileText className="w-4 h-4 mr-2" />
                                                             {newProductForm.descriptionHtml ? 'Zapisano bogaty opis HTML' : 'Brak Opisu HTML'}
                                                          </div>
                                                          {newProductForm.descriptionHtml && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                                                       </div>
                                                       {newProductForm.descriptionHtml && (
                                                           <div className="mt-3 max-h-32 overflow-y-auto custom-scrollbar p-2 bg-white rounded border border-emerald-100 text-[10px] text-slate-600 font-mono">
                                                               {newProductForm.descriptionHtml}
                                                           </div>
                                                       )}
                                                    </div>
                        
                                                    {newProductForm.aeoContent && (
                                                       <div className="p-4 rounded-sm border bg-amber-50 border-amber-200 text-amber-800">
                                                           <div className="flex items-center justify-between text-xs font-black uppercase tracking-widest mb-2">
                                                               <div className="flex items-center">
                                                                   <Zap className="w-4 h-4 mr-2 text-amber-500" />
                                                                   Treść AEO (Answer Engine Optimization)
                                                               </div>
                                                               <span className="bg-amber-200 text-amber-900 px-2 py-0.5 rounded text-[9px]">SGE / Perplexity Ready</span>
                                                           </div>
                                                           <div className="max-h-48 overflow-y-auto custom-scrollbar p-3 bg-white rounded border border-amber-200 text-[11px] text-slate-700 font-serif leading-relaxed">
                                                               <div dangerouslySetInnerHTML={{ __html: newProductForm.aeoContent }} />
                                                           </div>
                                                       </div>
                                                    )}
                                                    
                                                      <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-sm mb-4">
                                                         <div className="text-[10px] font-black text-emerald-800 uppercase tracking-widest mb-3 flex items-center justify-between">
                                                            <div className="flex items-center space-x-3">
                                                                <Database className="w-4 h-4 mr-1 text-emerald-600"/>
                                                                <span>Karta Techniczna i Skład (Parametry PIM)</span>
                                                            </div>
                                                         </div>
                                                         
                                                         <div className="flex flex-col space-y-2">
                                                            {(() => {
                                                                const basePimParams = ['Skład/INCI'];
                                                                const currentFeatures = newProductForm.features || {};
                                                                const displayFeatures = { ...currentFeatures };
                                                                
                                                                basePimParams.forEach(p => {
                                                                    if (!(p in displayFeatures)) {
                                                                        displayFeatures[p] = '';
                                                                    }
                                                                });

                                                                return Object.entries(displayFeatures)
                                                                    .filter(([k]) => !categorySchema?.parameters?.some(p => String(p.name).toLowerCase().trim() === String(k).toLowerCase().trim()))
                                                                    .map(([k, v]) => {
                                                                        const displayVal = typeof v === 'object' ? JSON.stringify(v) : v;
                                                                        return (
                                                                            <div key={k} className="flex items-center space-x-2 group">
                                                                                <input type="text" value={k} readOnly className="w-1/3 bg-white border border-emerald-200 rounded-sm px-3 py-2 text-[10px] font-bold text-emerald-700 uppercase tracking-widest shadow-sm" />
                                                                                <input type="text" value={displayVal} placeholder="Wpisz wartość..." onChange={e => {
                                                                                    const updated = {...newProductForm.features, [k]: e.target.value};
                                                                                    setNewProductForm({...newProductForm, features: updated});
                                                                                }} className="flex-1 bg-white border border-emerald-200 rounded-sm px-3 py-2 text-[11px] font-bold outline-none focus:border-emerald-500 shadow-sm" />
                                                                                <button type="button" onClick={() => {
                                                                                    const updated = {...newProductForm.features};
                                                                                    delete updated[k];
                                                                                    setNewProductForm({...newProductForm, features: updated});
                                                                                }} className="p-2 text-emerald-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"><X className="w-4 h-4" /></button>
                                                                            </div>
                                                                        );
                                                                    });
                                                            })()}
                                                            
                                                            <div className="flex items-center space-x-2 mt-2 pt-3 border-t border-emerald-200">
                                                                <input type="text" id="new_pim_feat_key" placeholder="Nazwa (np. Cechy dodatkowe)" className="w-1/3 bg-white border border-emerald-200 rounded-sm px-3 py-2 text-[10px] font-bold uppercase tracking-widest outline-none focus:border-emerald-500 placeholder:normal-case placeholder:tracking-normal" />
                                                                <input type="text" id="new_pim_feat_val" placeholder="Wartość" className="flex-1 bg-white border border-emerald-200 rounded-sm px-3 py-2 text-[11px] font-bold outline-none focus:border-emerald-500" onKeyDown={e => {
                                                                    if (e.key === 'Enter') {
                                                                        e.preventDefault();
                                                                        const keyInput = document.getElementById('new_pim_feat_key');
                                                                        const key = keyInput.value.trim();
                                                                        const val = e.target.value.trim();
                                                                        if (key && val) {
                                                                            setNewProductForm(prev => ({...prev, features: {...(prev.features || {}), [key]: val}}));
                                                                            keyInput.value = '';
                                                                            e.target.value = '';
                                                                            keyInput.focus();
                                                                        }
                                                                    }
                                                                }} />
                                                                <button type="button" onClick={() => {
                                                                    const keyInput = document.getElementById('new_pim_feat_key');
                                                                    const valInput = document.getElementById('new_pim_feat_val');
                                                                    const key = keyInput.value.trim();
                                                                    const val = valInput.value.trim();
                                                                    if (key && val) {
                                                                        setNewProductForm(prev => ({...prev, features: {...(prev.features || {}), [key]: val}}));
                                                                        keyInput.value = '';
                                                                        valInput.value = '';
                                                                        keyInput.focus();
                                                                    }
                                                                }} className="p-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-sm transition-colors shadow-md"><Plus className="w-4 h-4" /></button>
                                                            </div>
                                                         </div>
                                                      </div>

                                                      <div className="p-4 bg-slate-50 border border-slate-300 rounded-sm">
                                                         <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-3 flex items-center justify-between">
                                                            <div className="flex items-center space-x-3">
                                                                <span>Katalog Parametrów Allegro ({Object.keys(newProductForm.features || {}).filter(k => categorySchema?.parameters?.some(p => String(p.name).toLowerCase().trim() === String(k).toLowerCase().trim())).length})</span>
                                                                {categorySchema && <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-[9px] flex items-center"><Zap className="w-3 h-3 mr-1"/> Schema: {categorySchema.name}</span>}
                                                            </div>
                                                            <button type="button" onClick={async () => {
                                                                if (!editingProduct) return;
                                                                try {
                                                                    const btn = document.getElementById('btn_autofill_pxm');
                                                                    const prevText = btn.innerHTML;
                                                                    btn.innerHTML = 'Pobieram (BL + AI)...';
                                                                    btn.disabled = true;
                                                                    
                                                                    const res = await axios.post(`${API_URL}/api/products/${editingProduct}/autofill-params`, {}, { headers: { Authorization: `Bearer ${token}` } });
                                                                    setNewProductForm(prev => ({...prev, features: res.data.features}));
                                                                    
                                                                    btn.innerHTML = prevText;
                                                                    btn.disabled = false;
                                                                    alert("Zakończono PXM Auto-Fill. Zaimportowano dane z BaseLinkera, a luki uzupełnił Agent AI.");
                                                                } catch (err) {
                                                                    alert("Błąd: " + (err.response?.data?.error || err.message));
                                                                    const btn = document.getElementById('btn_autofill_pxm');
                                                                    if (btn) { btn.innerHTML = 'Pobierz dane (Auto-Fill)'; btn.disabled = false; }
                                                                }
                                                            }} id="btn_autofill_pxm" className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-sm text-[9px] font-bold uppercase transition-colors shadow-sm flex items-center">
                                                                <Zap className="w-3 h-3 mr-1" /> Pobierz dane (Auto-Fill)
                                                            </button>
                                                         </div>
                                                         
                                                         <div className="flex flex-col space-y-2">
                                                             {categorySchema?.parameters && categorySchema.parameters.map(param => {
                                                                const isRequired = param.required;
                                                                const featKeys = Object.keys(newProductForm.features || {});
                                                                const matchedKey = featKeys.find(k => String(k).toLowerCase().trim() === String(param.name).toLowerCase().trim());
                                                                let val = matchedKey ? (newProductForm.features || {})[matchedKey] : '';
                                                                if (val && param.dictionary && param.dictionary.length > 0) {
                                                                    const dictMatch = param.dictionary.find(d => String(d.value).toLowerCase().trim() === String(val).toLowerCase().trim());
                                                                    if (dictMatch) val = dictMatch.value;
                                                                }
                                                                const hasVal = val !== '';
                                                                return (
                                                                 <div key={param.id} className={`flex items-center space-x-2 p-2 rounded-sm border ${hasVal ? 'bg-indigo-50/30 border-indigo-100' : 'bg-white border-slate-200'}`}>
                                                                     <div className="w-1/3 text-[10px] font-bold text-slate-700 uppercase tracking-widest flex flex-col">
                                                                         <span>{param.name}</span>
                                                                         {isRequired && <span className="text-[8px] text-rose-500 uppercase mt-0.5">Wymagane</span>}
                                                                     </div>
                                                                     {param.dictionary && param.dictionary.length > 0 ? (
                                                                         <select className="flex-1 bg-white border border-slate-300 rounded-sm px-3 py-2 text-[11px] font-bold outline-none focus:border-indigo-500" value={val} onChange={e => {
                                                                             const updated = {...(newProductForm.features || {}), [param.name]: e.target.value};
                                                                             if (!e.target.value) delete updated[param.name];
                                                                             setNewProductForm({...newProductForm, features: updated});
                                                                         }}>
                                                                             <option value="">-- Wybierz ze słownika --</option>
                                                                             {param.dictionary && param.dictionary.map(d => <option key={d.id} value={d.value}>{d.value}</option>)}
                                                                         </select>
                                                                     ) : (
                                                                         <input type="text" className="flex-1 bg-white border border-slate-300 rounded-sm px-3 py-2 text-[11px] font-bold outline-none focus:border-indigo-500" placeholder={`Wpisz wartość (${param.type})`} value={val} onChange={e => {
                                                                             const updated = {...(newProductForm.features || {}), [param.name]: e.target.value};
                                                                             if (!e.target.value) delete updated[param.name];
                                                                             setNewProductForm({...newProductForm, features: updated});
                                                                         }} />
                                                                     )}
                                                                 </div>
                                                                );
                                                             })}
                                                             
                                                             <div className="flex items-center space-x-2 mt-2 pt-3 border-t border-slate-200">
                                                                 <input type="text" id="new_feat_key" placeholder="Nazwa (np. Stan, Rodzaj)" className="w-1/3 bg-white border border-indigo-200 rounded-sm px-3 py-2 text-[10px] font-bold uppercase tracking-widest outline-none focus:border-indigo-500 placeholder:normal-case placeholder:tracking-normal" />
                                                                 <input type="text" id="new_feat_val" placeholder="Wartość (np. Nowy)" className="flex-1 bg-white border border-indigo-200 rounded-sm px-3 py-2 text-[11px] font-bold outline-none focus:border-indigo-500" onKeyDown={e => {
                                                                     if (e.key === 'Enter') {
                                                                         e.preventDefault();
                                                                         const keyInput = document.getElementById('new_feat_key');
                                                                         const key = keyInput.value.trim();
                                                                         const val = e.target.value.trim();
                                                                         if (key && val) {
                                                                             setNewProductForm(prev => ({...prev, features: {...(prev.features || {}), [key]: val}}));
                                                                             keyInput.value = '';
                                                                             e.target.value = '';
                                                                             keyInput.focus();
                                                                         }
                                                                     }
                                                                 }} />
                                                                 <button type="button" onClick={() => {
                                                                     const keyInput = document.getElementById('new_feat_key');
                                                                     const valInput = document.getElementById('new_feat_val');
                                                                     const key = keyInput.value.trim();
                                                                     const val = valInput.value.trim();
                                                                     if (key && val) {
                                                                         setNewProductForm(prev => ({...prev, features: {...(prev.features || {}), [key]: val}}));
                                                                         keyInput.value = '';
                                                                         valInput.value = '';
                                                                         keyInput.focus();
                                                                     }
                                                                 }} className="p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-sm transition-colors shadow-md"><Plus className="w-4 h-4" /></button>
                                                             </div>
                                                            <p className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest mt-2 flex items-center">
                                                               <Zap className="w-3 h-3 mr-1" /> {categorySchema ? 'Wypełnij wymagane wartości z oficjalnego słownika Allegro.' : 'Pobierz kategorię Allegro, aby załadować interaktywny formularz parametrów.'}
                                                            </p>
                                                         </div>
                                                      </div>
                                                 </div>
                                              </div>
                                           </div>
                                        </div>
                        
                                        <div className="pt-12 border-t border-slate-300">
                                          <h4 className="text-sm font-black text-indigo-600 uppercase tracking-[0.3em] mb-5 flex items-center">
                                            <DollarSign className="w-6 h-6 mr-4" /> Struktura Analityczna Unit Economics
                                          </h4>
                                          <div className="grid grid-cols-3 gap-4">
                                            <div><label className={labelClass}>Cena Zakupu netto</label><input type="number" step="0.01" className={inputClass} value={newProductForm.basePrice} onChange={e => setNewProductForm({...newProductForm, basePrice: e.target.value})} /></div>
                                            <div><label className={labelClass}>Transport In (cła)</label><input type="number" step="0.01" className={inputClass} value={newProductForm.inboundTransportCost} onChange={e => setNewProductForm({...newProductForm, inboundTransportCost: e.target.value})} /></div>
                                            <div><label className={labelClass}>Koszty pakowania</label><input type="number" step="0.01" className={inputClass} value={newProductForm.packagingCost} onChange={e => setNewProductForm({...newProductForm, packagingCost: e.target.value})} /></div>
                                            <div><label className={labelClass}>BDO / Śmieci</label><input type="number" step="0.01" className={inputClass} value={newProductForm.bdoEprCost} onChange={e => setNewProductForm({...newProductForm, bdoEprCost: e.target.value})} /></div>
                                            <div><label className={labelClass}>Logistyka Out</label><input type="number" step="0.01" className={inputClass} value={newProductForm.outboundTransportCost} onChange={e => setNewProductForm({...newProductForm, outboundTransportCost: e.target.value})} /></div>
                                            <div>
                                              <label className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.3em] mb-3 block ml-2">Cena Sprzedaży Detalicznej *</label>
                                              <input required type="number" step="0.01" className="w-full px-6 py-4 bg-indigo-50 border-2 border-indigo-200 rounded-sm outline-none font-black text-indigo-700 text-lg shadow-inner focus:ring-8 focus:ring-indigo-600/5 transition-all" value={newProductForm.salePrice} onChange={e => setNewProductForm({...newProductForm, salePrice: e.target.value})} />
                                            </div>
                                          </div>
                                        </div>
                        
                                        <div className="flex space-x-4 mt-6 mb-5">
                                           {newProductForm.id && (
                                             <button type="button" onClick={async () => {
                                                 if(!window.confirm('Czy na pewno chcesz bezpowrotnie usunąć ten produkt z bazy PIM?')) return;
                                                 try {
                                                    const res = await fetch(`${API_URL}/api/products/${newProductForm.id}`, {
                                                       method: 'DELETE',
                                                       headers: { 'Authorization': `Bearer ${token}` }
                                                    });
                                                    if(!res.ok) throw new Error('Błąd usuwania API');
                                                    if (onClose) onClose();
                                                    if (fetchAppGlobalData) fetchAppGlobalData();
                                                 } catch (err) {
                                                    alert('Błąd podczas usuwania: ' + err.message);
                                                 }
                                             }} className="w-1/3 py-7 bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 font-black rounded-sm shadow-sm transition-all uppercase tracking-widest text-[11px] group flex items-center justify-center">
                                                <Trash2 className="w-5 h-5 mr-3" /> Usuń
                                             </button>
                                           )}
                                           <button type="button" onClick={handleCreateProduct} className="flex-1 py-7 bg-slate-900 hover:bg-indigo-600 text-white font-black rounded-sm shadow-[0_25px_60px_rgba(0,0,0,0.2)] hover:shadow-indigo-600/30 transition-all uppercase tracking-[0.3em] text-sm group flex items-center justify-center">
                                              <Cloud className="w-6 h-6 mr-4 group-hover:animate-bounce" /> Zapisz Kartotekę PIM
                                           </button>
                                        </div>
                                      </div>
                    
                    </div>
                </div>
            {showExportConfirm && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-rose-50 text-rose-600 shrink-0">
                            <div className="flex items-center space-x-4">
                                <ShieldAlert className="w-8 h-8" />
                                <div>
                                    <h3 className="font-black text-lg uppercase tracking-tight">Weryfikacja przed Eksportem do BaseLinker</h3>
                                    <p className="text-xs font-bold opacity-80 uppercase tracking-widest">Agent Walidator zweryfikował dane</p>
                                </div>
                            </div>
                            <div className={`px-4 py-2 rounded-md font-bold text-xs uppercase tracking-widest ${exportValidationResult?.validation?.is_valid ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                {exportValidationResult?.validation?.is_valid ? 'Zatwierdzony do Eksportu' : 'Wykryto Błędy'}
                            </div>
                        </div>
                        
                        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-slate-50">
                            {exportValidationResult && (
                                <div className="space-y-6">
                                    {exportValidationResult.validation?.errors?.length > 0 && (
                                        <div className="p-4 bg-rose-100 border border-rose-200 rounded-md">
                                            <h4 className="text-xs font-bold text-rose-800 uppercase tracking-widest mb-2">Błędy Walidacji:</h4>
                                            <ul className="list-disc pl-5 text-sm text-rose-700">
                                                {exportValidationResult.validation.errors.map((err, i) => <li key={i}>{err}</li>)}
                                            </ul>
                                        </div>
                                    )}
                                    
                                    {exportValidationResult.validation?.warnings?.length > 0 && (
                                        <div className="p-4 bg-amber-50 border border-amber-200 rounded-md">
                                            <h4 className="text-xs font-bold text-amber-800 uppercase tracking-widest mb-2">Ostrzeżenia:</h4>
                                            <ul className="list-disc pl-5 text-sm text-amber-700">
                                                {exportValidationResult.validation.warnings.map((warn, i) => <li key={i}>{warn}</li>)}
                                            </ul>
                                        </div>
                                    )}
                                    
                                    <div className="bg-white p-5 rounded-md border border-slate-200 shadow-sm">
                                        <div className="flex justify-between items-center mb-2">
                                            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Tytuł Ofertowy (Allegro)</label>
                                            <span className={`text-xs font-bold ${exportValidationResult.title?.length > 75 ? 'text-rose-500' : 'text-slate-400'}`}>
                                                {exportValidationResult.title?.length || 0} / 75 znaków
                                            </span>
                                        </div>
                                        <input 
                                            type="text" 
                                            value={exportValidationResult.title || ""}
                                            onChange={(e) => setExportValidationResult(prev => ({ ...prev, title: e.target.value }))}
                                            className={`w-full p-3 border rounded-sm font-bold outline-none ${exportValidationResult.title?.length > 75 ? 'border-rose-400 focus:border-rose-500 bg-rose-50' : 'border-slate-300 focus:border-indigo-500'}`}
                                        />
                                    </div>
                                    
                                    <div className="bg-white p-5 rounded-md border border-slate-200 shadow-sm">
                                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Podgląd Sekcji (Moduły)</h4>
                                        <div className="grid grid-cols-2 gap-4">
                                            {Object.entries(exportValidationResult.sections || {}).map(([key, html]) => (
                                                <div key={key} className="border border-slate-100 p-3 rounded-sm bg-slate-50">
                                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 pb-1 border-b border-slate-200">{key}</div>
                                                    <div className="text-[11px] text-slate-700 max-h-32 overflow-y-auto custom-scrollbar" dangerouslySetInnerHTML={{ __html: html }} />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    
                                    <div className="bg-white p-5 rounded-md border border-slate-200 shadow-sm">
                                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Parametry do wyeksportowania</h4>
                                        <div className="grid grid-cols-3 gap-3">
                                            {Object.entries(exportValidationResult.parameters || {}).map(([key, val]) => (
                                                <div key={key} className="flex justify-between items-center p-2 bg-slate-50 border border-slate-200 rounded-sm">
                                                    <span className="text-[10px] font-bold text-slate-600 truncate mr-2" title={key}>{key}</span>
                                                    <span className="text-[11px] font-black text-indigo-700 truncate" title={val}>{val}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        <div className="p-4 bg-white border-t border-slate-200 flex justify-between items-center shrink-0">
                            <p className="text-xs text-slate-500 font-bold max-w-lg">
                                Potwierdzając eksport, zgadzasz się na permanentne <strong className="text-rose-600">nadpisanie twardych danych PIM</strong> oraz wysłanie danych do systemu BaseLinker.
                            </p>
                            <div className="flex space-x-3">
                                <button 
                                    onClick={() => setShowExportConfirm(false)}
                                    disabled={isExporting}
                                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-bold text-xs uppercase tracking-widest transition-colors disabled:opacity-50"
                                >
                                    Anuluj
                                </button>
                                <button 
                                    onClick={handleConfirmExport}
                                    disabled={isExporting || (exportValidationResult && exportValidationResult.title?.length > 75)}
                                    className="px-6 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-md font-black text-xs uppercase tracking-widest transition-colors flex items-center shadow-lg disabled:opacity-50"
                                >
                                    {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                                    Zatwierdź Eksport
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {viewingImageUrl && (
                <ImageModal 
                    url={viewingImageUrl} 
                    onClose={() => setViewingImageUrl(null)} 
                />
            )}
        </div>
    );
}
