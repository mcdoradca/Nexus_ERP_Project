# SHARED_RULES v4.0 — WSPÓLNY BLOK REGUŁ (SINGLE SOURCE OF TRUTH)
# Wstrzykiwany jako statyczny, cache'owany prefiks WYŁĄCZNIE do węzłów, które daną
# regułę egzekwują (mapa na dole). Aktualizacja w jednym miejscu = spójność potoku.

## §A. STOP-WORDS ALLEGRO + UOKiK (egzekwuje: kod post-walidatora; zna: A6, A7)
Zakazane słowa marketingowe: gratis, tanio, promocja, hit, prezent, okazja, najtaniej,
wyprzedaż, mega, super.
Zakazane overpromising (ryzyko UOKiK): gwarancja, gwarantuje, udowodniona skuteczność,
cudowny, magiczny, w 100% udowodnione, pewność działania.

## §B. DOZWOLONY HTML (egzekwuje: kod; zna: A6, A7)
Wyłącznie: <h1> <h2> <p> <ul> <ol> <li> <b>/<strong> <br>.
Zakaz: tabel, div/span, CSS, JS, linków, danych kontaktowych.
Cudzysłowy w HTML: wyłącznie apostrofy (') — ochrona parsera JSON.

## §C. EMOTIKONY SEMANTYCZNE (egzekwuje: kod struktury; zna: A4, A6, A7)
Każdy <h1>/<h2>/<li> zaczyna się emotikonem. Dozwolone: ✅ ✔️ 🛡️ 🏅 🏆 🔬 📊 🌱 🌿 ♻️
💧 ⚠️ ➡️ 🌟 ❓ 💡 ⚙️ 📝 ⚡ 🔴 🟢 🏷️ 💆‍♀️. Zakazane (clickbait): 🔥 😱 💥 😍 🚀.
Emotikon tylko na początku linii, nigdy w środku tekstu.

## §D. ROSZCZENIA MEDYCZNE — LEKSYKON TWARDY (egzekwuje: kod + A5 + A10-semantyka)
Blokujące: leczy, wyleczył, uzdrawia, terapia, diagnozuje, antybiotyk, lek,
goi rany, zapobiega chorobom, likwiduje łuszczycę/egzemę/trądzik/AZS.
Zasada redakcji (A5): nie kasuj dowodu społecznego — przekuj intencję w legalną
korzyść kosmetologiczną (ukojenie, redukcja widocznych zaczerwienień, wsparcie
bariery hydrolipidowej).

## §E. BIOCYDY I CLP (egzekwuje: A5; weryfikuje: kod + A10)
Bez pozwolenia biobójczego: zakaz "zabija wirusy/bakterie", "dezynfekuje", "99,9%".
Z pozwoleniem: zakaz słów z Art. 72 BPR: nietoksyczny, nieszkodliwy, naturalny biocyd,
przyjazny dla środowiska, całkowicie bezpieczny, wolny od chemikaliów.
**NIENARUSZALNE:** zwroty H/P, hasła ostrzegawcze (NIEBEZPIECZEŃSTWO/UWAGA), kod UFI —
zakaz usuwania, łagodzenia i parafrazowania na całej długości potoku. Integralność
sekcji 6 gwarantowana hashem w Orkiestratorze.

## §F. GREENWASHING I "CHWALENIE SIĘ PRAWEM" (egzekwuje: A5; weryfikuje: A10)
Zakaz: bez chemii, bez parabenów, bez SLS/SLES, bez fenoksyetanolu, bez konserwantów.
Zamiana na pozytywną ekspozycję składu ("formuła oparta na łagodnych glukozydach").
Zakaz "cruelty-free / nietestowany na zwierzętach" bez akredytowanego certyfikatu
pozaunijnego zarejestrowanego w A1 (norma prawna UE od 2013 ≠ cecha wyróżniająca).

## §G. AI ACT — WIZUALIA (egzekwuje: A8, A9)
Miniatura #1: tło RGB(255,255,255), produkt ≥85%, zero cieni/ramek/napisów; dozwolone
fizyczne elementy symboliczne składu na białym tle. Obrazy AI/symulacje: obowiązkowa
etykieta [Wygenerowano przez AI] / [Wizualizacja symulowana komputerowo]. Bezwzględny
zakaz fałszywych "przed/po" i pseudoklinicznych dowodów.

## §H. ZERO PROMPT LEAK (zna: A7; weryfikuje: kod)
Nazwy technik (Pratfall, Kotwica Rutyny, Sensory Priming) nigdy w widocznym HTML;
flagowanie wyłącznie komentarzem <!-- Applied: ... -->.

## MAPA DYSTRYBUCJI PREFIKSÓW (Orkiestrator składa prefiks per węzeł):
A4: §C | A5: §D §E §F | A6: §A §B §C | A7: §A §B §C §H | A8: §G | A9: §G |
A10: §D §E §F (tylko warstwa semantyczna — leksykalną robi kod)
