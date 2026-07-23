import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Loader2, Database, Upload, FileText } from 'lucide-react';

export default function KnowledgeBasePanel() {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    fetchDocuments();
  }, []);

  const showToast = (title, message, isError = false) => {
    setNotification({ title, message, isError });
    setTimeout(() => setNotification(null), 5000);
  };

  const fetchDocuments = async () => {
    try {
      const token = localStorage.getItem('aps_token') || '';
      const res = await axios.get('/api/offer-optimizer/knowledge/list', {
          headers: { 'Authorization': `Bearer ${token}` }
      });
      setDocuments(res.data.documents || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!title) {
        setTitle(file.name.replace(/\.[^/.]+$/, ""));
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      setText(evt.target.result);
    };
    reader.readAsText(file);
  };

  const handleIngest = async () => {
    if (!title || !text) {
      showToast('Błąd', 'Podaj tytuł i tekst dokumentu.', true);
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('aps_token') || '';
      const res = await axios.post('/api/offer-optimizer/knowledge/ingest', { title, text }, {
          headers: { 'Authorization': `Bearer ${token}` }
      });
      showToast('Sukces', `Dokument pocięto na ${res.data.chunksInserted} wektorów.`);
      setTitle('');
      setText('');
      fetchDocuments();
    } catch (err) {
      showToast('Błąd', err.response?.data?.error || err.message, true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-6">
      {notification && (
        <div className={`fixed top-4 right-4 p-4 rounded-lg shadow-lg text-white z-50 ${notification.isError ? 'bg-rose-500' : 'bg-emerald-500'}`}>
          <h4 className="font-bold text-sm">{notification.title}</h4>
          <p className="text-xs mt-1">{notification.message}</p>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center gap-2">
          <Database className="w-5 h-5 text-indigo-500" /> 
          <h2 className="text-lg font-semibold text-slate-800">Baza Wiedzy i RAG (Regulaminy, Ustawy)</h2>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex gap-4 items-center">
            <input 
              placeholder="Tytuł Dokumentu (np. Dyrektywa OMNIBUS)" 
              value={title} 
              onChange={e => setTitle(e.target.value)}
              className="flex-1 px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="relative">
              <input 
                type="file" 
                accept=".txt,.md" 
                onChange={handleFileUpload} 
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
              <button className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-md hover:bg-slate-50 transition-colors text-sm font-medium text-slate-700">
                <Upload className="w-4 h-4" /> Wgraj plik TXT/MD
              </button>
            </div>
          </div>
          
          <textarea 
            placeholder="Wklej zawartość tekstową tutaj lub wgraj plik..." 
            value={text} 
            onChange={e => setText(e.target.value)}
            className="w-full h-64 p-4 border border-slate-300 rounded-md font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />

          <button 
            onClick={handleIngest} 
            disabled={loading || !text} 
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
            {loading ? 'Wektoryzacja za pomocą pgvector...' : 'Dodaj i Zwektoryzuj Dokument'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center gap-2">
          <FileText className="w-5 h-5 text-slate-500" /> 
          <h2 className="text-lg font-semibold text-slate-800">Zapisane Dokumenty Prawne (Vector DB)</h2>
        </div>
        <div className="p-6">
          {documents.length === 0 ? (
            <p className="text-slate-500 text-sm">Brak dokumentów w bazie. Agenci nie mają dostępu do wiedzy zewnętrznej.</p>
          ) : (
            <div className="space-y-3">
              {documents.map(doc => (
                <div key={doc.id} className="p-4 bg-slate-50 border border-slate-100 rounded-md">
                  <h4 className="font-semibold text-sm text-slate-800">{doc.title}</h4>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{doc.preview}...</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
