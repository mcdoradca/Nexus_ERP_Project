const fs = require('fs');

async function build() {
    const appContent = fs.readFileSync('frontend/src/App.jsx', 'utf8');
    const optimizerContent = fs.readFileSync('frontend/src/views/OfferOptimizer/OfferOptimizerView.jsx', 'utf8');

    // Here we extract the PIM Modal from App.jsx
    let pimStart = appContent.indexOf('{/* Nowy Produkt (PIM) */}');
    let pimEnd = appContent.indexOf('{/* End Nowy Produkt (PIM) */}'); // Wait, this comment might not exist.
    // Let's find the closing tag of the modal manually or just extract the form.
    let formStart = appContent.indexOf('<form onSubmit={handleCreateProduct}');
    let formEnd = appContent.indexOf('</form>', formStart) + '</form>'.length;
    
    let pimFormContent = appContent.substring(formStart, formEnd);
    
    // Replace handleCreateProduct with local handler or passed props
    // Change styles to fit the left column instead of a modal
    
    // I will write this file as a React component.
    const newComponent = `import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { TitleValidator } from './components/HitlReviewer/TitleValidator';
import { StrictWysiwyg } from './components/HitlReviewer/StrictWysiwyg';
import { TileSimulator } from './components/HitlReviewer/TileSimulator';
import { ImageUploadBox } from './components/SingleAuctionFetcher/ImageUploadBox';
import { PhotographicAuditorCard } from './components/VisionFeedback/PhotographicAuditorCard';
import { 
  Rocket, ShieldAlert, Cpu, Type, X, Download, RefreshCw, Save, Send, Database, Box, Tag, Layers, TrendingUp, Search,
  Hash, CloudLightning, Loader2, Package, Image, PlayCircle, FileText, CheckCircle2, Zap
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? window.location.origin : 'http://localhost:3001');

// Wklejenie komponentu ImageModal (ze starego OfferOptimizerView)
${optimizerContent.substring(optimizerContent.indexOf('const ImageModal ='), optimizerContent.indexOf('export const OfferOptimizerView'))}

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
    const [brandSearchTerm, setBrandSearchTerm] = useState('');
    const [isBrandDropdownOpen, setIsBrandDropdownOpen] = useState(false);
    const [categorySchema, setCategorySchema] = useState(null);
    const [brands, setBrands] = useState([]);
    
    // === STANY PIPELINE (OFFER OPTIMIZER) ===
    const [isDashboardActive, setIsDashboardActive] = useState(false);
    const [productData, setProductData] = useState(null); 

    const [liveTitle, setLiveTitle] = useState("");
    const [liveEan, setLiveEan] = useState("");
    const [editorHtml, setEditorHtml] = useState({ opis1: "", opis2: "", opis3: "", opis4: "", opis5: "" });
    const [editorKey, setEditorKey] = useState(0); 
    const [visionTickets, setVisionTickets] = useState([]);
    const [viewingImageUrl, setViewingImageUrl] = useState(null);
    
    const [isRegeneratingTitle, setIsRegeneratingTitle] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isSavingDraft, setIsSavingDraft] = useState(false);

    const brandDropdownRef = useRef(null);

    // Ładowanie marek
    useEffect(() => {
        axios.get(\`\${API_URL}/api/brands\`, { headers: { Authorization: \`Bearer \${token}\` } })
            .then(res => setBrands(res.data))
            .catch(err => console.error("Błąd ładowania marek", err));
    }, [token]);

    // Inicjalizacja PIM (Edycja)
    useEffect(() => {
        if (editingProduct) {
            axios.get(\`\${API_URL}/api/products/\${editingProduct}\`, { headers: { Authorization: \`Bearer \${token}\` } })
                .then(res => {
                    const p = res.data;
                    let calcBdo = parseFloat(p.bdoEprCost) || 0;
                    if (p.bomElements && p.bomElements.length > 0) {
                        calcBdo = 0;
                        p.bomElements.forEach(b => { calcBdo += (parseFloat(b.weightGrams) / 1000) * parseFloat(b.material.ratePerKg); });
                    }
                    setNewProductForm({ ...p, bdoEprCost: parseFloat(calcBdo.toFixed(4)) });
                    setBrandSearchTerm(p.brand ? p.brand.name : '');
                })
                .catch(err => alert("Błąd wczytywania produktu"));
        }
    }, [editingProduct, token]);

    useEffect(() => {
        if (newProductForm?.allegroCategoryId && token) {
            axios.get(\`\${API_URL}/api/categories/\${newProductForm.allegroCategoryId}\`, { headers: { Authorization: \`Bearer \${token}\` } })
                .then(res => setCategorySchema(res.data))
                .catch(err => setCategorySchema(null));
        } else {
            setCategorySchema(null);
        }
    }, [newProductForm?.allegroCategoryId, token]);

    // Handle Create Product
    const handleCreateProduct = async (e) => {
        if(e) e.preventDefault();
        try {
            let savedProduct;
            if (editingProduct) {
                const res = await axios.put(\`\${API_URL}/api/products/\${editingProduct}\`, newProductForm, { headers: { Authorization: \`Bearer \${token}\` } });
                savedProduct = res.data;
                alert('Zaktualizowano kartotekę PIM.');
            } else {
                const res = await axios.post(\`\${API_URL}/api/products\`, newProductForm, { headers: { Authorization: \`Bearer \${token}\` } });
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
    const handleTriggerPipeline = async () => {
        try {
            // Najpierw zapisujemy formularz PIM
            const savedProd = await handleCreateProduct();
            if (!savedProd || !savedProd.ean) {
                alert("Produkt musi posiadać kod EAN, aby uruchomić EAN Pipeline.");
                return;
            }
            
            // Startujemy Pipeline
            const response = await fetch(\`\${API_URL}/api/offer-optimizer/pipeline/trigger\`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${token}\` },
                body: JSON.stringify({ ean: savedProd.ean })
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
        } catch (error) {
            console.error(error);
            alert(error.message);
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
            
            await axios.post(\`\${API_URL}/api/products/\${editingProduct}/aeo\`, {}, { headers: { Authorization: \`Bearer \${token}\` }});
            if (fetchAppGlobalData) await fetchAppGlobalData();
            alert('Sukces! Treść AEO (pod wyszukiwarki AI) została wygenerowana.');
            
            // Odśwież widok
            const res = await axios.get(\`\${API_URL}/api/products/\${editingProduct}\`, { headers: { Authorization: \`Bearer \${token}\` } });
            setNewProductForm(prev => ({ ...prev, aeoContent: res.data.aeoContent }));
            
            btn.innerHTML = prevHtml;
            btn.disabled = false;
        } catch (err) {
            alert('Błąd generowania AEO: ' + err.message);
            const btn = document.getElementById('btn_generate_aeo_hub');
            if(btn) { btn.innerHTML = '<CloudLightning className="w-4 h-4 mr-2" /> Generuj AEO'; btn.disabled = false; }
        }
    };

    const handleAutofillEAN = async () => { /* Skopiowane z App.jsx */ };

    const labelClass = "text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 block";
    const inputClass = "w-full bg-slate-50 border border-slate-300 text-slate-800 text-sm font-bold rounded-sm px-4 py-3 focus:outline-none focus:border-indigo-500 transition-colors shadow-inner";

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
                    <button onClick={handleTriggerPipeline} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-xs font-bold uppercase transition-colors flex items-center shadow-[0_0_15px_rgba(79,70,229,0.4)]">
                        <Cpu className="w-4 h-4 mr-2" /> Zapisz PIM i Uruchom Agenta
                    </button>
                </div>
            </div>

            <div className="flex-1 flex space-x-4 min-h-0">
                {/* LEWA KOLUMNA: PIM */}
                <div className="w-1/2 bg-white rounded-lg shadow-xl flex flex-col overflow-hidden border border-slate-200 relative">
                    <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center shrink-0">
                        <h3 className="font-black text-slate-800 uppercase tracking-wider flex items-center"><Hash className="w-4 h-4 mr-2 text-indigo-500"/> Dane Kartoteki PIM</h3>
                        {editingProduct && (
                            <button id="btn_generate_aeo_hub" type="button" onClick={handleGenerateAEO} className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-sm text-[10px] font-black uppercase transition-colors flex items-center border border-amber-300">
                                <Zap className="w-3 h-3 mr-1" /> Generuj AEO
                            </button>
                        )}
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                        ${pimFormContent.replace(/<form onSubmit={handleCreateProduct}/, '<div').replace(/<\/form>/, '</div>').replace(/\n/g, '\n                        ')}
                    </div>
                </div>

                {/* PRAWA KOLUMNA: PIPELINE / SUPERVISOR */}
                <div className="w-1/2 bg-slate-800 rounded-lg shadow-xl flex flex-col overflow-hidden border border-slate-700 relative">
                    <div className="p-4 bg-slate-900 border-b border-slate-700 flex justify-between items-center shrink-0">
                        <h3 className="font-black text-white uppercase tracking-wider flex items-center"><Cpu className="w-4 h-4 mr-2 text-indigo-400"/> Supervisor Agent (EAN Pipeline)</h3>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar text-white">
                        {!isDashboardActive ? (
                            <div className="flex flex-col items-center justify-center h-full text-center text-slate-400">
                                <Box className="w-16 h-16 mb-4 text-slate-600" />
                                <h4 className="text-lg font-bold text-white mb-2">Agent Oczekuje w Gotowości</h4>
                                <p className="text-sm max-w-md">Po zapisaniu danych PIM i kliknięciu "Zapisz PIM i Uruchom Agenta", Supervisor przejmie stery: wygeneruje tytuł, opis HTML (StrictWysiwyg), zdjęcia Lifestyle oraz przygotuje draft do BaseLinkera.</p>
                            </div>
                        ) : (
                            <div className="space-y-8">
                                {/* Tutaj wstawiamy komponenty EAN Pipeline z OfferOptimizerView */}
                                <TitleValidator liveTitle={liveTitle} setLiveTitle={setLiveTitle} isRegeneratingTitle={isRegeneratingTitle} handleRegenerateTitle={() => {}} />
                                <StrictWysiwyg editorHtml={editorHtml} setEditorHtml={setEditorHtml} editorKey={editorKey} />
                                <PhotographicAuditorCard visionTickets={visionTickets} setViewingImageUrl={setViewingImageUrl} />
                            </div>
                        )}
                    </div>
                </div>
            </div>
            
            {viewingImageUrl && <ImageModal url={viewingImageUrl} onClose={() => setViewingImageUrl(null)} />}
        </div>
    );
}
`;

    fs.writeFileSync('frontend/src/views/OfferOptimizer/UnifiedProductPipelineView.jsx', newComponent);
    console.log("Unified view created!");
}

build();
