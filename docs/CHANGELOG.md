# Changelog — myMarket

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
