import React, { useState } from 'react';
import axios from 'axios';
import { Target, Plus, Cloud, CloudLightning, ArrowRight, Search, Filter, Scan, Calculator, TrendingUp } from 'lucide-react';

import PricingCalculatorDrawer from './PricingCalculatorDrawer';
import AnalyticsForecastModal from './AnalyticsForecastModal';

const ProductsView = ({
  products,
  currentUser,
  setIsNewBrandModalOpen,
  setIsNewProductModalOpen,
  onEditProduct,
  fetchAppGlobalData
}) => {
  const isAdmin = currentUser?.role === 'ADMIN';

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  

  const [pricingProduct, setPricingProduct] = useState(null);
  const [forecastProduct, setForecastProduct] = useState(null);

  const [aiQuery, setAiQuery] = useState('');
  const [aiFilteredIds, setAiFilteredIds] = useState(null);
  const [isAiSearching, setIsAiSearching] = useState(false);

  const API_URL = import.meta.env.PROD ? '' : 'http://localhost:3001';

  const handleAiSearch = async () => {
    if (!aiQuery.trim()) {
        setAiFilteredIds(null);
        return;
    }
    setIsAiSearching(true);
    try {
        const token = localStorage.getItem('aps_token');
        
        // Przygotowujemy lekką paczkę informacji o produktach z zachowaniem obliczonego już DQS
        const minimalProducts = products.map(p => ({
            id: p.id,
            name: p.name,
            sku: p.sku,
            ean: p.ean,
            dqsTotal: p.dqs?.totalScore || 0,
            stock: p.stock
        }));

        const res = await axios.post(`${API_URL}/api/products/ai-search`, { 
            query: aiQuery,
            products: minimalProducts
        }, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (res.data.ids && Array.isArray(res.data.ids)) {
            setAiFilteredIds(res.data.ids);
        } else {
            setAiFilteredIds([]);
        }
    } catch (err) {
        console.error("Błąd AI:", err);
        alert("Błąd podczas inteligentnego wyszukiwania AI.");
    } finally {
        setIsAiSearching(false);
    }
  };

  const handleProductUpdated = (updatedProd) => {
      // Wywołujemy odświeżenie w górę (jeśli App.jsx obsługuje) lub tymczasowo modyfikujemy lokalną listę (wymaga reloadu z props, co zapewni App.jsx)
      // Ponieważ nie mamy tu mutacji stanu products (są z propsów), zamykamy modal.
      setPricingProduct(updatedProd);
      // Najlepiej by było gdyby PIM odświeżał listę. Zakładamy, że onEditProduct odświeża PIM.
  };

  const filteredProducts = products.filter(p => {
     let matchesSearch = true;
     if (searchTerm) {
        const query = searchTerm.toLowerCase();
        matchesSearch = p.name?.toLowerCase().includes(query) || p.ean?.toLowerCase().includes(query) || p.sku?.toLowerCase().includes(query);
     }
     let matchesFilter = true;
     if (filterType === 'MISSING_BOM') {
        matchesFilter = !p.bomElements || p.bomElements.length === 0;
     } else if (filterType === 'HAS_BOM') {
        matchesFilter = p.bomElements && p.bomElements.length > 0;
     }
     
     let matchesAi = true;
     if (aiFilteredIds !== null) {
        matchesAi = aiFilteredIds.includes(p.id);
     }
     
     return matchesSearch && matchesFilter && matchesAi;
  });
  
  return (
    <div className="flex-1 flex flex-col p-4 bg-gradient-to-b from-[#f8fafc] to-[#e2e8f0] h-full w-full relative min-h-0 overflow-hidden">
      {/* Kompaktowy Header & Toolbar */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm mb-3 shrink-0 flex flex-col md:flex-row items-stretch md:items-center justify-between p-2 md:px-4 md:py-2.5 gap-3">
        
        {/* Lewa: Tytuł */}
        <div className="flex items-center shrink-0">
           <div className="w-8 h-8 bg-indigo-50 rounded-md flex items-center justify-center mr-3 border border-indigo-100">
              <Scan className="w-4 h-4 text-indigo-600" />
           </div>
           <div>
             <h2 className="text-sm font-bold text-slate-800 leading-tight">Katalog SKU</h2>
             <p className="text-[10px] font-medium text-slate-500">Zarządzanie PIM</p>
           </div>
        </div>

        {/* Środek: Główne Filtry i Szukajka */}
        <div className="flex-1 flex items-center gap-2 max-w-3xl">
            <div className="relative flex-1">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
               <input 
                  type="text" 
                  placeholder="Szukaj po nazwie, EAN, SKU..." 
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-800 outline-none focus:bg-white focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition-all" 
                  value={searchTerm} 
                  onChange={e => setSearchTerm(e.target.value)} 
               />
            </div>
            <div className="w-48 relative shrink-0">
               <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
               <select 
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-700 outline-none focus:bg-white focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition-all cursor-pointer appearance-none" 
                  value={filterType} 
                  onChange={e => setFilterType(e.target.value)}
               >
                  <option value="ALL">Wszystkie Indeksy</option>
                  <option value="MISSING_BOM">⚠️ Brak BOM</option>
                  <option value="HAS_BOM">✅ Gotowe BOM</option>
               </select>
            </div>
            
            {/* Wyszukiwarka AI */}
            <div className="relative flex-1 group min-w-[200px]">
                <div className="relative flex items-center bg-indigo-50 border border-indigo-100 rounded-md focus-within:border-indigo-300 focus-within:bg-white transition-all">
                    <CloudLightning className="absolute left-3 w-4 h-4 text-indigo-500" />
                    <input 
                        type="text" 
                        placeholder="Zapytaj AI np. 'braki PXM'..." 
                        className="w-full pl-9 pr-16 py-1.5 bg-transparent text-xs text-indigo-900 placeholder:text-indigo-400 outline-none" 
                        value={aiQuery} 
                        onChange={e => setAiQuery(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAiSearch()}
                    />
                    <div className="absolute right-1 flex space-x-1">
                        {aiFilteredIds !== null && (
                            <button onClick={() => { setAiQuery(''); setAiFilteredIds(null); }} className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-500 rounded text-[9px] font-medium transition-colors border border-slate-200">X</button>
                        )}
                        <button onClick={handleAiSearch} disabled={isAiSearching} className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[10px] font-medium transition-colors disabled:opacity-50 flex items-center shadow-sm">
                            {isAiSearching ? '...' : 'Szukaj'}
                        </button>
                    </div>
                </div>
            </div>
        </div>

        {/* Prawa: Przyciski Akcji */}
        <div className="flex space-x-2 shrink-0">
          {isAdmin && (
            <>

              <button onClick={() => setIsNewBrandModalOpen(true)} className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-md text-xs font-medium hover:bg-slate-50 hover:text-slate-900 shadow-sm flex items-center transition-all">
                <Target className="w-3.5 h-3.5 mr-1.5 text-indigo-500" /> Marka
              </button>
              <button onClick={() => setIsNewProductModalOpen(true)} className="px-4 py-1.5 bg-indigo-600 text-white rounded-md text-xs font-medium hover:bg-indigo-700 shadow-sm flex items-center transition-all">
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Nowe SKU
              </button>
            </>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 flex-1 flex flex-col min-h-0 overflow-hidden relative">
        <div className="p-0 overflow-auto custom-scrollbar flex-1">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-semibold text-xs text-slate-600">Produkt / SKU</th>
                <th className="px-4 py-3 font-semibold text-xs text-slate-600 text-center">Status</th>
                <th className="px-4 py-3 font-semibold text-xs text-slate-600 text-center">Data Quality</th>
                <th className="px-4 py-3 font-semibold text-xs text-slate-600">Marka</th>
                <th className="px-4 py-3 font-semibold text-xs text-slate-600 text-center">Stock</th>
                <th className="px-4 py-3 font-semibold text-xs text-slate-600 text-center">API</th>
                {isAdmin && (
                  <>
                    <th className="px-4 py-3 font-semibold text-xs text-slate-600">Eco/BOM</th>
                    <th className="px-4 py-3 font-semibold text-xs text-slate-600">Struktura TC</th>
                    <th className="px-4 py-3 font-semibold text-xs text-slate-600 text-right">Unit Economics</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredProducts.map(p => {
                let dynamicBdo = 0;
                if (p.bomElements && p.bomElements.length > 0) {
                    p.bomElements.forEach(b => {
                       dynamicBdo += (b.weightGrams / 1000) * b.material.ratePerKg;
                    });
                }
                const tc = p.basePrice + p.inboundTransportCost + p.packagingCost + dynamicBdo + p.outboundTransportCost;
                
                const vatRate = (p.taxRate || 23) / 100;
                const salePriceNetto = p.salePrice / (1 + vatRate);
                const commission = p.salePrice * 0.12;
                const profitNetto = salePriceNetto - tc - commission;
                const marginPercent = salePriceNetto > 0 ? (profitNetto / salePriceNetto) * 100 : 0;

                return (
                  <tr key={p.id} onClick={() => isAdmin && onEditProduct && onEditProduct(p)} className={`hover:bg-slate-50/50 transition-all group ${isAdmin ? 'cursor-pointer' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-6">
                        {p.imageUrl ? (
                           <div className="w-14 h-14 shrink-0 bg-white border border-slate-300 rounded-sm p-1 shadow-sm overflow-hidden flex items-center justify-center">
                              <img src={p.imageUrl} alt={p.name} className="w-full h-full object-contain" />
                           </div>
                        ) : (
                           <div className="w-14 h-14 shrink-0 bg-slate-50 border border-slate-400 rounded-sm shadow-inner flex items-center justify-center text-slate-300">
                              <span className="text-[10px] font-black uppercase tracking-widest">Brak</span>
                           </div>
                        )}
                        <div>
                           <div className="font-mono text-[9px] font-black text-slate-600 tracking-wider mb-1 uppercase">{p.ean || 'BRAK EAN'}</div>
                           <div className="font-black text-slate-900 text-sm uppercase tracking-tight group-hover:text-indigo-600 transition-colors line-clamp-1">{p.name}</div>
                           <div className="text-[10px] font-bold text-slate-600 mt-1 uppercase">SKU: {p.sku}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-[9px] font-black px-4 py-1.5 rounded-sm uppercase tracking-widest ${p.status === 'Aktywny' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-500 border border-slate-400'}`}>{p.status}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {p.dqs ? (
                        <div className="flex flex-col items-center group/dqs relative cursor-help">
                           <div className="text-[14px] font-black tabular-nums tracking-tighter mb-1" style={{ color: p.dqs.totalScore >= 80 ? '#059669' : p.dqs.totalScore >= 50 ? '#d97706' : '#e11d48' }}>
                             {p.dqs.totalScore}%
                           </div>
                           <div className="h-1.5 w-16 bg-slate-100 rounded-sm overflow-hidden flex mx-auto">
                              <div className="h-full bg-indigo-500" style={{ width: `${(p.dqs.coreScore / 100) * 100}%` }}></div>
                              <div className="h-full bg-emerald-400" style={{ width: `${(p.dqs.channelScore / 100) * 100}%` }}></div>
                           </div>
                           
                           {/* Tooltip z błędami */}
                           <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-96 bg-slate-900 border border-slate-700 rounded-sm p-4 opacity-0 group-hover/dqs:opacity-100 pointer-events-none transition-all shadow-2xl z-50 text-left whitespace-normal">
                               <div className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-2 border-b border-slate-700 pb-2 flex justify-between">
                                  <span>Braki do 100% PXM</span>
                                  <span className="text-indigo-400">{p.dqs.totalScore}%</span>
                               </div>
                               {p.dqs.missingCore && p.dqs.missingCore.length > 0 && (
                                 <div className="mb-2">
                                    <span className="text-[8px] text-rose-400 uppercase tracking-widest block mb-1">PIM Core (Filar 1):</span>
                                    {p.dqs.missingCore.map((m, i) => <div key={`core-${i}`} className="text-[10px] text-slate-300 leading-tight mb-0.5">- {m}</div>)}
                                 </div>
                               )}
                               {p.dqs.missingChannel && p.dqs.missingChannel.length > 0 && (
                                 <div>
                                    <span className="text-[8px] text-amber-400 uppercase tracking-widest block mb-1">Allegro (Filar 2):</span>
                                    {p.dqs.missingChannel.map((m, i) => <div key={`chan-${i}`} className="text-[10px] text-slate-300 leading-tight mb-0.5">- {m}</div>)}
                                 </div>
                               )}
                               {p.dqs.isSyndicationReady && (
                                 <div className="text-[10px] text-emerald-400 font-bold mt-1 text-center">✓ W pełni gotowy do syndykacji</div>
                               )}
                           </div>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400 font-bold">---</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="inline-flex items-center px-4 py-2 bg-indigo-50/50 text-indigo-700 rounded-sm text-[10px] font-black uppercase tracking-tighter border border-indigo-100/50">
                        <Target className="w-3 h-3 mr-2" /> {p.brand?.name || 'Bez Marki'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="font-black text-slate-800 text-lg tabular-nums tracking-tighter">{p.stock}</div>
                      <div className="text-[8px] font-black text-slate-600 uppercase tracking-widest mt-1">Sztuk</div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center space-x-3">
                        <div className={`p-2 rounded-sm border ${p.subiektId ? 'bg-emerald-50 border-emerald-100 text-emerald-600 shadow-lg shadow-emerald-500/10' : 'bg-slate-50 border-slate-300 text-slate-300 opacity-30 grayscale'}`}>
                          <Cloud className="w-5 h-5" />
                        </div>
                        <div className={`p-2 rounded-sm border ${p.baselinkerId ? 'bg-blue-50 border-blue-100 text-blue-600 shadow-lg shadow-blue-500/10' : 'bg-slate-50 border-slate-300 text-slate-300 opacity-30 grayscale'}`}>
                          <CloudLightning className="w-5 h-5" />
                        </div>
                      </div>
                    </td>
                    {isAdmin && (
                      <>
                        <td className="px-4 py-3">
                           {p.bomElements && p.bomElements.length > 0 ? (
                               <div className="flex flex-col space-y-1 relative group/bom">
                                   <div className="text-[11px] font-black tabular-nums text-emerald-600 underline decoration-emerald-200 decoration-2 underline-offset-4 w-max cursor-help">+ {dynamicBdo.toFixed(4)} zł</div>
                                   <div className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">{p.bomElements.length} Frakcje</div>
                                   
                                   {/* Tooltip Hover z Detalami Powiązań i DPP */}
                                   <div className="absolute left-0 top-full mt-2 w-64 bg-slate-900 border border-slate-700 rounded-sm p-4 opacity-0 group-hover/bom:opacity-100 pointer-events-none transition-all shadow-2xl z-50">
                                      <div className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-2 border-b border-slate-700 pb-2 flex justify-between">
                                        <span>Architektura BOM</span>
                                        <span className="text-indigo-400">DPP Ready</span>
                                      </div>
                                      {p.bomElements.map(b=>(
                                         <div key={b.id} className="flex flex-col mb-2 border-b border-slate-800 pb-1">
                                            <div className="flex justify-between items-center text-[10px]">
                                              <span className="text-slate-300 truncate max-w-[120px]">{b.material.name}</span>
                                              <span className="text-emerald-400 font-bold tabular-nums">({b.weightGrams}g)</span>
                                            </div>
                                            <div className="text-[8px] text-slate-500 font-mono mt-0.5">Ślad CO2: {b.material.carbonFootprintKg ? b.material.carbonFootprintKg + 'kg' : 'Nieznany'} | Pochodzenie: {b.material.origin || 'Brak danych'}</div>
                                         </div>
                                      ))}
                                   </div>
                               </div>
                           ) : (
                               <div className="flex items-center text-rose-400">
                                  <span className="text-[10px] font-black uppercase tracking-widest border border-rose-200 bg-rose-50 px-2 py-1 rounded-sm">Brak Deklaracji</span>
                               </div>
                           )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-between text-[10px] mb-1">
                            <span className="font-black text-slate-600 uppercase tracking-widest">Koszty Bazy:</span>
                            <span className="font-bold text-slate-700 tabular-nums">{(p.basePrice + p.inboundTransportCost + p.packagingCost + p.outboundTransportCost).toFixed(2)} zł</span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-100 rounded-sm overflow-hidden mb-2">
                             <div className="h-full bg-indigo-500" style={{ width: `${(tc/p.salePrice)*100}%` }}></div>
                          </div>
                          <div className="text-[11px] font-black text-indigo-900 tabular-nums uppercase tracking-widest">TC Sumarycznie: {tc.toFixed(2)} zł</div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-col items-end">
                              <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1">Profitability</div>
                              <div className={`text-xl font-black tabular-nums tracking-tighter ${profitNetto > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {profitNetto > 0 ? '+' : ''}{profitNetto.toFixed(2)} zł
                              </div>
                              <div className={`text-[10px] font-black uppercase ${profitNetto > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                {marginPercent.toFixed(1)}% Marży Netto
                              </div>
                              <button 
                                onClick={(e) => { e.stopPropagation(); setPricingProduct({...p, bdoEprCost: parseFloat(dynamicBdo.toFixed(4))}); }} 
                                className="mt-2 px-3 py-1 bg-slate-100 hover:bg-indigo-100 hover:text-indigo-700 border border-slate-300 rounded-sm text-[9px] font-black uppercase flex items-center transition-colors w-full justify-center"
                              >
                                <Calculator className="w-3 h-3 mr-1"/> AlgoPricing
                              </button>
                              <button 
                                onClick={(e) => { e.stopPropagation(); setForecastProduct(p); }} 
                                className="mt-1 px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white border border-slate-700 rounded-sm text-[9px] font-black uppercase flex items-center transition-colors w-full justify-center shadow-lg"
                              >
                                <TrendingUp className="w-3 h-3 mr-1 text-indigo-400"/> Prognoza AI
                              </button>
                              <button 
                                id={`aeo-btn-${p.id}`}
                                onClick={async (e) => { 
                                  e.stopPropagation(); 
                                  const btn = document.getElementById(`aeo-btn-${p.id}`);
                                  const prevHtml = btn.innerHTML;
                                  btn.innerHTML = '<span class="animate-spin mr-1 text-[12px]">⟳</span> Generuję...';
                                  btn.disabled = true;
                                  try {
                                      const token = localStorage.getItem('aps_token');
                                      await axios.post(`${import.meta.env.PROD ? '' : 'http://localhost:3001'}/api/products/${p.id}/aeo`, {}, { headers: { Authorization: `Bearer ${token}` }});
                                      if (fetchAppGlobalData) await fetchAppGlobalData();
                                      alert('Sukces! Treść AEO (pod wyszukiwarki AI) została wygenerowana. Wejdź w Edycję Kartoteki, aby ją zobaczyć.');
                                  } catch (err) {
                                      alert('Błąd generowania AEO: ' + err.message);
                                  } finally {
                                      btn.innerHTML = prevHtml;
                                      btn.disabled = false;
                                  }
                                }} 
                                className="mt-1 px-3 py-1 bg-indigo-50 hover:bg-indigo-600 hover:text-white text-indigo-700 border border-indigo-200 rounded-sm text-[9px] font-black uppercase flex items-center transition-colors w-full justify-center shadow-sm disabled:opacity-50"
                              >
                                <CloudLightning className="w-3 h-3 mr-1" /> Generuj AEO
                              </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        
        <div className="px-4 py-3 bg-slate-50/50 border-t border-slate-300 shrink-0 flex justify-between items-center">
          <span className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em]">Przefiltrowano wyników: {filteredProducts.length} z {products.length}</span>
          <div className="flex space-x-2">
             <button className="p-2 bg-white border border-slate-400 rounded-sm text-slate-600 hover:text-indigo-600 shadow-sm transition-all"><ArrowRight className="w-4 h-4 rotate-180" /></button>
             <button className="px-5 py-2 bg-slate-900 text-white rounded-sm text-[10px] font-black uppercase tracking-widest shadow-xl">1 – 10</button>
             <button className="p-2 bg-white border border-slate-400 rounded-sm text-slate-600 hover:text-indigo-600 shadow-sm transition-all"><ArrowRight className="w-4 h-4" /></button>
          </div>
        </div>
      </div>
      
      {/* Modals & Drawers */}

      <PricingCalculatorDrawer isOpen={!!pricingProduct} onClose={() => setPricingProduct(null)} product={pricingProduct} token={localStorage.getItem('aps_token')} onProductUpdated={handleProductUpdated} />
      <AnalyticsForecastModal isOpen={!!forecastProduct} onClose={() => setForecastProduct(null)} product={forecastProduct} token={localStorage.getItem('aps_token')} />
    </div>
  );
};

export default ProductsView;
