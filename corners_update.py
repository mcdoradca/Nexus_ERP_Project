import os
import glob
import re

files = glob.glob(r'z:\Nexus_ERP_Project\frontend\src\**\*.jsx', recursive=True)

for fp in files:
    with open(fp, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content
    
    # 1. Zmiana dużych zaokrągleń na małe (minimalistyczne / techniczne)
    content = re.sub(r'\brounded-\[3rem\]\b', 'rounded-sm', content)
    content = re.sub(r'\brounded-\[2\.5rem\]\b', 'rounded-sm', content)
    content = re.sub(r'\brounded-\[2rem\]\b', 'rounded-sm', content)
    content = re.sub(r'\brounded-\[1\.5rem\]\b', 'rounded-sm', content)
    content = re.sub(r'\brounded-\[1rem\]\b', 'rounded-sm', content)
    content = re.sub(r'\brounded-2xl\b', 'rounded-sm', content)
    content = re.sub(r'\brounded-xl\b', 'rounded-sm', content)
    content = re.sub(r'\brounded-lg\b', 'rounded-sm', content)
    content = re.sub(r'\brounded-md\b', 'rounded-sm', content)
    
    # 2. Specyficzne poprawki w ProductsView.jsx
    if 'ProductsView.jsx' in fp:
        # Nagłówki tabeli z p-8 na px-4 py-3
        content = re.sub(r'<th className="p-8 (.*?)">', r'<th className="px-4 py-3 \1">', content)
        # Komórki tabeli z p-8 na px-4 py-3
        content = re.sub(r'<td className="p-8(.*?)"', r'<td className="px-4 py-3\1"', content)
        # Dolna belka z p-8 na px-4 py-3
        content = content.replace('<div className="p-8 bg-slate-50/50', '<div className="px-4 py-3 bg-slate-50/50')
        # Górne marginesy
        content = content.replace('mb-10', 'mb-4')
        content = content.replace('mb-6', 'mb-3')
        content = content.replace('p-10', 'p-4')
        
    if content != original:
        with open(fp, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {fp}")
print("Finished making corners sharp")
