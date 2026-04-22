import React, { useState } from 'react';
import { Camera, AlertTriangle, UploadCloud, CheckCircle2 } from 'lucide-react';

export const PhotographicAuditorCard = ({ imageObj, index, onImageReplace }) => {
    // imageObj { originalUrl: string, alerts: string[], isCompliant: boolean, replacedUrl: string|null }
    
    // Status lokalny Dropzone'a
    const [isDragging, setIsDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    
    const isFixed = !!imageObj.replacedUrl;
    
    // Ustalanie czy to błąd brakujących slotów (gdzie AI zwraca customowy tekst zaczynający się od Audyt lub Analiza)
    const isMissingPhotosAlert = imageObj.originalUrl && (imageObj.originalUrl.includes('Audyt') || imageObj.originalUrl.includes('Analiza'));

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (!file || !file.type.startsWith('image/')) return;
        
        setUploading(true);
        // Symulacja wysyłki na s3 BaseLinkera i zwrócenie nowego Czystego URL'a RGB
        setTimeout(() => {
            const newUrl = URL.createObjectURL(file);
            setUploading(false);
            if(onImageReplace) onImageReplace(newUrl);
        }, 1200);
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
            <div className="relative group w-full h-48 bg-slate-200 overflow-hidden flex flex-col items-center justify-center p-4">
                 {/* Jeśli to jest symulowany obiekt błędu (Brakujące Slot'y) to używamy tekstu, w przeciwnym razie czysty obraz z CDN */}
                 {isMissingPhotosAlert && !isFixed ? (
                     <div className="text-center flex flex-col items-center justify-center z-0">
                         <Camera className="w-8 h-8 text-slate-400 mb-2 opacity-50" />
                         <span className="text-xs font-bold text-slate-600 leading-relaxed max-w-[90%]">
                             {imageObj.originalUrl}
                         </span>
                     </div>
                 ) : (
                     <img src={isFixed ? imageObj.replacedUrl : imageObj.originalUrl} alt={`Foto ${index}`} className="w-full h-full absolute inset-0 object-contain bg-slate-100 transition-transform group-hover:scale-105 z-0" />
                 )}
                 
                 {/* Alerty Nawierzchniowe */}
                 {!imageObj.isCompliant && !isFixed && (
                      <div className="absolute top-2 right-2 bg-rose-500/95 text-white p-3 rounded-xl shadow-xl flex items-start max-w-[90%] backdrop-blur-md border border-rose-400 z-20">
                          <AlertTriangle className="w-5 h-5 mr-2 shrink-0 mt-0.5 text-rose-200" />
                          <div className="flex flex-col space-y-1">
                             {imageObj.alerts.map((alert, idx) => (
                                 <span key={idx} className="text-[10px] font-bold leading-tight">{alert}</span>
                             ))}
                          </div>
                      </div>
                 )}

                 {/* Nakładka Dropzone Aktywna na Hover lub Drug (Tylko gdy potrzebna interwencja albo do nadpisania) */}
                 {(!imageObj.isCompliant || isFixed) && (
                     <div 
                         onDrop={handleDrop} 
                         onDragOver={handleDragOver}
                         onDragLeave={handleDragLeave}
                         className={`absolute inset-0 z-10 transition-all flex flex-col items-center justify-center backdrop-blur-sm cursor-pointer
                             ${isDragging ? 'bg-indigo-500/40 opacity-100 ring-4 ring-inset ring-indigo-400' : 'bg-slate-900/60 opacity-0 group-hover:opacity-100'}
                             ${uploading ? 'opacity-100 bg-slate-900/80 cursor-wait' : ''}
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
                 )}
            </div>

        </div>
    );
};
