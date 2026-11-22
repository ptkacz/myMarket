# Instrukcja uruchomienia — myMarket

Cała konfiguracja zajmuje ok. 5–10 minut. W repozytorium **nie ma żadnych prywatnych danych ani tokenów**, więc może być publiczne (wymagane dla darmowego GitHub Pages).

---

## Krok 1. Opublikuj frontend na GitHub Pages (tylko właściciel projektu, raz)

1. Utwórz konto / repozytorium na GitHubie o nazwie np. `myMarket` (ustaw widoczność **Public**, żeby darmowy GitHub Pages działał).
2. Wypchnij zawartość tego katalogu na gałąź `main`:
   ```bash
   git init
   git add .
   git commit -m "myMarket v1.0"
   git branch -M main
   git remote add origin https://github.com/TWOJ-LOGIN/myMarket.git
   git push -u origin main
   ```
3. Na GitHubie wejdź w **Settings → Pages → Build and deployment → Source** i wybierz **GitHub Actions**.
4. Po ok. 1 minucie w zakładce **Actions** pojawi się gotowy adres aplikacji:
   `https://TWOJ-LOGIN.github.io/myMarket/`

> Jeśli inna osoba chce używać myMarket ze swoim arkuszem, **pomija Krok 1** i korzysta z tego samego adresu frontendu (albo robi kopię Twojego arkusza z Kroku 2).

---

## Krok 2. Przygotuj swój Arkusz Google

1. Utwórz nowy pusty Arkusz Google na swoim Dysku (np. `myMarket — Portfel`).
2. W menu arkusza wybierz **Rozszerzenia → Apps Script**.
3. Usuń domyślny kod z pliku `Kod.gs` i wklej **całą** zawartość pliku [apps-script/Code.gs](../apps-script/Code.gs).
4. Zapisz projekt (ikona dyskietki / `Ctrl+S`), a następnie **odśwież kartę z Arkuszem Google** (`F5`).
5. Po kilku sekundach w górnym menu arkusza pojawi się pozycja **myMarket**. Kliknij **myMarket → 1. Przygotuj arkusz**.
   - Google poprosi o jednorazową autoryzację skryptu: kliknij **Kontynuuj → Zaawansowane → Przejdź do… (niebezpieczne) → Zezwól**. (Ostrzeżenie dotyczy Twojego własnego, niezweryfikowanego przez Google skryptu — skrypt ma dostęp wyłącznie do tego arkusza.)
   - Potwierdź, czy chcesz na start przykładowe dane (możesz je potem nadpisać swoimi).

### Jak uzupełniać arkusz
- **Akcje** — każdy zakup lub sprzedaż w osobnym wierszu (`KUPNO` / `SPRZEDAŻ`).
- **Krypto** — osobna zakładka z takimi samymi kolumnami (np. `BTC`, ilości ułamkowe).
- **Instrumenty** — słownik spółek i krypto. Tutaj wpisujesz **Kategorię** (steruje widokiem „Wg kategorii”) oraz opcjonalny kolor (`#HEX`) i **Symbol notowań** (jeśli inny niż ticker, np. `BTC-USD`).
- **Kategorie** — opcjonalnie kolor dla każdej kategorii.
- **Gotówka** — ręczne saldo wolnych środków (np. `USD | 1180`).
- **Ustawienia** — nazwa portfela, waluta i adresy połączenia.

---

## Krok 3. Wdróż API (Apps Script Web App)

1. W edytorze **Apps Script** kliknij **Wdróż → Nowe wdrożenie** (prawy górny róg).
2. Wybierz typ: **Aplikacja internetowa** (ikona koła zębatego).
3. Ustaw:
   - **Wykonaj jako:** `Ja`
   - **Kto ma dostęp:** `Każdy` *(wymagane dla zapytań z przeglądarki; dostęp chroni tajny token z arkusza)*
4. Kliknij **Wdróż** i skopiuj wygenerowany **URL aplikacji internetowej** (kończy się na `/exec`).
5. Wróć do Arkusza Google → zakładka **Ustawienia**:
   - w wierszu **Adres aplikacji (frontend)** wpisz swój adres z Kroku 1 (np. `https://TWOJ-LOGIN.github.io/myMarket/`),
   - w wierszu **Adres API (Web App)** wklej skopiowany URL kończący się na `/exec`.
6. Opcjonalnie sprawdź działanie: menu **myMarket → Testuj kursy**.

> **Gdy w przyszłości zaktualizujesz kod w `Code.gs`:** kliknij **Wdróż → Zarządzaj wdrożeniami → ikona ołówka → Wersja: Nowa wersja → Wdróż**. Adres URL i link na iPhonie pozostaną te same.

---

## Krok 4. Połącz iPhone’a (i komputer)

1. W arkuszu wybierz menu **myMarket → 2. Połącz z aplikacją (link + QR)**.
2. Zeskanuj kod QR aparatem iPhone’a — otworzy się Safari, zapisze połączenie lokalnie i od razu usunie token z paska adresu.
3. W Safari stuknij przycisk **Udostępnij** (kwadrat ze strzałką w górę) → **Dodaj do ekranu początkowego**.
4. Gotowe — aplikacja otwiera się jak natywna apka z ikoną na pulpicie.

---

## Jak udostępnić narzędzie znajomemu

1. Zrób czystą kopię swojego arkusza (bez prywatnych transakcji) i udostępnij link jako **„Każdy z linkiem może wyświetlać”**.
2. Znajomy wybiera **Plik → Utwórz kopię** na swój Dysk (skrypt kopiuje się razem z arkuszem).
3. Wykonuje **Krok 2 (pkt 5: Przygotuj arkusz)**, **Krok 3** i **Krok 4** — ma własne prywatne API i własny token na tym samym frontendzie.
