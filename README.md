# Rozvodňa

Administračný panel na prehľadávanie a úpravu registrov Home Assistanta.
Zariadenia a entity sú v jednej tabuľke. Každý riadok sa potvrdzuje zvlášť
a globálne **Uložiť** zapíše potvrdené návrhy zo všetkých integrácií.

**Verzia 0.1.0-alpha · Home Assistant Core 2026.11 · MIT**

![Panel Rozvodne v Home Assistante](docs/images/panel-preview.png)

Náhľad z izolovanej inštancie Home Assistanta zobrazuje testovacie záznamy.

## Inštalácia cez Marketplace

1. V Home Assistante 2026.11 alebo novšom otvor **Nastavenia → Marketplace**.
2. Vyber **Pridať z odkazu** a vlož `https://github.com/denkz0ne/ha-rozvodna`.
   Pri prvom pridaní vlastného repozitára Marketplace požiada o prepojenie s GitHubom.
3. Nainštaluj **Rozvodňu**. Po reštarte pridaj integráciu cez
   **Nastavenia → Zariadenia a služby → Pridať integráciu**.
4. Otvor **Rozvodňa** v bočnom menu. Inštancia integrácie nemá parametre.

[Dokumentácia Marketplace](https://www.home-assistant.io/integrations/marketplace/#custom-repositories)

Pri ručnej inštalácii skopíruj celý priečinok `custom_components/rozvodna`
do `<config>/custom_components/` a pokračuj reštartom a pridaním integrácie.

## Práca s registrom

1. Vyber integráciu a podľa potreby rozbaľ entity. Kliknutím na názov v prvom stĺpci
   otvoríš editor. Oblasti a štítky vyberáš v ponuke nad tabuľkou. Enter prejde na ďalší viditeľný riadok a Tab na ďalšie pole.
   Shift otočí smer. Esc obnoví hodnotu pred otvorením editora.
2. Oranžový návrh potvrď fajkou na konci daného riadka. Zelené návrhy
   prežijú obnovenie stránky a nájdeš ich cez **Skontrolovať potvrdené**.
3. **Uložiť** overí a zapíše potvrdené návrhy. Zmenu ID entity musíš
   potvrdiť samostatne. Odkazy v YAML, šablónach a kartách skontroluj
   podľa použitých ID.
4. V **Histórii** otvor detail zápisu. **Pripraviť návrat** vloží opačné
   hodnoty medzi potvrdené návrhy. Môžeš vybrať aj jednotlivé položky.
5. Pri konflikte obnov register, skontroluj detail a zruš alebo uprav
   kolidujúci návrh. Konflikt sa pri ukladaní neprepisuje automaticky.

Hromadné úpravy otvor po označení riadkov. Náhľad podporuje oblasť, štítky
a úpravy názvov. Po prenesení náhľadu do tabuľky potvrď dotknuté riadky.

Pri odstránení integrácie zmizne panel. SQLite história a staging zostanú
v priečinku `<config>/rozvodna` pre prípad opätovného pridania.

[Architektúra](docs/ARCHITECTURE.md) · [Špecifikácia](docs/SPECIFICATION.md) ·
[API](docs/API.md) · [Databáza](docs/DATABASE.md) · [Vývoj](docs/DEVELOPMENT.md) ·
[Roadmapa](docs/ROADMAP.md)
