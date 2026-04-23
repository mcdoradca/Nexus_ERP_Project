import React, { useState, useRef } from 'react';
import { Camera, AlertTriangle, UploadCloud, CheckCircle2, Maximize2, Trash2, RefreshCw } from 'lucide-react';

export const PhotographicAuditorCard = ({ imageObj, index, onImageReplace, onImageDelete, onView }) => {
    const fileInputRef = useRef(null);
    // imageObj { originalUrl: string, alerts: string[], isCompliant: boolean, replacedUrl: string|null }
    
    // Status lokalny Dropzone'a
    const [isDragging, setIsDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    
    const isFixed = !!imageObj.replacedUrl;
    
    // Ustalanie czy to błąd brakujących slotów (gdzie AI zwraca customowy tekst zaczynający się od Audyt lub Analiza)
    const isMissingPhotosAlert = imageObj.originalUrl && (imageObj.originalUrl.includes('Audyt') || imageObj.originalUrl.includes('Analiza'));

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

    return (
        <div className={`flex flex-col bg-slate-50 border rounded-2xl overflow-hidden shadow-sm transition-all relative ${isFixed ? 'border-emerald-300' : 'border-slate-200'}`}>
            
            {/* Nagłówek Biletu */}
            <div className={`px-4 py-2 border-b text-[10px] uppercase font-black tracking-widest flex items-center justify-between ${isFixed ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : (imageObj.isCompliant ? 'bg-slate-100 text-slate-500 border-slate-200' : 'bg-rose-50 text-rose-600 border-rose-200')}`}>
                <span className="flex items-center">
                    <Camera className="w-3 h-3 mr-2" />
                    Slot Zdjęcia #{index + 1}
                </span>
                {isFixed ? <span>Zatwierdzone Po Korekcji</span> : (imageObj.isCompliant ? <span>GEO Compliant</span> : <span>Wymaga Interwencji</span>)}
            </div>

            {/* Obszar Główny - Zdjęcie / Dropzone / Tekst */}
            <div 
                className="relative group w-full h-48 bg-slate-200 overflow-hidden flex flex-col items-center justify-center p-4"
                onDrop={handleDrop} 
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
            >
                 {/* Jeśli to jest symulowany obiekt błędu (Brakujące Slot'y) to używamy tekstu, w przeciwnym razie czysty obraz z CDN */}
                 {isMissingPhotosAlert && !isFixed ? (
                     <div className="text-center flex flex-col items-center justify-center z-0">
                         <Camera className="w-8 h-8 text-slate-400 mb-2 opacity-50" />
                         <span className="text-xs font-bold text-slate-600 leading-relaxed max-w-[90%]">
                             {imageObj.originalUrl || "Wymagane nowe zdjęcie"}
                         </span>
                     </div>
                 ) : (
                     (isFixed ? imageObj.replacedUrl : imageObj.originalUrl) ? (
                         <img src={isFixed ? imageObj.replacedUrl : imageObj.originalUrl} alt={`Foto ${index}`} className="w-full h-full absolute inset-0 object-contain bg-slate-100 transition-transform group-hover:scale-105 z-0" />
                     ) : (
                         <div 
                             onClick={() => fileInputRef.current && fileInputRef.current.click()}
                             className="w-full h-full absolute inset-0 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer flex flex-col items-center justify-center text-slate-400 z-0"
                         >
                             <Camera className="w-8 h-8 mb-2 opacity-50 text-indigo-400" />
                             <span className="font-bold uppercase text-[10px] tracking-widest text-center text-indigo-500">Kliknij by wybrać zdjęcie<br/>lub po prostu je tutaj upuść</span>
                         </div>
                     )
                 )}
                 
                 {/* Alerty Nawierzchniowe */}
                 {!imageObj.isCompliant && !isFixed && imageObj.alerts && imageObj.alerts.length > 0 && (
                      <div className="absolute top-2 right-2 bg-rose-500/95 text-white p-3 rounded-xl shadow-xl flex items-start max-w-[90%] backdrop-blur-md border border-rose-400 z-20">
                          <AlertTriangle className="w-5 h-5 mr-2 shrink-0 mt-0.5 text-rose-200" />
                          <div className="flex flex-col space-y-1">
                             {imageObj.alerts.map((alert, idx) => (
                                 <span key={idx} className="text-[10px] font-bold leading-tight">{alert}</span>
                             ))}
                          </div>
                      </div>
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

            {/* Nowy Toolbar (Zawsze widoczny na dole) */}
            <div className="flex bg-slate-100 border-t border-slate-200 divide-x divide-slate-200">
                <button 
                    onClick={() => onView && onView(isFixed ? imageObj.replacedUrl : imageObj.originalUrl)}
                    className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-200 hover:text-indigo-600 transition-colors flex justify-center items-center"
                >
                    <Maximize2 className="w-3.5 h-3.5 mr-2" />
                    Powiększ
                </button>
                <button 
                    onClick={() => fileInputRef.current && fileInputRef.current.click()}
                    className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-200 hover:text-emerald-600 transition-colors flex justify-center items-center"
                >
                    <RefreshCw className="w-3.5 h-3.5 mr-2" />
                    Zmień
                </button>
                <button 
                    onClick={() => onImageDelete && onImageDelete()}
                    className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest text-rose-400 hover:bg-rose-100 hover:text-rose-600 transition-colors flex justify-center items-center"
                >
                    <Trash2 className="w-3.5 h-3.5 mr-2" />
                    Usuń
                </button>
            </div>
            
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
