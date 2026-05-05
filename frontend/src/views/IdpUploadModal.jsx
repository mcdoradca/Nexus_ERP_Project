import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, X, Loader2, FileText, CheckCircle2 } from 'lucide-react';
import axios from 'axios';

const API_URL = import.meta.env.PROD ? '' : 'http://localhost:3001';

const IdpUploadModal = ({ isOpen, onClose, token }) => {
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [invoicesHistory, setInvoicesHistory] = useState([]);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
      setFile(null);
      setResult(null);
      setError(null);
    }
  }, [isOpen]);

  const fetchHistory = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/idp/invoices`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setInvoicesHistory(res.data);
    } catch (err) {
      console.error("Failed to fetch invoices", err);
    }
  };

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected && selected.type === 'application/pdf') {
      setFile(selected);
      setError(null);
    } else {
      setError("Dozwolone są tylko pliki PDF.");
      setFile(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setIsUploading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append('invoice', file);

    try {
      const res = await axios.post(`${API_URL}/api/idp/process-invoice`, formData, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      setResult(res.data.data);
      fetchHistory();
    } catch (err) {
      setError(err.response?.data?.error || "Wystąpił błąd podczas analizy AI.");
    } finally {
      setIsUploading(false);
      setFile(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-sm w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div>
            <h2 className="text-xl font-black text-slate-800 uppercase tracking-widest">IDP: Skaner Kosztów</h2>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Inteligentne Przetwarzanie Dokumentów PDF</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-sm transition-colors text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* Lewa kolumna: Upload */}
          <div className="flex flex-col space-y-6">
            <div 
              className={`border-2 border-dashed rounded-sm p-10 flex flex-col items-center justify-center text-center transition-all ${file ? 'border-indigo-400 bg-indigo-50/30' : 'border-slate-300 bg-slate-50 hover:border-slate-400 cursor-pointer'}`}
              onClick={() => !file && fileInputRef.current?.click()}
            >
              <input type="file" accept="application/pdf" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
              
              {!file ? (
                <>
                  <UploadCloud className="w-12 h-12 text-slate-400 mb-4" />
                  <p className="text-sm font-bold text-slate-700">Przeciągnij fakturę PDF lub <span className="text-indigo-600">przeglądaj</span></p>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-2">Maksymalnie 20 MB</p>
                </>
              ) : (
                <>
                  <FileText className="w-12 h-12 text-indigo-500 mb-4" />
                  <p className="text-sm font-black text-slate-800 truncate max-w-full px-4">{file.name}</p>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-2">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  <button onClick={() => setFile(null)} className="mt-4 text-[10px] font-black uppercase text-rose-500 tracking-widest">Usuń plik</button>
                </>
              )}
            </div>

            {error && (
              <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 text-sm font-bold rounded-sm">
                {error}
              </div>
            )}

            <button 
              onClick={handleUpload}
              disabled={!file || isUploading}
              className={`w-full py-4 rounded-sm font-black uppercase tracking-widest text-[11px] shadow-xl flex items-center justify-center transition-all ${!file || isUploading ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-slate-900 text-white hover:bg-slate-800 hover:scale-[1.02] active:scale-95'}`}
            >
              {isUploading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> AI Przetwarza (Może zająć minutę)...</>
              ) : (
                'Rozpocznij Ekstrakcję Kosztów'
              )}
            </button>

            {result && (
              <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-sm">
                <div className="flex items-center text-emerald-700 mb-4">
                  <CheckCircle2 className="w-5 h-5 mr-2" />
                  <span className="font-black uppercase tracking-widest text-sm">Sukces Ekstrakcji</span>
                </div>
                <div className="space-y-2 text-sm font-bold text-slate-700">
                  <div className="flex justify-between border-b border-emerald-100 pb-2">
                    <span>Odczytane pozycje:</span>
                    <span className="font-black text-emerald-700">{result.processedItems}</span>
                  </div>
                  <div className="flex justify-between border-b border-emerald-100 pb-2">
                    <span>Zaktualizowane w Bazie:</span>
                    <span className="font-black text-emerald-700">{result.updatedProductsCount}</span>
                  </div>
                </div>
                {result.items && result.items.length > 0 && (
                  <div className="mt-4">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 block mb-2">Rozpoznane EAN-y:</span>
                    <div className="flex flex-wrap gap-2">
                      {result.items.map((i, idx) => (
                        <span key={idx} className="px-2 py-1 bg-white border border-emerald-200 text-emerald-700 text-[10px] font-black rounded-sm">{i.ean}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Prawa kolumna: Archiwum Dokumentów */}
          <div className="flex flex-col bg-slate-50 rounded-sm border border-slate-200 p-6">
            <h3 className="text-[11px] font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center">
              <FileText className="w-4 h-4 mr-2 text-slate-500" /> Archiwum IDP
            </h3>
            
            <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
              {invoicesHistory.length === 0 ? (
                <div className="text-center text-slate-400 text-sm font-bold mt-10">
                  Brak wgranych dokumentów.
                </div>
              ) : (
                invoicesHistory.map(inv => (
                  <div key={inv.id} className="bg-white border border-slate-300 p-3 rounded-sm flex items-start justify-between hover:border-indigo-300 transition-colors">
                    <div className="flex items-start space-x-3 overflow-hidden">
                      <div className="p-2 bg-indigo-50 text-indigo-500 rounded-sm shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <a href={`${API_URL}${inv.fileUrl}`} target="_blank" rel="noopener noreferrer" className="text-xs font-black text-slate-800 truncate block hover:text-indigo-600 transition-colors">
                          {inv.fileName}
                        </a>
                        <div className="text-[9px] font-bold text-slate-500 mt-1 uppercase tracking-widest flex items-center">
                          {new Date(inv.uploadedAt).toLocaleString()} • {inv.uploader?.name || 'System'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default IdpUploadModal;
