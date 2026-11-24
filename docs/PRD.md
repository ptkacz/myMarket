# PRD — myMarket: osobisty dashboard portfela inwestycyjnego

| | |
|---|---|
| **Wersja** | 0.4 (zaktualizowany po wdrożeniu v1.3.0) |
| **Data** | 23.11.2026 |
| **Status** | v1.3.0 zaimplementowana |
| **Bazuje na** | Prototyp „Struktura portfela akcyjnego — 20.11.2026” (HTML + SVG + Tailwind) |

---

## 1. Cel produktu

Lekkie, czytelne narzędzie webowe (otwierane głównie na iPhonie z ekranu głównego, a także na desktopie), które:

1. Czyta transakcje i gotówkę z **Arkusza Google** użytkownika (jedyne źródło prawdy, edytowalne z każdego miejsca).
2. Samo wylicza pozycje otwarte i zamknięte (liczba akcji, średnia cena zakupu/sprzedaży, koszt, wynik niezrealizowany i zrealizowany, wynik dzienny).
3. Pobiera **aktualne kursy** czysto przez API — **bez żadnego udziału AI i bez płatnych subskrypcji** (w tym pre-market / after-hours) — i pokazuje strukturę portfela na **interaktywnym wykresie pierścieniowym** w stylu prototypu.
4. Jest **wielodostępne i dwujęzyczne (EN domyślnie, PL w Ustawieniach)**: jeden wspólny frontend, a każdy użytkownik podłącza własną kopię arkusza ze swoim tokenem.
5. Umożliwia **eksport stanu portfela dla AI** jednym kliknięciem (Markdown / JSON), aby łatwo konsultować kolejne decyzje inwestycyjne.
6. Ma architekturę przygotowaną na kolejne fazy: najbliższe wyniki finansowe (earnings), PLN (kursy NBP), rynki spoza USA (GPW/EUR), metodę FIFO i historię wartości.

### Zasady projektowe
- **Biało, przejrzyście, czytelnie** — wygląd prototypu jest punktem odniesienia; bez zbędnych górnych kart KPI (wszystko widać w środku wykresu i na liście).
- **Minimalna liczba przełączników na głównym ekranie** — rzadko używane opcje (język, styl koła, połączenie) są schowane w Ustawieniach.
- **Mobile-first** (iPhone Safari + PWA), pełny układ dwukolumnowy na desktopie.
- **Arkusz = baza danych.** Aplikacja w v1 jest tylko do odczytu; wszystkie zmiany robi się w arkuszu.
- **Zero zależności od AI w działaniu aplikacji** — każdy może korzystać za darmo.
- **Szybkie iteracje, czysty podział warstw** — wymienne warstwy (źródło danych, dostawca kursów, moduł obliczeń, i18n).

---

## 2. Użytkownicy

| Persona | Potrzeba |
|---|---|
| **Właściciel (Ty)** | Szybki podgląd struktury portfela i wyniku (otwartego i historycznego) na iPhonie; dopisywanie transakcji w arkuszu; łatwe wklejanie aktualnego portfela do rozmowy z AI. |
| **Inna osoba** | Robi kopię szablonu arkusza, wdraża skrypt na swoim koncie Google, podłącza linkiem/QR — ma własny dashboard bez żadnych płatnych subskrypcji. |

---

## 3. Architektura

```mermaid
flowchart LR
  subgraph Google["Konto Google użytkownika"]
    S["Arkusz Google<br/>Akcje, Krypto, Instrumenty, Kategorie, Gotówka, Ustawienia"]
    A["Apps Script (Code.gs)<br/>JSON API: surowe dane + kursy + cache"]
    S --> A
  end
  Q["Dostawca kursów (API, bez AI)<br/>Yahoo Finance chart API<br/>fallback: GOOGLEFINANCE()"] --> A
  N["NBP API (v1.4: kursy PLN)"] -.-> A
  A -- "HTTPS GET JSON (URL + token)" --> F["Frontend PWA (statyczny, bez builda)<br/>HTML + modułowy JS + SVG + Tailwind<br/>hosting: GitHub Pages"]
  F --> I["iPhone Safari / ikona na ekranie głównym"]
  F -. "Przycisk AI: kopiuj / udostępnij" .-> AI["Dowolny czat AI (Gemini, ChatGPT, Claude)"]
```

### 3.1 Kluczowe decyzje
| Decyzja | Uzasadnienie |
|---|---|
| **Arkusz Google + Apps Script jako backend** | Zero serwerów i kosztów; skrypt kopiuje się razem z arkuszem, więc każdy użytkownik ma prywatny backend z dostępem wyłącznie do własnego pliku. Pobieranie kursów po stronie skryptu omija CORS. |
| **Hosting frontendu: GitHub Pages** | Darmowy, automatyczne wdrożenie przez GitHub Actions (`.github/workflows/pages.yml`) z katalogu `web/`. Repozytorium publiczne bez żadnych prywatnych danych i tokenów. |
| **Frontend bez bundlera (modułowy JS + Tailwind CDN)** | Zero wymagań instalacyjnych; czysty podział na moduły (`i18n.js`, `format.js`, `demo.js`, `api.js`, `engine.js`, `chart.js`, `ai-export.js`, `app.js`) + cache-busting `?v=x.y.z`. |
| **Backend zwraca surowe dane, frontend liczy** | Przełączniki (spółki/kategorie, otwarte/wszystkie/zamknięte, gotówka, krypto, pre/post, sortowanie, język) działają natychmiast bez ponownego zapytania. |
| **Własny wykres SVG (port z prototypu)** | Zachowuje dokładny wygląd i animacje prototypu bez zewnętrznych bibliotek wykresowych. |

### 3.2 Bezpieczeństwo
- Web App wdrożony jako „Wykonaj jako: Ja”, „Kto ma dostęp: Każdy” + **losowy 40-znakowy token** przechowywany w `PropertiesService` skryptu.
- Link QR przekazuje dane w fragmencie `#connect?api=…&token=…` (fragment nie trafia na serwer hostujący), a aplikacja zapisuje go w `localStorage` i czyści pasek adresu (`history.replaceState`).
- W Ustawieniach można wkleić **cały link połączenia** w pole `API URL` — adres i token rozdzielają się automatycznie (wygodne dla odizolowanej pamięci ikony PWA na iPhonie).
- Zakres uprawnień OAuth ograniczony do `spreadsheets.currentonly` (tylko ten jeden arkusz).
- Możliwość unieważnienia wszystkich linków przez `myMarket → Wygeneruj nowy token`.

### 3.3 Kursy rynkowe (100% API, bez AI)
- **Dostawca podstawowy:** Yahoo Finance chart endpoint (`query1.finance.yahoo.com/v8/finance/chart/…`) — darmowy, bez klucza, obsługuje akcje USA, ETF, krypto (`BTC-USD`), waluty (`USDPLN=X`), giełdy spoza USA oraz **pre-market i after-hours**.
- **Fallback:** automatyczna ukryta zakładka `_Kursy` z formułami `GOOGLEFINANCE()` (sesja regularna, opóźnienie do ~20 min).
- **Cache** w `CacheService`: 60 s w godzinach notowań, 15 min gdy rynek zamknięty.
- **Domyślne zachowanie pre/post:** wyłączone w obliczeniach na wykresie; kurs pre/post widoczny jako dodatkowa informacja w szczegółach, a przełącznik **Pre/Post** przełącza wycenę na rozszerzoną sesję.
- **Najbliższe wyniki finansowe (earnings):** pobierane zbiorczo dla otwartych akcji przez Yahoo Finance (`v7/finance/quote` z sesyjnym cookie/crumb); osobny cache 6h w `CacheService` (maks. TTL Apps Script). Gdy brak danych — pole po prostu się nie wyświetla i nigdy nie blokuje kursów.

---

## 4. Struktura arkusza

Jeden broker (bez kolumny konta w v1). **Akcje i krypto są rozdzielone na dwie zakładki** o identycznych kolumnach — czytelność w arkuszu i wspólny model danych w kodzie.

| Zakładka | Rola |
|---|---|
| `Start` | Krótka instrukcja obsługi i wdrożenia |
| `Akcje` | Transakcje akcji i ETF (`Data transakcji`, `Data rozliczenia`, `Typ`, `Ticker`, `Ilość`, `Cena`, `Waluta`, `Prowizja`, `Kurs PLN (auto)`, `Notatka`) |
| `Krypto` | Transakcje kryptowalut (np. `BTC`) — te same kolumny co `Akcje`, wsparcie ilości ułamkowych |
| `Instrumenty` | Słownik: `Ticker`, `Nazwa`, `Kategoria` (steruje widokiem „By category / Wg kategorii”), `Klasa aktywa` (`Akcja`/`ETF`/`Krypto`), `Symbol notowań`, `Waluta`, `Kolor`, `Aktywny` |
| `Kategorie` | Opcjonalnie przypisanie kolorów do kategorii |
| `Gotówka` | Ręcznie wpisywane saldo (`Waluta`, `Saldo`, `Opis`) |
| `Ustawienia` | Nazwa portfela, waluta bazowa, adres frontendu, adres API |
| `_Kursy` | Ukryta, tworzona automatycznie tylko w razie fallbacku na `GOOGLEFINANCE` |

Kolumny przygotowane pod przyszłe wersje: `Data rozliczenia` i `Kurs PLN (auto)` (PLN / NBP), `Waluta` (rynki spoza USA).

---

## 5. Logika obliczeń (`web/js/engine.js`)

- Wszystkie obliczenia w v1 odbywają się w walucie bazowej (`USD`, bez przeliczania różnic kursowych USD/PLN).
- Transakcje z `Akcje` i `Krypto` sortowane chronologicznie po dacie transakcji.
- **Metoda kosztu (v1):** średnia ważona; prowizja kupna zwiększa koszt pozycji, prowizja sprzedaży pomniejsza wynik zrealizowany. (FIFO dojdzie razem z PLN.)
- **Otwarte pozycje (`ilość > 0`):**
  - Wartość = `ilość × kurs bieżący` (regularny lub pre/post zależnie od przełącznika).
  - Wynik otwartej pozycji (`pnl`) obejmuje **wynik niezrealizowany + zrealizowany z częściowych sprzedaży tego samego tickera** (procent `pnlPct` liczony od łącznego kosztu wszystkich zakupów danego tickera; przy braku sprzedaży identyczny z wynikiem niezrealizowanym).
  - Zmiana dzienna = `ilość × (kurs bieżący − poprzednie zamknięcie)`.
- **Całkowicie zamknięte pozycje (`ilość = 0`):**
  - Wyliczany koszt łączny (`cost`), przychód ze sprzedaży (`proceeds`), wynik zrealizowany (`pnl` i `pnlPct`), średnia cena zakupu i sprzedaży, okres (`pierwszy zakup → zamknięcie`), prowizje, grupowanie wg kategorii.

---

## 6. Zakres funkcjonalny — stan aktualny (`v1.3.0`)

### Ekran główny
- **Nagłówek:** nazwa portfela, status sesji + godzina kursów, przyciski **AI**, **Odśwież**, **Ustawienia**. Bez górnych kart KPI.
- **Przełączniki w pasku narzędzi:**
  - Grupowanie: `By stock / By category` (`Wg spółek / Wg kategorii`),
  - Zakres pozycji: `Open / All / Closed` (`Otwarte / Wszystkie / Zamknięte`),
  - Chipy: `Cash` (`Gotówka`, ukryty gdy saldo = 0 lub w trybie `Closed`), `Crypto` (`Krypto`, widoczny gdy istnieją pozycje krypto), `Pre/Post` (widoczny gdy dostępne są notowania rozszerzone, domyślnie wyłączony).
- **Wykres pierścieniowy SVG** (opcja pełnego koła w Ustawieniach):
  - W trybach `Open` i `All`: segmenty, etykiety ticker + %, pop-out, w środku wartość, wynik łączny (w `All` obejmujący otwarte + całkowicie zamknięte z rozbiciem `Open / Closed`) oraz zmiana dzienna.
  - W trybie `Closed`: zamiast koła czysta karta podsumowania **Realized P/L** (wynik USD i %, zainwestowany kapitał, przychód ze sprzedaży, bilans zysk/strata).
- **Ujednolicona karta szczegółów pod wykresem:**
  - Kliknięcie/tapnięcie wiersza na liście **tylko go podświetla** (bez dublowania treści w wierszu); pełne szczegóły (zarówno dla spółek, jak i kategorii, otwartych i zamkniętych) wyświetlają się w jednym miejscu — w karcie pod wykresem, w układzie z wartością, udziałem %, wynikiem % i zmianą dzienną + sekcją szczegółów pod kreską (w tym rozbiciem `Open / Realized` przy częściowych sprzedażach oraz **najbliższą datą wyników finansowych** z odliczaniem dni — wyróżnioną dla wyników w ciągu 14 dni).
  - Na mniejszych ekranach kliknięcie pozycji delikatnie przewija do karty szczegółów, jeśli jest poza widokiem.
- **Lista pozycji / kategorii:** kompaktowe 2-liniowe wiersze we wspólnej białej ramce z cienkimi liniami podziału (ok. 2× więcej pozycji widocznych bez przewijania); sortowanie (`value` / `P/L USD`, `P/L %`, `daily change`, `A–Z`); w trybie `All` pod otwartymi pozycjami pojawia się oddzielona sekcja zamkniętych pozycji.
- **Uwagi z arkusza:** zwijana lista ostrzeżeń walidacji.
- **Tryb demo**, natychmiastowe ładowanie z lokalnego cache + auto-odświeżanie co 60 s w trakcie sesji.

### Język i formatowanie (`web/js/i18n.js`, `web/js/format.js`)
- **Domyślny język: angielski (`EN`)**, przełącznik **`English | Polski`** w Ustawieniach (zapisywany w `localStorage`).
- Formatowanie liczb i dat automatycznie dopasowane do wybranego języka (`$10,823.35` w EN vs `$10 823,35` w PL).
- Nazwy spółek i kategorii pochodzą bezpośrednio z Arkusza Google użytkownika.

### Eksport dla AI (`web/js/ai-export.js`)
- Przycisk **AI** w nagłówku otwiera gotowy podgląd portfela w aktualnie wybranym języku (`EN` / `PL`):
  - format **Text (Markdown)** lub **JSON**,
  - opcja **Hide amounts / Ukryj kwoty** (zostają udziały %, średnie ceny, kursy i wyniki %),
  - opcja **Add prompt / Dodaj prośbę** (krótki prompt startowy),
  - zawiera podsumowanie, otwarte pozycje (z rozbiciem częściowych sprzedaży), **zamknięte pozycje** oraz strukturę kategorii,
  - przyciski **Copy** oraz **Share…** (natywny arkusz udostępniania na iPhonie).

---

## 7. Roadmapa

| Wersja | Zakres | Status |
|---|---|---|
| **v1.0** | Arkusz (`Akcje` + `Krypto`), Apps Script API + Yahoo/GOOGLEFINANCE, wykres pierścieniowy, lista pozycji, przełączniki, eksport dla AI, PWA na iPhone, GitHub Pages. | Gotowe |
| **v1.0.3** | Ujednolicenie karty szczegółów pod wykresem (spółki + kategorie), usunięcie dublowania na liście, delikatne przewijanie na mobile. | Gotowe |
| **v1.1.0** | Tryby `Open / All / Closed`, częściowe sprzedaże uwzględniane w wyniku otwartej pozycji, widok całkowicie zamkniętych pozycji i kategorii, zamknięte pozycje w eksporcie AI. | Gotowe |
| **v1.2.0** | Przełącznik języka `EN / PL` w Ustawieniach (EN domyślny), lokalne formatowanie liczb i dat, dwujęzyczny eksport AI. | Gotowe |
| **v1.3 — Najbliższe wyniki (Earnings)** | Pobieranie najbliższej daty publikacji wyników finansowych (Yahoo quote/crumb + fallback Nasdaq, cache 6h) i wyświetlanie jej w karcie szczegółów spółki, tooltipie oraz w eksporcie AI. | Gotowe |
| **v1.4 — PLN i podatki** | Automatyczne pobieranie kursu średniego **NBP (tabela A)** z ostatniego dnia roboczego przed datą rozliczenia do kolumny `Kurs PLN (auto)`; przełącznik waluty **USD / PLN** (z bieżącym kursem `USDPLN=X`); wynik w PLN z różnicami kursowymi; opcja metody kosztu **FIFO** (pod PIT-38). | Następny krok |
| **v1.5 — Rynki spoza USA i wielowalutowość** | Obsługa spółek w PLN (GPW, np. `CDR.WA`), EUR (np. `SAP.DE`), GBP itp. — przeliczanie walut w locie, gotówka wielowalutowa. | Planowane |
| **v2.x — Rozwój** | Wykres wartości portfela w czasie (dzienne snapshoty do zakładki `Historia`), dywidendy, porównanie z benchmarkiem (S&P 500 / Nasdaq), docelowe wagi i rebalancing, tryb ciemny, wiele kont/brokerów, opcjonalne logowanie Google OAuth. | Pomysły |

---

## 8. Historia zmian PRD

| Wersja | Data | Zmiana |
|---|---|---|
| 0.1 | 22.11.2026 | Pierwszy draft na bazie prototypu i wymagań użytkownika. |
| 0.2 | 22.11.2026 | Zatwierdzony zakres v1.0: GitHub Pages, osobne zakładki `Akcje`/`Krypto`, domyślnie wyłączone pre/post, jeden broker, eksport AI, architektura zero-build. |
| 0.3 | 23.11.2026 | Aktualizacja po v1.0.3–v1.2.0: ujednolicona karta szczegółów pod wykresem, tryby `Open / All / Closed` z częściowymi sprzedażami, dwujęzyczność `EN / PL` (EN domyślny) w Ustawieniach, plan najbliższych wyników (v1.3). |
| 0.4 | 23.11.2026 | Aktualizacja po v1.2.1–v1.3.0: pionowy układ `Open / Closed` w środku koła, najbliższe daty wyników finansowych (Yahoo + fallback Nasdaq, cache 6h) w karcie szczegółów, tooltipie i eksporcie AI. |
