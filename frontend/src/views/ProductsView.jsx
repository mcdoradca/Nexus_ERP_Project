import React from 'react';
import { Target, Plus, Cloud, CloudLightning, ArrowRight } from 'lucide-react';

const ProductsView = ({
  products,
  currentUser,
  setIsNewBrandModalOpen,
  setIsNewProductModalOpen
}) => {
  const isAdmin = currentUser?.role === 'ADMIN';
  
  return (
    <div className="flex-1 flex flex-col p-10 bg-[#f8fafc] h-full w-full relative min-h-0 overflow-hidden">
      <div className="flex items-center justify-between mb-10 shrink-0">
        <div>
          <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Katalog SKU</h2>
          <p className="text-sm text-slate-500 font-bold uppercase tracking-widest mt-1">Product Information Management & Unit Economics</p>
        </div>
        <div className="flex space-x-4">
          {isAdmin && (
            <>
              <button onClick={() => setIsNewBrandModalOpen(true)} className="px-6 py-3 bg-white border border-slate-200 text-slate-700 rounded-sm text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 shadow-sm flex items-center group transition-all">
                <Target className="w-4 h-4 mr-3 text-indigo-500 group-hover:scale-110 transition-transform" /> Dodaj Markę
              </button>
              <button onClick={() => setIsNewProductModalOpen(true)} className="px-8 py-3 bg-slate-900 text-white rounded-sm text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 shadow-2xl flex items-center transition-all">
                <Plus className="w-4 h-4 mr-3" /> Nowe SKU
              </button>
            </>
          )}
        </div>
      </div>

      <div className="bg-white rounded-[3rem] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.08)] border border-slate-200/50 flex-1 flex flex-col min-h-0 overflow-hidden relative">
        <div className="p-0 overflow-auto custom-scrollbar flex-1">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50/80 sticky top-0 z-10 border-b border-slate-100 backdrop-blur-xl">
              <tr>
                <th className="p-8 font-black uppercase tracking-[0.2em] text-[10px] text-slate-400">Identyfikacja Produkty</th>
                <th className="p-8 font-black uppercase tracking-[0.2em] text-[10px] text-slate-400 text-center">Status PIM</th>
                <th className="p-8 font-black uppercase tracking-[0.2em] text-[10px] text-slate-400">Marka</th>
                <th className="p-8 font-black uppercase tracking-[0.2em] text-[10px] text-slate-400 text-center">Stock</th>
                <th className="p-8 font-black uppercase tracking-[0.2em] text-[10px] text-slate-400 text-center">API Sync</th>
                {isAdmin && (
                  <>
                    <th className="p-8 font-black uppercase tracking-[0.2em] text-[10px] text-slate-400">Struktura Kosztów</th>
                    <th className="p-8 font-black uppercase tracking-[0.2em] text-[10px] text-slate-400 text-right">Analiza Unit Econ.</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {products.map(p => {
                const tc = p.basePrice + p.inboundTransportCost + p.packagingCost + p.bdoEprCost + p.outboundTransportCost;
                const margin = p.salePrice - tc;
                return (
                  <tr key={p.id} className="hover:bg-slate-50/50 transition-all group">
                    <td className="p-8">
                      <div className="font-mono text-[9px] font-black text-slate-400 tracking-wider mb-1 uppercase">{p.ean || 'BRAK EAN'}</div>
                      <div className="font-black text-slate-900 text-sm uppercase tracking-tight group-hover:text-indigo-600 transition-colors">{p.name}</div>
                      <div className="text-[10px] font-bold text-slate-400 mt-1 uppercase">SKU: {p.sku}</div>
                    </td>
                    <td className="p-8 text-center">
                      <span className={`text-[9px] font-black px-4 py-1.5 rounded-sm uppercase tracking-widest ${p.status === 'Aktywny' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>{p.status}</span>
                    </td>
                    <td className="p-8">
                      <div className="inline-flex items-center px-4 py-2 bg-indigo-50/50 text-indigo-700 rounded-sm text-[10px] font-black uppercase tracking-tighter border border-indigo-100/50">
                        <Target className="w-3 h-3 mr-2" /> {p.brand?.name || 'Bez Marki'}
                      </div>
                    </td>
                    <td className="p-8 text-center">
                      <div className="font-black text-slate-800 text-lg tabular-nums tracking-tighter">{p.stock}</div>
                      <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">Sztuk</div>
                    </td>
                    <td className="p-8 text-center">
                      <div className="flex items-center justify-center space-x-3">
                        <div className={`p-2 rounded-sm border ${p.subiektId ? 'bg-emerald-50 border-emerald-100 text-emerald-600 shadow-lg shadow-emerald-500/10' : 'bg-slate-50 border-slate-100 text-slate-300 opacity-30 grayscale'}`}>
                          <Cloud className="w-5 h-5" />
                        </div>
                        <div className={`p-2 rounded-sm border ${p.baselinkerId ? 'bg-blue-50 border-blue-100 text-blue-600 shadow-lg shadow-blue-500/10' : 'bg-slate-50 border-slate-100 text-slate-300 opacity-30 grayscale'}`}>
                          <CloudLightning className="w-5 h-5" />
                        </div>
                      </div>
                    </td>
                    {isAdmin && (
                      <>
                        <td className="p-8">
                          <div className="flex items-center justify-between text-[10px] mb-1">
                            <span className="font-black text-slate-400 uppercase tracking-widest">Koszty Zakupu:</span>
                            <span className="font-bold text-slate-700 tabular-nums">{p.basePrice.toFixed(2)} zł</span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden mb-2">
                             <div className="h-full bg-slate-400" style={{ width: `${(tc/p.salePrice)*100}%` }}></div>
                          </div>
                          <div className="text-[11px] font-black text-slate-900 tabular-nums">TC: {tc.toFixed(2)} zł</div>
                        </td>
                        <td className="p-8 text-right">
                          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Profitability</div>
                          <div className={`text-xl font-black tabular-nums tracking-tighter ${margin > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {margin > 0 ? '+' : ''}{margin.toFixed(2)} zł
                          </div>
                          <div className={`text-[10px] font-black uppercase ${margin > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {((margin / p.salePrice) * 100).toFixed(1)}% Marży
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
        
        <div className="p-8 bg-slate-50/50 border-t border-slate-100 shrink-0 flex justify-between items-center">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Łącznie produktów: {products.length}</span>
          <div className="flex space-x-2">
             <button className="p-2 bg-white border border-slate-200 rounded-sm text-slate-400 hover:text-indigo-600 shadow-sm transition-all"><ArrowRight className="w-4 h-4 rotate-180" /></button>
             <button className="px-5 py-2 bg-slate-900 text-white rounded-sm text-[10px] font-black uppercase tracking-widest shadow-xl">1 – 10</button>
             <button className="p-2 bg-white border border-slate-200 rounded-sm text-slate-400 hover:text-indigo-600 shadow-sm transition-all"><ArrowRight className="w-4 h-4" /></button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductsView;
