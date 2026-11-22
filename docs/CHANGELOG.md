# Changelog — myMarket

## [1.0.0] — 2026-11-22
Pierwsza wersja robocza (MVP):
- **Backend (Apps Script):** [Code.gs](../apps-script/Code.gs) — automatyczne tworzenie zakładek (`Akcje`, `Krypto`, `Instrumenty`, `Kategorie`, `Gotówka`, `Ustawienia`, `Start`), walidacja wierszy, JSON API chronione tokenem, pobieranie kursów z Yahoo Finance (z pre-market / after-hours i cache) + fallback na `GOOGLEFINANCE()`, okno QR „Połącz z aplikacją”.
- **Frontend PWA:** [web/index.html](../web/index.html) — interaktywny wykres pierścieniowy / kołowy SVG, lista pozycji z rozwijanymi szczegółami, przełączniki `Wg spółek / Wg kategorii`, `Gotówka`, `Krypto`, `Pre/Post`, sortowanie, cache lokalny, tryb demo, obsługa iPhone (ikona + ekran początkowy).
- **Eksport dla AI:** kopiowanie stanu portfela w formacie Markdown lub JSON, opcja ukrycia kwot (tylko udziały % i wyniki %), opcjonalny prompt i udostępnianie z iPhone’a.
- **Dokumentacja:** [PRD.md](PRD.md), [SETUP.md](SETUP.md), workflow GitHub Pages.
