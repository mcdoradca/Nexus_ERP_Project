import React, { useState, useEffect } from 'react';

/**
 * @typedef {Object} TitleValidatorProps
 * @property {string} initialTitle
 * @property {(valid: boolean, text: string) => void} onValidate
 */

export const TitleValidator = ({ initialTitle = "", onValidate }) => {
    const [title, setTitle] = useState(initialTitle);
    
    useEffect(() => {
        setTitle(initialTitle);
    }, [initialTitle]);
    
    // Statusy
    const length = title.length;
    const isTooShort = length < 12;
    const isPerfect = length >= 12 && length <= 75;
    const isMaxReached = length >= 75; // Realnie event keyDown powinien blokować wpisywanie na poziomie 75

    let colorClass = "text-slate-700 bg-slate-50 border-slate-200";
    let alertText = "";
    
    if (isTooShort) {
        colorClass = "text-rose-600 bg-rose-50 border-rose-300";
        alertText = `Za krótki. Brakuje ${12 - length} znaków.`;
    } else if (isPerfect) {
         if (length > 70) {
             colorClass = "text-amber-600 bg-amber-50 border-amber-300";
             alertText = `Blisko granicy limitu! Zostało ${75 - length} znaków.`;
         } else {
             colorClass = "text-emerald-700 bg-emerald-50 border-emerald-300";
             alertText = "Idealna długość.";
         }
    }

    const handleChange = (e) => {
        // Natywne obcięcie tekstu gdyby wklejono coś za długiego
        let newTitle = e.target.value;
        if (newTitle.length > 75) {
            newTitle = newTitle.slice(0, 75);
        }
        
        setTitle(newTitle);
        if (onValidate) onValidate(newTitle.length >= 12 && newTitle.length <= 75, newTitle);
    };

    const handleKeyDown = (e) => {
        // Prevent typing if length >= 75, allow navigation & delete keys
        const allowedKeys = ["Backspace", "ArrowLeft", "ArrowRight", "Delete", "Tab", "Enter"];
        // Allow select all (Ctrl+A) and paste (Ctrl+V)
        if (e.ctrlKey || e.metaKey) return;

        if (title.length >= 75 && !allowedKeys.includes(e.key)) {
            e.preventDefault(); // ZABLOKOWANE 
        }
    };

    return (
        <div className="flex flex-col space-y-2 mb-6">
            <div className="flex justify-between items-end">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    Walidacja Tytułu API (GEO)
                </label>
                <div className={`text-[10px] uppercase font-black tracking-widest px-2 py-1 rounded-sm ${title.length >= 75 ? 'bg-rose-500 text-white' : 'text-slate-400'}`}>
                    {length} / 75 STR
                </div>
            </div>
            
            <input 
                type="text" 
                value={title}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                id="geoTitle"
                name="geoTitle"
                placeholder="Wpisz rygorystyczny tytuł zgodnie z konwencją GEO..."
                className={`w-full p-4 rounded-xl text-lg font-black outline-none border-2 transition-all shadow-sm ${colorClass}`}
            />
            
            <div className="flex justify-between text-xs tracking-wider">
               <span className={`font-bold ${isTooShort ? 'text-rose-500' : (length >= 75 ? 'text-rose-600' : 'text-emerald-600')}`}>
                   {alertText || (length >= 75 && "Zablokowano. Osiągnięto twardy limit Allegro!")}
               </span>
               <span className="text-slate-400 font-bold">Wymagane minimum słów: 3</span>
            </div>
        </div>
    );
};
