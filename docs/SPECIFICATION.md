# Funkčná špecifikácia

## Register

Panel patrí správcom. Každé hlavné aj podriadené zariadenie má vlastný riadok.
Entity sa rozbaľujú pod vlastníckym zariadením. Entity bez dostupného zariadenia
sa zobrazujú v spoločnej skupine. Všetky zodpovedajúce záznamy sú v jednom
vertikálne posúvateľnom zozname bez stránkovania. Pri aktívnom stave alebo
textovom vyhľadávaní sa zodpovedajúce entity pod zariadením rozbalia automaticky.

Vyhľadávanie ignoruje veľkosť písmen a diakritiku. Hľadá v názvoch zariadení
a entít, ID entít, integráciách vrátane lokalizovaného názvu, oblastiach,
štítkoch a názvoch konfiguračných položiek a podpoložiek. Medzery oddeľujú
slová, ktoré sa musia zhodovať všetky.

Filter integrácií používa viacnásobný výber. Zvolené integrácie sa kombinujú
logikou OR; hľadaný text sa s nimi kombinuje logikou AND. Zaškrtnutie **Všetky
integrácie** vymaže len výber integrácií. Filter stavu obsahuje kategórie
Dostupné, Nedostupné, Povolené, Zakázané, Viditeľné, Skryté, Neovládateľné
a Nie je poskytované. Vybrané stavy sa kombinujú cez OR a s ostatnými filtrami
cez AND. Zariadenie zostane ako kontext, ak mu zodpovedá aspoň jedna entita.

Riadky zariadení zobrazujú počet priradených entít. Názov zariadenia alebo
entity je samostatným ovládaním na úpravu vlastného názvu. Ikona entity
otvorí natívne okno **Viac informácií**. Ikona zariadenia otvorí stránku
zariadenia v novej karte a pokúsi sa ponechať aktuálnu kartu v popredí.
Prehliadač môže toto správanie obmedziť. Obe ikony majú prístupný názov a tooltip. Názov
integrácie sa pod zariadením skryje, keď je zvolený filter integrácie.
Oblasť, štítky a ikona zobrazujú hodnoty priradené na objekte. Ak oblasť chýba
a HA ju odvodí zo zariadenia alebo rodiča, bunka uvedie zdedenú oblasť.
Prázdny text v editore voliteľného poľa odstráni override cez `null`.
Pri štítkoch prázdny výber uloží prázdnu množinu; už vybrané štítky sa pri
otvorení ponuky zobrazia navrchu.

Stavové ikony používajú natívne MDI ikony a tooltipy. Poradie priority je
obnovená entita, nedostupná entita, vypnutá entita, skrytá entita a entita
iba na čítanie. Bežné dostupné entity stavovú ikonu nemajú. Stavové filtre
čítajú aktuálne stavy z Home Assistanta a nemenia registre.

## Editor a potvrdenia

- Enter a Shift + Enter posúvajú editor zvislo po všetkých aktuálne
  zobrazených riadkoch. Tab a Shift + Tab prechádzajú editovateľné polia.
  Esc ukončí editor bez zmeny jeho pôvodnej hodnoty.
- Kliknutie mimo otvoreného editora ho dokončí. To isté kliknutie neotvorí
  ďalší editor; na jeho otvorenie treba kliknúť znova. Kliknutia v otvorenej
  ponuke alebo editačnom poli túto logiku nespustia.
- Oblasti a štítky majú vyhľadávateľné ponuky nad tabuľkou s ikonami.
  Ponuky neposúvajú riadky. Vyhľadávanie ponúk ignoruje diakritiku a veľkosť
  písmen. Šípky presúvajú fokus po položkách, medzerník mení zaškrtnutie štítka.
- Posuvný deliaci prvok mení šírku bočného panela myšou alebo šípkami
  na klávesnici. Na úzkej obrazovke zostáva bočný panel vysúvacím filtrom.
- Shift + kliknutie vyberie súvislý rozsah aktuálne viditeľných riadkov medzi
  kotviacim a kliknutým riadkom. Riadky bez výberového políčka sa preskočia.
- Hromadná úprava podporuje oblasť a štítky na označených zariadeniach aj
  entitách; skrytie a vypnutie sa menia iba na upraviteľných označených
  entitách. Nezmeniteľné alebo Home Assistantom/integráciou spravované riadky
  sa preskočia a zobrazí sa ich počet. Názvy, ID entít, ikony a ostatné
  individuálne vlastnosti sa hromadne nemenia.
- Prepínač **Skrytie** používa natívny prvok Home Assistanta. Hodnoty
  `hidden_by` nastavené inou integráciou alebo systémom sú iba na čítanie;
  používateľ môže meniť len vlastné skrytie.
- Rozpracované hodnoty zostávajú v paneli aj pri zmene filtrov. Fajka potvrdí
  iba polia konkrétneho riadka. Ďalšia editácia vytvára rozpracovaný návrh nad
  potvrdenou hodnotou. Opätovné potvrdenie pôvodnej hodnoty odstráni návrh.
- **Skontrolovať potvrdené** ukáže všetky návrhy vrátane konfliktov a umožní
  zrušiť vybrané položky. Pri konflikte sa zmena automaticky neprepíše.

### Kontrola odkazov pri zmene ID

Pred uložením premenovania sa načítajú úložné dashboardy cez rozhranie
Lovelace a konfigurácie práve načítaných automatizácií a skriptov. Kontrola
rozpoznáva presné hodnoty v poliach `entity`, `entity_id` a `entity_ids`.
Presné odkazy v úložných dashboardoch možno po náhľade opraviť automaticky.
Odkazy vo vlastných kartách sa považujú za nejednoznačné a zobrazia sa len na
ručnú kontrolu.
Odkazy v automatizáciách a skriptoch sú iba na čítanie; používateľ ich opraví
ručne v Home Assistante. Ich konfigurácie sa načítajú cez HA WebSocket príkazy,
najviac 500 položiek na kontrolu. Jedna kontrola podporuje najviac 100 zmien ID
a 5 000 nálezov. Ak sa limit nálezov dosiahne pri ručnej kontrole, dialóg to
oznámi a zostávajúce nálezy sa musia skontrolovať ručne. Dynamické šablóny sa
nikdy nemenia automaticky.

Kontrola pred uložením vytvorí kontrolný odtlačok úložných dashboardov. Ak sa
dashboard po náhľade zmení, commit sa odmietne a kontrola sa musí zopakovať.
Automatizácie a skripty sa čítajú cez ich administračné WebSocket príkazy;
keďže sa nemenia, ich konfigurácia sa neukladá ani neprepisuje.
Automatická oprava aj premenovanie sú samostatné operácie v rovnakom zázname
histórie. Čiastočné zlyhanie je označené ako čiastočný commit. Návrat ID
entity a úspešných opráv odkazov sa musí vybrať spoločne; história neobsahuje
celé automatizácie, skripty ani dashboardy.

YAML dashboardy sa neskenujú ani neupravujú. Blueprints, externé súbory,
konfigurácie iných integrácií a dynamické odkazy bez rozpoznateľného zápisu
sa nedajú pokryť. Rozvodňa to používateľovi výslovne oznámi a odporučí ručnú
kontrolu.

## História

Úspešný alebo začatý zápis má samostatný záznam. Detail porovná hodnotu pred
a po operácii s aktuálnym stavom. História objektu funguje aj po zmene ID
entity vďaka stabilnému internému identifikátoru. Históriu objektu možno
filtrovať aj podľa vlastnosti. Pri návrate sa kontrolujú len úspešné operácie,
aktuálna hodnota a dostupnosť pôvodných referencií. Pri konflikte je možné
pripraviť menšiu skupinu alebo hodnotu manuálne upraviť v registri.
