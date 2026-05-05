import re
text = open('claid_api_book_clean.txt', 'r', encoding='utf-8').read()
match = re.search(r'"SceneCreateAPIScenePromptIn":\{(.*?)\"SceneCreateAPISceneTemplateIn\"', text)
if match:
    open('temp.json', 'w', encoding='utf-8').write(match.group(1))
else:
    open('temp.json', 'w', encoding='utf-8').write('Not found')
