# Bank Wody: doradca wodny dla Twojego pola

> HackNation 2026 · zadanie KOWR **„Zatrzymaj wodę, chroń plony – inteligentne wsparcie gospodarowania wodą w rolnictwie”**

Rolnik wskazuje **działkę ewidencyjną** (numer albo kliknięcie na mapie), **uprawę** i **dzień analizy**. Aplikacja pobiera na żywo dane
meteorologiczne z 10 lat, glebowe, satelitarne, hydrologiczne i o ukształtowaniu terenu. Następnie w kolejności wymaganej przez KOWR i „Podstawy naukowe”
(**ocena sytuacji wodnej → przyczyny → retencja → agrotechnika → nawadnianie**) przygotowuje raport prostym językiem,
z uzasadnieniem każdego zalecenia, poziomem pewności, źródłami i ograniczeniami. Raport można zapisać w przeglądarce albo wydrukować / zapisać do PDF.

Opis zgłoszenia znajduje się w [OPIS.md](OPIS.md), a scenariusz prezentacji w [PITCH.md](PITCH.md).

---

## 1. Uruchomienie

Wymagany jest **Node.js 20+** (testowane na 24). Nie trzeba kluczy API ani kont.

```bash
npm install
npm run build
npm start            # http://localhost:8080  (PORT=xxxx npm start — inny port)
```

Tryb deweloperski: `npm run dev` (http://localhost:5173, z tym samym proxy co serwer produkcyjny).

Raport z wiersza poleceń, przydatny do weryfikacji wyników:

```bash
node scripts/raport.ts 160201_5.0001.23 2025-06-15 pszenica
node scripts/raport.ts 321004_5.0010.110/15 2018-07-20 kukurydza
```

Uprawy: `pszenica zyto jeczmien rzepak kukurydza ziemniak burak laka`.

**Dlaczego mały serwer, a nie same pliki statyczne?** Geoportal (NMT), Copernicus DEM i Overpass nie wysyłają nagłówków CORS, więc przeglądarka
nie może ich pobrać bezpośrednio. `server.mjs` (Node, **zero zależności**) serwuje aplikację, pośredniczy wyłącznie w zapytaniach do tych trzech
hostów (to nie jest otwarte proxy) i buforuje odpowiedzi na dysku (`cache/`).

## 2. Funkcjonalności

1. **Wybór działki**: numer ewidencyjny (ULDK GUGiK) albo kliknięcie na mapie z nałożonymi granicami działek (KIEG).
2. **Wybór uprawy** (8 najczęstszych: pszenica, żyto/pszenżyto, jęczmień jary, rzepak, kukurydza, ziemniak, burak, łąka) i **daty analizy** (dziś albo dowolny dzień z 10 lat).
3. **Ocena stanu wilgotności** na dzień analizy z czterech niezależnych wskaźników:
   - **woda w glebie**: dobowy bilans wodny FAO-56 dla wybranej uprawy (Kc wg fazy rozwoju, głębokość korzeni) i pojemności wodnej gleby z SoilGrids (funkcje pedotransferowe Saxton & Rawls 2006), od 1 marca do dnia analizy;
   - **klimatyczny bilans wodny** (opad − ET₀) z 30 i 60 dni na tle tych samych okresów w 10 poprzednich latach (percentyl), plus upały i okresy bezopadowe;
   - **wilgotność gleby 0–100 cm** z ERA5-Land na tle tego samego terminu w 10 poprzednich latach (dostępna zawsze, także przy chmurach i poza sezonem);
   - **satelita**: NDMI i NDVI z najnowszej bezchmurnej sceny Sentinel-2 (≤ 45 dni przed datą; starsze zdjęcie ma mniejszą wagę), **interpretowane z uwzględnieniem uprawy**: porównanie z wzorcowym przebiegiem NDVI zdrowego łanu w danym tygodniu sezonu. Poza sezonem (po zbiorze, przed wschodami) wskaźnik nie jest oceniany. Jeśli łan wygląda dużo słabiej niż wzorzec, raport ostrzega, że uprawa może być inna niż wskazana.
   - Wynik łączny w 4 klasach plus **pewność** (wysoka / średnia / niska) zależna od liczby dostępnych i zgodnych wskaźników.
4. **Podatność historyczna (10 lat)**: symulacja każdego sezonu dla tej uprawy i gleby, czyli liczba dni stresu w okresie krytycznym, lata suszy (np. „5 z 10”), miesiące największego ryzyka i średnie / suche zapotrzebowanie na nawadnianie.
5. **Identyfikacja przyczyn**: deficyt opadów i upał, słaba retencja gleby, spływ powierzchniowy (spadki, punkty wyjścia wody), wrażliwa faza uprawy, nawracająca susza, drenaż (jeśli rolnik go potwierdzi). Każda przyczyna ma liczby i dane, z których wynika.
5a. **„Doprecyzuj raport”**: pięć pytań, na które rolnik zna odpowiedź lepiej niż jakakolwiek baza danych: *czy pole jest zdrenowane*, *jaka jest gleba*, *ile deszczu spadło w ostatnim tygodniu (własny deszczomierz)*, *orka czy uprawa bezorkowa*, *czy przy polu rosną wierzby lub topole*. Raport przelicza się w ułamku sekundy, bez ponownego pobierania danych. Drenaż dodaje przyczynę i zalecenie *regulowanego odpływu z drenów*; gleba zastępuje SoilGrids; opad zastępuje ERA5 w ostatnich 7 dniach.
6. **Rekomendacje retencyjne** z analizy terenu: zastawka / próg na cieku (pojemność z symulacji piętrzenia na NMT), oczko w naturalnym obniżeniu (zlewnia, objętość), pas zadrzewień wzdłuż poziomicy. Każda podana jest z **zakresem m³**, efektem rocznym i formalnościami.
7. **Rekomendacje agrotechniczne** zależne od gleby, uprawy, spadku i stanu wody: resztki pożniwne i mulcz, międzyplon, próchnica (z wyliczonym przyrostem zapasu wody dla tej gleby), uprawa uproszczona, uprawa w poprzek stoku, wałowanie, dobór odmian i terminu siewu, nawożenie pod deszcz.
8. **Nawadnianie** (opcjonalne): decyzja tak / przygotuj / nie / poza sezonem, dawka w mm i m³/ha, prognoza opadu na 7 dni (dla daty bieżącej), sezonowe zapotrzebowanie i uwaga prawna.
8a. **Pogoda, przymrozki, śnieg i studnie** (zgłoszone przez rolników w trakcie konsultacji):
   - **pogoda jak ze stacji**: 14 dni wstecz + prognoza 7 dni (Tmin/Tmax, deszcz, śnieg) i **ostrzeżenie o przymrozku** w fazach wrażliwych uprawy (np. kwitnienie rzepaku, młode wschody), a po przymrozku zalecenie oceny łanu;
   - **śnieg i roztopy**: model pokrywy śnieżnej metodą stopniodni. Śnieg nie trafia do gleby od razu, tylko w czasie roztopów, a bilans wodny i spływ liczone są z wody, która faktycznie dociera do gleby. Raport pokazuje, ile śniegu spadło tej zimy na tle 10 lat, ile wody dały roztopy (mm i m³ na działce), ile jest jej teraz w śniegu, i zaleca **zatrzymanie wody z roztopów** (zastawki, dreny, ściernisko / międzyplon);
   - **studnie i wody podziemne**: wskaźnik pośredni (bilans opad − parowanie z 12 miesięcy, wilgotność warstwy 1–2,5 m z ERA5-Land, zasilanie zimowe) na tle 10 lat, plus **główny zbiornik wód podziemnych pod działką** (PIG-PIB, GZWP/LZWP). Zalecenie: *ograniczyć pobór / korzystać oszczędnie / można korzystać* oraz zasady prawne (5 m³/dobę, studnie > 30 m);
   - **opady w kolejnych latach** hydrologicznych (XI–X), w podziale na deszcz i śnieg.
8b. **Praktyki gospodarstwa** (też z konsultacji z rolnikami):
   - **uprawa bezorkowa jako symulacja „co by było, gdyby”**: ta sama symulacja 10 lat liczona dla orki i dla uprawy bezorkowej (resztki na powierzchni: CN −4 wg tabel USDA, parowanie z gleby −15% wg FAO-56) daje różnicę w dniach stresu, latach suszy i spływie, liczoną dla tej działki;
   - **wierzby i topole**: pytanie, czy rosną przy polu. Na suchych polach (gleba kat. I–II, częste susze, niskie wody podziemne) raport wskazuje strefę konkurencji o wodę (20–30 m) i co z nią zrobić; w pasach zadrzewień dobiera gatunki do wilgotności (na suchych polach mało wodochłonne, wierzby tylko w miejscach podmokłych);
   - **woda do oprysków z deszczówki lub zbiornika, nie ze studni**: zużycie wody na opryski dla tej działki i uprawy (liczba zabiegów × 250 l/ha), potrzebna powierzchnia dachu przy lokalnym opadzie i liczba sezonów, na które wystarczy proponowane oczko.
9. **Mapa 3D pola**: prawdziwe ukształtowanie terenu z ortofotomapą, animacja spływu kropli deszczu (czerwone uciekają z działki), punkty wyjścia wody, efekt zastawki i podświetlenie proponowanych miejsc retencji.
10. **Sprawdzian modelu**: strefy suche wg terenu (TWI) porównane ze strefami suchymi na zdjęciu z suszy 2018 r., z korelacją Spearmana i trafnością.
11. **Raport**: źródła z datą pobrania i licencją, ograniczenia, brakujące dane podane wprost. Można go **wydrukować / zapisać do PDF** i **zapisać w przeglądarce** („Moje raporty”, bez konta i bez danych osobowych).
12. **Działa przyrostowo**: pierwsze liczby (pogoda) po 1–2 s, ocena po ok. 5–13 s, pełny raport z terenem w **≈ 22 s** (pomiary w tabeli w pkt 9).
13. Wersja na komputer i **telefon** (układ responsywny); Chrome, Edge, Firefox, Safari, Opera.

## 3. Architektura

```
przeglądarka (React + TypeScript, cała analityka po stronie klienta)
 ├─ src/geo/loader.ts     pipeline: wszystkie źródła równolegle, każde z limitem czasu, raport aktualizowany po każdym
 ├─ src/geo/sources.ts    ULDK · NMT (WCS) · ortofoto (WMS) · Sentinel-2 (STAC + COG, odczyt wycinków) · Copernicus DEM · OSM
 ├─ src/geo/weather.ts    Open-Meteo: ERA5 10+ lat do daty analizy + prognoza 7 dni (dla „dziś”)
 ├─ src/geo/soil.ts       SoilGrids → uziarnienie, próchnica → Saxton & Rawls → pojemność wodna, kategoria podatności, grupa CN
 ├─ src/geo/crops.ts      parametry upraw: Kc, Zr, p (FAO-56), Ky (FAO-33), fenologia, okres krytyczny, wzorcowy NDVI
 ├─ src/geo/hydro.ts      priority-flood, D8, akumulacja, TWI, rasteryzacja, symulacja piętrzenia, SCS-CN
 ├─ src/geo/analyze.ts    analiza terenu: punkty wyjścia wody, miejsca retencji, spływ roczny, walidacja TWI × NDMI
 ├─ src/geo/assess.ts     OCENA → PRZYCZYNY → RETENCJA → AGROTECHNIKA → NAWADNIANIE, pewność, ograniczenia
 └─ src/components/       StartPage, ReportPage, FieldView + Terrain3D (three.js), wykresy (Recharts)
server.mjs                serwer statyczny + proxy z cache dla usług bez CORS (NMT, Copernicus DEM, Overpass)
scripts/raport.ts         ten sam silnik uruchamiany z wiersza poleceń (Node 24 uruchamia TS bezpośrednio)
```

**Wymóg 30 s.** Najwolniejsze źródło to NMT 1 m z Geoportalu, który odpowiada w 17–70 s, zależnie od obciążenia. Dlatego:

- **teren i gleba zaczynają się pobierać już w chwili wskazania działki**, zanim rolnik wybierze uprawę i datę (nie zależą od nich), więc zwykle są gotowe przed kliknięciem „Sprawdź”;
- pozostałe zapytania startują równolegle;
- jeśli NMT nie odpowie w 20 s, teren liczony jest na **Copernicus DEM 30 m**, a gdy NMT dotrze, raport **sam się doprecyzowuje**;
- satelita ma limit 24 s, gleba 15 s, a po ich przekroczeniu raport mówi wprost, czego brakuje;
- **limity Open-Meteo**: zapytanie o 10 lat danych liczy się jako wiele „wywołań”, więc archiwum pogody idzie przez serwer z trwałym cache (dane historyczne się nie zmieniają), współrzędne są zaokrąglane do siatki 0,05° (sąsiednie działki dzielą cache), a odpowiedź 429 jest automatycznie ponawiana.

## 4. Źródła i zakresy danych

| Kategoria (wymóg KOWR) | Źródło | Zakres | Licencja / warunki |
|---|---|---|---|
| przestrzenne: działki | ULDK GUGiK (`uldk.gugik.gov.pl`), mapa: KIEG WMS | granica działki, EPSG:2180 | dane publiczne, bezpłatne |
| przestrzenne: ukształtowanie terenu | NMT 1 m, Geoportal WCS | działka + bufor 200 m, uśrednione do 2 m | bezpłatne, do dowolnego wykorzystania |
| przestrzenne: teren (zapas) | Copernicus DEM GLO-30 (AWS Open Data) | jw., 30 m | licencja Copernicus DEM (bezpłatna, z atrybucją) |
| przestrzenne: użytkowanie / podkład | ortofotomapa Geoportal WMS; Esri World Imagery (tylko podkład mapy wyboru) | — | GUGiK: bezpłatne; Esri: warunki Esri (podkład) |
| meteorologiczne | Open-Meteo: ERA5 i ERA5-Land (archiwum) + model prognozy | dobowo: opad, deszcz, śnieg, ET₀ FAO, Tmin / Tmax / Tśr, wilgotność gleby 0–100 cm i 100–255 cm; od 1 stycznia (rok − 10) do daty analizy, + 7 dni prognozy | CC BY 4.0 |
| glebowe | ISRIC SoilGrids 2.0 (REST) | ił, piasek, pył 0–60 cm; węgiel organiczny 0–30 cm | CC BY 4.0 |
| satelitarne | Sentinel-2 L2A, katalog Earth Search (Element 84), COG | B04, B8A, B11, SCL; scena ≤ 30 dni przed datą + scena z suszy 2018 (V–VII) | licencja Copernicus Sentinel (bezpłatna) |
| hydrogeologiczne | PIG-PIB, CBDG: Główne i Lokalne Zbiorniki Wód Podziemnych (ArcGIS REST, `cbdgmapa.pgi.gov.pl`) | zbiornik pod punktem działki | dane publiczne PIG-PIB (z podaniem źródła) |
| hydrologiczne | cieki i zagłębienia wyznaczane z NMT (akumulacja D8 > 0,8 ha); rowy i cieki z OpenStreetMap (jeśli Overpass odpowie w 15 s) | — | NMT jw.; OSM: ODbL |

## 5. Co jest pobierane na bieżąco, a co wcześniej

- **Wszystkie dane źródłowe pobierane są na żywo** przy każdej analizie, dla wskazanej działki i daty. Aplikacja nie ma żadnych wcześniej przygotowanych rekomendacji ani paczek danych.
- `cache/` na serwerze przechowuje odpowiedzi usług bez CORS (NMT, DEM, OSM) z poprzednich analiz, żeby kolejne analizy tej okolicy były szybsze. Nie zmienia to wyniku i można go w każdej chwili usunąć.
- **Przygotowane wcześniej (21.11.2026)** są tylko **parametry modeli** w kodzie: współczynniki upraw (Kc, Zr, p wg FAO-56; Ky wg FAO-33), fenologia upraw dla Polski i wzorcowe krzywe NDVI zdrowego łanu (przybliżone, na podstawie literatury), progi klasyfikacji. Wynik i rekomendacje zawsze oblicza aplikacja z danych pobranych w danej chwili.

## 6. Biblioteki, usługi i narzędzia AI

| Komponent | Wersja | Licencja | Do czego |
|---|---|---|---|
| React, React DOM | 19 | MIT | interfejs |
| Vite, @vitejs/plugin-react | 8 / 6 | MIT | budowanie |
| TypeScript | 7 | Apache-2.0 | język |
| Tailwind CSS | 4 | MIT | style |
| Leaflet | 1.9 | BSD-2-Clause | mapa wyboru działki |
| three.js | 0.187 | MIT | model 3D pola |
| Recharts | 3 | MIT | wykresy |
| geotiff.js | 3 | MIT | odczyt GeoTIFF / COG (NMT, Sentinel-2, DEM) |
| proj4js | 2.23 | MIT | układy współrzędnych (EPSG:2180, UTM, WGS84) |
| Fonty Fraunces, Source Sans 3 (Google Fonts) | — | SIL OFL 1.1 | typografia |

Usługi zewnętrzne: jak w pkt 4 (wszystkie bezpłatne, bez kluczy). **Nie ma płatnych usług ani warstw infrastruktury.**

**Sztuczna inteligencja.** Aplikacja **nie używa** modeli AI w działaniu: wszystkie wyniki pochodzą z deterministycznych, opisanych w literaturze
metod (FAO-56, FAO-33, SCS-CN, Saxton & Rawls, TWI, NDMI/NDVI), więc każdą liczbę da się prześledzić. Kod i dokumentację przygotowano z pomocą
asystenta programistycznego **Claude Code (Anthropic)**, a zespół zweryfikował wyniki na rzeczywistych działkach (pkt 9).

## 7. Licencje i warunki

Kod: do przekazania KOWR na zasadach regulaminu (§ 5). Wszystkie biblioteki mają licencje permisywne (MIT, BSD, Apache-2.0, OFL), które pozwalają
na korzystanie, modyfikację i dystrybucję, także komercyjną. W raporcie wymagane jest podanie źródeł danych (atrybucja CC BY / Copernicus / ODbL),
co aplikacja robi automatycznie w sekcji „Skąd te dane”.

## 8. Znane ograniczenia i co z nimi zrobiliśmy

| Ograniczenie | Jak je rozwiązaliśmy | Co zostaje |
|---|---|---|
| Teren 30 m, gdy Geoportal jest wolny | prefetch NMT 1 m od chwili wskazania działki + cache serwera + automatyczne doprecyzowanie | DEM 30 m tylko przy awarii lub bardzo dużym obciążeniu Geoportalu |
| Spływ SCS-CN przy „przeciętnej wilgotności” | poprawka CN na wilgotność poprzedzającą (AMC I/II/III wg opadu z 5 dni, USDA NEH-4) dla każdego dnia | — |
| Brak zdjęcia satelitarnego (chmury) | czwarty wskaźnik: wilgotność gleby ERA5-Land (zawsze dostępna) + okno satelitarne 45 dni z wagą zależną od wieku zdjęcia | bez zdjęcia ocena opiera się na 3 wskaźnikach, co raport mówi wprost |
| Drenaż podziemny niewidoczny w danych | pytanie do rolnika; „tak” dodaje przyczynę i zalecenie regulowanego odpływu z drenów | przy „nie wiem” raport o tym przypomina |
| SoilGrids 250 m to model globalny | rolnik może wskazać kategorię gleby (bardzo lekka … ciężka, z podpowiedzią klas bonitacyjnych) | próchnica nadal z SoilGrids |
| ERA5 ma siatkę 9–25 km, lokalne burze | rolnik może wpisać opad z własnego deszczomierza (ostatnie 7 dni) | wcześniejsze dni z ERA5; docelowo stacje IMGW-PIB |
| Śnieg liczony jak deszcz | model pokrywy śnieżnej (stopniodni): woda z roztopów trafia do gleby w dniu topnienia | stały współczynnik topnienia 3 mm/°C/dobę |
| Brak danych o studniach | wskaźnik pośredni z 12-miesięcznego bilansu, ERA5-Land 1–2,5 m i zasilania zimowego + zbiornik GZWP pod działką (PIG-PIB) | pomiary poziomu wody w studniach monitoringu PIG-PIB nie są publicznie dostępne (wymagają zgody GIOŚ) |
| Wzorce NDVI / NDMI przybliżone, uprawa podawana przez rolnika | ostrzeżenie, gdy łan wygląda inaczej niż wzorzec wybranej uprawy | docelowo automatyczne rozpoznanie uprawy z przebiegu NDVI w sezonie |

Pozostałe: koszty interwencji nie są liczone (zależą od wykonawcy), a formalności (zgłoszenie / pozwolenie wodnoprawne) są sygnalizowane.

## 9. Weryfikacja wyników

1. **Każda liczba jest śledzalna**: przyczyny i rekomendacje pokazują dane wejściowe (percentyl KBW, mm, %, scena satelitarna, metoda).
2. **Spójność trzech niezależnych wskaźników** (bilans glebowy, klimatyczny bilans wodny, satelita) decyduje o deklarowanej pewności oceny.
3. **Sprawdzian modelu terenu z satelitą** (TWI × NDMI w suszy 2018, bloki 20 m). Wyniki z pomiarów w trakcie hackathonu:

   | Działka | ρ Spearmana | trafność najsuchszej ⅓ (losowo 33%) |
   |---|---|---|
   | 160201_5.0001.23 (Babice, less, 34 ha) | 0,39 | 57% |
   | 321004_5.0010.110/15 (Kruszwin, morena, 45 ha) | 0,34 | 53% |
   | 061404_4.0005.582 (Wylągi, mieszane uprawy, 6 ha) | 0,26 | 39% |

4. **Wiarygodność historyczna**: dla Babic (pszenica) rok 2018 wychodzi jako najsuchszy w dekadzie (28 dni stresu w okresie krytycznym), a 2024 jako drugi. To zgadza się z suszą rolniczą ogłaszaną w tych latach w monitoringu IUNG-PIB. Dla Kruszwina (kukurydza, 20.07.2018) raport wskazuje stres i nawadnianie ok. 35 mm.
5. **Raport z wiersza poleceń** (`scripts/raport.ts`) pozwala odtworzyć dowolny wynik bez przeglądarki.
6. **Czas** (pomiar 21.11.2026, z rozgrzanym cache tylko dla ULDK):

   | Działka, data, uprawa | pogoda | ocena | satelita | pełny raport |
   |---|---|---|---|---|
   | Babice, 15.06.2025, pszenica | 1,5 s | 5,4 s | 11,8 s | 22,4 s |
   | Kruszwin, 20.07.2018, kukurydza | 0,9 s | 13,0 s | 13,1 s | 22,3 s |

## Skalowalność (5.5)

- **Limity źródeł**: cache odpowiedzi na serwerze (NMT, DEM, OSM) i równoległe zapytania z limitami czasu. Przy dużym ruchu warto dodać kolejkę zapytań do Geoportalu i cache wyników per działka + data (raport z tego samego dnia jest identyczny).
- **Aktualizacja danych**: pogoda i satelita są zawsze najświeższe (pobierane przy analizie). Dane statyczne (NMT, gleba) można wstępnie przeliczyć dla całego kraju albo dla gruntów KOWR (np. kafle TWI / spadków) i serwować z magazynu obiektów, co skróci raport do kilku sekund.
- **Koszty**: obecnie 0 zł (darmowe API). Przy tysiącach użytkowników trzeba liczyć 1 mały serwer / kontener i magazyn na cache, rzędu kilkudziesięciu–kilkuset zł miesięcznie. Open-Meteo przy użyciu komercyjnym na dużą skalę wymaga planu płatnego, a alternatywą jest IMGW-PIB.
- **Integracja**: silnik (`src/geo`) jest niezależny od interfejsu i działa też w Node (`scripts/raport.ts`), więc łatwo wystawić go jako API, np. dla Portalu Rolnika lub systemów KOWR.

## Bezpieczeństwo (5.6)

- Brak kont, logowania i danych osobowych. „Moje raporty” trzymamy tylko w `localStorage` przeglądarki użytkownika.
- Serwer pośredniczy wyłącznie w trzech zdefiniowanych hostach (lista dozwolonych), nie jest otwartym proxy. Ścieżki plików są ograniczone do `dist/` (ochrona przed `../`), z nagłówkiem `X-Content-Type-Options: nosniff`.
- Brak sekretów i kluczy API w repozytorium.

## Struktura repozytorium

```
src/geo/          silnik analityczny (opis w pkt 3)
src/components/   interfejs
server.mjs        serwer produkcyjny + proxy + cache
scripts/raport.ts raport z wiersza poleceń
legacy/zastawka/  wcześniejszy prototyp (poza buildem)
OPIS.md           opis rozwiązania do zgłoszenia
PITCH.md          scenariusz prezentacji i filmu
```
