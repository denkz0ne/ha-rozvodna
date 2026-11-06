# WebSocket API

Príkazy používajú HA protokol `/api/websocket` a vyžadujú správcu.
Typ požiadavky je `rozvodna/<príkaz>`. HA pridá obálku
`id`, `type: "result"`, `success` a `result` alebo `error`.

| Príkaz | Argumenty | Výsledok |
| --- | --- | --- |
| `snapshot` | — | `devices`, `entities`, `areas`, `labels` |
| `state` | — | `revision`, `changes`, `issues` |
| `stage` | `revision`, `changes[]`, voliteľne `drop[]` | nový `state` |
| `commit` | `revision`, voliteľne `message` a `acknowledge_rename` | detail zápisu alebo `{status:"conflict", issues}` |
| `history` | voliteľne `kind` a `object_id`, `field` pri filtri objektu, `offset` | najviac 50 sumarizovaných zápisov |
| `detail` | `commit_id` | hlavička a `operations[]` |
| `revert` | `revision`, `commit_id`, voliteľne `positions[]` | nový `state` s opačnými návrhmi |
| `baseline` | — | `created` a `snapshot` |

Objekt registra má `kind`, `id`, `title`, `original_name`, `effective_area`,
`inherited_labels`, `integration`, `config_entry`, `config_title`,
`subentry`, `subentry_title` a mapu `values`. Zariadenie môže mať
`parent_device_id` a `via_device_id`, entita `device_id`, `original_icon`
a `has_entity_name`. Oblasti a štítky majú `id` a `name`.

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
