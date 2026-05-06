import React, { useState } from 'react';
import { TitleValidator } from './components/HitlReviewer/TitleValidator';
import { StrictWysiwyg } from './components/HitlReviewer/StrictWysiwyg';
import { TileSimulator } from './components/HitlReviewer/TileSimulator';
import { ImageUploadBox } from './components/SingleAuctionFetcher/ImageUploadBox';
import { PhotographicAuditorCard } from './components/VisionFeedback/PhotographicAuditorCard';
import { Rocket, ShieldAlert, Cpu, Type, X, Download, RefreshCw, Save, Send } from 'lucide-react';

const ImageModal = ({ url, onClose }) => {
    if (!url) return null;
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/90 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="relative max-w-5xl w-full h-full flex flex-col items-center justify-center" onClick={e => e.stopPropagation()}>
                <button onClick={onClose} className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white rounded-sm p-2 transition-colors">
                    <X className="w-6 h-6" />
                </button>
                <img src={url} alt="Powiększenie" className="max-w-full max-h-[80vh] object-contain shadow-2xl rounded-sm" />
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
                        className="flex items-center px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest text-xs rounded-sm shadow-lg transition-colors"
                    >
                        <Download className="w-4 h-4 mr-2" /> Pobierz na dysk
                    </button>
                </div>
            </div>
        </div>
    );
};

export const OfferOptimizerView = () => {
    // Stany dla Ofert (Usunięty Mock)
    const [titleValid, setTitleValid] = useState(false);
    const [liveTitle, setLiveTitle] = useState("");
    const [liveEan, setLiveEan] = useState("");
    
    // Sztywny content dla edytora początkowego
    const [editorHtml, setEditorHtml] = useState({
        opis1: "<h2>Czekam na analizę...</h2><p>Moduł 1 (Mocne Strony)</p>",
        opis2: "<p>Moduł 2 (Opis główny cz.1)</p>",
        opis3: "<p>Moduł 3 (Opis główny cz.2)</p>",
        opis4: "<p>Moduł 4 (Specyfikacja)</p>",
        opis5: "<p>Moduł 5 (Skład INCI)</p>"
    });
    const [editorKey, setEditorKey] = useState(0); // Klucz wymuszający twardy re-render Tiptapa przy nowych danych
    const [visionTickets, setVisionTickets] = useState([]);
    const [viewingImageUrl, setViewingImageUrl] = useState(null);
    const [isRegeneratingTitle, setIsRegeneratingTitle] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isSavingDraft, setIsSavingDraft] = useState(false);

    // Przemapowanie contentu edytora z powrotem do Symulatora Kafelkowego w czasie rzeczywistym
    const safeImages = visionTickets.map(t => {
        const url = t.replacedUrl || t.originalUrl;
        return (url && (url.startsWith('http') || url.startsWith('data:image'))) ? url : null;
    });
    const getImage = (index) => safeImages[index] || `data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22800%22%20height%3D%22600%22%20viewBox%3D%220%200%20800%20600%22%3E%3Crect%20width%3D%22800%22%20height%3D%22600%22%20fill%3D%22%23f8fafc%22%2F%3E%3Ctext%20x%3D%22400%22%20y%3D%22300%22%20font-family%3D%22Arial%22%20font-size%3D%2224%22%20font-weight%3D%22bold%22%20fill%3D%22%2394a3b8%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%3EZdj%C4%99cie%20nr%20${index+1}%3C%2Ftext%3E%3C%2Fsvg%3E`;

    const allegroSections = [
         { items: [ { type: 'TEXT', content: editorHtml.opis1 || '' }, { type: 'IMAGE', content: getImage(1) } ] },
         { items: [ { type: 'TEXT', content: editorHtml.opis2 || '' }, { type: 'IMAGE', content: getImage(2) } ] },
         { items: [ { type: 'TEXT', content: editorHtml.opis3 || '' }, { type: 'IMAGE', content: getImage(3) } ] },
         { items: [ { type: 'TEXT', content: editorHtml.opis4 || '' }, { type: 'IMAGE', content: getImage(4) } ] },
         { items: [ { type: 'TEXT', content: editorHtml.opis5 || '' }, { type: 'IMAGE', content: getImage(5) } ] }
    ];

    let nextImageIndex = 6;
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
        if(res.title) setLiveTitle(res.title);
        if(res.ean) setLiveEan(res.ean);
        if(res.htmlContent) {
            // Bezpieczne ładowanie, jeśli res.htmlContent jest stringiem to fallback (np. stary rekord), w przeciwnym razie obiekt
            if (typeof res.htmlContent === 'string') {
                 setEditorHtml({ opis1: res.htmlContent, opis2: '', opis3: '', opis4: '', opis5: '' });
            } else {
                 setEditorHtml(res.htmlContent);
            }
            setEditorKey(prev => prev + 1); // Rerenderuje Wysiwyg by wczytał nowy text
        }
        
        // Renderujemy bilety do obróbki (Gemini Vision output)
        if (res.images) {
            const mappedImages = res.images.map(img => ({
                ...img,
                sourcePreviewUrl: res.sourcePreviewUrl
            }));

            // Zapewnienie minimum 7 slotów (1 miniatura + 6 lifestyle)
            while (mappedImages.length < 7) {
                mappedImages.push({
                    originalUrl: `Wymagane nowe zdjęcie (Lifestylowe nr ${mappedImages.length})`,
                    alerts: ["Pusty slot - wygeneruj Lifestyle AI"],
                    isCompliant: false
                });
            }

            setVisionTickets(mappedImages);
        }

        if (res.isDraftRestored) {
            alert("Wczytano zapisaną kopię roboczą! Możesz kontynuować pracę.");
        }
    };

    const handleImageChange = (index, url) => {
        const up = [...visionTickets];
        up[index].originalUrl = url;
        setVisionTickets(up);
    };

    const handleRegenerateTitle = async () => {
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
        } catch (e) {
            alert("Błąd komunikacji z serwerem regeneracji.");
        }
        setIsRegeneratingTitle(false);
    };

    const compileDraftData = () => {
        return {
            title: liveTitle,
            opis1: editorHtml.opis1,
            opis2: editorHtml.opis2,
            opis3: editorHtml.opis3,
            opis4: editorHtml.opis4,
            opis5: editorHtml.opis5,
            images: safeImages.map(url => ({ url }))
        };
    };

    const handleSaveDraft = async () => {
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

    const handleExportToBaselinker = async () => {
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

    return (
        <div className="w-full h-full min-h-screen bg-slate-50 p-4 space-y-8 pb-32">
            
            {/* Nagłówek Modułu */}
            <div className="flex flex-col xl:flex-row xl:items-end justify-between bg-white p-4 rounded-sm shadow-sm border border-slate-400">
                <div>
                   <div className="bg-indigo-100 w-16 h-16 rounded-sm flex items-center justify-center mb-6 shadow-sm border border-indigo-200"><Cpu className="w-8 h-8 text-indigo-600" /></div>
                   <h1 className="text-4xl font-black text-slate-800 tracking-tighter mb-2">Command Center GEO 2026</h1>
                   <p className="text-slate-500 font-bold uppercase tracking-widest text-xs flex items-center">
                       <span className="w-2 h-2 bg-emerald-500 rounded-sm mr-2"></span> Single Auction Pivot: Aktywny &nbsp;|&nbsp; Pure API Mode
                   </p>
                </div>
            </div>

            <div className="w-full mb-8 z-10 relative">
                <ImageUploadBox onAnalysisComplete={handleAnalysisComplete} />
            </div>

            {/* Split Screen -> HitlReviewer vs TileSimulator */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
                
                {/* Panel Lewy: Hitl Reviewer + Edytor TipTap */}
                <div className="xl:col-span-7 space-y-6">
                     <div className="bg-white p-4 rounded-sm shadow-sm border border-slate-400">
                          <div className="flex items-center justify-between mb-8 border-b border-slate-300 pb-4">
                              <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-600">
                                  Weryfikacja "HitL" Rekordu (Human-In-The-Loop)
                              </h2>
                              {liveTitle && (
                                  <button 
                                      onClick={handleRegenerateTitle}
                                      disabled={isRegeneratingTitle}
                                      className="flex items-center text-[10px] uppercase font-black tracking-widest text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-sm transition-colors"
                                  >
                                      <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isRegeneratingTitle ? 'animate-spin' : ''}`} />
                                      {isRegeneratingTitle ? 'Generowanie...' : 'Odśwież Tytuł'}
                                  </button>
                              )}
                          </div>
                          
                          {/* Header Sekcji Prawego Panelu (Tytuł + EAN) */}
                          <div className="flex items-center space-x-3 mb-6 bg-indigo-50 border border-indigo-100 p-4 rounded-sm">
                              <Type className="w-6 h-6 text-indigo-500" />
                              <div className="flex-1 w-full space-y-3">
                                  <input 
                                     type="text" 
                                     value={liveTitle}
                                     onChange={(e) => setLiveTitle(e.target.value)}
                                     placeholder="Zoptymalizowany Tytuł Aukcji pojawi się tutaj..." 
                                     className="w-full bg-white border border-slate-400 text-slate-800 font-black text-xl px-4 py-2.5 rounded-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 transition-all placeholder:text-slate-300 placeholder:font-bold" 
                                  />
                                  <div className="flex items-center space-x-2">
                                      <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400 bg-indigo-100/50 px-2 py-1 rounded-sm">Kod EAN (GTIN)</span>
                                      <input 
                                         type="text" 
                                         value={liveEan}
                                         onChange={(e) => setLiveEan(e.target.value)}
                                         placeholder="EAN / GTIN" 
                                         className="flex-1 bg-white border border-slate-400 text-slate-700 font-bold text-sm px-3 py-1.5 rounded-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition-all placeholder:text-slate-300" 
                                      />
                                  </div>
                              </div>
                          </div> 
                          
                          {/* Walidator Titla 12-75 */}
                          <TitleValidator 
                               initialTitle={liveTitle} 
                               onValidate={(valid, text) => { setTitleValid(valid); setLiveTitle(text); }} 
                          />
                          
                          {/* Ostry Edytor Headless UI (Tiptap) z SanitizeOnPaste */}
                          <div className="mt-8">
                               <div className="text-xs text-slate-600 font-medium mb-8 leading-relaxed bg-slate-50 p-4 border border-slate-300 rounded-sm">
                                  Wklej bogaty kod skopiowany ze strony (ze <span className="font-bold text-rose-400">spanami</span>, <span className="font-bold text-rose-400">kolorami</span> czy <span className="font-bold text-rose-400">tabelami</span>). Kod zostanie autosanitaryzowany w Ułamku Sekundy do restrykcyjnych 7 tagów GEO.
                               </div>
                               
                               {[
                                   { key: 'opis1', label: 'Moduł 1: Mocne Strony' },
                                   { key: 'opis2', label: 'Moduł 2: Główny Opis (Cz. 1)' },
                                   { key: 'opis3', label: 'Moduł 3: Główny Opis (Cz. 2)' },
                                   { key: 'opis4', label: 'Moduł 4: Specyfikacja' },
                                   { key: 'opis5', label: 'Moduł 5: Skład (INCI)' }
                               ].map((sec) => (
                                   <div className="mb-6" key={`${editorKey}-${sec.key}`}>
                                       <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 block">
                                           {sec.label} (Węzeł TEXT)
                                       </label>
                                       <StrictWysiwyg 
                                           initialContent={editorHtml[sec.key] || ""} 
                                           onChange={html => setEditorHtml(prev => ({ ...prev, [sec.key]: html }))} 
                                       />
                                   </div>
                               ))}
                          </div>
                     </div>
                     
                     {/* BAZA ZDJĘĆ - NOWY MODUŁ VISION */}
                     {visionTickets.length > 0 && (
                         <div className="bg-white p-4 rounded-sm shadow-sm border border-slate-400">
                              <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-600 mb-6 border-b border-slate-300 pb-4 flex items-center justify-between">
                                  Audyt Multimodalny (Vision AI)
                                  <span className="bg-indigo-50 text-indigo-500 px-3 py-1 rounded-sm border border-indigo-100 flex items-center">
                                      {visionTickets.filter(v => v.isCompliant || v.replacedUrl).length} / {visionTickets.length} Poprawne
                                  </span>
                              </h2>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                  {visionTickets.map((ticket, i) => (
                                      <PhotographicAuditorCard 
                                          key={i} 
                                          index={i} 
                                          ean={liveEan}
                                          imageObj={ticket} 
                                          primaryImageObj={visionTickets[0]}
                                          onImageReplace={(newUrl) => {
                                              const updated = [...visionTickets];
                                              updated[i].replacedUrl = newUrl;
                                              setVisionTickets(updated);
                                          }} 
                                          onImageDelete={() => {
                                              const updated = [...visionTickets];
                                              updated[i] = {
                                                  originalUrl: `Wymagane nowe zdjęcie (Lifestylowe nr ${i + 1})`,
                                                  alerts: ["Pusty slot - wygeneruj Lifestyle AI lub wgraj własne"],
                                                  isCompliant: false,
                                                  replacedUrl: null
                                              };
                                              setVisionTickets(updated);
                                          }}
                                          onView={(url) => setViewingImageUrl(url)}
                                      />
                                  ))}
                              </div>
                              <button 
                                  onClick={() => {
                                      setVisionTickets([...visionTickets, { originalUrl: '', isCompliant: false, alerts: ["Pusty slot - upuść tu nowe zdjęcie"] }]);
                                  }}
                                  className="mt-6 w-full py-4 border-2 border-dashed border-slate-300 rounded-sm flex items-center justify-center text-slate-500 font-bold hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all uppercase tracking-widest text-xs"
                              >
                                  + Dodaj Nowy Slot Zdjęcia
                              </button>
                         </div>
                     )}
                </div>

                {/* Panel Prawy: Tile Simulator */}
                <div className="xl:col-span-5">
                     <TileSimulator customSections={allegroSections} />
                </div>
            </div>

            {/* Panel Akcji (Draft i Eksport) umieszczony na dole jako "Sticky" pasek lub zwykły kontener */}
            {visionTickets.length > 0 && (
                <div className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-md border-t border-slate-400 p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.02)] flex justify-end space-x-4 px-8 z-50">
                    <button 
                        onClick={handleSaveDraft}
                        disabled={isSavingDraft}
                        className="flex items-center px-6 py-3 bg-white border border-slate-400 hover:bg-slate-50 text-slate-700 font-bold uppercase tracking-wider text-xs rounded-sm transition-all shadow-sm"
                    >
                        <Save className={`w-4 h-4 mr-2 ${isSavingDraft ? 'animate-pulse text-indigo-500' : 'text-slate-600'}`} />
                        {isSavingDraft ? "Zapisywanie..." : "Zapisz Kopię Roboczą"}
                    </button>
                    
                    <button 
                        onClick={handleExportToBaselinker}
                        disabled={isExporting}
                        className="flex items-center px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest text-xs rounded-sm shadow-lg shadow-indigo-600/20 transition-all hover:-translate-y-0.5"
                    >
                        {isExporting ? (
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                            <Send className="w-4 h-4 mr-2" />
                        )}
                        {isExporting ? "Eksport w toku..." : "Eksportuj do BaseLinker"}
                    </button>
                </div>
            )}

            {/* Modal Powiększenia Zdjęcia */}
            <ImageModal url={viewingImageUrl} onClose={() => setViewingImageUrl(null)} />
        </div>
    );
};
