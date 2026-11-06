# SQLite

Rozvodňa používa `<config>/rozvodna/registry.sqlite3`. Každá databázová
operácia beží v executore a jej spojenie sa po skončení uzavrie.
Cudzie kľúče sú zapnuté pre každé spojenie.

| Tabuľka | Účel |
| --- | --- |
| `baseline` | prvý snapshot registry a čas zachytenia |
| `workspace` | revízia a JSON návrhov podľa ID používateľa |
| `commits` | ID, UTC čas, autor, správa a stav zápisu |
| `operations` | poradie, typ a stabilné ID objektu, pole, názov, integrácia, pred/po, odkaz na revert a výsledok |

Index na `kind, object_id, field` podporuje vyhľadávanie histórie.
Migrácia z prázdnej databázy vytvorí schému a nastaví
`PRAGMA user_version = 1` v jednej transakcii. Neznáma novšia schéma
zastaví načítanie. Ďalšia verzia pridá vlastný transakčný krok migrácie.

Zápis má trvalý plán pred zmenou registra. Pred každou operáciou žurnál
označí `applying`. Po operácii sa zapíše jej výsledok. Záverečná transakcia
uloží výsledok celku a odstráni úspešné návrhy zo stagingu. Po prerušenom
zápise sa `applying` zmení na `uncertain`, `planned` na `skipped` a
commitu sa priradí `interrupted`. Návrhy zostanú na kontrolu. Ak už HA má
cieľovú hodnotu, staging ju označí ako konflikt s pôvodnou hodnotou.
Používateľ ju môže po kontrole zrušiť. HA ukladá registry vlastným tempom.

História sa uchováva bez časového limitu. Databáza obsahuje názvy, ID
a identitu správcu. Pri zálohovaní ju kopíruj pomocou SQLite online
backup alebo zo zastavenej testovacej inštancie spolu s konfiguráciou HA.
