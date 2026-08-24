import React, { useState, useRef } from 'react';
import axios from 'axios';
import { Upload, Image as ImageIcon, Download, Loader2, Maximize2, Settings2 } from 'lucide-react';

const ItalianFrameTool = ({ token, API_URL }) => {
    const [file, setFile] = useState(null);
    const [preview, setPreview] = useState(null);
    const [processedImage, setProcessedImage] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [borderThickness, setBorderThickness] = useState(6);
    const [lightboxUrl, setLightboxUrl] = useState(null);
    const fileInputRef = useRef(null);

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile) {
            setFile(selectedFile);
            setPreview(URL.createObjectURL(selectedFile));
            setProcessedImage(null);
        }
    };

    const processImage = async () => {
        if (!file) return;
        setIsProcessing(true);
        const formData = new FormData();
        formData.append('image', file);
        formData.append('borderThickness', borderThickness);

        try {
            const response = await axios.post(`${API_URL}/api/offer-optimizer/italian-frame`, formData, {
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'multipart/form-data'
                },
                responseType: 'blob'
            });

            const processedUrl = URL.createObjectURL(response.data);
            setProcessedImage(processedUrl);
        } catch (error) {
            console.error("Błąd przetwarzania:", error);
            alert("Nie udało się nałożyć ramki.");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDownload = () => {
        if (!processedImage) return;
        const a = document.createElement('a');
        a.href = processedImage;
        const originalName = file.name;
        a.download = `framed_${originalName}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    return (
        <div className="flex-1 p-6 overflow-y-auto">
            {lightboxUrl && (
                <div className="fixed inset-0 bg-slate-900/90 z-[300] flex items-center justify-center p-4 backdrop-blur-md cursor-pointer" onClick={() => setLightboxUrl(null)}>
                    <img src={lightboxUrl} className="max-w-[90vw] max-h-[90vh] object-contain rounded-sm shadow-2xl" alt="Powiększenie" />
                </div>
            )}

            <div className="max-w-4xl mx-auto bg-white rounded-sm shadow-sm border border-slate-200 overflow-hidden">
                <div className="border-b border-slate-200 bg-slate-50 p-6 flex justify-between items-center">
                    <div>
                        <h2 className="text-lg font-bold text-slate-800 flex items-center">
                            <ImageIcon className="w-5 h-5 mr-2 text-indigo-500" /> Włoska Ramka (Wizualny Kreator)
                        </h2>
                        <p className="text-xs text-slate-500 mt-1">Narzędzie nakładające precyzyjną, trójkolorową obwódkę przy zachowaniu oryginalnej wielkości obrazu.</p>
                    </div>
                </div>

                <div className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Wgrywanie */}
                        <div className="flex flex-col space-y-6">
                            <div 
                                className={`border-2 border-dashed ${file ? 'border-indigo-300 bg-indigo-50/30' : 'border-slate-300 bg-slate-50'} rounded-lg p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-slate-100 transition-colors h-64`}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
                                {preview ? (
                                    <div className="relative w-full h-full flex items-center justify-center">
                                        <img src={preview} className="max-h-full max-w-full object-contain rounded shadow-sm" alt="Podgląd" />
                                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity rounded">
                                            <span className="text-white text-xs font-bold uppercase tracking-wider bg-black/60 px-3 py-1 rounded">Zmień zdjęcie</span>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4">
                                            <Upload className="w-8 h-8 text-indigo-400" />
                                        </div>
                                        <h3 className="text-sm font-bold text-slate-700">Wgraj Zdjęcie</h3>
                                        <p className="text-xs text-slate-500 mt-2">JPG, PNG, WEBP</p>
                                    </>
                                )}
                            </div>

                            {/* Suwak grubości */}
                            <div className="bg-slate-50 border border-slate-200 rounded p-4">
                                <label className="flex items-center justify-between text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                                    <span className="flex items-center"><Settings2 className="w-4 h-4 mr-2 text-slate-400" /> Grubość Ramki</span>
                                    <span className="text-indigo-600 font-black">{borderThickness} px</span>
                                </label>
                                <input 
                                    type="range" 
                                    min="1" max="150" 
                                    value={borderThickness} 
                                    onChange={(e) => setBorderThickness(e.target.value)}
                                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                />
                            </div>

                            <button 
                                onClick={processImage}
                                disabled={!file || isProcessing}
                                className={`w-full py-3 rounded text-sm font-bold shadow-sm transition-all flex items-center justify-center ${(!file || isProcessing) ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                            >
                                {isProcessing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Przetwarzanie...</> : 'Nałóż Włoską Ramkę'}
                            </button>
                        </div>

                        {/* Wynik */}
                        <div className="flex flex-col border border-slate-200 rounded-lg overflow-hidden bg-slate-50/50">
                            <div className="bg-slate-100 p-3 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider text-center">
                                Obraz Wyjściowy
                            </div>
                            <div className="flex-1 flex items-center justify-center p-6 relative min-h-[300px]">
                                {processedImage ? (
                                    <div className="relative group w-full h-full flex flex-col items-center justify-center">
                                        <img src={processedImage} className="max-h-full max-w-full object-contain rounded shadow-lg" alt="Gotowe" />
                                        <button 
                                            onClick={() => setLightboxUrl(processedImage)}
                                            className="absolute top-2 right-2 bg-white/90 p-2 rounded shadow text-slate-600 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <Maximize2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="text-center text-slate-400">
                                        <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                        <p className="text-xs">Tutaj pojawi się przetworzone zdjęcie</p>
                                    </div>
                                )}
                            </div>
                            {processedImage && (
                                <div className="p-4 bg-white border-t border-slate-200">
                                    <button 
                                        onClick={handleDownload}
                                        className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded text-sm font-bold shadow flex items-center justify-center"
                                    >
                                        <Download className="w-4 h-4 mr-2" /> Pobierz Gotowe Zdjęcie
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ItalianFrameTool;
