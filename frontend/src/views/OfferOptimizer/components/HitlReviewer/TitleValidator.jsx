import React from 'react';
import { RefreshCw } from 'lucide-react';

/**
 * @typedef {Object} TitleValidatorProps
 * @property {string} liveTitle
 * @property {(text: string) => void} setLiveTitle
 * @property {boolean} isRegeneratingTitle
 * @property {() => void} handleRegenerateTitle
 */

export const TitleValidator = ({ liveTitle = "", setLiveTitle, isRegeneratingTitle, handleRegenerateTitle }) => {
    
    // Statusy
    const length = (liveTitle || "").length;
    const isTooShort = length < 12;
    const isPerfect = length >= 12 && length <= 75;

    let colorClass = "text-slate-700 bg-slate-50 border-slate-400";
    let alertText = "";
    
    if (isTooShort) {
        colorClass = "text-rose-600 bg-rose-50 border-rose-300 focus:border-rose-500 focus:ring-rose-500/20";
        alertText = `Za krótki. Brakuje ${12 - length} znaków.`;
    } else if (isPerfect) {
         if (length > 70) {
             colorClass = "text-amber-600 bg-amber-50 border-amber-300 focus:border-amber-500 focus:ring-amber-500/20";
             alertText = `Blisko granicy limitu! Zostało ${75 - length} znaków.`;
         } else {
             colorClass = "text-emerald-700 bg-emerald-50 border-emerald-300 focus:border-emerald-500 focus:ring-emerald-500/20";
             alertText = "Idealna długość.";
         }
    }

    const handleChange = (e) => {
        // Natywne obcięcie tekstu gdyby wklejono coś za długiego
        let newTitle = e.target.value;
        if (newTitle.length > 75) {
            newTitle = newTitle.slice(0, 75);
        }
        
        if (setLiveTitle) setLiveTitle(newTitle);
    };

    const handleKeyDown = (e) => {
        // Prevent typing if length >= 75, allow navigation & delete keys
        const allowedKeys = ["Backspace", "ArrowLeft", "ArrowRight", "Delete", "Tab", "Enter"];
        // Allow select all (Ctrl+A) and paste (Ctrl+V)
        if (e.ctrlKey || e.metaKey) return;

        if (length >= 75 && !allowedKeys.includes(e.key)) {
            e.preventDefault(); // ZABLOKOWANE 
        }
    };

    return (
        <div className="flex flex-col space-y-3 mb-6 relative group">
            <div className="flex justify-between items-end">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center">
                    Walidacja Tytułu API (GEO)
                </label>
                <div className="flex items-center gap-3">
                    <button 
                        onClick={handleRegenerateTitle} 
                        disabled={isRegeneratingTitle} 
                        className="text-[10px] uppercase font-bold text-indigo-500 hover:text-indigo-400 flex items-center transition-colors"
                        title="Ponownie wygeneruj tytuł przez AI"
                    >
                        <RefreshCw className={`w-3 h-3 mr-1 ${isRegeneratingTitle ? 'animate-spin' : ''}`} /> Odśwież
                    </button>
                    <div className={`text-[10px] uppercase font-black tracking-widest px-2 py-1 rounded-sm ${length >= 75 ? 'bg-rose-500 text-white shadow-sm shadow-rose-500/30' : 'bg-slate-100 text-slate-600'}`}>
                        {length} / 75 STR
                    </div>
                </div>
            </div>
            
            <input 
                type="text" 
                value={liveTitle}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                id="geoTitle"
                name="geoTitle"
                placeholder="Wpisz rygorystyczny tytuł zgodnie z konwencją GEO..."
                className={`w-full p-4 rounded-xl text-lg font-black outline-none border-2 transition-all shadow-sm focus:ring-4 ${colorClass}`}
            />
            
            <div className="flex justify-between text-xs tracking-wider px-1">
               <span className={`font-bold ${isTooShort ? 'text-rose-500' : (length >= 75 ? 'text-rose-600' : 'text-emerald-600')}`}>
                   {alertText || (length >= 75 && "Zablokowano. Osiągnięto twardy limit Allegro!")}
               </span>
               <span className="text-slate-500 font-bold">Wymagane minimum słów: 3</span>
            </div>
        </div>
    );
};
