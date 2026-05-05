import json
text = open('claid_api_book_clean.txt', 'r', encoding='utf-8').read()

start = text.find('{"openapi":"3.1.0"')
while start != -1:
    end = text.find('}}}}}', start) + 5
    if end > 4:
        try:
            api_spec = json.loads(text[start:end])
            if '/v1/scene/create' in api_spec.get('paths', {}):
                with open('temp3.json', 'w') as f:
                    json.dump(api_spec['components']['schemas'], f, indent=2)
        except Exception as e:
            pass
    start = text.find('{"openapi":"3.1.0"', start + 10)
