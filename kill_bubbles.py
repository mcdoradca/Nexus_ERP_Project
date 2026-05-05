import os
import glob
import re

files = glob.glob(r'z:\Nexus_ERP_Project\frontend\src\**\*.jsx', recursive=True)

targets = [
    'rounded-[0.9rem]',
    'rounded-[1.25rem]',
    'rounded-[1.5rem]',
    'rounded-[1rem]',
    'rounded-[2.5rem]',
    'rounded-[2rem]',
    'rounded-[3rem]',
    'rounded-[4rem]',
    'rounded-3xl',
    'rounded-2xl',
    'rounded-xl',
    'rounded-lg',
    'rounded-md',
    'rounded-full'
]

for fp in files:
    with open(fp, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content
    
    # 1. Brutalne zastąpienie wszystkich znanych okrągłości na zaokrąglenia minimalne "rounded-sm"
    for t in targets:
        # Zastępujemy jako substring, żeby uniknąć problemów z \b
        # Dodajemy spację przed, żeby nie zepsuć czegoś co ma to w nazwie (mało prawdopodobne, ale bezpieczne)
        # Bądź po prostu .replace(t, 'rounded-sm')
        content = content.replace(f" {t}", " rounded-sm")
        content = content.replace(f"'{t}", "'rounded-sm")
        content = content.replace(f'"{t}', '"rounded-sm')
        content = content.replace(f"`{t}", "`rounded-sm")
        # dla końcówek z apostrofem
        content = content.replace(f"{t} ", "rounded-sm ")
        content = content.replace(f"{t}'", "rounded-sm'")
        content = content.replace(f'{t}"', 'rounded-sm"')
        content = content.replace(f"{t}`", "rounded-sm`")
    
    # Wypadek, gdy występuje jako sam ciąg:
    for t in targets:
        content = content.replace(t, 'rounded-sm')
        
    # Specyficzny wyjątek: Czasami małe notyfikacje np w-2 h-2 mogą wyglądać źle jako kwadraty,
    # ale użytkownik prosił o minimalne łuki, więc zostawiamy rounded-sm.

    if content != original:
        with open(fp, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {fp}")

print("Zakończono totalną anihilację bąbelków.")
