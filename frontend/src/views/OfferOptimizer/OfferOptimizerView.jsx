import React, { useState } from 'react';
import { TitleValidator } from './components/HitlReviewer/TitleValidator';
import { StrictWysiwyg } from './components/HitlReviewer/StrictWysiwyg';
import { TileSimulator } from './components/HitlReviewer/TileSimulator';
import { ImageUploadBox } from './components/SingleAuctionFetcher/ImageUploadBox';
import { PhotographicAuditorCard } from './components/VisionFeedback/PhotographicAuditorCard';
import { Rocket, ShieldAlert, Cpu, Type } from 'lucide-react';

export const OfferOptimizerView = () => {
    // Stany dla Ofert (Usunięty Mock)
    const [titleValid, setTitleValid] = useState(false);
    const [liveTitle, setLiveTitle] = useState("");
    const [liveEan, setLiveEan] = useState("");
    
    // Sztywny content dla edytora początkowego
    const [editorHtml, setEditorHtml] = useState(`<h2>Czekam na analizę...</h2><p>Pobierz z API Allegro aukcję używając formularza wyżej.</p>`);
    const [editorKey, setEditorKey] = useState(0); // Klucz wymuszający twardy re-render Tiptapa przy nowych danych
    const [visionTickets, setVisionTickets] = useState([]);

    // Przemapowanie contentu edytora z powrotem do Symulatora Kafelkowego w czasie rzeczywistym
    const dynamicSections = [];
    if (editorHtml) dynamicSections.push({ type: "TEXT", content: editorHtml });
    if (visionTickets.length > 0) {
        dynamicSections.push({ type: "IMAGE", content: visionTickets[0].replacedUrl || visionTickets[0].originalUrl });
    }

    const handleAnalysisComplete = (res) => {
        if(res.title) setLiveTitle(res.title);
        if(res.ean) setLiveEan(res.ean);
        if(res.htmlContent) {
            setEditorHtml(res.htmlContent);
            setEditorKey(prev => prev + 1); // Rerenderuje Wysiwyg by wczytał nowy text
        }
        
        // Renderujemy bilety do obróbki (Gemini Vision output)
        if (res.images) {
            const mappedImages = res.images.map(img => ({
                ...img,
                sourcePreviewUrl: res.sourcePreviewUrl
            }));
            setVisionTickets(mappedImages);
        }
    };

    return (
        <div className="w-full h-full min-h-screen bg-slate-50 p-8 space-y-8 pb-32">
            
            {/* Nagłówek Modułu */}
            <div className="flex flex-col xl:flex-row xl:items-end justify-between bg-white p-8 rounded-[2rem] shadow-sm border border-slate-200">
                <div>
                   <div className="bg-indigo-100 w-16 h-16 rounded-[1.5rem] flex items-center justify-center mb-6 shadow-sm border border-indigo-200"><Cpu className="w-8 h-8 text-indigo-600" /></div>
                   <h1 className="text-4xl font-black text-slate-800 tracking-tighter mb-2">Command Center GEO 2026</h1>
                   <p className="text-slate-500 font-bold uppercase tracking-widest text-xs flex items-center">
                       <span className="w-2 h-2 bg-emerald-500 rounded-full mr-2"></span> Single Auction Pivot: Aktywny &nbsp;|&nbsp; Pure API Mode
                   </p>
                </div>
                <div className="mt-8 xl:mt-0 flex space-x-4">
                     <button disabled={!titleValid} className="px-8 py-4 bg-slate-900 text-white rounded-xl font-black uppercase tracking-widest text-xs disabled:opacity-50 disabled:cursor-not-allowed hover:bg-indigo-600 transition-colors shadow-lg shadow-indigo-900/20 flex items-center">
                         <Rocket className="w-4 h-4 mr-2"/> {titleValid ? 'Zapisz i Wyślij payload (BL)' : 'Zablokowano - Błąd Walidacji'}
                     </button>
                </div>
            </div>

            <div className="w-full mb-8 z-10 relative">
                <ImageUploadBox onAnalysisComplete={handleAnalysisComplete} />
            </div>

            {/* Split Screen -> HitlReviewer vs TileSimulator */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
                
                {/* Panel Lewy: Hitl Reviewer + Edytor TipTap */}
                <div className="xl:col-span-7 space-y-6">
                     <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-200">
                          <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 mb-8 border-b border-slate-100 pb-4 flex items-center justify-between">
                              Weryfikacja "HitL" Rekordu (Human-In-The-Loop)
                              <span className="bg-rose-50 text-rose-500 px-3 py-1 rounded-sm border border-rose-100 flex items-center">
                                  <ShieldAlert className="w-3 h-3 mr-1"/> Tryb Surowy (Restrykcyjny)
                              </span>
                          </h2>
                          
                          {/* Header Sekcji Prawego Panelu (Tytuł + EAN) */}
                          <div className="flex items-center space-x-3 mb-6 bg-indigo-50 border border-indigo-100 p-4 rounded-[1.5rem]">
                              <Type className="w-6 h-6 text-indigo-500" />
                              <div className="flex-1 w-full space-y-3">
                                  <input 
                                     type="text" 
                                     value={liveTitle}
                                     onChange={(e) => setLiveTitle(e.target.value)}
                                     placeholder="Zoptymalizowany Tytuł Aukcji pojawi się tutaj..." 
                                     className="w-full bg-white border border-slate-200 text-slate-800 font-black text-xl px-4 py-2.5 rounded-xl outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 transition-all placeholder:text-slate-300 placeholder:font-bold" 
                                  />
                                  <div className="flex items-center space-x-2">
                                      <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400 bg-indigo-100/50 px-2 py-1 rounded-md">Kod EAN (GTIN)</span>
                                      <input 
                                         type="text" 
                                         value={liveEan}
                                         onChange={(e) => setLiveEan(e.target.value)}
                                         placeholder="EAN / GTIN" 
                                         className="flex-1 bg-white border border-slate-200 text-slate-700 font-bold text-sm px-3 py-1.5 rounded-lg outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition-all placeholder:text-slate-300" 
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
                               <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 block">
                                   Węzeł Opisu (Typ: TEXT)
                               </label>
                               <div className="mt-2 text-xs text-slate-400 font-medium mb-4 leading-relaxed bg-slate-50 p-4 border border-slate-100 rounded-lg">
                                  Sprobuj wkleić tu bogaty kod skopiowany ze strony (ze <span className="font-bold text-rose-400">spanami</span>, <span className="font-bold text-rose-400">kolorami</span> czy <span className="font-bold text-rose-400">tabelami</span>). Kod zostanie autosanitaryzowany w Ułamku Sekundy do restrykcyjnych 7 tagów GEO i natychmiast wrzucony na symulator Mobile UI po prawej.
                               </div>
                               <StrictWysiwyg 
                                   key={editorKey}
                                   initialContent={editorHtml} 
                                   onChange={html => setEditorHtml(html)} 
                               />
                          </div>
                     </div>
                     
                     {/* BAZA ZDJĘĆ - NOWY MODUŁ VISION */}
                     {visionTickets.length > 0 && (
                         <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-200">
                              <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 mb-6 border-b border-slate-100 pb-4 flex items-center justify-between">
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
                                          imageObj={ticket} 
                                          onImageReplace={(newUrl) => {
                                              const updated = [...visionTickets];
                                              updated[i].replacedUrl = newUrl;
                                              setVisionTickets(updated);
                                          }} 
                                      />
                                  ))}
                              </div>
                         </div>
                     )}
                </div>

                {/* Panel Prawy: Tile Simulator */}
                <div className="xl:col-span-5">
                     <TileSimulator customSections={dynamicSections} />
                </div>
            </div>

        </div>
    );
};
