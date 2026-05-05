import React, { useState, useEffect } from 'react';
import { X, TrendingUp, AlertTriangle, Loader2, BarChart2, DollarSign, Package } from 'lucide-react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const AnalyticsForecastModal = ({ isOpen, onClose, product, token }) => {
  const [forecast, setForecast] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen && product) {
      fetchForecast();
    }
  }, [isOpen, product]);

  const fetchForecast = async () => {
    setIsLoading(true);
    setError(null);
    setForecast(null);
    try {
      const res = await axios.get(`${API_URL}/api/analytics/forecast/${product.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setForecast(res.data.data);
    } catch (err) {
      setError(err.response?.data?.error || "Nie udało się wygenerować prognozy.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || !product) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-slate-900 rounded-sm w-[95vw] max-w-7xl max-h-[90vh] flex flex-col shadow-2xl border border-slate-700 overflow-hidden relative">
        {/* Dekoracyjne Tło */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

        <div className="flex items-center justify-between p-6 border-b border-slate-800 relative z-10">
          <div className="flex items-center">
            <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-sm mr-4">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white uppercase tracking-widest">Nexus AI: Prognoza Popytu</h2>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">EAN: {product.ean} | {product.name}</div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-sm transition-colors text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8 relative z-10 overflow-y-auto custom-scrollbar">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-6" />
              <div className="text-sm font-black text-white uppercase tracking-widest">Inicjalizacja Modeli Gemini 3.1 Pro...</div>
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-2">Analiza stochastyczna trendów rynkowych i historii CRM</div>
            </div>
          ) : error ? (
            <div className="bg-rose-500/10 border border-rose-500/50 p-6 rounded-sm flex items-start">
              <AlertTriangle className="w-6 h-6 text-rose-500 mr-4 shrink-0" />
              <div>
                <h4 className="text-sm font-black text-rose-400 uppercase tracking-widest mb-1">Błąd Estymacji</h4>
                <p className="text-xs text-rose-200">{error}</p>
                <button onClick={fetchForecast} className="mt-4 px-4 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-[10px] font-black uppercase tracking-widest rounded-sm transition-colors">Spróbuj Ponownie</button>
              </div>
            </div>
          ) : forecast ? (
            <div className="space-y-8">
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-sm flex flex-col items-center text-center">
                  <BarChart2 className="w-8 h-8 text-indigo-400 mb-3" />
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Przewidywana Sprzedaż (30 dni)</div>
                  <div className="text-4xl font-black text-white tabular-nums">{forecast.forecastData.predictedSales30Days} <span className="text-lg text-slate-500">szt.</span></div>
                </div>

                <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-sm flex flex-col items-center text-center">
                  <Package className={`w-8 h-8 mb-3 ${forecast.forecastData.recommendedRestock > 0 ? 'text-emerald-400' : 'text-slate-400'}`} />
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Rekomendowane Domówienie</div>
                  <div className={`text-4xl font-black tabular-nums ${forecast.forecastData.recommendedRestock > 0 ? 'text-emerald-400' : 'text-white'}`}>
                    {forecast.forecastData.recommendedRestock > 0 ? `+${forecast.forecastData.recommendedRestock}` : '0'} <span className="text-lg text-slate-500">szt.</span>
                  </div>
                </div>

                <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-sm flex flex-col items-center text-center">
                  <DollarSign className="w-8 h-8 text-amber-400 mb-3" />
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Przewidywany Przychód (30 dni)</div>
                  <div className="text-3xl font-black text-amber-400 tabular-nums">{forecast.forecastData.revenueForecast.toLocaleString()} <span className="text-lg text-amber-700">PLN</span></div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 bg-indigo-500/10 border border-indigo-500/30 p-6 rounded-sm flex flex-col max-h-[400px]">
                  <div className="flex items-center justify-between mb-4 shrink-0">
                    <h3 className="text-xs font-black text-indigo-400 uppercase tracking-widest">Komentarz Analityczny AI</h3>
                    <span className="px-3 py-1 bg-indigo-500/20 text-indigo-300 text-[9px] font-black uppercase tracking-widest rounded-sm">
                      Pewność Algorytmu: {forecast.forecastData.confidenceScore}%
                    </span>
                  </div>
                  <div className="overflow-y-auto pr-4 custom-scrollbar">
                    <p className="text-base font-normal text-slate-200 leading-relaxed tracking-wide">
                      {forecast.forecastData.analyticalCommentary}
                    </p>
                  </div>
                </div>
                
                <div className="md:col-span-1 bg-slate-800/50 border border-slate-700 p-6 rounded-sm">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Co Było Analizowane?</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500">Stan Magazynowy:</span>
                      <span className="text-slate-300 font-bold">{forecast.contextUsed.stock} szt.</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500">Aktualna Cena:</span>
                      <span className="text-slate-300 font-bold">{forecast.contextUsed.salePrice} PLN</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500">Zidentyfikowane Koszty (True Cost):</span>
                      <span className="text-rose-400 font-bold">{forecast.contextUsed.trueCost} PLN</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500">Zysk jednostkowy (Netto):</span>
                      <span className="text-emerald-400 font-bold">{forecast.contextUsed.profitNetto} PLN ({forecast.contextUsed.marginPercent}%)</span>
                    </div>
                    <div className="flex justify-between items-center text-xs border-t border-slate-700 pt-3">
                      <span className="text-slate-500">Powiązane Deale (Influencerzy):</span>
                      <span className="text-indigo-400 font-bold">{forecast.contextUsed.dealsCount}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500">Powiązane Kampanie:</span>
                      <span className="text-indigo-400 font-bold">{forecast.contextUsed.campaignsCount}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500">Średni miesięczny popyt (ost. 90 dni):</span>
                      <span className="text-emerald-400 font-bold">{forecast.contextUsed.recentSales} szt.</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500">Zwiad Sieciowy (Web Grounding):</span>
                      <span className="text-indigo-400 font-bold">{forecast.contextUsed.webGroundingActive ? 'AKTYWNY' : 'Brak'}</span>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          ) : null}
        </div>
        
        {/* Stopka */}
        <div className="bg-slate-950 p-4 border-t border-slate-800 text-center">
           <span className="text-[9px] font-black text-slate-600 uppercase tracking-[0.3em]">Powered by Google Gemini 3.1 Pro Engine</span>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsForecastModal;
