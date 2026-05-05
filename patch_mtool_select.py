import os

fp = r'z:\Nexus_ERP_Project\frontend\src\views\MToolView.jsx'

with open(fp, 'r', encoding='utf-8') as f:
    content = f.read()

states_insertion = """
  // PIM Search Dropdown State
  const [pimSearchTerm, setPimSearchTerm] = useState('');
  const [isPimDropdownOpen, setIsPimDropdownOpen] = useState(false);
  const pimDropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (pimDropdownRef.current && !pimDropdownRef.current.contains(event.target)) {
        setIsPimDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredPimProducts = products.filter(p => {
    if(!pimSearchTerm) return true;
    const term = pimSearchTerm.toLowerCase();
    return (p.name && p.name.toLowerCase().includes(term)) || 
           (p.ean && p.ean.toLowerCase().includes(term)) || 
           (p.sku && p.sku.toLowerCase().includes(term));
  });

  // Overhead Cost State
"""

content = content.replace("  // Overhead Cost State\n", states_insertion, 1)

old_select = """                           <div>
                              <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest mb-2 block">Obiekt / Produkt z PIM</label>
                              <select className="w-full p-4 bg-slate-50 border border-slate-400 rounded-sm text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 transition-colors" value={calcSelectedProduct} onChange={e=>setCalcSelectedProduct(e.target.value)}>
                                 <option value="">-- Wybierz indeks PIM --</option>
                                 {products.map(p => <option key={p.id} value={p.id}>{p.brand?.name || ''} {p.name} [{p.sku}]</option>)}
                              </select>
                           </div>"""

new_select = """                           <div ref={pimDropdownRef} className="relative z-20">
                              <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest mb-2 block">Obiekt / Produkt z PIM (Wyszukiwanie EAN/SKU)</label>
                              <div className="relative">
                                 <input 
                                   type="text" 
                                   className="w-full p-4 pl-12 bg-slate-50 border border-slate-400 rounded-sm text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 transition-colors"
                                   placeholder="Wpisz nazwę, EAN lub SKU..."
                                   value={pimSearchTerm}
                                   onChange={(e) => {
                                      setPimSearchTerm(e.target.value);
                                      setIsPimDropdownOpen(true);
                                   }}
                                   onFocus={() => {
                                      if(calcSelectedProduct) setPimSearchTerm(''); // Clear to search again if focused
                                      setIsPimDropdownOpen(true);
                                   }}
                                 />
                                 <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                 {calcSelectedProduct && (
                                     <button 
                                         className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-500 transition-colors"
                                         onClick={() => {
                                            setCalcSelectedProduct('');
                                            setPimSearchTerm('');
                                         }}
                                     >
                                        <X className="w-4 h-4" />
                                     </button>
                                 )}
                              </div>
                              {isPimDropdownOpen && (
                                 <div className="absolute z-50 w-full mt-1 bg-white border border-slate-300 rounded-sm shadow-[0_10px_40px_rgba(0,0,0,0.1)] max-h-60 overflow-y-auto custom-scrollbar">
                                    {filteredPimProducts.length > 0 ? (
                                       filteredPimProducts.map(p => (
                                          <div 
                                             key={p.id} 
                                             className={`p-3 cursor-pointer hover:bg-indigo-50 transition-colors border-b border-slate-100 last:border-b-0 ${calcSelectedProduct === p.id ? 'bg-indigo-50' : ''}`}
                                             onMouseDown={(e) => {
                                                e.preventDefault(); // Prevent input blur before click
                                                setCalcSelectedProduct(p.id);
                                                setPimSearchTerm(`[${p.sku}] ${p.name}`);
                                                setIsPimDropdownOpen(false);
                                             }}
                                          >
                                             <div className="text-[11px] font-black text-slate-800 line-clamp-1">{p.brand?.name || ''} {p.name}</div>
                                             <div className="text-[9px] font-bold text-slate-500 mt-0.5 uppercase tracking-widest">EAN: {p.ean || 'Brak'} | SKU: {p.sku}</div>
                                          </div>
                                       ))
                                    ) : (
                                       <div className="p-4 text-center text-[10px] font-bold text-slate-500 uppercase tracking-widest">Brak wyników wyszukiwania</div>
                                    )}
                                 </div>
                              )}
                           </div>"""

if old_select in content:
    content = content.replace(old_select, new_select, 1)
    with open(fp, 'w', encoding='utf-8') as f:
        f.write(content)
    print("MToolView.jsx updated successfully!")
else:
    print("ERROR: old_select not found in content!")
