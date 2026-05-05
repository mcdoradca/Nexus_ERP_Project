import React, { useRef, useState, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { StatusBadge } from './StatusBadge';
import { PlayCircle, Database, CheckSquare, Search } from 'lucide-react';

// Generowanie 5000 testowych rekordów do zwizualizowania potęgi Wirtualizacji.
const MOCK_JOBS = Array.from({ length: 5000 }).map((_, index) => ({
    id: `SKU-${100000 + index}`,
    name: `Testowy Produkt Ofertowy Allegro #${index + 1}`,
    brand: index % 3 === 0 ? 'Trimay' : (index % 2 === 0 ? 'DeWalt' : 'Samsung'),
    status: 'QUEUED',
}));

export const VirtualizedGrid = ({ onJobSelect }) => {
    const parentRef = useRef(null);
    const [jobs, setJobs] = useState(MOCK_JOBS);
    const [search, setSearch] = useState('');

    // Symulacja SSE (Server-Sent Events) z Backendu.
    // Progresja: QUEUED -> VISION_AI -> GEO_BUILDER -> HITL_REVIEW lub ERROR
    useEffect(() => {
        const interval = setInterval(() => {
            setJobs(currentJobs => {
                const newJobs = [...currentJobs];
                // Wylosujmy 5 indexów do zmiany co 2 sekundy (symulacja partii z kolejki)
                for (let i=0; i<5; i++) {
                    const rId = Math.floor(Math.random() * 500); // Mieszamy tylko w pierwszych 500 paczkach dla płynności
                    let stat = newJobs[rId].status;
                    if (stat === 'QUEUED') stat = 'VISION_AI';
                    else if (stat === 'VISION_AI') stat = 'GEO_BUILDER';
                    else if (stat === 'GEO_BUILDER') {
                        // 10% szansy na pad API (Rate Limit / Schema error)
                        stat = Math.random() > 0.9 ? 'ERROR_400' : 'HITL_REVIEW'; 
                    }
                    newJobs[rId] = { ...newJobs[rId], status: stat };
                }
                return newJobs;
            });
        }, 800);

        return () => clearInterval(interval);
    }, []);

    // Proste filtrowanie - uwaga, przefiltrowanie 5k rekordów działa w nanosekundach po stronie DOM dzięki Virtualizerowi
    const filteredJobs = jobs.filter(j => 
        j.id.toLowerCase().includes(search.toLowerCase()) || 
        j.name.toLowerCase().includes(search.toLowerCase())
    );

    const rowVirtualizer = useVirtualizer({
        count: filteredJobs.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 64, // Stała wysokość na ~64px (skraca matematykę do layout shiftów)
        overscan: 5 // margines buforu
    });

    return (
        <div className="flex flex-col h-full bg-white rounded-sm shadow-sm border border-slate-400 overflow-hidden">
            {/* Header Panelu Grid */}
            <div className="bg-slate-50 border-b border-slate-400 px-6 py-4 flex items-center justify-between z-10 shrink-0">
               <div>
                   <h3 className="text-[12px] font-black uppercase tracking-widest text-slate-800 flex items-center">
                       <Database className="w-4 h-4 mr-2 text-indigo-500" />
                       Queue Monitor (The Grid)
                   </h3>
                   <p className="text-[9px] font-bold text-slate-600 mt-1 uppercase tracking-wider">
                       Renderowanie <span className="text-indigo-500">{filteredJobs.length}</span> węzłów poprzez TanStack Virtual
                   </p>
               </div>
               
               <div className="flex space-x-3 items-center">
                   <div className="relative">
                       <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-600" />
                       <input 
                          type="text" 
                          placeholder="Szukaj ID/SKU..."
                          className="pl-9 pr-4 py-2 bg-white border border-slate-400 rounded-sm text-xs font-bold outline-none focus:border-indigo-500 transition-colors"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                       />
                   </div>
                   <button className="px-5 py-2 bg-slate-900 text-white rounded-sm flex items-center text-[10px] uppercase font-black tracking-widest hover:bg-indigo-600 transition-colors shadow-sm">
                       <PlayCircle className="w-4 h-4 mr-2" />
                       Wywołaj Ingestię
                   </button>
               </div>
            </div>

            {/* Sztywny Tytuł Kolumn */}
            <div className="grid grid-cols-12 gap-4 px-6 py-3 border-b border-slate-400 bg-slate-100 text-[9px] font-black text-slate-600 uppercase tracking-widest shrink-0">
                <div className="col-span-1 flex items-center justify-center"><CheckSquare className="w-4 h-4"/></div>
                <div className="col-span-2 text-left">SKU / ID Ofertowe</div>
                <div className="col-span-4 text-left">Tytuł Bazowy</div>
                <div className="col-span-2 text-left">Marka</div>
                <div className="col-span-2 text-center">System (Job Status)</div>
                <div className="col-span-1 text-center">Akcja</div>
            </div>

            {/* Ograniczony Kontener Wirtualizatora - TU DZIEJE SIĘ MAGIA WYDAJNOŚCI CZYTAMY TYLKO 20 ELEM. Z DOM */}
            <div ref={parentRef} className="flex-1 overflow-auto custom-scrollbar" style={{ height: '500px' }}>
                <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
                    {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                        const job = filteredJobs[virtualItem.index];
                        return (
                            <div 
                                key={virtualItem.key} 
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    height: `${virtualItem.size}px`,
                                    transform: `translateY(${virtualItem.start}px)`,
                                }}
                                className={`grid grid-cols-12 gap-4 px-6 items-center border-b border-slate-300 transition-colors hover:bg-indigo-50/50 cursor-pointer ${virtualItem.index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}
                                onClick={() => { if(onJobSelect) onJobSelect(job); }}
                            >
                                <div className="col-span-1 flex items-center justify-center">
                                    <input type="checkbox" className="w-4 h-4 rounded-sm border-slate-300 text-indigo-600 focus:ring-indigo-500" onClick={e=>e.stopPropagation()}/>
                                </div>
                                <div className="col-span-2 text-left">
                                     <span className="bg-slate-100 text-slate-600 text-[10px] font-black px-2 py-1 rounded-sm tracking-wider font-mono">{job.id}</span>
                                </div>
                                <div className="col-span-4 text-left text-xs font-bold text-slate-700 truncate pr-4">
                                     {job.name}
                                </div>
                                <div className="col-span-2 text-left text-[10px] font-black text-slate-600 uppercase tracking-widest">
                                     {job.brand}
                                </div>
                                <div className="col-span-2 flex justify-center">
                                     <StatusBadge status={job.status} />
                                </div>
                                <div className="col-span-1 flex justify-center">
                                     <button 
                                        className="text-[9px] bg-white border border-slate-400 shadow-sm px-3 py-1.5 rounded-sm font-black uppercase tracking-widest text-indigo-600 hover:bg-indigo-600 hover:text-white transition-colors"
                                        onClick={(e) => { e.stopPropagation(); if(onJobSelect) onJobSelect(job); }}
                                     >
                                         Edytuj
                                     </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
            {/* Koniec Virtualizatora */}

        </div>
    );
};
