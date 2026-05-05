Oto merytoryczny raport architektoniczny dotyczący budowy systemu backtestingu dla algorytmu Reinforcement Learning (RL) operującego na ekosystemie Allegro Ads, przygotowany na podstawie aktualnej dokumentacji Allegro REST API oraz standardów Node.js.

# Raport Architektoniczny: Środowisko Backtestingu RL dla Allegro Ads

## 1. Dane Historyczne z Allegro (REST API Endpoints)
Aby zasilić algorytm Q-Learningu prawdziwymi danymi i uniknąć mockowania, musimy zintegrować się z produkcyjnymi endpointami Allegro. Dane historyczne dzielą się na trzy główne filary:

*   **Koszty, Prowizje i Saldo (Billing):**
    *   `GET /billing/billing-entries` [1] – Główne źródło prawdy o kosztach. Zwraca historię operacji billingowych na koncie. Pozwala na precyzyjne wyliczenie nagrody (Reward) dla algorytmu RL. Zwraca m.in. pobrane prowizje od sprzedaży. Można filtrować po `type.id` (np. `SUC` dla prowizji), `offer.id` oraz `order.id` [1].
    *   `GET /payments/payment-operations` [1] – Historia operacji płatniczych (wpływy od kupujących).
*   **Dane Sprzedażowe i Konwersje (Zamówienia):**
    *   `GET /order/checkout-forms` [1] – Pobiera szczegóły zamówień (wartość koszyka, kupione oferty, status opłacenia).
    *   `GET /order/events` [1] – Dziennik zdarzeń zamówień. Jest to kluczowy endpoint do budowania chronologicznej osi czasu (timeline) dla symulatora RL, pozwalający na odtworzenie stanu wiedzy algorytmu w danym ułamku sekundy w przeszłości [1].
*   **Dane Allegro Ads (Kampanie i Statystyki):**
    *   *Uwaga architektoniczna:* Allegro Ads API funkcjonuje jako osobny moduł pod bazowym adresem `https://api.allegro.pl/ads/...` [2]. Dostęp do niego nie jest domyślnie otwarty dla każdego dewelopera – wymaga autoryzacji agencyjnej lub specjalnego dostępu partnerskiego [2].
    *   Kluczowe ścieżki (wymagające uprawnień Ads): `GET /ads/clients` [2], `GET /ads/campaigns` (konfiguracja i budżety), `GET /ads/statistics` (metryki: kliknięcia, odsłony, koszt CPC).

## 2. Standardy i Moduły Backtestingu w Node.js
Zamiast pisać pętlę symulacyjną od zera, w ekosystemie Node.js/JS możemy wykorzystać gotowe biblioteki wzorowane na standardzie *OpenAI Gym*, co ułatwi późniejszą wymianę algorytmów (np. z Q-Learningu na PPO czy DQN).

*   **`gym.js` / `js-gym`** [4] – Porty klasycznego środowiska OpenAI Gym dla JavaScriptu. Wymuszają ustandaryzowaną architekturę z metodami `reset()` (inicjalizacja epizodu) oraz `step(action)` (wykonanie akcji, np. zmiany stawki CPC, i zwrócenie nowego stanu, nagrody oraz flagi `done`).
*   **`reinforce-js`** [3] – Dojrzała biblioteka implementująca algorytmy Reinforcement Learning (Q-Learning, Deep Q-Network - DQN, SARSA) w JS/TS [3]. Posiada gotowe interfejsy do definiowania stanów (States) i akcji (Actions).
*   **TensorFlow.js (`@tensorflow/tfjs-node`)** – Jeśli agent RL ma wykorzystywać głębokie sieci neuronowe (Deep RL) do aproksymacji funkcji Q, TF.js pozwala na natywne trenowanie modeli w Node.js z akceleracją sprzętową (GPU/C++ bindings), co drastycznie przyspieszy backtesting na dużych paczkach danych.

## 3. Format Danych, Limity i Throttling (Ograniczenia API)
Podczas projektowania warstwy *Data Ingestion* (pobierania danych do lokalnej bazy przed uruchomieniem backtestu), należy uwzględnić twarde limity Allegro REST API:

*   **Paginacja i Limity Rekordów:**
    *   `GET /billing/billing-entries`: Maksymalny parametr `limit` na jedno zapytanie to **100** [1]. Paginacja odbywa się przez parametr `offset`. Suma `offset` + `limit` może wynosić maksymalnie 10 000 000 [5].
    *   `GET /order/checkout-forms`: Maksymalny `limit` to **100**, a suma `offset` + `limit` nie może przekroczyć 10 000 [1].
*   **Zakres Dat (Date Range):**
    *   Zamówienia (`checkout-forms`) są dostępne wstecz maksymalnie przez **12 miesięcy** [1]. Oznacza to, że do głębszego backtestingu (np. 2-3 lata wstecz) konieczne jest wdrożenie własnego hurtowego archiwizowania danych (Data Warehouse) na bieżąco.
    *   Filtrowanie czasowe w billingu odbywa się przez parametry `occurredAt.gte` i `occurredAt.lte` (wymagany format ISO 8601, np. `2025-07-10T11:06:50.935Z`) [1].
*   **Throttling (Rate Limiting):**
    *   Allegro API stosuje standardowy rate limiting. Przekroczenie dozwolonej liczby zapytań skutkuje błędem `429 Too Many Requests`. 

## Sugerowana Struktura Środowiska Backtestowego

1. **Data Ingestion Layer (ETL):** Skrypty Node.js wykorzystujące bibliotekę `bottleneck` lub `p-limit` do obsługi rate-limitingu i *Exponential Backoff*. Pobierają dane z `/billing/billing-entries` [1] i `/order/checkout-forms` [1], a następnie zapisują je do lokalnej bazy zoptymalizowanej pod szeregi czasowe (np. TimescaleDB lub ClickHouse).
2. **AllegroAdsEnv (Symulator):** Klasa implementująca interfejs Gym (`reset()`, `step(action)`). 
   * **State (Stan):** Wektor cech z danego dnia (np. CTR z wczoraj, wydany budżet, ROAS, godzina).
   * **Action (Akcja):** Dyskretna lub ciągła zmiana stawki CPC (np. +10 gr, -5 gr) lub modyfikacja budżetu dziennego.
   * **Reward (Nagroda):** Zysk netto wyliczony z danych historycznych: `(Wartość sprzedaży z /order/checkout-forms) - (Koszty Ads) - (Prowizje z /billing/billing-entries)`.
3. **Agent (RL Model):** Model oparty na `reinforce-js` [3] lub TF.js, który iteruje przez historyczne dni, ucząc się optymalnej polityki licytacji bez ryzykowania prawdziwego budżetu na środowisku produkcyjnym.