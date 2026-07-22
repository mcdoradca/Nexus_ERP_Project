import React, { useState, useRef } from 'react';
import { Camera, AlertTriangle, UploadCloud, CheckCircle2, Maximize2, Trash2, RefreshCw, Sparkles } from 'lucide-react';

export const PhotographicAuditorCard = ({ imageObj, index, ean, primaryImageObj, onImageReplace, onImageDelete, onView }) => {
    const fileInputRef = useRef(null);
    // imageObj { originalUrl: string, alerts: string[], isCompliant: boolean, replacedUrl: string|null }
    
    const token = localStorage.getItem('token') || localStorage.getItem('aps_token') || '';

    // Status lokalny Dropzone'a
    const [isDragging, setIsDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [isGeneratingAi, setIsGeneratingAi] = useState(false);
    const [trendReport, setTrendReport] = useState(null);
    
    const [imgError, setImgError] = useState(false);
    const [useDirectUrl, setUseDirectUrl] = useState(false);

    const isFixed = !!imageObj.replacedUrl;
    
    // Ustalanie czy to błąd brakujących slotów (gdzie AI zwraca customowy tekst zaczynający się od Audyt lub Analiza)
    const isMissingPhotosAlert = imageObj.originalUrl && (
        imageObj.originalUrl.includes('Audyt') || 
        imageObj.originalUrl.includes('Analiza') ||
        imageObj.originalUrl.includes('Wymagane nowe zdjęcie')
    );

    const handleGenerateLifestyle = async () => {
        if (!ean) {
            alert("Brak kodu EAN niezbędnego do pobrania miniatury i wygenerowania lifestylu.");
            return;
        }
        setIsGeneratingAi(true);
        try {
            const token = localStorage.getItem('aps_token') || localStorage.getItem('token') || '';
            const API_URL = import.meta.env.PROD ? '' : `http://${window.location.hostname}:3001`;
            
            const bodyData = { ean, imageIndex: index };
            if (primaryImageObj) {
                if (primaryImageObj.replacedUrl) {
                    bodyData.imageBase64 = primaryImageObj.replacedUrl;
                } else if (primaryImageObj.originalUrl && primaryImageObj.originalUrl.startsWith('http')) {
                    bodyData.sourceImageUrl = primaryImageObj.originalUrl;
                }
            }
            
            const res = await fetch(`${API_URL}/api/offer-optimizer/generate-lifestyle`, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json' 
                },
                body: JSON.stringify(bodyData)
            });
            
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP error! status: ${res.status}`);
            }
            
            const initData = await res.json();
            
            if (initData && initData.jobId) {
                const jobId = initData.jobId;
                let attempts = 0;
                const maxAttempts = 60; // Max 60 prób x 3s = 180s
                
                while (attempts < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    attempts++;
                    
                    try {
                        const statusRes = await fetch(`${API_URL}/api/offer-optimizer/generate-lifestyle/status/${jobId}`, {
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        
                        if (!statusRes.ok) continue;
                        
                        const statusData = await statusRes.json();
                        
                        if (statusData.status === 'COMPLETED') {
                            if (statusData.newImageBase64) {
                                if (onImageReplace) onImageReplace(statusData.newImageBase64);
                                if (statusData.visualTrendReport) {
                                    setTrendReport(statusData.visualTrendReport);
                                }
                            }
                            return;
                        }
                        
                        if (statusData.status === 'ERROR') {
                            throw new Error(statusData.error || "Wystąpił błąd podczas przetwarzania obrazu przez AI.");
                        }
                    } catch (pollErr) {
                        if (pollErr.message && !pollErr.message.includes('fetch')) {
                            throw pollErr;
                        }
                    }
                }
                throw new Error("Przekroczono czas oczekiwania na odpowiedź serwera Claid AI (180s). Próba przerwana.");
            } else if (initData && initData.newImageBase64) {
                if (onImageReplace) onImageReplace(initData.newImageBase64);
                if (initData.visualTrendReport) {
                    setTrendReport(initData.visualTrendReport);
                }
            }
        } catch (error) {
            console.error("Błąd Lifestyle AI:", error);
            alert("Błąd podczas generowania zdjęcia AI: " + error.message);
        } finally {
            setIsGeneratingAi(false);
        }
    };

    const handleFileSelect = (file) => {
        if (!file || !file.type.startsWith('image/')) return;
        setUploading(true);
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                // Zachowujemy ORYGINALNE wymiary dla lupy na Allegro i Amazonie
                const canvas = document.createElement('canvas');
                const width = img.width;
                const height = img.height;
                
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                // Dynamiczny algorytm odchudzający wagę pliku zachowując pełne wymiary
                let quality = 0.95;
                let base64Data = canvas.toDataURL('image/jpeg', quality);
                const MAX_BASE64_LENGTH = 1.9 * 1024 * 1024; // 1.9 MB jako bezpieczny limit tekstu Base64
                
                while (base64Data.length > MAX_BASE64_LENGTH && quality > 0.4) {
                    quality -= 0.1;
                    base64Data = canvas.toDataURL('image/jpeg', quality);
                }
                
                setTimeout(() => {
                    setUploading(false);
                    if(onImageReplace) onImageReplace(base64Data);
                }, 400);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        handleFileSelect(e.dataTransfer.files[0]);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    // Reset error state if URL changes
    React.useEffect(() => {
        setImgError(false);
        setUseDirectUrl(false);
    }, [imageObj.originalUrl]);

    return (
        <div className={`flex flex-col bg-slate-50 border rounded-sm overflow-hidden shadow-sm transition-all relative ${isFixed ? 'border-emerald-300' : 'border-slate-400'}`}>
            
            {/* Nagłówek Biletu */}
            <div className={`px-4 py-2 border-b text-[10px] uppercase font-black tracking-widest flex items-center justify-between ${isFixed ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : (imageObj.isCompliant ? 'bg-slate-100 text-slate-500 border-slate-400' : 'bg-rose-50 text-rose-600 border-rose-200')}`}>
                <span className="flex items-center">
                    <Camera className="w-3 h-3 mr-2" />
                    Slot Zdjęcia #{index + 1}
                </span>
                {isFixed ? (
                    <span className="flex items-center font-bold text-indigo-600">
                        <Sparkles className="w-3 h-3 mr-1 text-indigo-500" /> AI Generated (EU AI Act Art. 50)
                    </span>
                ) : (imageObj.isCompliant ? <span>GEO Compliant</span> : <span>Wymaga Interwencji</span>)}
            </div>

            {/* Obszar Główny - Zdjęcie / Dropzone / Tekst */}
            <div 
                className="relative group w-full h-48 bg-slate-200 overflow-hidden flex flex-col items-center justify-center p-4"
                onDrop={handleDrop} 
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
            >
                 <input 
                     type="file" 
                     ref={fileInputRef}
                     className="hidden" 
                     onChange={(e) => handleFileSelect(e.target.files[0])} 
                     accept="image/*"
                 />
                 
                 {!isFixed ? (
                     <div className="relative w-full h-full flex flex-col items-center justify-center z-0">
                         {/* Pełna widoczność istniejącego zdjęcia */}
                         {!isMissingPhotosAlert && imageObj.originalUrl && !imgError && (
                             <img 
                                 src={useDirectUrl || !imageObj.originalUrl.startsWith('http') ? imageObj.originalUrl : `${import.meta.env.PROD ? '' : `http://${window.location.hostname}:3001`}/api/offer-optimizer/proxy-image?url=${encodeURIComponent(imageObj.originalUrl)}&token=${token}`} 
                                 alt="Obecne" 
                                 className="absolute inset-0 w-full h-full object-contain opacity-100" 
                                 onError={(e) => {
                                     if (!useDirectUrl && imageObj.originalUrl.startsWith('http')) {
                                         setUseDirectUrl(true);
                                     } else {
                                         setImgError(true);
                                     }
                                 }}
                             />
                         )}
                         {/* Komunikat błędu zewnętrznego (CORS / 404 z BaseLinkera) */}
                         {!isMissingPhotosAlert && imgError && (
                             <div className="flex flex-col items-center text-center opacity-50 p-4">
                                 <AlertTriangle className="w-8 h-8 mb-2" />
                                 <span className="text-[10px] font-bold uppercase tracking-widest leading-relaxed">
                                     Plik wygasł lub<br/>zablokowany przez zewnętrzny serwer.
                                 </span>
                             </div>
                         )}
                         <div className="relative z-10 flex flex-col items-center text-center p-4">
                             {isMissingPhotosAlert && (
                                 <>
                                     <span className="text-[10px] font-bold text-slate-500 leading-relaxed max-w-[90%] mb-4">
                                         {imageObj.originalUrl || "Wymagane nowe zdjęcie"}
                                     </span>
                                     {index !== 0 && (
                                         <>
                                             <button 
                                                 onClick={handleGenerateLifestyle}
                                                 disabled={isGeneratingAi}
                                                 className="flex items-center bg-indigo-600 text-white font-bold px-4 py-3 rounded-sm text-xs hover:bg-indigo-500 shadow-lg shadow-indigo-600/30 transition-all uppercase tracking-widest mb-3"
                                             >
                                                 {isGeneratingAi ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                                                 {isGeneratingAi ? "Generowanie AI..." : "✨ Wygeneruj Lifestyle AI"}
                                             </button>
                                             <div className="flex items-center space-x-2 text-[10px] text-slate-600 font-bold uppercase tracking-widest mb-3">
                                                 <div className="h-px bg-slate-300 w-8"></div>
                                                 <span>ALBO</span>
                                                 <div className="h-px bg-slate-300 w-8"></div>
                                             </div>
                                         </>
                                     )}
                                     <button 
                                         onClick={() => fileInputRef.current && fileInputRef.current.click()}
                                         className="flex items-center text-slate-500 hover:text-indigo-600 text-xs font-bold uppercase tracking-widest transition-colors bg-white/60 px-4 py-2 rounded-sm"
                                     >
                                         <UploadCloud className="w-4 h-4 mr-2" />
                                         Dodaj własne zdjęcie
                                     </button>
                                 </>
                             )}
                         </div>
                     </div>
                 ) : (
                     <img src={imageObj.replacedUrl} alt="Poprawione zdjęcie" className="w-full h-full absolute inset-0 object-contain bg-slate-100 transition-transform group-hover:scale-105 z-0" />
                 )}
                 
                 {/* Nakładka Dropzone Aktywna na Hover lub Drug (Zawsze aktywna w kodzie by łapać styl po dragu na rodzicu) */}
                 <div 
                     className={`absolute inset-0 z-10 transition-all flex flex-col items-center justify-center backdrop-blur-sm pointer-events-none
                         ${isDragging ? 'bg-indigo-500/40 opacity-100 ring-4 ring-inset ring-indigo-400' : 'opacity-0'}
                         ${uploading ? 'opacity-100 bg-slate-900/80 !flex' : ''}
                     `}
                 >
                         {uploading ? (
                             <div className="text-white text-[10px] font-black uppercase tracking-widest text-center animate-pulse">Optymalizacja RGB...</div>
                         ) : (
                             <>
                                 {isFixed ? <CheckCircle2 className="w-8 h-8 text-emerald-400 mb-2 shadow-sm" /> : <UploadCloud className="w-8 h-8 text-white mb-2" />}
                                 <span className="text-white text-[10px] font-black uppercase tracking-widest text-center px-4 leading-relaxed">
                                     {isDragging ? "Upuść perfekcyjny plik" : "Upuść przefiltrowany plik (Tło #FFF) by podmienić"}
                                 </span>
                             </>
                         )}
                 </div>
            </div>
            
            {/* Przeniesione Alerty (by nie zasłaniały zdjęcia) */}
            {!imageObj.isCompliant && !isFixed && imageObj.alerts && imageObj.alerts.length > 0 && (
                 <div className="bg-rose-50 border-t border-rose-200 p-3 shadow-inner">
                     <div className="flex items-start">
                         <AlertTriangle className="w-4 h-4 mr-2 shrink-0 mt-0.5 text-rose-500" />
                         <div className="flex flex-col space-y-1">
                            {imageObj.alerts.map((alert, idx) => (
                                <span key={idx} className="text-[10px] font-bold leading-tight text-rose-700">{alert}</span>
                            ))}
                         </div>
                     </div>
                 </div>
            )}

            {/* Nowy Toolbar (Zawsze widoczny na dole) */}
            <div className="flex bg-slate-100 border-t border-slate-400 divide-x divide-slate-200">
                <button 
                    onClick={() => onView && onView(isFixed ? imageObj.replacedUrl : imageObj.originalUrl)}
                    className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-200 hover:text-indigo-600 transition-colors flex justify-center items-center"
                >
                    <Maximize2 className="w-3.5 h-3.5 mr-1" />
                    Powiększ
                </button>
                {index !== 0 && (
                    <button 
                        onClick={handleGenerateLifestyle}
                        disabled={isGeneratingAi}
                        className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-200 hover:text-indigo-600 transition-colors flex justify-center items-center"
                    >
                        {isGeneratingAi ? <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
                        Generuj AI
                    </button>
                )}
                <button 
                    onClick={() => fileInputRef.current && fileInputRef.current.click()}
                    className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-200 hover:text-emerald-600 transition-colors flex justify-center items-center"
                >
                    <UploadCloud className="w-3.5 h-3.5 mr-1" />
                    Zmień
                </button>
                <button 
                    onClick={() => onImageDelete && onImageDelete()}
                    className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest text-rose-400 hover:bg-rose-100 hover:text-rose-600 transition-colors flex justify-center items-center"
                >
                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                    Usuń
                </button>
            </div>
            
            {/* Raport z analizy wizualnej (Visual Trend Report) */}
            {trendReport && (
                <div className="bg-indigo-50 border-t border-indigo-100 p-3">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-indigo-500 mb-1 flex items-center">
                        <Sparkles className="w-3 h-3 mr-1" />
                        Raport Trendów (Visual Agent)
                    </h4>
                    <p className="text-xs text-indigo-900 leading-relaxed italic">
                        "{trendReport}"
                    </p>
                </div>
            )}
            
            {/* Ukryty Input Pliku */}
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*" 
                onChange={(e) => handleFileSelect(e.target.files[0])}
            />

        </div>
    );
};
