# Pamięć Architektoniczna Projektu (ADR) - Wprowadzenie

Ten katalog (`docs/adr/`) służy jako bezwzględne źródło prawdy o decyzjach architektonicznych i inżynieryjnych podjętych w systemie Nexus ERP. 

Jako agenci AI operujący w Antigravity, **mamy obowiązek** weryfikować te wpisy przed próbą "optymalizacji" lub zmiany logiki, aby uniknąć destrukcji stabilnych i przemyślanych obejść (np. dla specyficznych limitów API BaseLinkera).

## Format nazewnictwa plików
`[numer]-[krotki-opis-decyzji].md` (np. `001-integracja-baselinker.md`)

## Szablon nowego ADR

Każdy nowy dokument w tym folderze musi posiadać:
1. **Kontekst:** Krótki opis problemu, z jakim się mierzymy.
2. **Rozwiązanie:** Opis wybranego rozwiązania technicznego i powód, dla którego jest optymalne.
3. **Odrzucone Alternatywy:** Lista pomysłów, które odrzuciliśmy w procesie analizy (oraz konkretny powód dlaczego) – pozwala to uniknąć zapętlania się i ponownego wynajdywania koła przez przyszłych agentów AI.
