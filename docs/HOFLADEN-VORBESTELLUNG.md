# Hofladen-Vorbestellung – Umsetzungsplan

Stand: September 2026 · Status: **Entwurf der Verwaltung liegt vor (Abschnitt 0.2), Datenbank und Kundenseite offen**

> Kurzfassung: Statt Vorbestellungen in mehreren WhatsApp-Gruppen zu sammeln,
> bekommt kruckenhaus.at eine Vorbestellseite für Fleisch, Eiernudeln und
> Honig. Jede Schlachtung oder Lieferung ist eine **Charge** mit fester Menge,
> Bestellschluss und Abhol-/Liefertermin. Kunden bestellen selbst, die Menge
> zählt automatisch herunter, und Kathrin und Florian sehen alles in **einer**
> Liste am Handy: wer was bestellt hat, was gewogen ist, was geliefert und was
> bezahlt ist. Telefon- und WhatsApp-Bestellungen werden dort mit wenigen
> Klicks nachgetragen.
>
> Die Lösung baut auf dem auf, was es schon gibt (Cloudflare Pages, D1,
> Resend). Sie braucht **kein Framework, keinen Shop-Anbieter, keine Cookies
> und kostet im laufenden Betrieb nichts.**

---

## 0. Neue Ausgangslage: Es gibt bereits einen Friedhold-Shop

Der Hof hat schon einen Online-Hofladen bei Friedhold
(`kruckenhaus.friedhold.at`), über den aber kaum bestellt wird. Friedhold
deckt laut Anbieter den Großteil dieses Plans bereits ab: Chargen und
Vorbestellung, Preisspannen für Gewichtsware, Charge duplizieren,
Lieferscheine und Rechnungen, Newsletter bei neuer Ware. Kosten: 5 % vom
Online-Umsatz, keine Gebühr ohne aktive Ware.

**Empfehlung, bevor hier etwas gebaut wird:** zuerst Friedhold zum einzigen
Bestellweg machen (Abschnitt 0.1). Die Eigenentwicklung ab Abschnitt 1 nur
angehen, wenn sich danach zeigt, dass Friedhold konkret etwas nicht kann
(z. B. Bestellungen am Telefon nachtragen, Liefertour, gemeinsame Übersicht
für Kathrin und Florian) oder die 5 % auf Dauer zu teuer werden.

### 0.1 Friedhold zum Laufen bringen

Wenige Bestellungen liegen vermutlich nicht an der Software, sondern daran,
dass niemand den Shop findet und die Kunden das Bestellen per WhatsApp
gewohnt sind. Die Website verlinkt den Shop derzeit nirgends.

1. **Ein Bestellweg:** Jede Charge wird nur noch in Friedhold angelegt und in
   den WhatsApp-Gruppen ausschließlich mit dem Shop-Link angekündigt.
   Bestellungen, die trotzdem per WhatsApp oder Telefon kommen, trägt
   Kathrin bzw. Florian selbst in Friedhold ein (prüfen, ob Friedhold das
   Erfassen von Bestellungen im Namen eines Kunden anbietet).
2. **Website:** Auf `bauernhof.html` im Abschnitt „Unser Hofladen" einen
   Knopf „Fleisch vorbestellen" zum Shop, eigener Navigationspunkt
   „Hofladen", Hinweis in `llms.txt`. Nur ein Link – keine eingebetteten
   Fremd-Skripte (Datenschutz, siehe `CLAUDE.md`).
3. **Vor Ort:** QR-Code zum Shop am Selbstbedienungs-Kühlschrank, auf
   Etiketten und Packzetteln, in der Ferienwohnung.
4. **Newsletter von Friedhold** nutzen und Stammkunden aktiv bitten, sich
   einzutragen – damit werden die WhatsApp-Gruppen auf Dauer entbehrlich.
5. **Nach zwei, drei Chargen auswerten:** Wie viele Bestellungen kamen über
   den Shop, wie viele mussten nachgetragen werden, was hat gefehlt?

### 0.2 Entscheidung: eigene Lösung, zuerst als Entwurf

Kathrin und Florian empfinden Friedhold als wenig komfortabel und
unübersichtlich. Beide arbeiten am Handy **und** am Windows-PC, die
Abrechnung läuft über eine **Excel-Liste**.

Deshalb gibt es unter `verwaltung/` einen **anklickbaren Entwurf** der
Verwaltung (Abschnitt 7) mit frei erfundenen Beispieldaten – noch ohne
Datenbank, ohne Mails, ohne Anmeldung:

| Datei | Inhalt |
|---|---|
| `verwaltung/index.html` | Gerüst, Navigation (Handy: unten, PC: links) |
| `verwaltung/verwaltung.js` | Ansichten Übersicht, Bestellungen, Erfassen, Wiegen, Übergabe, Zahlungen; Excel-Export; Packzettel-Druck |
| `verwaltung/entwurf-daten.js` | Beispieldaten (zwei Chargen, 19 Bestellungen) |
| `css/style.css` Abschnitt 40 | Gestaltung der Verwaltung |

**Excel:** „Liste für Excel herunterladen" erzeugt eine CSV-Datei
(Semikolon, Dezimalkomma, Umlaute korrekt), eine Zeile je Artikel einer
Bestellung. Sie öffnet sich per Doppelklick direkt in Excel. Die Spalten
werden an die bestehende Abrechnungsliste angepasst, sobald diese vorliegt.

**Wichtig:** Der Entwurf ist nicht geschützt. Er darf erst auf `master`,
wenn Cloudflare Access für `/verwaltung/*` eingerichtet ist (Phase 3) –
bis dahin nur auf dem Feature-Branch bzw. dessen Vorschau-Adresse.

---

## 1. Rahmenbedingungen (festgelegt)

| Punkt | Entscheidung |
|---|---|
| Produkte | Masthühner, Pute, Gans (nach Gewicht) · Rindfleisch-Pakete 5 kg / 10 kg (Fixpreis) · Eiernudeln, Honig (Fixpreis je Stück) |
| Verkaufsform | Vorbestellung je Charge, wenige Chargen im Jahr |
| Übergabe | Abholung am Hof **oder** Lieferung im Umkreis |
| Zahlung | Bar bei Übergabe **oder** Überweisung |
| Nutzer der Verwaltung | Kathrin und Florian, gleichberechtigt, beide am Handy |
| Dauerhaft | ja – Kundenkartei und Bestellhistorie bleiben erhalten |

## 2. So läuft eine Charge ab (Alltag)

So sieht es für Kathrin und Florian aus, ohne Technik:

1. **Charge anlegen** (Verwaltung → „Neue Charge"):
   z. B. *„Masthühner Herbst"*, 40 Stück, 13,90 €/kg, Bestellschluss
   10.10., Abholung Sa 18.10. 9–12 Uhr, Lieferung Fr 17.10. nachmittags.
   Eiernudeln und Honig kann man jeder Charge als Zusatzartikel mitgeben.
2. **Ankündigen:** In der Verwaltung auf „Ankündigung" tippen. Dann:
   - geht eine E-Mail an alle Kunden, die Neuigkeiten erhalten wollen, und
   - erscheint ein fertiger Text mit Link, den man in die WhatsApp-Gruppen
     oder den WhatsApp-Kanal kopiert.
   - Optional: Stammkunden bekommen einen eigenen Link und können **ein paar
     Tage früher** bestellen, bevor die Charge für alle freigegeben wird.
3. **Bestellungen laufen ein:** Jede Bestellung ist sofort verbindlich
   vorgemerkt, der Kunde bekommt eine Bestätigungsmail, und Kathrin und
   Florian bekommen eine kurze Mail „Neue Vorbestellung". Ist das Kontingent
   erschöpft, landet man automatisch auf der **Warteliste**.
4. **Telefon- und WhatsApp-Bestellungen** trägt man in der Verwaltung mit
   „Bestellung erfassen" nach (Kunde suchen oder neu anlegen, Stückzahl,
   Abholung/Lieferung – fertig). Sie zählen genauso vom Kontingent ab.
5. **Nach dem Bestellschluss:** Die Übersicht zeigt, was insgesamt
   gebraucht wird (z. B. 37 Hühner, 12 Honig, 20 Nudeln) – das ist die
   Packliste.
6. **Nach der Schlachtung – wiegen:** In der Ansicht „Wiegen" steht jede
   Bestellung in einer Zeile; Gewicht eintippen, weiter zur nächsten. Der
   Endbetrag wird sofort ausgerechnet. Die Etiketten/Packzettel können
   gedruckt werden (Name, Inhalt, Gewicht, Betrag, Abholung/Lieferung).
7. **„Abholbereit" verschicken:** Ein Tipp schickt allen Kunden der Charge
   eine Mail mit Endbetrag, Termin und – bei Überweisung – Bankdaten und
   Zahlungsreferenz. Wer lieber per WhatsApp informiert werden will: Neben
   jedem Kunden gibt es einen WhatsApp-Knopf mit fertigem Text.
8. **Übergabe:**
   - *Abholung:* Liste „Abholung" am Handy offen, Kunde kommt, abhaken
     („übergeben", ggf. „bar bezahlt").
   - *Lieferung:* Liste „Liefertour" – nach Ort sortiert, mit Adresse,
     Telefonnummer (antippen = anrufen) und Navigationslink. Abhaken wie
     oben.
9. **Zahlungen nachverfolgen:** Die Ansicht „Offene Zahlungen" zeigt, wer
   noch überweisen muss. Kommt Geld am Konto an, in der Liste auf „bezahlt"
   tippen. Die Zahlungsreferenz (z. B. `HK-26-014`) macht das Zuordnen
   einfach.
10. **Charge abschließen:** Wenn alles übergeben und bezahlt ist, wird die
    Charge archiviert. Umsatz, Stück, Kilo bleiben für den Jahresüberblick
    erhalten.

## 3. Produkte und Preislogik

| Art | Beispiele | Kunde bestellt | Preis bei Bestellung | Endpreis |
|---|---|---|---|---|
| **Nach Gewicht** | Masthuhn, Pute, Gans | Stück | „ca."-Preis aus Kilopreis × Richtgewicht (z. B. 1,8–2,2 kg → ca. 28 €) | Kilopreis × tatsächliches Gewicht, nach dem Wiegen |
| **Paket fix** | Rind 5 kg, Rind 10 kg | Stück | fix | = Bestellpreis |
| **Stückware** | Eiernudeln, Honig (je Sorte/Größe) | Stück | fix | = Bestellpreis |

- Jedes Produkt wird **einmal** im Produktkatalog angelegt (Name,
  Beschreibung, Allergene/Pflichtangaben, Einheit, Richtgewicht, Foto).
- In der Charge wird es mit **Preis und Kontingent** angeboten. So kann der
  Kilopreis von Charge zu Charge anders sein, ohne dass alte Bestellungen sich
  ändern.
- **Rind-Paketinhalt** (z. B. „Steaks, Braten, Gulasch, Faschiertes,
  Suppenfleisch") steht in der Produktbeschreibung.
- Beträge werden intern in **Cent**, Gewichte in **Gramm** gespeichert
  (keine Rundungsfehler).
- Optional je Charge: **Höchstmenge pro Bestellung** (z. B. max. 2 Gänse),
  damit nicht einer alles nimmt.

## 4. Abholung und Lieferung

- Jede Charge hat einen oder mehrere **Termine**: Abholzeitfenster am Hof und
  Liefertermin(e). Der Kunde wählt beim Bestellen.
- **Liefergebiet:** Liste der belieferten Orte/Postleitzahlen (zentral in
  der Verwaltung gepflegt). Liegt die PLZ außerhalb, bietet das Formular nur
  Abholung an.
- **Lieferbedingungen** (bitte festlegen, siehe Abschnitt 11):
  Liefergebühr ja/nein, ab welchem Bestellwert gratis, ggf. Zonen.
- Bei Lieferung sind Adresse und Telefonnummer Pflichtfelder, bei Abholung
  nur Telefonnummer.
- Die Liefertour-Ansicht sortiert nach Ort und lässt die Reihenfolge per
  Verschieben anpassen; sie ist druckbar.

## 5. Zahlung

- **Bar:** bei Übergabe, wird beim Abhaken mit „bar bezahlt" vermerkt.
- **Überweisung:** Bankdaten und Zahlungsreferenz kommen mit der Mail
  „Abholbereit" (erst dann steht der Endbetrag fest). Kein Vorab-Zahlen,
  keine Anzahlung – passt zu Stammkunden und vermeidet Rückzahlungen bei
  Gewichtsabweichungen.
- **Keine Online-Zahlung** (Karte/PayPal/Stripe): unnötige Gebühren und
  Aufwand für wenige Chargen. Kann später ergänzt werden, falls gewünscht.
- IBAN/BIC werden als Cloudflare-Variable hinterlegt (nicht geheim, aber
  zentral änderbar), nicht fest im Code.

## 6. Was die Kunden sehen – Seite `hofladen.html`

**Aufbau (mobil zuerst, wie der Rest der Website):**

1. Kurze Einleitung: „Fleisch, Nudeln und Honig vom Hof – auf Vorbestellung".
2. **Aktuelle Chargen** als Karten: Produkt, Foto, Preis (bzw. Kilopreis
   mit „ca."-Preis je Stück), **noch verfügbar: 12 von 40**, Bestellschluss,
   Termine. Ausverkauft → „Auf die Warteliste".
3. Gibt es keine offene Charge: „Die nächste Charge kommt voraussichtlich
   im …" plus Anmeldung „Bei neuen Chargen Bescheid geben" (E-Mail,
   ausdrückliche Einwilligung).
4. **Bestellformular** (eine Seite, keine Registrierung, kein Konto):
   - Mengen je Artikel (Plus/Minus-Knöpfe)
   - Abholung oder Lieferung → Termin wählen → bei Lieferung Adresse
   - Name, Telefon, E-Mail
   - Zahlungswunsch: bar / Überweisung
   - Anmerkung (z. B. „Gans lieber größer")
   - Häkchen: Neuigkeiten zu neuen Chargen per E-Mail (freiwillig)
   - Hinweis auf Datenschutz und die Bestellbedingungen
   - Zusammenfassung mit „ca."-Summe, Knopf **„Verbindlich vorbestellen"**
5. **Bestätigung** auf der Seite und per Mail mit Bestellnummer, Inhalt,
   Termin und dem Hinweis, dass sich der Endbetrag bei Gewichtsware nach dem
   Wiegen ergibt.
6. **Ändern/Stornieren:** Bis zum Bestellschluss per Anruf/WhatsApp; Kathrin
   oder Florian ändern es in der Verwaltung. (Ein Selbstbedienungs-Link
   „Meine Bestellung ändern" ist als späterer Ausbau vorgesehen, siehe
   Phase 7.)

**Pflichtangaben neben jedem Produkt** (siehe Abschnitt 10): Bezeichnung,
Zutaten und Allergene (Eiernudeln: Ei, Gluten), Nettofüllmenge, Herkunft,
Lagerhinweis, Name und Anschrift des Betriebs.

**Einbindung in die Website:**

- Neuer Navigationspunkt **„Hofladen"** in allen Seiten (Desktop-Menü,
  Mobil-Overlay), `sitemap.xml`, `llms.txt`.
- Auf `bauernhof.html` im Abschnitt „Unser Hofladen" ein Knopf
  „Fleisch vorbestellen".
- Optional: Hinweis für Ferienwohnungsgäste („Fleisch und Honig zum
  Mitnehmen – bei der Anreise vorbestellen").

## 7. Was Kathrin und Florian sehen – Verwaltung `/verwaltung/`

**Zugang:** Geschützt mit **Cloudflare Access** (kostenlos bis 50 Nutzer).
Anmeldung per E-Mail-Code an die freigegebenen Adressen von Kathrin und
Florian – kein Passwort, keine App. Auf dem Handy als Lesezeichen auf dem
Startbildschirm ablegen, dann fühlt es sich wie eine App an. Beide sehen
immer denselben Stand.

**Ansichten** (große Knöpfe, für Daumen gebaut, druckbar):

| Ansicht | Inhalt |
|---|---|
| **Start** | Offene Chargen mit Ampel: bestellt / Kontingent, Tage bis Bestellschluss, offene Zahlungen gesamt |
| **Charge** | Alle Bestellungen der Charge, Filter (Abholung/Lieferung/offen/bezahlt), Suche nach Name; Summen je Artikel |
| **Bestellung erfassen** | Für Telefon/WhatsApp: Kunde suchen (Name/Telefon) oder neu, Mengen, Termin – zählt vom Kontingent ab |
| **Wiegen** | Eine Zeile je Gewichtsware, Gewicht eintippen, Endbetrag erscheint sofort |
| **Packliste / Etiketten** | Druckansicht je Bestellung: Name, Inhalt, Gewicht, Betrag, Abholung/Lieferung |
| **Abholung** | Abhakliste für den Abholtag, Knöpfe „übergeben" und „bar bezahlt" |
| **Liefertour** | Nach Ort sortiert, Adresse, Anruf- und Navigationslink, Abhaken |
| **Offene Zahlungen** | Wer noch zahlen muss, mit Zahlungsreferenz; „bezahlt"-Knopf |
| **Warteliste** | Nachrücken mit einem Tipp (Kunde bekommt Mail) |
| **Kunden** | Kartei mit Bestellhistorie, Notizen („liefert immer an Nachbarn"), Stammkunde ja/nein, Newsletter-Einwilligung |
| **Produkte** | Katalog pflegen (Texte, Allergene, Richtgewicht, Foto) |
| **Chargen** | Neu anlegen, bearbeiten, Bestellung öffnen/schließen, archivieren; Jahresübersicht (Stück, kg, Umsatz) |
| **Export** | CSV aller Bestellungen einer Charge oder eines Jahres (für Buchhaltung/Excel) |

**Status einer Bestellung** (bewusst wenige, gut lesbar):

```
Warteliste ─► Vorgemerkt ─► Bereit (gewogen/gepackt) ─► Übergeben
                  │                                        │
                  └─► Storniert              Zahlung: offen / bezahlt (bar|Überweisung)
```

Übergabe und Zahlung sind getrennt – so sieht man auch „übergeben, aber noch
nicht überwiesen".

## 8. Benachrichtigungen

| Anlass | Empfänger | Kanal |
|---|---|---|
| Neue Bestellung eingegangen | Kunde | Mail (automatisch) |
| Neue Bestellung eingegangen | Kathrin + Florian | Mail (automatisch) |
| Von Warteliste nachgerückt | Kunde | Mail (auf Knopfdruck) |
| Abholbereit / Lieferung kommt, mit Endbetrag | Kunde | Mail (auf Knopfdruck, alle einer Charge) |
| Neue Charge | Kunden mit Einwilligung | Mail (auf Knopfdruck) + Text zum Kopieren für WhatsApp |
| Einzelne Rückfrage | Kunde | WhatsApp-Knopf mit vorbereitetem Text (öffnet WhatsApp am Handy) |

- Versand über **Resend** (schon eingerichtet, gratis bis 3.000 Mails/Monat,
  100 pro Tag – reicht deutlich). Bei der Ankündigung an viele Empfänger
  werden die Mails gestaffelt verschickt.
- **Keine automatische WhatsApp-Anbindung:** Die offizielle WhatsApp-Business-
  Schnittstelle ist kostenpflichtig, aufwendig freizuschalten und für diese
  Mengen nicht nötig. Die WhatsApp-Gruppen können bleiben – sie dienen dann
  nur noch zum **Ankündigen**, nicht mehr zum Sammeln. Empfehlung: aus den
  Gruppen langfristig einen **WhatsApp-Kanal** machen (nur ihr schreibt,
  keine Antworten-Flut).
- Jede Newsletter-Mail enthält einen Abmeldelink.
- Fehlt `RESEND_API_KEY`, wird trotzdem alles gespeichert (gleiches Muster
  wie beim Kontaktformular) – es geht nur keine Mail raus.

## 9. Technik

### 9.1 Neue und geänderte Dateien

```
hofladen.html                           öffentliche Vorbestellseite
js/hofladen.js                          Angebot laden, Formular, Summen
verwaltung/index.html                   Verwaltung (eine Seite, mehrere Ansichten)
verwaltung/verwaltung.js                Logik der Verwaltung
functions/api/hofladen/angebot.js       GET  – offene Chargen + Restmengen
functions/api/hofladen/bestellung.js    POST – Bestellung aufgeben
functions/api/hofladen/newsletter.js    POST – An-/Abmeldung Neuigkeiten
functions/api/verwaltung/[[pfad]].js    alle Verwaltungs-Aufrufe (nur mit Access)
functions/_lib/hofladen.js              gemeinsame Helfer (Mail, Escape, Beträge)
schema-hofladen.sql                     neue Tabellen (schema.sql bleibt unberührt)
css/style.css                           neuer Abschnitt „HOFLADEN" + „VERWALTUNG"
```

Anzupassen: Navigation in allen `.html`, `sitemap.xml`, `llms.txt`,
`bauernhof.html` (Knopf), `robots.txt` und `_headers` (Verwaltung:
`Disallow`, `X-Robots-Tag: noindex`, `Cache-Control: no-store`),
`wrangler.toml` (neue nicht-geheime Variablen), `README.md` (Bedienung),
`datenschutz.html` (**nur nach ausdrücklicher Freigabe**, siehe Abschnitt 10).

### 9.2 Datenmodell (D1, neue Tabellen)

```sql
kunden            id, name, telefon, email, strasse, plz, ort,
                  stammkunde (0/1), newsletter (0/1), newsletter_seit,
                  abmelde_token, notiz, erstellt_am

produkte          id, name, art ('gewicht'|'paket'|'stueck'),
                  beschreibung, pflichtangaben, allergene,
                  richtgewicht_von_g, richtgewicht_bis_g, bild, aktiv

chargen           id, titel, beschreibung, status ('entwurf'|'stammkunden'
                  |'offen'|'geschlossen'|'archiviert'),
                  stammkunden_ab, offen_ab, bestellschluss,
                  stammkunden_token, erstellt_am

charge_artikel    id, charge_id, produkt_id,
                  preis_cent,            -- bei 'gewicht': pro kg
                  kontingent, max_pro_bestellung

termine           id, charge_id, art ('abholung'|'lieferung'),
                  datum, von, bis, hinweis

liefergebiet      plz, ort, liefergebuehr_cent

bestellungen      id, nummer ('HK-26-014'), charge_id, kunde_id,
                  quelle ('web'|'telefon'|'whatsapp'|'persoenlich'),
                  status ('warteliste'|'vorgemerkt'|'bereit'
                         |'uebergeben'|'storniert'),
                  termin_id, lieferadresse, zahlart ('bar'|'ueberweisung'),
                  bezahlt_am, bezahlt_betrag_cent, liefergebuehr_cent,
                  anmerkung, interne_notiz, erstellt_am, geaendert_am

bestell_positionen id, bestellung_id, charge_artikel_id, menge,
                  einzelpreis_cent,       -- zum Bestellzeitpunkt eingefroren
                  gewicht_g,              -- nach dem Wiegen, nur Gewichtsware
                  betrag_cent             -- berechnet
```

- Das vorbereitete Buchungsmodell (`einheiten`, `preisperioden`,
  `buchungen`, `naechte`) und `anfragen` bleiben unberührt.
- **Kontingent sicher abziehen:** Die Bestellung wird als D1-`batch()`
  (läuft als Transaktion) geschrieben; die Position wird nur eingefügt, wenn
  die Restmenge reicht (`INSERT … SELECT … WHERE rest >= menge`). Sonst
  → Warteliste. So kann nichts doppelt verkauft werden.
- Alle Zugriffe über gebundene Prepared Statements, Nutzereingaben in Mails
  werden mit `escapeHtml` abgesichert.

### 9.3 Schnittstellen

| Route | Methode | Zweck | Schutz |
|---|---|---|---|
| `/api/hofladen/angebot` | GET | offene Chargen, Artikel, Restmengen, Termine, Liefergebiet | öffentlich (mit `?t=` Stammkunden-Token für Vorab-Chargen) |
| `/api/hofladen/bestellung` | POST | Bestellung aufgeben | öffentlich, Honeypot, Plausibilitätsprüfung, Bestellschluss |
| `/api/hofladen/newsletter` | POST | Anmelden/Abmelden | öffentlich, Abmelden nur mit Token |
| `/api/verwaltung/…` | GET/POST | alles aus Abschnitt 7 | Cloudflare Access **und** Prüfung des Access-Tokens in der Function |

**Doppelte Absicherung der Verwaltung:** Cloudflare Access schützt
`/verwaltung/*` und `/api/verwaltung/*`. Zusätzlich prüft die Function den
Header `Cf-Access-Jwt-Assertion` (Signatur gegen die Access-Zertifikate,
Audience, erlaubte E-Mail-Adressen). Fällt Access versehentlich weg, liefert
die API trotzdem nichts aus.

### 9.4 Neue Einstellungen in Cloudflare

| Name | Art | Inhalt |
|---|---|---|
| `ACCESS_TEAM_DOMAIN` | Variable | `<team>.cloudflareaccess.com` |
| `ACCESS_AUD` | Variable | Application Audience aus Access |
| `VERWALTUNG_EMAILS` | Variable | E-Mail-Adressen von Kathrin und Florian |
| `BANK_IBAN`, `BANK_BIC`, `BANK_INHABER` | Variable | für die Mail „Abholbereit" |
| `HOFLADEN_TO` | Variable (optional) | wohin „Neue Vorbestellung" geht, Standard `CONTACT_TO` |

`RESEND_API_KEY` und die D1-Anbindung gibt es schon.

### 9.5 Grundsätze, die gelten bleiben

- Kein Framework, kein Build-Schritt, keine npm-Abhängigkeiten im Frontend.
- Keine Cookies, kein `localStorage`, kein Tracking, keine externen Skripte
  oder Schriften – auch nicht in der Verwaltung. (Cloudflare Access setzt
  ausschließlich für die Verwaltung ein technisch notwendiges Anmelde-Cookie;
  öffentliche Seiten bleiben cookiefrei.)
- Navigationslinks zu Karten-Apps sind nur Links, keine eingebetteten
  Karten.
- Mobil (375 px) zuerst testen.

## 10. Vor dem Start zu klären (Recht und Behörden)

Keine Rechtsberatung – bitte mit der **Landwirtschaftskammer Tirol**
(Direktvermarktung) bzw. Steuerberatung abstimmen:

- [ ] **Pflichtangaben im Fernabsatz (LMIV Art. 14):** Alle verpflichtenden
      Lebensmittelinformationen (außer Mindesthaltbarkeit) müssen **vor**
      der Bestellung auf der Seite stehen – Zutaten, Allergene (Eiernudeln:
      Ei, Gluten), Füllmenge, Herkunft, Betrieb.
- [ ] **Rücktrittsrecht:** Für schnell verderbliche Lebensmittel besteht
      kein 14-tägiges Rücktrittsrecht (FAGG § 18 Abs. 1 Z 4). Honig und
      Nudeln sind nicht schnell verderblich – klären, ob für diese ein
      Rücktrittsrecht bzw. eine Widerrufsbelehrung nötig ist.
- [ ] **Kurze Bestellbedingungen** (Vorbestellung verbindlich, Endpreis
      nach Gewicht, Stornierung bis Bestellschluss, Lieferbedingungen,
      Zahlung) – als eigener Abschnitt auf `hofladen.html`.
- [ ] **Datenschutzerklärung** um die Bestelldaten, die Kundenkartei, den
      Newsletter und Cloudflare Access ergänzen (**nur auf ausdrücklichen
      Auftrag**, Rechtstexte sind abgestimmt).
- [ ] **Steuer und Beleg:** Umsatzsteuer bei Pauschalierung, ob Fleisch-
      Direktvermarktung noch Urproduktion oder Nebengewerbe ist,
      Belegerteilungs-/Registrierkassenpflicht.
- [ ] **Kennzeichnung und Hygiene:** Geflügel- und Rindfleisch-Etikett,
      Honig-Kennzeichnung, Kühlkette bei der Lieferung (Kühlbox,
      Temperaturgrenzen für Geflügel/Fleisch).
- [ ] **Preisangaben** inkl. Umsatzsteuer bzw. Hinweis bei Pauschalierung.

## 11. Offene Fragen an Kathrin und Florian

Diese Antworten brauche ich vor Phase 2:

1. **Produktliste:** alle Artikel mit Preis, Einheit, Richtgewicht
   (Huhn/Pute/Gans), Inhalt der Rind-Pakete, Honig- und Nudelsorten/-größen,
   Zutaten und Allergene.
2. **Liefergebiet:** Welche Orte/PLZ? Liefergebühr oder gratis? Ab welchem
   Bestellwert gratis?
3. **Termine:** Typischer Abholtag/-zeit, typischer Liefertag?
4. **Stammkunden-Vorlauf:** gewünscht? Wie viele Tage vorher?
5. **Höchstmengen** pro Bestellung (z. B. max. 2 Gänse)?
6. **E-Mail-Adressen** von Kathrin und Florian für den Verwaltungszugang.
7. **Bankverbindung** für die Überweisungs-Mail.
8. **Bestellnummern-Format:** Vorschlag `HK-26-014` (Jahr + laufende Nummer).
9. **Fotos** der Produkte (Rind-Paket, Honig, Nudeln, Huhn) – bis dahin
    TODO-Platzhalter.
10. Sollen **Ferienwohnungsgäste** auf der Seite angesprochen werden?

## 12. Umsetzung in Phasen

Arbeitsweise wie im `UMSETZUNGSPLAN.md`: **eine Sitzung = ein Thema = ein
Commit**, auf dem Feature-Branch; erst nach dem Testlauf auf `master`.

| Phase | Inhalt | Ergebnis |
|---|---|---|
| **1 – Grundlage** | `schema-hofladen.sql`, Tabellen in D1 anlegen, Produktkatalog und Liefergebiet befüllen, gemeinsame Helfer | Datenbank steht |
| **2 – Kundenseite** | `hofladen.html`, `js/hofladen.js`, `/api/hofladen/angebot` und `/bestellung`, Bestätigungsmails, Warteliste; noch **nicht** verlinkt | Bestellen funktioniert über direkten Link |
| **3 – Verwaltung Kern** | Cloudflare Access einrichten, Token-Prüfung, Start, Charge, Bestellung erfassen, Status ändern, Chargen anlegen | Kathrin und Florian können eine Charge komplett führen |
| **4 – Wiegen und Zahlung** | Wiegen, Endbeträge, Mail „Abholbereit", offene Zahlungen, Packliste/Etiketten drucken | Ablauf nach der Schlachtung läuft |
| **5 – Übergabe** | Abholliste, Liefertour mit Anruf-/Navi-Links, Druckansichten | Abhol- und Liefertag am Handy |
| **6 – Kunden und Ankündigung** | Kundenkartei, Newsletter An-/Abmeldung, „Ankündigung"-Knopf, Stammkunden-Link, WhatsApp-Text | Chargen ankündigen ohne Gruppen-Chaos |
| **7 – Veröffentlichung** | Navigation in allen Seiten, `sitemap.xml`, `llms.txt`, Knopf auf `bauernhof.html`, `robots.txt`/`_headers`, README-Bedienungsanleitung, Datenschutz (nach Freigabe) | live |
| **später** | „Meine Bestellung ändern"-Link, Jahresauswertung als Grafik, CSV-Import alter Kunden | nach Bedarf |

**Testlauf vor dem Start:** Eine echte, kleine Charge (z. B. Honig und
Nudeln) mit ein paar Stammkunden durchspielen – vom Anlegen bis „bezahlt".
Die bestehenden WhatsApp-Bestellungen der laufenden Charge in Phase 3
einmalig nachtragen, damit ab dann **nur noch eine Liste** zählt.

## 13. Kosten

| Posten | Kosten |
|---|---|
| Cloudflare Pages, Functions, D1 | 0 € (Gratis-Kontingent reicht bei weitem) |
| Cloudflare Access (bis 50 Nutzer) | 0 € |
| Resend (bis 3.000 Mails/Monat) | 0 € |
| Shop-Software, Zahlungsanbieter | entfällt |
