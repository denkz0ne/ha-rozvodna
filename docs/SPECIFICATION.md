# Funkčná špecifikácia

## Register

Panel patrí správcom. Každé hlavné aj podriadené zariadenie má vlastný
riadok. Entity sa rozbaľujú pod vlastníckym zariadením. Entity bez
dostupného zariadenia sa zobrazujú v spoločnej skupine. Filter je podľa
integračnej domény. Riadky uvádzajú aj názvy konfiguračnej položky a jej
podpoložky, ak sú dostupné. Ak entita patrí do zvoleného filtra a jej
zariadenie do iného, zariadenie ostane viditeľné ako kontext.

V prvom stĺpci sa dá upraviť vlastný názov priamo cez zobrazený názov
zariadenia alebo entity. Pod názvom zariadenia je počet jeho entít.
Pri filtri integrácie sa jej názov neopakuje v riadkoch.
Oblasť, štítky a ikona zobrazujú hodnoty priradené na objekte.
Ak oblasť chýba a HA ju odvodí zo zariadenia alebo rodiča, bunka uvedie
zdedenú oblasť. Tooltip ukazuje pôvodný názov alebo štítky na rodičoch.
Prázdny text v editore voliteľného poľa odstráni override prostredníctvom
`null`. Pri štítkoch prázdny výber uloží prázdnu množinu.

## Editor a potvrdenia

- Enter a Shift + Enter posúvajú editor zvislo po aktuálnej strane.
- Tab a Shift + Tab prechádzajú editovateľné polia a podľa potreby prejdú na
  susedný riadok. Esc zatvorí editor a obnoví predchádzajúci návrh.
- Oblasti a štítky majú vyhľadávateľné ponuky nad tabuľkou s ikonami.
  Ponuky neposúvajú riadky. Šípky presúvajú fokus po položkách,
  medzerník mení zaškrtnutie štítka a Enter ukončí úpravu bunky.
- Rozpracované hodnoty žijú v paneli. Pri prepnutí integrácie sa na ich
  zahodenie pýta. Potvrdené hodnoty žijú na serveri podľa účtu.
- Fajka potvrdí iba polia konkrétneho riadka. Ďalšia editácia vytvára
  rozpracovaný návrh nad potvrdenou hodnotou. Opätovné potvrdenie pôvodnej
  hodnoty odstráni potvrdený návrh.
- **Skontrolovať potvrdené** ukáže všetky návrhy vrátane konfliktov
  a umožní zrušiť vybrané položky.

## História

Úspešný alebo začatý zápis má samostatný záznam. Detail porovná hodnotu
pred a po operácii s aktuálnym stavom. História objektu funguje aj po
zmene ID entity vďaka stabilnému internému identifikátoru. Históriu objektu možno filtrovať aj podľa vlastnosti. Pri návrate sa kontrolujú len úspešné
operácie, aktuálna hodnota a dostupnosť pôvodných referencií. Pri konflikte
je možné pripraviť menšiu skupinu alebo hodnotu manuálne upraviť v registri.
