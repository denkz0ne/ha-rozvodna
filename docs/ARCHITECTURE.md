# Architektúra

Rozvodňa je samostatná custom integration s jednou config entry. Core
registruje administračný panel cez `panel_custom` a vlastné WebSocket príkazy
cez `websocket_api`. Panel je natívny webový komponent s premennými témy HA.
Importuje iba súbory dodané s integráciou a používa verejný panelový kontrakt
`hass`, `panel`, `narrow` a `route`. Interné komponenty HA tabuľky by
viazali integráciu na konkrétny build frontendu. [Custom panel](https://developers.home-assistant.io/docs/frontend/custom-ui/custom-panel/)

## Registry

- Core 2026.11 má hlavné a podriadené zariadenia so samostatnými metódami
  zápisu. Používame ich skutočné ID, `config_entry_id`,
  `config_subentry_id`, `parent_device_id` a `via_device_id`. Syntetické
  composite zariadenia sa neupravujú. [Device Registry](https://github.com/home-assistant/core/blob/2026.11.0/homeassistant/helpers/device_registry.py)
- Zariadenie zapisuje `name_by_user`, `area_id` a `labels`. Entita zapisuje
  `name`, `entity_id`, `area_id`, `labels`, `icon`, `hidden_by` a
  `disabled_by`. Pri skrytí a vypnutí používame iba stavy dostupné
  používateľovi. Stavy odvodené integráciou, config entry alebo zariadením
  sú chránené. Opätovné povolenie môže vyžadovať reload alebo reštart.
  [WebSocket pre entity](https://github.com/home-assistant/core/blob/2026.11.0/homeassistant/components/config/entity_registry.py)
  [WebSocket pre zariadenia](https://github.com/home-assistant/core/blob/2026.11.0/homeassistant/components/config/device_registry.py)
- `null` odstráni override. Zobrazovaný názov entity čítame pomocou výpočtu HA
  2026.11. Počas editácie ukazujeme uloženú hodnotu oddelene od naposledy
  vypočítaného názvu. Rodičovské zariadenie a oblasť ovplyvňujú kontext, ktorý
  HA zobrazuje na rôznych miestach. Automatické generovanie ID je samostatná
  operácia Core. Rozvodňa podporuje explicitné premenovanie v rovnakej
  doméne. [Pomenovávanie](https://www.home-assistant.io/blog/2026/11/03/naming-things-in-home-assistant/)
  [Entity Registry](https://github.com/home-assistant/core/blob/2026.11.0/homeassistant/helpers/entity_registry.py)
- Zoznam oblastí a štítkov je z HA. Odstránenú referenciu treba pri návrate
  ručne nahradiť existujúcou alebo odstrániť. Priradenie štítkov zapisujeme ako
  množinu na konkrétnom objekte, zdedené štítky ostávajú samostatné.
  [Area Registry](https://github.com/home-assistant/core/blob/2026.11.0/homeassistant/helpers/area_registry.py)
  [Label Registry](https://github.com/home-assistant/core/blob/2026.11.0/homeassistant/helpers/label_registry.py)

## Zápis a obnova

Panel drží pracovné hodnoty v pamäti. SQLite drží staging pre každého HA
používateľa. Každá bunka nesie stabilný identifikátor, pole, pôvodnú hodnotu a
návrh. Staging má revíziu, ktorá chráni pred prepísaním práce z inej karty.
Backend validuje celý plán, trvalo uloží žurnál a pri každom zápise opakuje
kontrolu aktuálnej hodnoty. Zápis do registry a kontrola výsledku prebehnú v
jednom kroku na slučke HA. SQLite operácie bežia v executore.

Pri prerušení sa plán znova nevykoná. História prizná neistý výsledok a
staging umožní kontrolu a opakovanie. Home Assistant ukladá vlastné registry
asynchrónne. Po tvrdom páde môže byť ich stav odlišný od stavu pozorovaného
pred pádom. História dokumentuje výsledok API v danom čase.
