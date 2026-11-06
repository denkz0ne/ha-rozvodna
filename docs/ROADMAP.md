# Roadmapa

## 0.1.0-alpha

- Admin panel, filtre integrácií, vyhľadávanie, zoraďovanie a 100 riadkov
  na stranu. Integračné položky a podpoložky sú viditeľné ako kontext.
- Inline editácia, hromadné návrhy, staging a história s návratom.
- Samostatný SQLite snapshot a zápisy s kontrolou konfliktov.

## Plánované

- Samostatné filtre config entry, subentry, oblastí a štítkov.
- Detailnejšie prezeranie a porovnanie počiatočného snapshotu.
- Priebežné načítanie zmien len pre dotknuté záznamy a virtualizácia.
- Nájdenie odkazov na staré ID v podporovaných typoch konfigurácie a
  bezpečný plán viacstupňových presunov medzi obsadenými ID.

Aktuálna verzia odmieta presuny na obsadené ID a ich výmeny. Panel
stránkuje, klávesová navigácia sa drží aktuálnej strany. Pri udalostiach
registrov používa odložené obnovenie snapshotu, ktoré počká na ukončenie
editora. Priradenie zariadenia, integračnej položky či podpoložky je len
na čítanie. Externé zmeny sa prejavia po obnovení, bez zápisu do histórie.
