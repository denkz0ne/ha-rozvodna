# Changelog

## 0.2.0

- Hromadná úprava oblasti, štítkov, skrytia a vypnutia; Shift výber rozsahu.
- Pri hoveri sa zvýrazní iba názov a stavová ikona entity je zarovnaná o pozíciu doľava.
- Pred zmenou ID sa kontrolujú odkazy v úložných dashboardoch, automatizáciách
  a skriptoch. Presné odkazy v dashboardoch možno bezpečne opraviť cez HA API;
  ostatné nálezy sa zobrazia na ručnú kontrolu.
- Opravy dashboardov sa zapisujú spolu s premenovaním do histórie a dajú sa
  vrátiť spoločne. Pridané sú testy a dokumentácia bezpečnostných obmedzení.

## 0.1.0

- Prvé stabilné vydanie pre Home Assistant Core 2026.11.
- Textové vyhľadávanie ignoruje diakritiku a veľkosť písmen. Hľadá v názvoch,
  ID, integráciách, oblastiach, štítkoch a názvoch konfiguračných položiek.
- Výber integrácií podporuje viacero zaškrtnutých možností. Pribudol filter
  stavu podľa kategórií Home Assistanta a meniteľná šírka bočného panela.
- Zoznam zobrazuje všetky zodpovedajúce záznamy na jednej stránke bez stránkovania.
- Ikona entity otvára natívne okno s podrobnosťami. Ikona zariadenia otvára
  stránku zariadenia v novej karte. Názov zostáva samostatným ovládaním na premenovanie.
- Skrytie entity používa natívny prepínač Home Assistanta. Hodnoty spravované
  integráciou sú iba na čítanie.
- Vybrané štítky sa v ponuke zobrazia pred nevybranými. Kliknutie mimo editora
  najprv dokončí rozpracovanú úpravu a neaktivuje cieľový editor tým istým klikom.
- Zariadenia zobrazujú počet entít a riadky používajú natívne ikony a tooltipy.

## 0.1.0-alpha

- Inštalovateľná custom integration s administračným panelom.
- Tabuľka zariadení a entít s editormi, vyhľadávaním a filtrom integrácií.
- Hromadný náhľad, potvrdenia po riadkoch a perzistentný staging.
- Kontrola konfliktov a kolízií ID, žurnál a detail výsledku zápisu.
- Východiskový snapshot, história a príprava celého alebo čiastočného návratu.
- Slovenské a anglické rozhranie.
