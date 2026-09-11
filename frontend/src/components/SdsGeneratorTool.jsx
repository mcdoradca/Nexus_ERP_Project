import React, { useState, useRef } from 'react';
import axios from 'axios';
import { Upload, FileText, Loader2, CheckCircle, ShieldAlert, Sparkles, DownloadCloud, AlertTriangle, UserPlus, Eye, Check } from 'lucide-react';

const SdsGeneratorTool = ({ token, API_URL }) => {
    const [file, setFile] = useState(null);
    const [productName, setProductName] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);
    
    // HITL States
    const [anomalies, setAnomalies] = useState([]);
    const [isInvestigating, setIsInvestigating] = useState(false);
    const [investigatorResult, setInvestigatorResult] = useState(null);
    
    const fileInputRef = useRef(null);

    const handleFileSelect = (e) => {
        const selected = e.target.files[0];
        if (selected && selected.type === 'application/pdf') {
            setFile(selected);
            setError(null);
            setSuccess(false);
            if (!productName) {
                setProductName(selected.name.replace('.pdf', ''));
            }
        } else {
            setError('Proszę wybrać prawidłowy plik PDF.');
        }
    };

    const handleGenerate = async () => {
        if (!file) return;
        
        setIsProcessing(true);
        setError(null);
        setSuccess(false);
        setAnomalies([]);
        setInvestigatorResult(null);

        const formData = new FormData();
        formData.append('sdsFile', file);
        formData.append('productName', productName);

        try {
            const response = await axios.post(`${API_URL}/api/sds/process`, formData, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'multipart/form-data'
                },
                responseType: 'blob' // Wymagane przy pobieraniu plików Binarnych!
            });

            // Wymuszenie pobrania
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Karta_Charakterystyki_${productName || 'PL'}.docx`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            setSuccess(true);
        } catch (err) {
            console.error(err);
            // Wyłuskiwanie bledu z bloba
            if (err.response && err.response.data && err.response.data instanceof Blob) {
                const text = await err.response.data.text();
                try {
                    const json = JSON.parse(text);
                    if (err.response && err.response.status === 422 && json.requiresHITL) {
                        setAnomalies(json.anomalies || []);
                        setError('Wykryto anomalie. Wymagana interwencja eksperta (HITL).');
                    } else {
                        setError(json.error || 'Wystąpił błąd podczas generowania karty SDS.');
                    }
                } catch(e) {
                    setError('Błąd krytyczny serwera.');
                }
            } else {
                setError('Nie można połączyć się z serwerem. Sprawdź logi.');
            }
        } finally {
            setIsProcessing(false);
        }
    };

    const handleInvestigate = async () => {
        setIsInvestigating(true);
        try {
            const response = await axios.post(`${API_URL}/api/sds/investigate-cas`, { anomalies }, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setInvestigatorResult(response.data);
        } catch (err) {
            console.error(err);
            setError('Agent śledczy napotkał problem.');
        } finally {
            setIsInvestigating(false);
        }
    };

    const handleResume = async () => {
        if (!file || !investigatorResult) return;
        setIsProcessing(true);
        setError(null);
        setSuccess(false);

        const formData = new FormData();
        formData.append('sdsFile', file);
        formData.append('productName', productName);
        formData.append('manualOverrides', JSON.stringify(investigatorResult.proposedOverrides || {}));

        try {
            const response = await axios.post(`${API_URL}/api/sds/resume-process`, formData, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'multipart/form-data'
                },
                responseType: 'blob'
            });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Karta_Charakterystyki_PL_${productName || 'WZNOWIONA'}.docx`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            setSuccess(true);
            setAnomalies([]);
            setInvestigatorResult(null);
        } catch (err) {
            console.error(err);
            setError('Błąd podczas wznowienia procesu.');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="flex-1 overflow-auto bg-slate-50 p-8 custom-scrollbar">
            <div className="max-w-4xl mx-auto space-y-8">
                
                {/* HEAD */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 flex items-start gap-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 opacity-60"></div>
                    
                    <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-indigo-200 relative z-10">
                        <FileText className="w-8 h-8 text-white" />
                    </div>
                    
                    <div className="relative z-10">
                        <h1 className="text-2xl font-black text-slate-800 tracking-tight">Generator Kart SDS (UE 2020/878)</h1>
                        <p className="text-sm font-medium text-slate-500 mt-2 max-w-2xl leading-relaxed">
                            Autonomiczny procesor hybrydowy (Agent AI + Deterministyczny Silnik Node.js). 
                            Prześlij oryginalną kartę w języku włoskim (PDF), aby wygenerować edytowalną polską wersję DOCX
                            zawierającą kwarantannę prawną oraz wygenerowane lokalnie piktogramy GHS.
                        </p>
                    </div>
                </div>

                {/* WORKSPACE */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    
                    {/* LEFT: UPLOAD & CONFIG */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest flex items-center mb-6">
                                <Upload className="w-4 h-4 mr-2 text-indigo-600" /> Wgrywanie Źródła
                            </h3>
                            
                            <div className="space-y-5">
                                <div>
                                    <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2">Nazwa Handlowa Produktu</label>
                                    <input 
                                        type="text" 
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                                        placeholder="np. SGRASSANTE EXTRA UNIVERSAL"
                                        value={productName}
                                        onChange={(e) => setProductName(e.target.value)}
                                        disabled={isProcessing}
                                    />
                                </div>
                                
                                <div 
                                    onClick={() => !isProcessing && fileInputRef.current?.click()}
                                    className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${file ? 'border-indigo-400 bg-indigo-50/50' : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50'} ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    <input 
                                        type="file" 
                                        ref={fileInputRef} 
                                        className="hidden" 
                                        accept="application/pdf"
                                        onChange={handleFileSelect}
                                    />
                                    
                                    {file ? (
                                        <>
                                            <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mb-3 text-indigo-600">
                                                <CheckCircle className="w-6 h-6" />
                                            </div>
                                            <p className="text-sm font-bold text-slate-700">{file.name}</p>
                                            <p className="text-xs font-medium text-slate-500 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB • Gotowy do przetworzenia</p>
                                        </>
                                    ) : (
                                        <>
                                            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-3 text-slate-400">
                                                <Upload className="w-6 h-6" />
                                            </div>
                                            <p className="text-sm font-bold text-slate-700">Kliknij, aby wybrać plik PDF</p>
                                            <p className="text-xs font-medium text-slate-500 mt-1">Akceptowane tylko oryginalne włoskie formaty PDF</p>
                                        </>
                                    )}
                                </div>

                                {error && (
                                    <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                                        <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                                        <div>
                                            <h4 className="text-xs font-bold text-red-800 uppercase tracking-widest">Błąd Operacji</h4>
                                            <p className="text-sm font-medium text-red-700 mt-0.5">{error}</p>
                                        </div>
                                    </div>
                                )}

                                {anomalies.length > 0 && (
                                    <div className="p-5 bg-amber-50 border border-amber-300 rounded-xl space-y-4">
                                        <div className="flex items-start gap-3">
                                            <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0" />
                                            <div>
                                                <h4 className="text-sm font-bold text-amber-900 uppercase tracking-widest">Zatrzymanie Ochronne (HITL)</h4>
                                                <p className="text-sm text-amber-800 mt-1">Proces został wstrzymany ze względu na błędy parsowania lub brakujące dane w bazach. Wymagana interwencja.</p>
                                            </div>
                                        </div>
                                        <ul className="list-disc pl-10 text-sm font-medium text-amber-900 space-y-1">
                                            {anomalies.map((a, idx) => (
                                                <li key={idx}><strong>{a.type}</strong>: {a.message} (CAS: {a.cas || 'Brak'})</li>
                                            ))}
                                        </ul>
                                        
                                        {!investigatorResult ? (
                                            <button 
                                                onClick={handleInvestigate}
                                                disabled={isInvestigating}
                                                className="w-full mt-2 py-3 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white rounded-lg text-sm font-bold uppercase tracking-wider flex justify-center items-center transition-colors"
                                            >
                                                {isInvestigating ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Odpytywanie Apify / Gemini...</> : <><UserPlus className="w-5 h-5 mr-2" /> Uruchom Agenta Śledczego (ECHA/PubChem)</>}
                                            </button>
                                        ) : (
                                            <div className="bg-white p-4 rounded-lg border border-amber-200 mt-4">
                                                <h5 className="text-xs font-bold text-slate-800 uppercase mb-2 flex items-center"><Eye className="w-4 h-4 mr-2 text-indigo-600" /> Raport Agenta Śledczego</h5>
                                                <p className="text-sm text-slate-600 mb-3">{investigatorResult.agentNote}</p>
                                                <pre className="bg-slate-50 p-3 rounded text-xs overflow-auto max-h-40 border border-slate-100 mb-3">
                                                    {JSON.stringify(investigatorResult.proposedOverrides, null, 2)}
                                                </pre>
                                                <button 
                                                    onClick={handleResume}
                                                    disabled={isProcessing}
                                                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold uppercase tracking-wider flex justify-center items-center transition-colors"
                                                >
                                                    {isProcessing ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Check className="w-5 h-5 mr-2" />}
                                                    Zatwierdzam i Wznów Generowanie
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                                
                                {success && (
                                    <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3">
                                        <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                                        <div>
                                            <h4 className="text-xs font-bold text-emerald-800 uppercase tracking-widest">Sukces</h4>
                                            <p className="text-sm font-medium text-emerald-700 mt-0.5">Karta SDS (Word DOCX) została pomyślnie wygenerowana i pobrana.</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <button 
                                onClick={handleGenerate}
                                disabled={!file || isProcessing || !productName}
                                className="px-8 py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:text-slate-500 text-white rounded-xl text-sm font-black uppercase tracking-widest transition-all shadow-lg shadow-indigo-200 flex items-center"
                            >
                                {isProcessing ? (
                                    <><Loader2 className="w-5 h-5 mr-3 animate-spin" /> Analizowanie AI...</>
                                ) : (
                                    <><Sparkles className="w-5 h-5 mr-3" /> Generuj DOCX</>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* RIGHT: RULES */}
                    <div className="space-y-6">
                        <div className="bg-slate-800 rounded-2xl shadow-lg p-6 text-white relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-4 opacity-10">
                                <ShieldAlert className="w-32 h-32" />
                            </div>
                            <h3 className="text-xs font-black text-indigo-300 uppercase tracking-widest mb-4 relative z-10">Tarcza Prawna</h3>
                            <ul className="space-y-4 text-sm font-medium text-slate-300 relative z-10">
                                <li className="flex items-start">
                                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-2 mr-3 shrink-0"></div>
                                    <p>Sekcje <strong className="text-white">1.4, 8, 13, 15</strong> nie są tłumaczone przez AI - są zastępowane polskimi, aktualnymi normami prawnymi (Baza NDS, Ustawy RP).</p>
                                </li>
                                <li className="flex items-start">
                                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-2 mr-3 shrink-0"></div>
                                    <p>Piktogramy GHS są dynamicznie generowane jako obrazy <strong className="text-white">Pure PNG</strong> osadzane bezpośrednio w DOCX, gwarantując integralność wizualną.</p>
                                </li>
                                <li className="flex items-start">
                                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-2 mr-3 shrink-0"></div>
                                    <p>Wygenerowany plik zachowuje <strong className="text-white">Protokół Żółty</strong> (Quarantine Audit) sygnalizując Ekspertowi sekcje do obowiązkowej weryfikacji.</p>
                                </li>
                            </ul>
                        </div>
                        
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col items-center justify-center text-center">
                            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mb-3 text-emerald-600">
                                <DownloadCloud className="w-6 h-6" />
                            </div>
                            <h4 className="text-sm font-bold text-slate-800">100% Zgodność</h4>
                            <p className="text-xs font-medium text-slate-500 mt-2 leading-relaxed">
                                System wykorzystuje rozporządzenie UE 2020/878, gwarantując odpowiednią paginację oraz nagłówki w dokumencie Word.
                            </p>
                        </div>
                    </div>
                    
                </div>
            </div>
        </div>
    );
};

export default SdsGeneratorTool;
