import React, { useState, useEffect } from 'react';
import { X, Calculator, ArrowRight, Save, Zap, AlertTriangle, Search } from 'lucide-react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? window.location.origin : 'http://localhost:3001');

const PricingCalculatorDrawer = ({ isOpen, onClose, product, token, onProductUpdated }) => {
  const [targetMargin, setTargetMargin] = useState(product?.targetMargin || 0.20);
  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState(null);
  const [recommendation, setRecommendation] = useState(null);

  useEffect(() => {
    if (product && isOpen) {
      setTargetMargin(product.targetMargin || 0.20);
      setError(null);
    }
  }, [product, isOpen]);

  if (!isOpen || !product) return null;

  const trueCost = (product.basePrice || 0) + 
                   (product.inboundTransportCost || 0) + 
                   (product.packagingCost || 0) + 
                   (product.bdoEprCost || 0) + 
                   (product.outboundTransportCost || 0) +
                   (product.aiImageCost || 0);

  const handleRecalculate = async () => {
    setIsCalculating(true);
    setError(null);
    try {
      // Oszustwo wizualne - my wyślemy update samej marży, a potem każemy backendowi przeliczyć
      // Aktualizacja marży i BDO (na wypadek gdyby zostało wyliczone z BOM)
      await axios.patch(`${API_URL}/api/products/${product.id}`, {
        targetMargin: targetMargin,
        bdoEprCost: product.bdoEprCost
      }, { headers: { Authorization: `Bearer ${token}` }});

      // Wywołanie przeliczenia
      const res = await axios.post(`${API_URL}/api/pricing/recalculate/${product.id}`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      onProductUpdated(res.data.data);
    } catch (err) {
      setError(err.response?.data?.error || "Błąd podczas wyliczania.");
    } finally {
      setIsCalculating(false);
    }
  };

  const handleApplyProposedPrice = async () => {
    if (!product.proposedSalePrice) return;
    try {
      const res = await axios.put(`${API_URL}/api/products/${product.id}`, {
        salePrice: product.proposedSalePrice
      }, { headers: { Authorization: `Bearer ${token}` }});
      
      onProductUpdated(res.data);
      onClose();
    } catch (err) {
      setError("Nie udało się zaktualizować głównej ceny.");
    }
  };

  const handleGetRecommendation = async () => {
    try {
      const vatRate = (product.taxRate || 23) / 100;
      const commissionRate = 0.12;
      const denominator = ((1 - targetMargin) / (1 + vatRate)) - commissionRate;
      
      if (denominator <= 0) {
        setError("Marża docelowa i koszty platformy przekraczają dopuszczalny próg rentowności.");
        return;
      }
      
      const recommendedSalePrice = trueCost / denominator;
      const safePriceLevel = trueCost / (((1 - 0.05) / (1 + vatRate)) - commissionRate); // Safety at 5% margin
      
      let riskLevel = 'LOW';
      let message = 'Cena jest bezpieczna. Pokrywa wszystkie koszty, VAT i prowizję Allegro (12%).';
      
      if (product.salePrice < safePriceLevel * 0.9) {
          riskLevel = 'HIGH';
          message = 'KRYTYCZNE: Cena sprzedaży prowadzi do strat. Prowizja i VAT zjedzą przychód!';
      } else if (product.salePrice < safePriceLevel) {
          riskLevel = 'MEDIUM';
          message = 'OSTRZEŻENIE: Zbliżasz się do granicy opłacalności (poniżej 5% netto).';
      }

      setRecommendation({
         trueCost,
         recommendedSalePrice,
         riskLevel,
         message
      });
      setError(null);
    } catch (err) {
      setError("Błąd algorytmu oceny ryzyka.");
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-[0_0_60px_rgba(0,0,0,0.1)] z-50 flex flex-col transform transition-transform duration-300">
      <div className="flex items-center justify-between p-6 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center text-slate-800">
          <Calculator className="w-5 h-5 mr-3 text-indigo-600" />
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest">Kalkulator AlgoPricing</h2>
            <div className="text-[10px] font-bold text-slate-500 truncate max-w-[250px] uppercase">{product.name}</div>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-sm transition-colors text-slate-500">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
        
        {/* Koszty */}
        <div>
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Struktura True Cost (PLN)</h3>
          <div className="bg-slate-50 border border-slate-200 rounded-sm p-4 space-y-3 font-mono text-sm font-bold text-slate-700">
            <div className="flex justify-between"><span>Cena Zakupu (IDP):</span> <span>{product.basePrice?.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>Transport Inbound (Cła/IDP):</span> <span>{product.inboundTransportCost?.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>Koszt Pakowania:</span> <span>{product.packagingCost?.toFixed(2)}</span></div>
            <div className="flex justify-between text-emerald-600"><span>Podatki BDO / Śmieci:</span> <span>{product.bdoEprCost?.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>Logistyka Out:</span> <span>{product.outboundTransportCost?.toFixed(2)}</span></div>
            <div className="flex justify-between text-slate-400 text-[10px]"><span>Amortyzacja sesji AI:</span> <span>{product.aiImageCost?.toFixed(2)}</span></div>
            <div className="flex justify-between pt-3 border-t border-slate-300 text-slate-900 font-black">
              <span>Suma True Cost:</span> <span>{trueCost.toFixed(2)} PLN</span>
            </div>
          </div>
        </div>

        {/* Ustawienia Marży */}
        <div>
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex justify-between">
            <span>Sterowanie Marżą (%)</span>
            <span className="text-indigo-600">{(targetMargin * 100).toFixed(0)}%</span>
          </h3>
          <input 
            type="range" 
            min="0.01" max="0.80" step="0.01" 
            value={targetMargin} 
            onChange={e => setTargetMargin(parseFloat(e.target.value))}
            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
          />
          <div className="flex justify-between text-[9px] font-bold text-slate-400 uppercase mt-2">
            <span>1%</span>
            <span>Platforma zabiera ok. 12%</span>
            <span>80%</span>
          </div>

          {product.pricingAlert && (
            <div className="mt-4 p-4 bg-amber-50 border-l-4 border-amber-500 rounded-sm shadow-sm flex items-start">
              <Zap className="w-5 h-5 text-amber-500 mr-3 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-[10px] font-black text-amber-800 uppercase tracking-widest mb-1">Alert Dynamic Pricing</h4>
                <p className="text-xs text-amber-900 font-medium leading-relaxed">{product.pricingAlert}</p>
                {product.dynamicMarginUsed && (
                  <p className="text-[10px] font-bold text-amber-700 mt-2">Zastosowano całkowitą marżę ochronną: {(product.dynamicMarginUsed * 100).toFixed(0)}%</p>
                )}
              </div>
            </div>
          )}

          {error && <div className="mt-4 p-3 bg-rose-50 text-rose-600 text-xs font-bold rounded-sm border border-rose-200 flex"><AlertTriangle className="w-4 h-4 mr-2 shrink-0"/> {error}</div>}

          {recommendation && (
            <div className={`mt-4 p-4 rounded-sm shadow-sm flex items-start border-l-4 ${recommendation.riskLevel === 'HIGH' ? 'bg-rose-50 border-rose-500' : (recommendation.riskLevel === 'MEDIUM' ? 'bg-amber-50 border-amber-500' : 'bg-emerald-50 border-emerald-500')}`}>
              <Zap className={`w-5 h-5 mr-3 shrink-0 mt-0.5 ${recommendation.riskLevel === 'HIGH' ? 'text-rose-500' : (recommendation.riskLevel === 'MEDIUM' ? 'text-amber-500' : 'text-emerald-500')}`} />
              <div>
                <h4 className="text-[10px] font-black uppercase tracking-widest mb-1 text-slate-800">Analiza Ryzyka (Unit Economics)</h4>
                <p className="text-xs text-slate-700 font-medium leading-relaxed">{recommendation.message}</p>
                <div className="text-[10px] font-bold text-slate-500 mt-2">Sugerowana bezpieczna cena: {recommendation.recommendedSalePrice.toFixed(2)} PLN</div>
              </div>
            </div>
          )}

          <div className="mt-6 flex space-x-2">
            <button 
              onClick={handleGetRecommendation}
              className="flex-1 py-3 bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-black uppercase tracking-widest rounded-sm hover:bg-indigo-100 transition-colors flex justify-center items-center"
            >
              Audyt Ryzyka <Search className="w-4 h-4 ml-2" />
            </button>
            <button 
              onClick={handleRecalculate}
              disabled={isCalculating}
              className="flex-1 py-3 bg-slate-900 text-white text-[11px] font-black uppercase tracking-widest rounded-sm hover:bg-slate-800 transition-colors flex justify-center items-center"
            >
              {isCalculating ? 'Kalkulacja...' : 'Wylicz Ofertę'} <Zap className="w-4 h-4 ml-2" />
            </button>
          </div>
        </div>

        {/* Wyniki */}
        {product.proposedSalePrice != null && (
          <div className="pt-8 border-t border-slate-200">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Wynik Optymalizacji</h3>
            
            <div className="flex items-center justify-between mb-6">
              <div className="text-center">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Obecna Cena</div>
                <div className="text-xl font-black text-slate-800 tabular-nums">{product.salePrice?.toFixed(2)}</div>
              </div>
              <ArrowRight className="w-6 h-6 text-slate-300" />
              <div className="text-center">
                <div className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mb-1">Sugerowana</div>
                <div className="text-3xl font-black text-emerald-600 tabular-nums">{product.proposedSalePrice.toFixed(2)}</div>
              </div>
            </div>

            <button 
              onClick={handleApplyProposedPrice}
              className="w-full py-4 bg-emerald-50 border-2 border-emerald-500 text-emerald-700 text-xs font-black uppercase tracking-widest rounded-sm hover:bg-emerald-500 hover:text-white transition-all flex justify-center items-center group"
            >
              Nadpisz Główną Cenę <Save className="w-4 h-4 ml-2 group-hover:scale-110 transition-transform" />
            </button>
            <p className="text-[9px] text-center text-slate-400 font-bold uppercase tracking-widest mt-3">Ta akcja zmieni cenę w PIM. (Nie wypycha do zewnętrznych platform)</p>
          </div>
        )}

      </div>
    </div>
  );
};

export default PricingCalculatorDrawer;
