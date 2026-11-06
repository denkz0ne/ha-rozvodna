# Roadmapa

## 0.1.0

- Stabilný admin panel s tabuľkou zariadení a entít, textovým vyhľadávaním,
  viacerými filtrami integrácií a filtrami stavov Home Assistanta.
- Vyhľadávanie bez rozlišovania diakritiky a veľkosti písmen.
- Jeden zoznam všetkých zodpovedajúcich riadkov bez stránkovania.
- Inline a hromadné úpravy, potvrdenia, SQLite história a príprava návratu.
- Ikonové odkazy do natívneho detailu entity a stránky zariadenia.
- Responzívny panel filtrov, native hide switch a slovenské/anglické rozhranie.

## Plánované

- Samostatné filtre config entry, subentry, oblastí a štítkov.
- Detailnejšie prezeranie a porovnanie počiatočného snapshotu.
- Priebežné načítanie dotknutých záznamov a výkonové vylepšenia veľkých zoznamov
  bez návratu k stránkovaniu.
- Kontrola odkazov pred premenovaním entity a bezpečná ponuka automatických
  alebo manuálnych opráv v podporovaných typoch konfigurácie. Návrh a limity
  sú v [issue #12](https://github.com/denkz0ne/ha-rozvodna/issues/12).
- Bezpečný plán viacstupňových presunov medzi obsadenými ID.

Aktuálna verzia odmieta presuny na obsadené ID a ich výmeny. Úplné vykreslenie
zoznamu bez stránkovania môže pri tisícoch entít zvýšiť spotrebu pamäte.
Priradenie zariadenia, integračnej položky či podpoložky je iba na čítanie.
Externé zmeny sa prejavia po obnovení, bez zápisu do histórie.
