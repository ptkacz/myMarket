# myMarket

Lekki, przejrzysty dashboard portfela inwestycyjnego zasilany **Arkusza Google**, gotowy do użycia na iPhonie (PWA) i desktopie.

- **Dane tylko u Ciebie:** transakcje i gotówka w Twoim Arkuszu Google, zero zewnętrznych baz danych i zero kosztów.
- **Wielodostępność:** każdy może skopiować arkusz i podpiąć go do tej samej aplikacji — w repozytorium nie ma żadnych prywatnych danych ani tokenów.
- **Aktualne kursy bez AI:** czyste API (Yahoo Finance z pre-market / after-hours + fallback `GOOGLEFINANCE`).
- **Konsultacje z AI:** wbudowany przycisk **AI** kopiuje czytelne podsumowanie portfela (Markdown lub JSON, z opcją ukrycia kwot) do wklejenia w Gemini / ChatGPT / Claude.

## Struktura projektu
- `apps-script/` — kod backendu ([Code.gs](apps-script/Code.gs)) wklejany do Arkusza Google.
- `web/` — statyczny frontend publikowany na GitHub Pages (działa bez budowania).
- `docs/` — [PRD](docs/PRD.md), [instrukcja uruchomienia](docs/SETUP.md), [changelog](docs/CHANGELOG.md).

## Szybki start
Zobacz krok po kroku w [docs/SETUP.md](docs/SETUP.md).
