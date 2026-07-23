# Rejestr Agentów AI w systemie Nexus ERP (Stan na 2026-07-23)

## Moduł: Offer Optimizer (EAN Pipeline)
| Agent ID | Model | Opis |
|---|---|---|
| `Agent_1_OSINT` | gemini-3.1-pro-preview-customtools | Zaawansowany research i mapowanie rynkowe. |
| `Agent_2_Sentiment` | gemini-3.1-pro-preview-customtools | Analiza opinii i potrzeb użytkowników na podstawie recenzji. |
| `Agent_3_Compliance` | antigravity-preview-05-2026 | Weryfikacja pod kątem zgodności z prawem (dyrektywa OMNIBUS, EU AI Act, claims kosmetyczne). |
| `Agent_4_GEO` | gemini-3.1-pro-preview | Generowanie zoptymalizowanych bloków tekstowych pod Allegro/Shopify. |
| `Agent_Title` | gemini-3.1-pro-preview | Konstruowanie precyzyjnych i wysoce konwertujących tytułów ofert. |
| `Agent_AEO` | gemini-3.1-pro-preview | Generowanie nagłówków i odpowiedzi dla Answer Engine Optimization (np. do Google SGE). |
| `Agent_11_Autofill` | gemini-3.5-flash | Automatyczne wypełnianie parametrów Allegro/PIM. |
| `Agent_Segment_Tone` | gemini-3.1-pro-preview | Adaptacja stylu i tonu opisów do docelowej grupy odbiorczej (Persona). |
| `Agent_Offer_JSON` | gemini-3.5-flash | Mapowanie rozproszonych danych HTML/JSON do pojedynczego, zwartego draftu oferty PIM. |
| `Agent_Photoroom_Prompt` | gemini-3.5-flash | Generowanie promptów do scenerii lifestylowych (Photoroom API) na podstawie parametrów z bazy. |
| `Agent_Vision_Native` | gemini-3-pro-image | Wewnętrzna kontrola i opis techniczny uploadowanych grafik produktowych (PIM/Auditor). |
| `Agent_Image_Audit` | gemini-3-pro-image | Inspekcja etykiet pod kątem wad prawnych (np. niedozwolone symbole i braki informacji w ostrzeżeniach). |

## Moduł: Influencer Marketing (SMI)
| Agent ID | Model | Opis |
|---|---|---|
| `Agent_Social_Integration` | gemini-3.1-pro-preview | Scrapowanie i deep-research na podstawie linków URL do profili social media twórców. |
| `Agent_Hunter` | gemini-3.1-pro-preview | Wyszukiwanie odpowiednich influencerów pasujących do promptów marketingowych i wymagań finansowych. |
| `Agent_Vector_Embedding` | text-embedding-004 | Semantyczna ocena, kategoryzacja oraz mapowanie "similarity" profili na bazie przestrzeni euklidesowej. |
| `Agent_PR_Outreach` | gemini-3.5-flash | Automatyczne generowanie mocno spersonalizowanych wiadomości typu DMs i e-mail pod współpracę barter/płatną. |
| `Agent_Router_SMI` | gemini-3.5-flash | Klasyfikowanie wejść od twórców na poszczególne platformy docelowe podczas planowania postów. |
| `Agent_Facebook_SMI` | gemini-3.5-flash | Generowanie eksperckich draftów/wpisów w formacie specyficznym pod Facebooka. |
| `Agent_Instagram_SMI` | gemini-3.5-flash | Generowanie wpisów dla Instagrama z naciskiem na estetykę i dobór hasztagów. |
| `Agent_TikTok_SMI` | gemini-3.5-flash | Tworzenie dynamicznych zarysów/scenariuszy dla krótkich filmów na platformę TikTok. |
| `Agent_Sentinel_Scheduler` | gemini-3.1-pro-preview | Analityczna optymalizacja terminów i okien czasowych (Data/Godzina) dla zaplanowanych kampanii. |

## Pozostałe moduły (Logistyka, Ads, Dokumentacja, Boty)
| Agent ID | Model | Opis |
|---|---|---|
| `Agent_Logistics_Optimizer` | gemini-3.5-flash | Algorytmiczne kalkulowanie najtańszych gabarytów i podpowiadanie lepszych kartonów. |
| `Agent_Ads_Sentinel` | gemini-3.5-flash | Codzienny zautomatyzowany audyt zwrotu (ROAS) z Allegro Ads i rekomendacje włącz/wyłącz kampanie. |
| `Agent_Data_Analyst` | gemini-3.5-flash | (W Demand Forecast) Szacowanie popytu przy użyciu trendów rynkowych, świąt, i danych twardych (S/A). |
| `Agent_SOT_Compiler` | gemini-3.1-pro-preview | Generowanie ustrukturyzowanych Kart Charakterystyki/Cech na podstawie plików (PDF, Zdjęcia etykiet). |
| `Agent_Ebook_Generator` | gemini-3.1-pro-preview | Dynamiczne pisanie merytorycznych rozdziałów z użyciem twardej wiedzy z PIM (np. kosmetyki/ingrediencje). |
| `Agent_Nexus_Bot` | gemini-3.1-pro-preview | Inteligentny system czatowy (NeS - Nexus Sentinel) wspierający operacje w całej firmie, wbudowany Tool Calling i analizy. |

*Uwaga: Wszyscy powyżsi Agenci korzystają teraz z systemowej, scentralizowanej telemetrii i są śledzeni za pomocą funcji `AiMetricsService.logUsage()` (bezpośrednio, lub pod spodem przez `generateWithRetry`).*
