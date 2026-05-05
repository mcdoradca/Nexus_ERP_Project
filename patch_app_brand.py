import os

fp = r'z:\Nexus_ERP_Project\frontend\src\App.jsx'
with open(fp, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Dodanie stanu i logiki do App.jsx
state_insert = """
  // PIM Search Dropdown State
  const [brandSearchTerm, setBrandSearchTerm] = useState('');
  const [isBrandDropdownOpen, setIsBrandDropdownOpen] = useState(false);
  const brandDropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (brandDropdownRef.current && !brandDropdownRef.current.contains(event.target)) {
        setIsBrandDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleCreateBrandInline = async (name) => {
      if(!name) return;
      try {
          const brandRes = await axios.post(`${API_URL}/api/brands`, { name: name.trim() }, { headers: { Authorization: `Bearer ${token}` } });
          setBrands(prev => [...prev, brandRes.data]); 
          setNewProductForm(prev => ({ ...prev, brandId: brandRes.data.id }));
          setBrandSearchTerm(brandRes.data.name);
          setIsBrandDropdownOpen(false);
      } catch(err) { alert('Błąd tworzenia marki'); }
  };

  const filteredBrands = brands.filter(b => b.name.toLowerCase().includes(brandSearchTerm.toLowerCase()));

"""

if "const [brandSearchTerm, setBrandSearchTerm] = useState('');" not in content:
    content = content.replace("  // --- USE EFFECTS ---", state_insert + "  // --- USE EFFECTS ---", 1)

# 2. Update handleAutofillEAN to also set brandSearchTerm
autofill_hook = """      setNewProductForm(prev => ({
        ...prev,
        name: name || prev.name,"""
autofill_hook_new = """      
      // Auto-update text field if brand matched
      if(matchedBrandId) {
          const b = brands.find(x => x.id === matchedBrandId) || {name: brand};
          setBrandSearchTerm(b.name);
      } else {
          setBrandSearchTerm('');
      }
      
      setNewProductForm(prev => ({
        ...prev,
        name: name || prev.name,"""

if "setBrandSearchTerm(b.name)" not in content:
    content = content.replace(autofill_hook, autofill_hook_new, 1)

# 3. Replace the Select
old_select = """                  <div>
                    <label className={labelClass}>Marka *</label>
                    <select required className={inputClass} value={newProductForm.brandId} onChange={e => setNewProductForm({...newProductForm, brandId: e.target.value})}>
                      <option value="">Wybierz markę z listy...</option>
                      {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>"""

new_select = """                  <div ref={brandDropdownRef} className="relative z-30">
                    <label className={labelClass}>Marka (Wybierz lub dodaj nową) *</label>
                    <div className="relative">
                       <input 
                         type="text" 
                         required
                         className={`${inputClass} pr-10`}
                         placeholder="Wpisz nazwę marki..."
                         value={brandSearchTerm}
                         onChange={(e) => {
                            setBrandSearchTerm(e.target.value);
                            setNewProductForm(prev => ({...prev, brandId: ''}));
                            setIsBrandDropdownOpen(true);
                         }}
                         onFocus={() => setIsBrandDropdownOpen(true)}
                       />
                       <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    </div>
                    {isBrandDropdownOpen && (
                       <div className="absolute z-50 w-full mt-1 bg-white border border-slate-300 rounded-sm shadow-[0_10px_40px_rgba(0,0,0,0.1)] max-h-48 overflow-y-auto custom-scrollbar">
                          {filteredBrands.length > 0 ? (
                             filteredBrands.map(b => (
                                <div 
                                   key={b.id} 
                                   className={`p-3 cursor-pointer hover:bg-indigo-50 transition-colors border-b border-slate-100 last:border-b-0 ${newProductForm.brandId === b.id ? 'bg-indigo-50' : ''}`}
                                   onMouseDown={(e) => {
                                      e.preventDefault(); 
                                      setNewProductForm(prev => ({...prev, brandId: b.id}));
                                      setBrandSearchTerm(b.name);
                                      setIsBrandDropdownOpen(false);
                                   }}
                                >
                                   <div className="text-xs font-bold text-slate-800">{b.name}</div>
                                </div>
                             ))
                          ) : (
                             <div className="p-3 text-center">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Brak marki w bazie</span>
                                <button type="button" onMouseDown={(e) => { e.preventDefault(); handleCreateBrandInline(brandSearchTerm); }} className="w-full py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white rounded-sm text-[10px] font-black uppercase tracking-widest transition-colors flex items-center justify-center">
                                  <Plus className="w-3 h-3 mr-2" /> Dodaj: "{brandSearchTerm}"
                                </button>
                             </div>
                          )}
                       </div>
                    )}
                  </div>"""

if old_select in content:
    content = content.replace(old_select, new_select, 1)
    with open(fp, 'w', encoding='utf-8') as f:
        f.write(content)
    print("App.jsx updated with Combobox!")
else:
    print("ERROR: old_select not found in content!")
