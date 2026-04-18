import EmbedWidget from '../components/EmbedWidget';

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-8">
      <div>
         <h1 className="text-3xl font-black text-slate-800 mb-2 uppercase tracking-tight">Enterprise Influ-Addon</h1>
         <p className="text-sm font-bold text-slate-500 mb-8 uppercase tracking-widest">Test Środowiska Mikrofrontendu</p>
         <EmbedWidget />
      </div>
    </div>
  );
}
