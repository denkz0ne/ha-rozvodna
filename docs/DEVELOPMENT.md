# Vývoj

Rozvodňa cieli na HA Core 2026.11.0. Panel používa ES moduly bez kompilácie.
Testy jadra bežia na Pythone 3.13 alebo novšom a prehliadačové testy na Node.js
22 alebo novšom.

```shell
python -m unittest discover -s tests -v
npm ci
npx playwright install chromium
npm test
```

Pre overenie integrácie používaj oddelený prázdny adresár konfigurácie alebo
testovací HA Container. Skontroluj pridanie integrácie, sidebar, admin a
neadmin účet, zápis a návrat nad testovacími registrami, reload a odstránenie.
Produkčné registre nie sú súčasťou testovacích dát.


## Test so skutočným Core

V samostatnom virtuálnom prostredí s Pythonom 3.14:

```shell
python -m pip install homeassistant==2026.11.0 home-assistant-frontend==20261028.4
python -X utf8 tests/core_smoke.py
```

Test použije dočasný priečinok a lokálny HTTP server. Overuje config flow,
panel v zozname HA, podriadené zariadenie, registry, oprávnenia, zápis,
návrat, reload a odstránenie integrácie. Prehliadačové testy používajú
samostatné syntetické dáta. Plný webový klient HA sa na testovacom Windowse
zastavil pri načítaní služieb Core pre chýbajúci `pymicro-vad`. Overenie
v bežiacom HAOS je ďalší krok.
