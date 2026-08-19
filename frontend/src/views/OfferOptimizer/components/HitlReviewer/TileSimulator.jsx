import React from 'react';

/**
 * Złote Źródło Prawdy (Mock dla podglądu Typu StandardizedDescription)
 * @type {import('../../models/AllegroModels').StandardizedDescription}
 */
const mockStandardizedDescription = {
    title: "Młot Udarowy DeWalt 1500W D25134K SDS Plus",
    sections: [
        {
            type: "TEXT",
            content: "<h2>Dlaczego ten model to wybór inżynierów?</h2><p>Odpowiedź znajduje się w module udarowym 1500W, który generuje energię kinetyczną zdolną rozkruszyć beton B20 w ułamku sekundy. BLUF (Bottom Line Up Front): Jest to najlżejszy we własnej klasie sprzet pozwalający na ciągłą pracę przez 8 godzin bez przegrzania wirnika.</p>"
        },
        {
            type: "IMAGE",
            content: "https://via.placeholder.com/800x600/ffffff/d3d3d3?text=Wizualizacja+Lifestyle+AI+1"
        },
        {
            type: "TEXT",
            content: "<h2>Specyfikacja Techniczna ⚙️</h2><ul><li>Podłączenie: 230V</li><li>Uchwyt: SDS Plus Wymienny</li><li>Moc uderzenia: 2.8 dżula</li><li>Obroty biegu: 0-1500 RPM</li></ul><p>Wzmocniona powłoka żywiczna zapobiega wstrząsom elektrostatycznym podczas pracy zbrojeniowej.</p>"
        }
    ]
};

export const TileSimulator = ({ customSections = mockStandardizedDescription.sections }) => {
    return (
        <div className="w-full bg-white rounded-sm shadow-xl overflow-hidden border border-slate-400">
            {/* Header / Belka */}
            <div className="bg-orange-500 px-6 py-4 flex items-center justify-between">
               <h3 className="text-white font-black uppercase tracking-widest text-xs flex items-center">
                   <span className="w-2 h-2 rounded-sm bg-white mr-2 animate-pulse"></span>
                   Symulator Układu Kafelków
               </h3>
               <span className="text-[10px] bg-black/20 text-white px-2 py-1 rounded font-bold uppercase tracking-wider">Mobile UI</span>
            </div>
            
            {/* Kontener Mobilny Ofert */}
            <div className="p-8 bg-slate-100 flex flex-col items-center max-h-[700px] overflow-y-auto">
                <div className="w-full max-w-lg bg-white rounded-sm shadow-sm border border-slate-400 p-6 space-y-8">
                    
                    {customSections.map((section, sectionIdx) => (
                        <div key={sectionIdx} className="flex flex-col gap-6 w-full">
                            {section.items.map((item, itemIdx) => {
                                if (item.type === 'IMAGE') {
                                    return (
                                        <div key={itemIdx} className="flex-1 rounded-sm overflow-hidden shadow-sm border border-slate-300 flex items-center justify-center bg-white min-h-[200px]">
                                            <img src={item.content || undefined} alt={`Block ${sectionIdx}-${itemIdx}`} className="max-w-full max-h-[400px] object-contain" />
                                        </div>
                                    );
                                }
                                
                                if (item.type === 'TEXT') {
                                    return (
                                        <div key={itemIdx} className="flex-1 prose prose-slate prose-h2:text-orange-500 prose-h2:mb-4 prose-h2:pb-2 prose-h2:border-b prose-h2:border-slate-300 prose-p:leading-relaxed prose-p:text-sm prose-ul:font-medium prose-ul:text-slate-700 p-4 border border-slate-300 rounded-sm bg-white"
                                             dangerouslySetInnerHTML={{ __html: item.content }} 
                                        />
                                    );
                                }
                                return null;
                            })}
                        </div>
                    ))}
                    
                </div>
            </div>
        </div>
    );
};
