# Changelog — myMarket

## [1.4.2] — 2026-11-27
- Naprawa znikającej karty szczegółów przy kliknięciu bezpośrednio w wiersz listy (Portfel i Watchlist) — karta otwiera się teraz wyłącznie po kliknięciu/tapnięciu (nie przesuwa listy na `mouseenter`).
- Przewidywalne zamykanie karty szczegółów: ponowne kliknięcie wybranej pozycji (na kole lub na liście) albo kliknięcie dowolnego pustego tła (w tym środka koła) zamyka kartę; przełączniki w pasku narzędzi nie zamykają otwartej karty.

## [1.4.1] — 2026-11-27
- Odchudzenie i oczyszczenie UI:
  - Nagłówek zastąpiony ikoną aplikacji + tytułem **`myMarket`** (usunięta niebieska kapsułka i napis `Portfolio structure`), skrócony wiersz statusu (`● After-hours · 20:15`, bez zdublowanej kapsułki `with Pre/Post`).
  - Usunięte wszystkie podpowiedzi (`Hover / Tap…`) oraz dolny pasek `Total` pod listą — karta szczegółów (w Portfelu, Zamkniętych i Watchliście) jest ukryta dopóki nic nie jest wybrane.
  - Usunięta etykieta `Sort:` oraz zdublowany nagłówek `Watchlist` (zastąpiony zgrabnym licznikiem pozycji).

## [1.4.0] — 2026-11-27
- **Watchlist z progami cenowymi (`Kup ≤` / `Sprzedaj ≥`):**
  - Backend ([apps-script/Code.gs](../apps-script/Code.gs)): nowa, uproszczona zakładka `Watchlist` (`Ticker` z listą rozwijaną z `Instrumenty`, `Kup ≤`, `Sprzedaj ≥`, `Notatka` — nazwa i kategoria zaciągane ze słownika `Instrumenty`) dodawana selektywnie przez `1. Przygotuj arkusz` (automatycznie usuwa wycofane kolumny `Nazwa` i `Kategoria` bez naruszania pozostałych danych); wspólne pobieranie kursów (z Pre/Post) i dat wyników z deduplikacją symboli.
  - Frontend: przełącznik `Portfolio | Watchlist` z zielonym licznikiem trafień, kompaktowa lista 2-liniowa z podświetleniem trafionych (`BUY TARGET` / `SELL TARGET`) i bliskich (≤ 5%, `NEAR`) celów, karta szczegółów z dystansem `$` / `%`, datą wyników i notatką, wsparcie EN/PL oraz sekcja `## Watchlist` w eksporcie AI.

## [1.3.8] — 2026-11-27
- Symbole **`$`** (dla gotówki) i **`₿`** (dla krypto) na segmentach wykresu pierścieniowego — wyświetlane zarówno w trybie spółek, jak i kategorii, również dla wąskich segmentów (od `2.2%` udziału; powyżej `7%` z dopiskiem `%`).

## [1.3.7] — 2026-11-24
- Zmiana nazwy animacji na `mm-spin-ccw` w [web/css/app.css](../web/css/app.css), ponieważ Tailwind CDN nadpisywał globalne `@keyframes spin` kierunkiem w prawo.
- Precyzyjne przewijanie `window.scrollTo` do dokładnie `12 px` nad górną krawędzią karty szczegółów (niezawodne w Safari iOS i Chrome).

## [1.3.6] — 2026-11-24
- Poprawiony kierunek obrotu ikony odświeżania (zgodny z grotami strzałek).
- Poprawione przewijanie do karty szczegółów (`block: 'start'` + `scroll-mt-3`), dzięki czemu widok wraca dokładnie do górnej krawędzi karty szczegółów bez odsłaniania wykresu powyżej.

## [1.3.5] — 2026-11-24
- Stały, jednolity układ karty szczegółów dla wszystkich pozycji (otwartych i kategorii): zawsze widoczne pola `Open`, `Realized` (z liczbą sprzedanych akcji lub `—`), `Category`, `Next earnings` (lub `—`) i `Pre/Post` (lub `—`) w równych kolumnach — gwarantuje `0 px` przeskoku wysokości między dowolnymi spółkami.

## [1.3.4] — 2026-11-24
- Stabilna wysokość karty szczegółów po zaznaczeniu pozycji (`min-h` + układ `justify-between`) oraz stałe pole `Next earnings: TBD / brak` dla akcji bez ogłoszonej daty wyników — eliminuje przeskakiwanie listy przy klikaniu po spółkach.

## [1.3.3] — 2026-11-24
- Kompaktowa lista pozycji i kategorii: 2-liniowe wiersze (~52 px zamiast ~104 px) we wspólnej białej ramce z cienkimi liniami podziału i wyraźnym paskiem zaznaczenia z lewej, dzięki czemu bez przewijania widać ok. 2× więcej pozycji bez utraty czytelności.

## [1.3.2] — 2026-11-24
- Globalna zamiana etykiety waluty `USD` na kompaktowy symbol `$` (np. `$11,735.85`).
- Poszerzony środek wykresu pierścieniowego (`OUTER_R = 188`, `INNER_R = 124`, z zachowaniem marginesów wokół koła) oraz dwuliniowy blok `TODAY` nad zmianą dzienną z pełną precyzją groszy, dzięki czemu wszystkie wartości mieszczą się czysto w kole również przy dużych kwotach.

## [1.3.1] — 2026-11-23
- Usunięto fallback na `api.nasdaq.com` w [apps-script/Code.gs](../apps-script/Code.gs) (serwery Nasdaq zawieszały połączenia z Google Apps Script) — daty wyników pobierane są teraz wyłącznie szybko przez Yahoo Finance.
- Dodano 25-sekundowy timeout w [web/js/api.js](../web/js/api.js), dzięki czemu ikona odświeżania nigdy nie zawiesza się w nieskończoność.

## [1.3.0] — 2026-11-23
- **Najbliższe wyniki finansowe (Earnings):**
  - Backend ([apps-script/Code.gs](../apps-script/Code.gs)): zbiorcze pobieranie nadchodzących dat wyników dla otwartych akcji (Yahoo Finance `v7/finance/quote` z sesyjnym cookie/crumb + fallback Nasdaq, cache 6h) oraz podgląd w menu `myMarket → Testuj kursy`.
  - Frontend: wyświetlanie najbliższej daty wyników z odliczaniem dni (oraz oznaczeniem `est. / szac.`) w karcie szczegółów spółki pod wykresem (wyróżnienie na niebiesko w ciągu 14 dni), w tooltipie na desktopie oraz w eksporcie dla AI.

## [1.2.1] — 2026-11-23
- Poprawka układu w środku wykresu pierścieniowego w trybie `All / Wszystkie`: rozbicie `Open` i `Closed` ułożone jedna pod drugą z kolorowaniem kwot, dzięki czemu bez problemu mieści się w kole również dla dużych wartości.

## [1.2.0] — 2026-11-23
- **Dwujęzyczność EN / PL (domyślnie angielski):**
  - Nowy moduł [web/js/i18n.js](../web/js/i18n.js) oraz przełącznik języka `English | Polski` w Ustawieniach.
  - Automatyczne formatowanie liczb i dat zgodnie z wybranym językiem (`10,823.35 USD` w EN vs `10 823,35 USD` w PL).
  - Pełne tłumaczenie interfejsu, dialogów oraz eksportu dla AI.

## [1.1.0] — 2026-11-23
- **Zakres pozycji: Otwarte / Wszystkie / Zamknięte (Krok 2):**
  - W trybie **Otwarte** wynik otwartej pozycji uwzględnia również zrealizowany zysk/stratę z częściowych sprzedaży tego samego tickera (procent liczony od całego kosztu zakupów; w karcie szczegółów pod kołem pojawia się rozbicie `Otwarte / Zrealizowane`).
  - W trybie **Wszystkie** środek wykresu pokazuje łączny wynik historyczny (otwarte + całkowicie zamknięte) z rozbiciem `Otw. / Zamk.`, a pod listą otwartych wyświetla się osobna sekcja zamkniętych pozycji.
  - W trybie **Zamknięte** wyświetla się czysta karta podsumowania zrealizowanego wyniku (USD, %, zainwestowany kapitał, przychód, bilans zysk/strata) oraz lista całkowicie zamkniętych pozycji lub kategorii ze szczegółami po kliknięciu.
  - Rozszerzony eksport **AI** o sekcję pozycji zamkniętych i rozbicie częściowych sprzedaży.

## [1.0.3] — 2026-11-23
- **Ujednolicenie szczegółów pozycji (Krok 1):** szczegóły wybranej spółki lub kategorii pokazują się wyłącznie w karcie pod wykresem (w układzie z wartością, udziałem %, wynikiem % i zmianą dzienną); wiersz na liście tylko się podświetla, bez dublowania treści. Na mniejszych ekranach kliknięcie pozycji delikatnie przewija do karty szczegółów, jeśli jest poza widokiem.

## [1.0.2] — 2026-11-22
- Wersjonowanie zasobów statycznych (cache-busting) oraz wklejanie całego linku połączenia w Ustawieniach (ułatwienie konfiguracji w ikonie PWA na iPhonie).

## [1.0.0] — 2026-11-22
Pierwsza wersja robocza (MVP):
- **Backend (Apps Script):** [Code.gs](../apps-script/Code.gs) — automatyczne tworzenie zakładek (`Akcje`, `Krypto`, `Instrumenty`, `Kategorie`, `Gotówka`, `Ustawienia`, `Start`), walidacja wierszy, JSON API chronione tokenem, pobieranie kursów z Yahoo Finance (z pre-market / after-hours i cache) + fallback na `GOOGLEFINANCE()`, okno QR „Połącz z aplikacją”.
- **Frontend PWA:** [web/index.html](../web/index.html) — interaktywny wykres pierścieniowy / kołowy SVG, lista pozycji z rozwijanymi szczegółami, przełączniki `Wg spółek / Wg kategorii`, `Gotówka`, `Krypto`, `Pre/Post`, sortowanie, cache lokalny, tryb demo, obsługa iPhone (ikona + ekran początkowy).
- **Eksport dla AI:** kopiowanie stanu portfela w formacie Markdown lub JSON, opcja ukrycia kwot (tylko udziały % i wyniki %), opcjonalny prompt i udostępnianie z iPhone’a.
- **Dokumentacja:** [PRD.md](PRD.md), [SETUP.md](SETUP.md), workflow GitHub Pages.
