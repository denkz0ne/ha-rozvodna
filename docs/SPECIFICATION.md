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
- Prepínač **Skrytie** používa natívny prvok Home Assistanta. Hodnoty
  `hidden_by` nastavené inou integráciou alebo systémom sú iba na čítanie;
  používateľ môže meniť len vlastné skrytie.
- Rozpracované hodnoty zostávajú v paneli aj pri zmene filtrov. Fajka potvrdí
  iba polia konkrétneho riadka. Ďalšia editácia vytvára rozpracovaný návrh nad
  potvrdenou hodnotou. Opätovné potvrdenie pôvodnej hodnoty odstráni návrh.
- **Skontrolovať potvrdené** ukáže všetky návrhy vrátane konfliktov a umožní
  zrušiť vybrané položky. Pri konflikte sa zmena automaticky neprepíše.

## História

Úspešný alebo začatý zápis má samostatný záznam. Detail porovná hodnotu pred
a po operácii s aktuálnym stavom. História objektu funguje aj po zmene ID
entity vďaka stabilnému internému identifikátoru. Históriu objektu možno
filtrovať aj podľa vlastnosti. Pri návrate sa kontrolujú len úspešné operácie,
aktuálna hodnota a dostupnosť pôvodných referencií. Pri konflikte je možné
pripraviť menšiu skupinu alebo hodnotu manuálne upraviť v registri.
