import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Database, Upload, FileText } from 'lucide-react';

export default function KnowledgeBasePanel() {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [documents, setDocuments] = useState([]);
  const { toast } = useToast();

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const res = await axios.get('/api/offer-optimizer/knowledge/list');
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
      toast({ title: 'Błąd', description: 'Podaj tytuł i tekst dokumentu.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post('/api/offer-optimizer/knowledge/ingest', { title, text });
      toast({ title: 'Sukces', description: `Dokument pocięto na ${res.data.chunksInserted} wektorów.` });
      setTitle('');
      setText('');
      fetchDocuments();
    } catch (err) {
      toast({ title: 'Błąd', description: err.response?.data?.error || err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" /> Baza Wiedzy i RAG (Regulaminy, Ustawy)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 items-center">
            <Input 
              placeholder="Tytuł Dokumentu (np. Dyrektywa OMNIBUS)" 
              value={title} 
              onChange={e => setTitle(e.target.value)}
              className="flex-1"
            />
            <div className="relative">
              <Input 
                type="file" 
                accept=".txt,.md" 
                onChange={handleFileUpload} 
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
              <Button variant="outline" className="flex gap-2">
                <Upload className="w-4 h-4" /> Wgraj plik TXT
              </Button>
            </div>
          </div>
          
          <Textarea 
            placeholder="Wklej zawartość tekstową tutaj lub wgraj plik..." 
            value={text} 
            onChange={e => setText(e.target.value)}
            className="h-64 font-mono text-xs"
          />

          <Button 
            onClick={handleIngest} 
            disabled={loading || !text} 
            className="w-full flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
            {loading ? 'Wektoryzacja za pomocą pgvector...' : 'Dodaj i Zwektoryzuj Dokument'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" /> Zapisane Dokumenty Prawne (Vector DB)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-gray-500 text-sm">Brak dokumentów w bazie. Agenci nie mają dostępu do wiedzy zewnętrznej.</p>
          ) : (
            <div className="space-y-3">
              {documents.map(doc => (
                <div key={doc.id} className="p-3 bg-gray-50 border rounded-md">
                  <h4 className="font-semibold text-sm">{doc.title}</h4>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">{doc.preview}...</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
