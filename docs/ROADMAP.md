# Roadmapa

## 0.1.0

- Stabilný admin panel s tabuľkou zariadení a entít, textovým vyhľadávaním,
  viacerými filtrami integrácií a filtrami stavov Home Assistanta.
- Vyhľadávanie bez rozlišovania diakritiky a veľkosti písmen.
- Jeden zoznam všetkých zodpovedajúcich riadkov bez stránkovania.
- Inline a hromadné úpravy, potvrdenia, SQLite história a príprava návratu.
- Ikonové odkazy do natívneho detailu entity a stránky zariadenia.
- Responzívny panel filtrov, native hide switch a slovenské/anglické rozhranie.

## 0.2.0

- Hromadná úprava oblasti, štítkov, skrytia a vypnutia; Shift výber rozsahu.
- Jemný rámček názvu pri hoveri a zarovnanie stavovej ikony entity.
- Kontrola odkazov pred premenovaním entity s bezpečnými opravami úložných
  dashboardov cez HA API a ručnými upozorneniami pre ostatné zistené odkazy.

## Plánované

- Samostatné filtre config entry, subentry, oblastí a štítkov.
- Detailnejšie prezeranie a porovnanie počiatočného snapshotu.
- Priebežné načítanie dotknutých záznamov a výkonové vylepšenia veľkých zoznamov
  bez návratu k stránkovaniu.
- Bezpečný plán viacstupňových presunov medzi obsadenými ID.

Aktuálna verzia odmieta presuny na obsadené ID a ich výmeny. Úplné vykreslenie
zoznamu bez stránkovania môže pri tisícoch entít zvýšiť spotrebu pamäte.
Priradenie zariadenia, integračnej položky či podpoložky je iba na čítanie.
Externé zmeny sa prejavia po obnovení, bez zápisu do histórie.
