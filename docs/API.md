# WebSocket API

Príkazy používajú HA protokol `/api/websocket` a vyžadujú správcu.
Typ požiadavky je `rozvodna/<príkaz>`. HA pridá obálku
`id`, `type: "result"`, `success` a `result` alebo `error`.

| Príkaz | Argumenty | Výsledok |
| --- | --- | --- |
| `snapshot` | — | `devices`, `entities`, `areas`, `labels` |
| `state` | — | `revision`, `changes`, `issues` |
| `stage` | `revision`, `changes[]`, voliteľne `drop[]` | nový `state` |
| `references` | `revision` | `token`, nájdené `matches[]` a rozsah kontroly pred premenovaním entity |
| `commit` | `revision`, voliteľne `message`, `acknowledge_rename`, `reference_token`, `reference_ids[]` | detail zápisu alebo `{status:"conflict", issues}` |
| `history` | voliteľne `kind` a `object_id`, `field` pri filtri objektu, `offset` | najviac 50 sumarizovaných zápisov |
| `detail` | `commit_id` | hlavička a `operations[]` |
| `revert` | `revision`, `commit_id`, voliteľne `positions[]` | nový `state` s opačnými návrhmi |
| `baseline` | — | `created` a `snapshot` |

Objekt registra má `kind`, `id`, `title`, `original_name`, `effective_area`,
`inherited_labels`, `integration`, `config_entry`, `config_title`,
`subentry`, `subentry_title` a mapu `values`. Zariadenie môže mať
`parent_device_id` a `via_device_id`, entita `device_id`, `original_icon`
a `has_entity_name`. Oblasti a štítky majú `id`, `name` a `icon`. Štítky majú aj `color`.

Návrh má `kind` (`device` alebo `entity`), `object_id` (stabilné ID z
registrov), `field`, `before` a `after`. Hodnoty sú reťazec, `null` alebo
zoradený zoznam jedinečných štítkov. `drop` obsahuje iba trojicu
`kind`, `object_id` a `field`. Výstup môže pridať `source` s ID
pôvodného zápisu. `issues` dopĺňa návrh o `code`. Nastavenie `after` na
`before` odstráni príslušný návrh. Maximálne 5 000 potvrdených polí na účet.

Detail obsahuje `id`, `user_id`, `created`, `message`, `status` a operácie.
Operácia pridáva `position`, `title`, `integration`, `status` a `error`.
Úspešný zápis má stav `saved`. Po začatí môže skončiť ako `partial`,
`error` alebo `interrupted`. Príklady kódov validácie sú `stale_revision`,
`missing_object`, `changed`, `occupied`, `duplicate_target` a
`rename_confirmation_required`. Pri `stale_revision` znovu načítaj stav a
skontroluj obsah pred ďalšou požiadavkou.

Pri premenovaní entity panel najprv zavolá `references`. Commit musí odoslať
vrátený `token`; výber opráv obsahuje iba ID presných odkazov v úložných
dashboardoch. UI navyše číta načítané automatizácie a skripty cez ich natívne
WebSocket príkazy a zobrazuje ich odkazy iba na ručnú kontrolu (najviac 500
položiek). Zmena úložného dashboardu po náhľade spôsobí
`reference_conflict`. Opravy dashboardov majú v detaile `kind: "reference"`,
JSON Pointer v `field` a staré/nové entity ID v `before`/`after`.
Panel zobrazí najviac 5 000 nálezov; pri dosiahnutí limitu oznámi, že ďalšie
ručne kontrolované nálezy sa v zozname nezobrazili.
