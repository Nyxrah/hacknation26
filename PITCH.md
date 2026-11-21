# Pitch (2–3 min) i film (do 3 min)

## Prezentacja PDF: 10 slajdów
1. **Bank Wody**: „Czy Twoje pole ma dość wody i jak jej nie tracić?” (zrzut strony startowej)
2. **Problem**: dane są, ale rozproszone. Rolnik nie wie, *dlaczego* jest sucho ani *co zrobić*.
3. **Jak działa**: działka → uprawa → dzień → raport w ~20 s (zrzut pipeline’u: pogoda 2 s, ocena 5–13 s, teren 22 s).
4. **Ocena stanu wody**: 3 niezależne wskaźniki + pewność (zrzut sekcji 1).
5. **Przyczyny**: opady, gleba, spływ, faza uprawy, historia (zrzut sekcji 2).
6. **Co zrobić**: retencja → agrotechnika → nawadnianie, z m³ i mm (zrzut sekcji 3).
7. **Mapa 3D**: gdzie ucieka woda, efekt zastawki (zrzut / GIF).
8. **Nauka i dane**: FAO-56, FAO-33, SCS-CN, Saxton & Rawls, TWI, NDMI. GUGiK, Copernicus, ERA5, SoilGrids. Wszystko live i bezpłatnie.
9. **Wiarygodność**: 3 wskaźniki → pewność; sprawdzian TWI × satelita (Babice ρ = 0,39, 57% vs 33%); ograniczenia mówione wprost.
10. **Wdrożenie**: zero kosztów danych, silnik jako API dla Portalu Rolnika i zasobu KOWR, skalowanie przez cache.

## Scenariusz na żywo (jury podaje działkę i datę)
1. Wklej numer działki → „Szukaj” (mapa przelatuje do pola).
2. Wybierz uprawę, ustaw datę albo okres od jury → „Sprawdź moje pole”. Teren z europejskiego modelu 30 m, więc raport jest gotowy w ok. 10–15 s.
3. **Komentuj, co pojawia się po kolei**:
   - „Po dwóch sekundach mamy pogodę z 10 lat. Tyle spadło, tyle wyparowało, tyle lat było suszej.”
   - „Teraz gleba z SoilGrids, więc liczymy bilans wody w strefie korzeni tej uprawy.” (status, pewność)
   - „Satelita: wilgotność roślin względem tego, czego oczekujemy od zdrowej pszenicy w tym tygodniu.”
   - „Teren: którędy ucieka woda i gdzie ją zatrzymać.” (przewiń do „Co zrobić?” i kliknij „Pokaż na mapie pola”)
4. Mapa 3D: ulewa, czerwone krople uciekają, „Pokaż efekt zastawki”.
5. „Drukuj / PDF”: raport z źródłami, datą i ograniczeniami.

## Gotowe odpowiedzi
- **Skąd pewność wyniku?** Trzy niezależne wskaźniki. Gdy się nie zgadzają, piszemy „pewność niska” i dlaczego.
- **Satelita a rodzaj uprawy?** Porównujemy NDMI z wzorcem zdrowego łanu wybranej uprawy w danym tygodniu sezonu. Po zbiorze nie oceniamy.
- **Dlaczego najpierw retencja?** „Retain water where it falls”, czyli zasada z Podstaw naukowych KOWR i wytycznych UE (NWRM).
- **Dlaczego nie lidar / NMT 1 m?** Zgodnie z zaleceniem mentora priorytet ma szybkość: domyślnie europejski model 30 m (2 s), NMT 1 m na życzenie jednym przyciskiem.
- **Limit zapytań do pogody?** Cache na serwerze i automatyczne źródło zapasowe NASA POWER, a raport mówi, z którego źródła liczył.
- **Ochrona środowiska?** Budżet wody: ile uprawa naprawdę potrzebuje, ile rolnik leje i ile prądu kosztuje nadwyżka; studnie i woda do oprysków z deszczówki.
- **Drenaż?** Niewidoczny w danych. Mówimy to w każdym raporcie.
- **AI?** Wyniki z deterministycznych metod naukowych, każda liczba jest śledzalna. AI pomogło nam pisać kod.

## Plan B
- Gdy Geoportal nie odpowiada, raport i tak powstaje (DEM 30 m), a w raporcie jest to zaznaczone.
- Gdy nie ma internetu, pokazujemy wcześniej zapisany PDF raportu i film.
