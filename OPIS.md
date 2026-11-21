# Bank Wody: opis rozwiązania

**Tytuł:** Bank Wody, doradca wodny dla Twojego pola
**Zadanie:** KOWR „Zatrzymaj wodę, chroń plony – inteligentne wsparcie gospodarowania wodą w rolnictwie”

## Problem
Danych o suszy jest dużo (satelity, pogoda, gleby, mapy), ale są rozproszone i wymagają wiedzy eksperckiej. Rolnik nie dostaje prostej
odpowiedzi na trzy pytania o swoje pole: *czy jest za sucho*, *dlaczego* i *co z tym zrobić*. Istniejące narzędzia pokazują głównie
*gdzie i kiedy* jest susza. Nie podpowiadają, gdzie na konkretnej działce ucieka woda ani jak ją zatrzymać.

## Rozwiązanie
Aplikacja webowa bez instalacji i bez logowania, która działa też na telefonie. Rolnik wskazuje działkę (numer albo kliknięcie na mapie), uprawę i dzień albo dowolny okres (dni, sezon, kilka lat).
W ok. 10–15 s dostaje raport prostym językiem, ułożony w kolejności zalecanej przez naukę i KOWR:

1. **Ile wody ma teraz pole**: trzy niezależne wskaźniki (bilans wody w glebie FAO-56 dla tej uprawy i gleby, opad − parowanie na tle 10 lat, wilgotność roślin z Sentinel-2 oceniana względem wzorca dla tej uprawy) i łączna ocena z deklarowaną pewnością.
2. **Skąd się bierze problem**: deficyt opadów i upał, słaba gleba, spływ wody z pola, wrażliwa faza uprawy, susza nawracająca w historii 10 lat. Każda przyczyna ma konkretne liczby.
3. **Co zrobić**: najpierw *retencja* (konkretne miejsca na mapie: zastawka na cieku, oczko w obniżeniu, pas zadrzewień, każde z objętością w m³), potem *agrotechnika* (międzyplony, mulcz, próchnica z wyliczonym zyskiem wody, uprawa w poprzek stoku…), na końcu *nawadnianie* (tak / nie, kiedy, ile mm).
4. **Pogoda, przymrozki, śnieg i studnie**: prognoza z ostrzeżeniem o przymrozku w fazach wrażliwych, zima i roztopy (ile wody dał śnieg i jak ją zatrzymać), stan wód podziemnych z zaleceniem dla studni i zbiornik wód podziemnych pod polem (PIG-PIB).
5. **Mapa 3D pola**: prawdziwy teren z animacją spływu deszczu, punkty, którymi woda ucieka, i efekt zastawki.
6. **10 lat wstecz**: w ilu latach była susza, które miesiące są najgroźniejsze, ile wody trzeba by dolać w typowym i suchym roku, i **która uprawa najlepiej pasuje do wody na tej działce**.
7. **Uczciwość danych**: źródła z datą i licencją, ograniczenia, brakujące dane mówione wprost, oraz *sprawdzian modelu*: porównanie stref suchych wg terenu ze zdjęciem satelitarnym z suszy 2018.

## Wykorzystanie danych
Wszystko pobierane jest **na żywo**, bez płatnych API: ULDK i NMT 1 m (GUGiK, Geoportal), Copernicus DEM, ortofotomapa, Open-Meteo / ERA5 (10 lat + prognoza),
ISRIC SoilGrids, Sentinel-2 L2A (Earth Search) i OpenStreetMap. Metody: FAO-56, FAO-33, SCS-CN, Saxton & Rawls, D8 / TWI, NDVI / NDMI.
Raport przyrasta na oczach użytkownika: pogoda po ~2 s, ocena po ~5–13 s, pełny raport z terenem po ~22 s.

## Korzyści dla rolnika
- Konkretna decyzja zamiast mapy do interpretacji: co, gdzie, ile m³ i kiedy.
- Najpierw tanie działania (retencja, uprawa), nawadnianie dopiero gdy ma sens; budżet wody i prądu pokazuje, gdy rolnik leje za dużo, co chroni wody podziemne.
- Raport do druku / PDF, np. dla doradcy ODR albo jako uzasadnienie wniosku o wsparcie.

## Korzyści dla KOWR
Ten sam silnik, uruchomiony dla zasobu 1,4 mln ha, wskazuje, gdzie retencja zatrzyma najwięcej wody, i może zasilać Portal Rolnika przez API.
