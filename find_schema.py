import json
text = open('claid_api_book_clean.txt', 'r', encoding='utf-8').read()

out = ""
lines = text.replace('{', '\n{').replace('}', '}\n').split('\n')
for i, line in enumerate(lines):
    if '"prompt"' in line and '"generative"' in text[max(0, text.find(line)-500):text.find(line)+500]:
        out += line[:100] + "\n"

with open('lines.txt', 'w', encoding='utf-8') as f:
    f.write(out)
