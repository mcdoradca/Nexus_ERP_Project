import json
text = open('claid_api_book_clean.txt', 'r', encoding='utf-8').read()

lines = text.replace('{', '\n{').replace('}', '}\n').split('\n')
out = ""
for i, line in enumerate(lines):
    if 'scene' in line.lower() or 'background' in line.lower():
        out += line[:150] + "\n"

with open('scene_lines.txt', 'w', encoding='utf-8') as f:
    f.write(out)
