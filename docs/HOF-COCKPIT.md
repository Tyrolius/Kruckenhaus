# Hof-Cockpit – Umsetzungsplan

Stand: Oktober 2026 · Status: **Plan**, noch nichts umgesetzt

> Kurzfassung: Eine Seite, auf der Florian und Kathrin sehen, was im ganzen
> Betrieb zu tun ist: Ferienwohnung, Hofladen, Eier (Bertha), Gasthaus-Rechnungen,
> Eingangsrechnungen, Steuern, Meldungen und Prüffristen. Das Cockpit wird die
> **Startseite der bestehenden Verwaltung** (`/verwaltung`). Es gibt keine neue App
> und keinen neuen Zugang.
>
> Das Cockpit **erinnert und zeigt an**. Gerechnet, gebucht und geschrieben wird
> weiter dort, wo es heute passiert: Rechnungen in LBG AbHof, Buchhaltung in
> LBG Business, Lieferungen und Salden in Bertha, Bestellungen in der Verwaltung.

Grundlage: `docs/HOFLADEN-VORBESTELLUNG.md` (Verwaltung) und
`docs/SCHNITTSTELLE-BERTHA.md` (Verbindung zu Bertha). Dieser Plan ergänzt beide.

---

## 0. Entscheidungen (Oktober 2026)

| Frage | Entscheidung |
|---|---|
| Wo lebt das Cockpit? | **Startseite der Website-Verwaltung**, am PC und am Handy, geschützt wie bisher (Cloudflare Access und `zugang.js`) |
| Ausgangsrechnungen (Gasthäuser) | werden weiter in **LBG AbHof** geschrieben. Das Cockpit erinnert daran und liefert die Mengen aus Bertha |
| Buchhaltung | **LBG Business**. Das Cockpit bucht nichts |
| Wo werden „verrechnet“ und „bezahlt“ bei Gasthäusern gepflegt? | in der **Bertha-App** (Monatsrechnung, Status `open → invoiced → paid`). Das Cockpit liest den Stand mit; einzige Ausnahme ist „bar erhalten“ (5a) |
| Eingangsrechnungen | kommen per Mail **und** per Post. Neue Adresse `rechnungen@kruckenhaus.at` als **Weiterleitung bei world4you** nach Gmail mit dem Label „Rechnungen“. Post wird fotografiert und an dieselbe Adresse geschickt |
| Zahltag | **Montag**. Alles, was bis zum nächsten Montag fällig ist, steht im Cockpit und im Montagsbrief |
| Bank | **George** (Erste Bank / Sparkasse). Der Kontoauszug-Export dient dem Bankabgleich (Abschnitt 5) |
| Umsatzsteuer | Voranmeldung **vierteljährlich** |
| SVS | wird per **Bankeinzug** bezahlt. Dafür gibt es keine Aufgabe, der Bankabgleich erkennt die Abbuchung |
| Zahlungsreferenz | **Nicht alle** Gasthäuser geben die Rechnungsnummer an. Der Abgleich darf sich also nicht allein darauf verlassen |

**Warum die Cloudflare-E-Mail-Weiterleitung nicht infrage kommt:** Das Postfach
`info@kruckenhaus.at` liegt bei world4you (MX auf `mail.kruckenhaus.at`, siehe
README Schritt 4). Die Cloudflare-Weiterleitung würde den MX-Eintrag übernehmen,
und bei world4you käme keine Post mehr an. Deshalb wird die Weiterleitung im
world4you-Kundencenter angelegt.

---

## 1. Woher die Aufgaben kommen

```
  ┌───────────────────────────┐   ┌─────────────────────────────┐
  │ WEBSITE (D1)              │   │ BERTHA (Firestore)          │
  │ Bestellungen, Anfragen,   │   │ Gasthaus-Monatsrechnungen,  │
  │ Airbnb-Kalender,          │   │ offene Salden, nächste Tour,│
  │ Aufgaben, Vorlagen,       │   │ Portal-Anmeldungen,         │
  │ Eingangsrechnungen        │   │ Saldo-Warnungen             │
  └─────────────┬─────────────┘   └──────────────┬──────────────┘
                │                                │ ③ nur lesen, nur Zahlen
                │                                │   und Gastro-Namen
                ▼                                ▼
        ┌────────────────────────────────────────────────┐
        │  HOF-COCKPIT  /verwaltung                      │
        │  Überfällig · Diese Woche · Demnächst · Stand  │
        └───────────────┬────────────────────────────────┘
                        │ ④ Montagsbrief (Mail)
                        ▼
                Florian / Kathrin
```

| Quelle | Beispiele | Wie die Aufgabe entsteht und verschwindet |
|---|---|---|
| **A. Automatisch** | neue Fleischbestellung, Termin offen, Geld fehlt · neue Anfrage zur Ferienwohnung · Anreise in den nächsten Tagen · Gasthaus abrechnen · Gasthaus-Rechnung offen · Portal-Anmeldung | wird aus dem Datenstand berechnet und nicht gespeichert. Sie verschwindet, sobald die Ursache erledigt ist |
| **B. Wiederkehrend** | USt-Voranmeldung, Aufenthaltsabgabe, Bienen-Meldung, Waage eichen … | eine **Vorlage** (Abschnitt 10) erzeugt die nächste Fälligkeit. Nach dem Abhaken kommt automatisch die übernächste |
| **C. Von Hand** | Eingangsrechnungen, „Tierarzt anrufen“ | eintragen, abhaken |

---

## 2. Aufgaben und Vorlagen (Website, D1)

### 2.1 Tabellen

Eigenes Schema `schema-cockpit.sql` (mehrfach ausführbar, `CREATE … IF NOT EXISTS`).

```sql
-- Vorlagen für wiederkehrende Pflichten
aufgaben_vorlagen  id, titel, bereich ('steuer','ferienwohnung','tiere','hofladen',
                   'foerderung','betrieb'), rhythmus ('monatlich','vierteljaehrlich',
                   'halbjaehrlich','jaehrlich','alle_n_jahre'), n_jahre, faellig_tag,
                   faellig_monat_versatz, faellig_monate (z. B. '5,8,11,2'),
                   vorlauf_tage, hinweis, link, aktiv, erstellt_am

-- Einzelne Aufgaben (aus Vorlage oder von Hand)
aufgaben           id, vorlage_id NULL, titel, bereich, faellig_am, hinweis, link,
                   erledigt_am NULL, erledigt_von NULL, erstellt_am
                   UNIQUE (vorlage_id, faellig_am)

-- Eingangsrechnungen
eingangsrechnungen id, lieferant, betrag_cent, faellig_am, iban NULL, bic NULL,
                   zahlungsreferenz NULL, beleg_link NULL, notiz NULL,
                   bezahlt_am NULL, bezahlt_von NULL, bank_buchung_hash NULL,
                   erstellt_am
```

- **Wiederkehrende Aufgaben** werden nicht im Voraus für Jahre angelegt. Es gibt
  immer nur **die nächste offene** Aufgabe je Vorlage. Beim Abhaken legt
  `naechsteFaelligkeit(vorlage, datum)` die folgende an. `UNIQUE (vorlage_id,
  faellig_am)` verhindert Doppelte, auch wenn zwei Personen gleichzeitig abhaken.
- `erledigt_von` / `bezahlt_von` speichert die Anmeldung aus Cloudflare Access
  (wie die Verwaltung heute). Adressen gehören in D1, nie ins Repository.
- **Belege liegen nicht in D1.** Rechnungen sind sieben Jahre aufzubewahren, dafür
  ist D1 der falsche Ort. `beleg_link` zeigt auf die Mail in Gmail bzw. die Datei
  im Belegordner (siehe 3.3).

### 2.2 Fälligkeiten

| Rhythmus | Beispiel | Regel |
|---|---|---|
| vierteljährlich, feste Monate | USt-Voranmeldung | `faellig_monate = '5,8,11,2'`, `faellig_tag = 15` |
| monatlich mit Versatz | Aufenthaltsabgabe | letzter Tag des Folgemonats (`faellig_tag = 0` = Monatsende) |
| jährlich | SVS-Meldung Nebentätigkeiten | `faellig_monate = '4'`, `faellig_tag = 30` |
| alle n Jahre ab Datum | Waage eichen, Feuerlöscher | `n_jahre = 2`, ab dem letzten Erledigt-Datum |

Fällt ein Termin auf Samstag, Sonntag oder einen Feiertag, zeigt das Cockpit
trotzdem das echte Datum an. Ob sich die Frist verschiebt, regelt die jeweilige
Vorschrift. Das Cockpit rechnet daran nichts schön.

### 2.3 Aufgaben aus Ereignissen

Manche Pflichten haben keinen Kalendertermin, sondern hängen an einem Ereignis.
Dafür gibt es **Schnellknöpfe**, die eine Aufgabe mit fester Frist anlegen:

| Knopf | Aufgabe | Frist |
|---|---|---|
| „Rind geboren / zugekauft / geschlachtet“ | Meldung an die AMA-Rinderdatenbank | 7 Tage |
| „Neue Nebentätigkeit“ | Meldung an die SVS | 1 Monat |

Die **Gästemeldung** zur Ferienwohnung (unverzüglich, spätestens 24 Stunden nach
der Ankunft) entsteht **automatisch** aus dem Airbnb-Kalender: Am Anreisetag kommt
„Gäste anmelden“. Abhaken muss man sie von Hand, weil die Website nicht weiß, ob
gemeldet wurde.

---

## 3. Eingangsrechnungen

### 3.1 Ablauf

1. **Eingang:**
   - Lieferanten bekommen `rechnungen@kruckenhaus.at`. Die Adresse leitet bei
     world4you nach Gmail weiter, ein Gmail-Filter setzt das Label „Rechnungen“.
   - **Post:** am Tag des Eingangs fotografieren bzw. scannen (z. B. mit der
     Scan-Funktion der Google-Drive-App) und an dieselbe Adresse schicken. Das
     Papier kommt in die Ablage „erfasst“.
2. **Erfassen** in der Verwaltung („Rechnung erfassen“, am Handy optimiert):
   Lieferant (Vorschlag aus früheren Einträgen), Betrag, fällig am, IBAN und
   Referenz, Beleg-Link. Bekannte Lieferanten bringen IBAN und BIC mit.
3. **Zahltag Montag:**
   - Das Cockpit zeigt alles, was bis zum nächsten Montag fällig ist, je mit
     **Überweisungs-QR-Code** (`KruckenhausQr.epcText()` aus `js/qrcode.js`). Er
     wird in George gescannt, dort sind Betrag, IBAN und Referenz ausgefüllt.
   - Danach „bezahlt“ antippen, oder der Bankabgleich erledigt das (Abschnitt 5).
4. **Ablage:** Der Beleg kommt in den Belegordner des Jahres und wird in
   **LBG Business** verbucht.

### 3.2 Ausbaustufe: automatisch aus Gmail

Wenn sich die Handerfassung bewährt hat:

- **Variante A – geplante Claude-Aufgabe:** Sie sieht täglich das Gmail-Label
  „Rechnungen“ durch, liest Lieferant, Betrag, Fälligkeit und IBAN aus dem PDF,
  legt einen Eintrag **„zu prüfen“** an und setzt in Gmail das Label „erfasst“.
  - Ohne neuen Code auf der Website.
  - Hängt davon ab, dass dieser Weg bestehen bleibt.
- **Variante B – Cloudflare Email Worker:** nimmt Mails direkt an. Das ist
  robuster, aber ein eigener Worker außerhalb von Pages. Weil der MX bei world4you
  bleiben muss, wäre das nur über eine Subdomain möglich
  (z. B. `rechnungen@eingang.kruckenhaus.at`).

In beiden Fällen gilt: **Nichts wird ungeprüft bezahlt.** Automatisch angelegte
Einträge stehen auf „zu prüfen“, bis jemand Betrag und IBAN bestätigt hat. Das
schützt auch gegen gefälschte Rechnungen mit fremder IBAN. **Ändert sich die IBAN
eines bekannten Lieferanten**, zeigt das Cockpit eine deutliche Warnung.

### 3.3 Belegordner

Offen (Frage 1): Hat LBG Business einen Belegeingang, also Beleg hochladen und beim
Buchen anhängen? Wenn ja, ist das der Ordner. Sonst ein Ordner je Jahr in Google
Drive. Der Beleg-Link im Cockpit zeigt dorthin.

---

## 4. Gasthaus-Abrechnung und Kennzahlen aus Bertha

### 4.1 Was Bertha schon hat

- Gastro-Kunden mit `paymentMethod = MONTHLY_INVOICE`
- Monatsrechnungen (`invoices`): `month`, `totalAmount`, `totalEggs`,
  `invoiceNumber`, `status` (`open` / `invoiced` / `paid` / `cancelled`),
  `invoicedAt`, `paidAt`
- Lieferscheine (`deliveryNotes`) mit dem Kennzeichen „abgerechnet“ und der
  Monatsaufstellung (`getMonthlyDeliveryNoteSummary`)
- offene Posten der Überweiser (`BankTransferOpenItemsActivity`), Salden, nächste
  Tour, Portal-Anmeldungen (`customer_requests`), Saldo-Warnungen
  (`balance_audit_alerts`)

### 4.2 Neue Function in Bertha: `GET /betriebsuebersicht`

Allgemein gebaut als „Betriebskennzahlen für verbundene Systeme“, damit sie zu
Bertha als Produkt für viele Betriebe passt (wie „Hofladen verbinden“).

```json
{
  "stand": "2026-11-02T06:00:00Z",
  "abrechnung": [
    { "kunde": "Gasthof X", "monat": "2026-10", "status": "open",
      "lieferungen": 18, "eier": 540, "betrag_cent": 21600,
      "positionen": [{ "artikel": "Eier", "menge": 540 }, { "artikel": "Nudeln 500 g", "menge": 6 }],
      "lieferscheine": ["LS-2026-0412", "…"] },
    { "kunde": "Gasthof Y", "monat": "2026-09", "status": "invoiced",
      "rechnungsnummer": "2026-118", "verrechnet_am": "2026-10-03", "betrag_cent": 18450 }
  ],
  "tour": { "naechste": "2026-11-03", "kunden": 41, "eier": 1230 },
  "salden": { "offen_cent": 48210, "ueberweiser_offen": 6 },
  "portal_anmeldungen": 2,
  "saldo_warnungen": 0
}
```

- **Datenminimierung:** Namen gibt es nur für Kunden vom Typ GASTRO/BUSINESS, ohne
  Adressen. Privatkunden erscheinen nur als Summe.
- **Anmeldung:** wie die bestehende Schnittstelle, nur in Gegenrichtung.
  - Der Schlüssel wird in Bertha erzeugt und einmal angezeigt. In Firestore steht
    nur die SHA-256-Prüfsumme.
  - Auf der Website liegt er als Cloudflare-Secret `BERTHA_UEBERSICHT_KEY`.
  - Es gibt nur Server-zu-Server-Aufrufe, keine CORS-Header.
- **Graceful degradation:** Fehlt das Secret oder antwortet Bertha nicht innerhalb
  von 5 Sekunden, zeigt das Cockpit den letzten Stand aus `einstellungen`
  (`bertha_uebersicht`, mit Uhrzeit) oder „Bertha gerade nicht erreichbar“. Der
  Rest der Seite funktioniert weiter.
- **Zwischenspeicher:** höchstens alle 10 Minuten neu abrufen, außerdem über den
  Knopf „Jetzt aktualisieren“.

### 4.3 Aufgaben daraus

| Bedingung | Aufgabe |
|---|---|
| Monat vorbei, Monatsrechnung `open` bzw. Lieferscheine nicht abgerechnet | **„Gasthof X: Oktober abrechnen“**, aufklappbar mit Mengen je Artikel und Lieferscheinnummern zum Abtippen in LBG AbHof |
| `invoiced` und älter als 21 Tage (einstellbar) | **„Gasthof X: Rechnung 2026-118 offen seit 24 Tagen“** – Mahnung in LBG schreiben |
| alles eines Monats `invoiced` oder `paid` | erledigt, verschwindet |

Den Status „verrechnet“ setzt man in der **Bertha-App**. Zurück in Bertha schreibt das Cockpit nur
eine Zahlung, die bar erhalten wurde (5a.3).

**Bei LBG nachfragen** (Frage 2): Kann LBG AbHof Lieferscheine bzw. Positionen
als CSV einlesen? Wenn ja, bekommt die Aufgabe einen Knopf „CSV für LBG“ im
passenden Format, und das Abtippen entfällt.

---

## 5. Bankabgleich (George)

### 5.1 Ablauf

1. In George den Kontoauszug für einen Zeitraum exportieren und in der
   Verwaltung unter „Bankabgleich“ hochladen.
2. **Die Datei wird im Browser gelesen und nicht hochgeladen oder gespeichert.**
   An den Server gehen nur die Kandidaten für einen Treffer (Betrag, Datum,
   Verwendungszweck, Prüfsumme der IBAN), damit er sie mit den offenen Posten
   vergleichen kann.
3. Heraus kommen drei Listen:
   - **Gefunden – bitte bestätigen:** Zahlung und offener Posten passen.
   - **Noch nicht bezahlt:** alles Offene ohne passende Zahlung, nach Alter
     sortiert.
   - **Unbekannt:** Gutschriften und Abbuchungen ohne Zuordnung (zum Ansehen).

### 5.2 Was verglichen wird

| Offen in | Posten | Erkennung, in dieser Reihenfolge |
|---|---|---|
| Website | Hofladen-Bestellung, Überweisung, nicht bezahlt | Bestellnummer im Verwendungszweck (steht über den QR-Code drin), dann Betrag |
| Bertha | Gasthaus-Monatsrechnung `invoiced` | Rechnungsnummer, sonst **bekannte IBAN** und genauer Betrag, sonst Name und genauer Betrag |
| Bertha | Saldo eines Überweisers | bekannte IBAN bzw. Name, Betrag bis zur Höhe des Saldos (auch Teilzahlung) |
| Cockpit | Eingangsrechnung (Abbuchung) | IBAN des Lieferanten und Betrag, sonst Referenz |
| – | SVS, Grundsteuer, andere Einzüge | Kennung des Einziehers, nur zur Einordnung, keine Aufgabe |

- **Weil nicht alle Gasthäuser die Rechnungsnummer angeben**, lernt der Abgleich:
  Wird eine Zahlung einmal bestätigt, merkt sich das Cockpit
  `SHA-256(IBAN) → Kunde`. Ab dann wird dieses Konto wiedererkannt. Die IBAN
  selbst wird nie gespeichert (Muster wie bei den Schlüsseln).
- **Jede Zuordnung ist ein Vorschlag mit Begründung**, z. B. „Rechnungsnummer im
  Zweck“ oder „bekanntes Konto, Betrag genau“. Nichts wird ungefragt gebucht.
- `bank_buchung_hash` (Prüfsumme aus Datum, Betrag, Zweck, Gegenkonto) verhindert,
  dass dieselbe Buchung bei überlappenden Exporten zweimal zählt.

### 5.3 Buchen nach dem Bestätigen

- **Website-Posten** (Hofladen, Eingangsrechnungen): werden sofort auf „bezahlt“
  gesetzt.
- **Bertha-Posten:** Das Cockpit zeigt „in Bertha als bezahlt / Zahlung erhalten
  buchen“ mit Betrag und Datum. Gebucht wird in der App.
- **Ausbaustufe:** Die Function „Zahlung buchen“ entsteht schon für Barzahlungen
  (5a.3, Phase C4b). Läuft der Abgleich ein paar Monate zuverlässig, bucht auch
  er Bertha-Posten darüber, mit `paymentMethod: "TRANSFER"` und der
  Bank-Buchungsnummer als Idempotenzschlüssel.

### 5.4 Format

George bietet Exporte als CSV und je nach Konto weitere Formate an. Das genaue
Format (Spalten, Trennzeichen, Datums- und Betragsschreibweise) wird anhand
**eines echten Exports mit geschwärzten Namen** festgelegt (Frage 3). Der Leser
kommt als eigenes Skript `js/bankabgleich.js` dazu, ohne Bibliothek, mit Test
`scripts/test-cockpit-bank.mjs`.

---

## 5a. Barzahlungen schnell erfassen

### 5a.1 Was es heute schon gibt

| Wo | Was | Was fehlt |
|---|---|---|
| Verwaltung | „Bar erhalten“ bei Übergabe und Zahlungen, Verkauf am Hof mit „bar kassiert“ | nur Hofladen-Bestellungen. Ein Gasthaus, das bar zahlt, lässt sich dort nicht erfassen |
| Bertha, Lieferrunde | Zahlung bei der Lieferung (`ON_DELIVERY`) | – |
| Bertha, Kunde → „Zahlung erfassen“ | Betrag gegen den Saldo, `source: "manual_payment"` | **keine Zahlart:** Ob bar oder Überweisung, steht nirgends. Deshalb lässt sich kein Bargeldstand und keine Liste der Bareingänge bilden |

Bargeld kommt also an drei Stellen an, und niemand sieht die Summe.

### 5a.2 „Bar erhalten“ im Cockpit

Ein **großer Knopf** ganz oben im Cockpit, auch direkt erreichbar über
`/verwaltung/#bar` (als Lesezeichen auf dem Startbildschirm des Handys).

```
Bar erhalten
────────────────────────────────────────
Wer?  [ Gast…                       ]
      ▸ Gasthof X – Rechnung 2026-118   184,50 €   (Bertha)
      ▸ Maria M. – Saldo                 23,40 €   (Bertha)
      ▸ 2026-047 Rindfleischpaket        86,40 €   (Hofladen)
      ▸ Etwas anderes …
Betrag      [ 184,50 ] €
Gegeben     [ 200    ] €   → zurück 15,50 €
            [  Bar erhalten  ]
```

1. **Wer?** Die Vorschläge kommen aus allen offenen Posten. Oben stehen die
   heutigen Übergaben, dann nach Name gesucht. Erfasst werden:
   - Hofladen-Bestellungen „bar, offen“
   - Gasthaus-Rechnungen `invoiced` aus Bertha
   - Bertha-Kunden mit Saldo
2. **Betrag:** mit dem offenen Betrag vorbelegt. Teilzahlungen sind möglich.
   „Gegeben“ ist freiwillig und rechnet nur das Wechselgeld aus, gespeichert wird
   es nicht.
3. **„Bar erhalten“:** Es folgen 10 Sekunden „Rückgängig“, erst danach wird
   gebucht. So entsteht bei einem Vertippen keine Gegenbuchung.
4. **„Etwas anderes …“:** Bargeld ohne offenen Posten (z. B. Endreinigung oder
   Aufenthaltsabgabe direkt vom Gast, ein Verkauf ohne Bestellung). Dazu gehören
   Betrag, wofür und ein Bereich (Ferienwohnung, Hofladen, Eier, Sonstiges).

### 5a.3 Wohin gebucht wird

- **Hofladen-Bestellung:** wie heute `bezahlt = 'bar'`, mit Datum.
- **Etwas anderes:** neue Tabelle `bareingaenge` (Betrag, wofür, Bereich, Datum,
  erfasst von).
- **Bertha-Posten:** Für Bargeld kommt die Function **„Zahlung buchen“** aus 5.3
  früher als geplant. Bar kassiert wird sofort an der Tür, ein Umweg über die App
  wäre genau das, was die Funktion verhindern soll.
  - Callable bzw. HTTP-Function in Bertha mit eigenem Recht `zahlung_buchen`
    am Schlüssel. Nur OWNER und ADMIN können es vergeben.
  - Sie schreibt **dieselbe Buchung** wie „Zahlung erfassen“: einen
    `TransactionLog` mit `type: "PAID"` und
    `outstandingBalance: FieldValue.increment(-betrag)` in einem Batch.
    Zusätzlich kommen `source: "cockpit"` und `paymentMethod: "CASH"` dazu.
  - **Dokument-ID = Idempotenzschlüssel** aus dem Cockpit (eine UUID je Vorgang),
    nie eine zufällige ID (Bertha-Invariante). Ein Wiederholen nach einem
    Netzabbruch bucht nicht doppelt.
  - Bei einer Gasthaus-Rechnung wird zusätzlich `invoices.status = "paid"` mit
    `paidAt` gesetzt, sobald der Betrag die Rechnung deckt.
  - **Schranken:**
    - Betrag größer 0 und höchstens offener Betrag plus 50 €, sonst Rückfrage.
    - Höchstens 30 Buchungen pro Stunde je Schlüssel.
    - Jede Buchung erzeugt ein `change_event` (`PAYMENT_RECEIVED`) und erscheint
      damit wie gewohnt im Bericht der App.
  - **Korrektur nur als Gegenbuchung**, nie Löschen oder Überschreiben
    (Bertha-Invariante). In der App über das Logbuch wie bei jeder Zahlung.

### 5a.4 Bargeldstand und Kassabuch-Liste

- Das Cockpit zeigt **„Bargeld seit der letzten Einzahlung: 342,50 €“**,
  zusammengesetzt aus:
  - Hofladen bar
  - `bareingaenge`
  - Bertha-Barzahlungen, sowohl aus dem Cockpit als auch aus der Lieferrunde.
    Die Summe je Tag liefert `betriebsuebersicht` als neues Feld `bar_je_tag`.
- Knopf **„Zur Bank gebracht“** (Betrag, Datum): Der Stand beginnt neu, und der
  Bankabgleich (Abschnitt 5) erkennt die Bareinzahlung am Konto und bestätigt sie.
  Eine Abweichung zeigt er als Hinweis an.
- **Monatsliste der Bareingänge** als Excel für **LBG Business**: Datum, wofür,
  Bereich, Betrag, Quelle. Vorbild ist der Export der Auswertung.

### 5a.5 Was das Cockpit nicht ist

**Keine Registrierkasse.** Das Cockpit erfasst nur, *dass* Geld gekommen ist.
Es erstellt keine signierten Belege und keinen Datenerfassungsprotokoll-Eintrag.

- Ob für die Barumsätze des Betriebs eine Registrierkassen- bzw.
  Belegerteilungspflicht besteht, hängt an Umsatzgrenzen und Ausnahmen. Das klärt
  die Steuerberatung (Frage 4).
- Wenn es eine Registrierkasse gibt, bleibt sie für die Belege zuständig. Das
  Cockpit verbindet dann nur noch die Bareingänge mit den offenen Posten.

### 5a.6 Kleine Ergänzung in der Bertha-App

Im Dialog **„Zahlung erfassen“** (`CustomerDetailActivity.showRecordPaymentDialog`)
kommt die Auswahl **bar / Überweisung** dazu, gespeichert als `paymentMethod` am
`TransactionLog`. Fehlt das Feld (alte Buchungen), gilt die Zahlart „unbekannt“.
Erst damit stimmt der Bargeldstand auch für Zahlungen, die in der App erfasst
werden. Auch „Zahlung erhalten“ bei den Überweisern
(`BankTransferOpenItemsActivity`) setzt `paymentMethod: "TRANSFER"`.

---

## 5b. Bar ausgegeben, ohne Rechnung (Eigenbeleg)

Beispiel: Leihgebühr für die Kreissäge beim Nachbarn, bar bezahlt, ohne Rechnung.
Für solche Ausgaben gibt es den **Eigenbeleg**. Er muss enthalten (Quellen siehe
unten, mit der Steuerberatung bestätigen):

- Empfänger (wer das Geld bekommen hat)
- Art der Ausgabe bzw. Leistung
- Datum
- Betrag
- **Grund, warum es keinen Originalbeleg gibt**
- Unterschrift

Wichtig: **Aus einem Eigenbeleg gibt es keinen Vorsteuerabzug.** Dafür braucht
es eine Rechnung nach § 11 UStG. Ist der Empfänger ein Unternehmen (Verleih,
Maschinenring, Werkstatt), lieber gleich eine Rechnung verlangen.

### 5b.1 Ablauf am Handy (unter einer Minute)

Zweiter Knopf neben „Bar erhalten“: **„Bar ausgegeben“**.

```
Bar ausgegeben
────────────────────────────────────────
Betrag        [ 30,00 ] €
An wen?       [ Josef Huber, Oberberg 12      ]   ← Vorschlag aus früheren
Wofür?        [ Leihgebühr Kreissäge, 1 Tag   ]
Bereich       ( Landwirtschaft ▾ )
Datum         [ 18.10.2026 ]
Warum kein Beleg?  (•) Privatperson, stellt keine Rechnung aus
                   ( ) Beleg verloren
                   ( ) Anderer Grund: [        ]
Foto (freiwillig)  [ 📷 ]   z. B. ein handgeschriebener Zettel
Unterschrift  ( ) Empfänger unterschreibt hier am Handy
              (•) ich unterschreibe selbst
              [ ✍  Unterschriftsfeld             ]
        [ Eigenbeleg speichern ]
```

- **Am besten unterschreibt der Empfänger** gleich am Handy („Betrag erhalten“).
  Dann ist der Beleg eine Quittung des Empfängers und viel belastbarer als eine
  reine Eigenerklärung. Geht das nicht (z. B. nachträglich), unterschreibt
  Florian oder Kathrin selbst.
- Empfänger, Zweck und Grund werden für das nächste Mal vorgeschlagen. Bei
  „Leihgebühr Kreissäge“ ist der Rest fast ausgefüllt.

### 5b.2 Was dabei herauskommt

- **Fortlaufende Nummer** `EB-2026-001`, nie neu vergeben, auch nicht nach
  einem Storno.
- **Beleg als Seite zum Drucken bzw. „Als PDF speichern“** (Druckansicht der
  Verwaltung, ohne Bibliothek). Sie enthält alle Pflichtangaben, die
  Unterschrift und das Foto.
- **Automatisch per Mail an `rechnungen@kruckenhaus.at`.** Damit landet der
  Eigenbeleg im selben Gmail-Label und im selben Belegordner wie jede andere
  Rechnung und geht mit ihnen in **LBG Business**.
  - Es gibt keinen zweiten Ablageweg.
  - Die Mail wird mit `mailHtml()` gebaut. Unterschrift und Foto kommen als
    Anhang mit, nicht als eingebettetes Bild (Mail-Regel).
- **Bargeldstand** (5a.4) sinkt um den Betrag. Die **Monatsliste** wird damit
  zum vollständigen Kassabuch: Bareingänge **und** Barausgaben, mit
  Anfangsstand, Endstand und Einzahlungen auf die Bank.
- **Barausgabe mit echter Rechnung** (z. B. Tankstelle, Lagerhaus bar bezahlt)
  geht über denselben Knopf: Foto der Rechnung statt Unterschrift, „Warum kein
  Beleg?“ entfällt. Das Foto geht ebenso an `rechnungen@`.

### 5b.3 Daten

```sql
barausgaben  id, nummer (UNIQUE, 'EB-2026-001'), datum, betrag_cent,
             empfaenger, zweck, bereich, grund, art ('eigenbeleg','rechnung'),
             unterschrift_von ('empfaenger','selbst'), unterschrift_png NULL,
             foto_id NULL, gemailt_am NULL, storniert_am NULL, storno_grund NULL,
             erfasst_von, erstellt_am
```

- Die Unterschrift wird als kleines PNG (wenige KB) gespeichert, das Foto wie die
  Produktfotos (verkleinert, `produkt_fotos`-Muster).
- Das **Original zum Aufbewahren** (7 Jahre) ist die Mail bzw. die PDF-Datei im
  Belegordner. D1 hält den Datensatz für Bargeldstand und Kassabuch.
- **Ändern geht nicht, nur stornieren** (mit Grund) und neu erfassen. So bleibt
  das Kassabuch nachvollziehbar.
- Name und Ort des Empfängers sind personenbezogene Daten. Sie werden nur für den
  Beleg verwendet und nicht an Bertha oder in Protokolle gegeben.
- Fehlt `RESEND_API_KEY`, wird der Beleg trotzdem gespeichert. Das Cockpit zeigt
  dann „noch nicht gemailt“ mit dem Knopf „erneut senden“.

Quellen zum Eigenbeleg (nicht amtlich, mit der Steuerberatung bestätigen):
[everbill: Eigenbeleg-Vorlage](https://www.everbill.com/?p=4707),
[SumUp: Eigenbeleg](https://www.sumup.com/de-de/rechnungen/lexikon/eigenbeleg/),
[freefinance: Vorsteuer](https://freefinance.at/steuern/vorsteuer.html).

---

## 6. Die Cockpit-Seite

Mobil zuerst, gleiche Gestaltung wie die Verwaltung:

```
Hof-Cockpit                                     Mo 02.11.
──────────────────────────────────────────────────────────
ÜBERFÄLLIG                                              2
  ▸ Lagerhaus: 412,80 € überweisen    fällig 30.10.  [QR]
  ▸ Gasthof Y: Rechnung 2026-118 offen seit 30 Tagen

DIESE WOCHE                                             5
  ▸ Gasthof X: Oktober abrechnen (18 Lieferungen)     [▾]
  ▸ Aufenthaltsabgabe Oktober abführen      bis 30.11.
  ▸ Gäste anmelden – Anreise heute
  ▸ 3 Fleischbestellungen – Termin klären
  ▸ Bertha: 2 neue Anmeldungen im Portal

DEMNÄCHST (30 Tage)                                     3  ▸
──────────────────────────────────────────────────────────
Ferienwohnung  Anreise Fr 06.11. · Belegung Nov 40 %
Eier           Tour morgen: 41 Kunden, 1.230 Stk
Hofladen       2 Runden offen · 1 Dauerartikel aus
Bank           letzter Abgleich 26.10.
Verbindung     Bertha ● 06:00
```

- Die Zahlen sind Beispiele.
- Jede Zeile führt dorthin, wo man die Sache erledigt. Für Bertha-Aufgaben steht
  dort „in der Bertha-App“.
- Abhaken direkt in der Liste. „Erledigt von …“ ist im aufgeklappten Eintrag zu
  sehen.
- **Ferienwohnungs-Anfragen:** Die Tabelle `anfragen` ist heute in der Verwaltung
  nicht sichtbar. Das Cockpit zeigt neue Anfragen und eine Liste mit dem Knopf
  „beantwortet“ (neue Spalte `anfragen.beantwortet_am`, Migration).

---

## 7. Montagsbrief

- Jeden Montag um 6 Uhr eine Mail an die Adressen aus `VERWALTUNG_EMAILS`:
  Überfälliges, „Zahltag heute“ (Summe und Liste) und die Woche.
- Gebaut mit `mailHtml()` aus `functions/_lib/mail.js`, Nur-Text-Fassung inklusive.
- **Auslöser:** Pages Functions haben keinen Zeitplan. Für den Zeitplan gibt es
  zwei Wege:
  - ein **Cloudflare Cron-Worker** (eigener kleiner Worker, ruft
    `POST /api/verwaltung/montagsbrief` mit eigenem Secret auf), oder
  - eine geplante Claude-Aufgabe, die denselben Aufruf macht.

  Empfehlung: der Cron-Worker, weil er unabhängig ist.
- Fehlt `RESEND_API_KEY`, fällt der Brief aus. Das Cockpit selbst funktioniert
  weiter.

---

## 8. Datenschutz und Sicherheit

- **Zugang:** wie die Verwaltung (Cloudflare Access und `zugang.js`), nie
  abschwächen.
- **Bertha → Website:** nur Zahlen, Gastro- und Firmennamen, Monate und Status;
  keine Adressen und keine Privatkunden. Das bleibt innerhalb desselben
  Verantwortlichen. Vor dem Live-Gang prüfen, ob `datenschutz.html#bertha` einen
  Satz dazu braucht (Rechtstext nur auf ausdrücklichen Auftrag ändern).
- **Website → Bertha:** nur „Zahlung buchen“ (5a.3), mit eigenem Recht am Schlüssel,
  Idempotenzschlüssel, Betragsschranke und Audit-Eintrag. Sonst schreibt das Cockpit nichts in Bertha.
- **Kontoauszug:** wird nur im Browser gelesen und nie gespeichert. In D1 stehen
  nur Prüfsummen (IBAN → Kunde, Buchung).
- **Eingangsrechnungen:** IBAN und BIC von Lieferanten stehen in D1 (Geschäftsdaten,
  nötig für den QR-Code). Eine geänderte IBAN eines bekannten Lieferanten löst eine
  Warnung aus.
- **Keine Belege in D1**, keine Geheimnisse im Repository, kein `localStorage`.

---

## 9. Umsetzung in Phasen

Eine Sitzung, ein Thema, ein Commit, auf dem Feature-Branch, erst nach dem Test
auf `master`. **W** = Website, **B** = Bertha.

| Phase | Wo | Inhalt | Ergebnis |
|---|---|---|---|
| **C1** | W | `schema-cockpit.sql`, Aufgaben und Vorlagen (Abschnitt 2), Vorlagen aus Abschnitt 10 als Erstbefüllung, Cockpit-Startseite mit Website-Aufgaben, Ferienwohnungs-Anfragen, Anreisen und Gästemeldung | sofort nützlich, ohne Bertha |
| **C2** | W | Eingangsrechnungen mit QR-Code, Lieferanten-Vorschlag, IBAN-Warnung, Zahltag-Ansicht | Rechnungen werden pünktlich bezahlt |
| **C3** | B | Function `betriebsuebersicht`, Schlüssel in den Betriebseinstellungen, Tests im Emulator | Bertha liefert Abrechnung und Kennzahlen |
| **C2b** | W | „Bar ausgegeben“ mit Eigenbeleg, Unterschrift am Handy, Nummernkreis, Druckansicht und Mail an `rechnungen@` (5b) · „Bar erhalten“ für Hofladen-Posten und „Etwas anderes“ (5a) · Bargeldstand, „Zur Bank gebracht“, Kassabuch-Monatsliste für LBG | Bargeld an einer Stelle, auch ohne Rechnung belegt |
| **C4** | W | Bertha-Aufgaben (4.3) und -Kennzahlen im Cockpit, Zwischenspeicher, Ampel | Gasthaus-Rechnungen werden nicht mehr vergessen |
| **C4b** | B + W | Bertha: Function „Zahlung buchen“ (5a.3), Zahlart im Dialog „Zahlung erfassen“ (5a.6), `bar_je_tag` in der Übersicht · Website: Bertha-Posten in „Bar erhalten“ | Gasthaus und Eierkunden bar an der Tür erfassen |
| **C5** | W | Bankabgleich George (Abschnitt 5) für Website-Posten und als Vorschlag für Bertha-Posten | „Wer hat noch nicht bezahlt?“ auf einen Blick |
| **C6** | W | Montagsbrief mit Cron-Worker | Überblick, ohne etwas zu öffnen |
| später | W/B | Eingangsrechnungen automatisch aus Gmail (3.2) · Bankabgleich bucht Bertha-Überweisungen über „Zahlung buchen“ (5.3) · CSV für LBG AbHof (4.3) | weniger Handarbeit |

**Tests:** `scripts/test-cockpit-db.mjs` (Schema, Fälligkeitsregeln, keine Doppelten
beim gleichzeitigen Abhaken), `…-bank.mjs` (George-Format, Zuordnung,
Doppel-Export), danach alle bestehenden `test-hofladen-*.mjs` und
`test-extern-api.mjs`.

---

## 10. Wiederkehrende Pflichten – Vorlagen

Recherche Oktober 2026. **Jede Vorlage ist abschaltbar.** Was nicht auf den Betrieb
zutrifft, wird nicht aktiviert. Fristen mit „prüfen“ sind nicht abschließend
bestätigt und vor dem Aktivieren mit Steuerberatung, Bezirkshauptmannschaft (BH)
bzw. Landwirtschaftskammer (LK) abzuklären.

### 10.1 Steuern und Sozialversicherung

| Pflicht | Frist / Rhythmus | Stand | Quelle |
|---|---|---|---|
| **USt-Voranmeldung und Zahlung** | vierteljährlich, 15. des zweitfolgenden Monats: 15.05., 15.08., 15.11., 15.02. | bestätigt | [USP: UVA](https://www.usp.gv.at/themen/steuern-finanzen/umsatzsteuer-ueberblick/umsatzsteuervoranmeldung-und-umsatzsteuererklaerung.html) |
| Jahreserklärungen (ESt, USt) | 30.04. (Papier) bzw. 30.06. (FinanzOnline). Mit Steuerberatung gelten längere Quotenfristen | bestätigt, Vertretung klären | [USP: Steuererklärungen](https://www.usp.gv.at/steuern-finanzen/steuerliche-rechte-und-pflichten/weitere-informationen-zu-steuerlichen-rechten-und-pflichten-als-unternehmen/einreichen-von-steuererklaerungen.html), [BMF: Fristen](https://www.bmf.gv.at/themen/steuern/fristen-verfahren/fristen-faelligkeiten.html) |
| **SVS: Einnahmen aus Nebentätigkeiten melden** | jährlich bis **30.04.** für das Vorjahr (brutto inkl. USt), sonst 5 % Beitragszuschlag. Neue Nebentätigkeit: binnen 1 Monat | bestätigt (LK) | [LK Wien](https://wien.lko.at/einnahmen-aus-nebentätigkeiten-sind-zu-melden+2400+4232752), [LK OÖ](https://ooe.lko.at/direktvermarktung-sozialversicherung+2400+3549522) |
| Registrierkasse: Jahresbeleg prüfen | bis **15.02.** (Dezember-Monatsbeleg mit der BMF-Belegcheck-App) | bestätigt – **nur wenn es eine Registrierkasse gibt** | [WKO](https://www.wko.at/steuern/pruefung-jahresbeleg-registrierkasse), [KPMG](https://kpmg.com/at/de/home/insights/2025/01/tn-kmu-pruefung-des-registrierkassen-jahresbelegs.html) |
| Grundsteuer / Abgabe von land- und forstwirtschaftlichen Betrieben | laut Bescheid der Gemeinde, meist vierteljährlich | prüfen (Bescheid) – entfällt bei Einzug | – |

Die SVS-Meldung ist für euch wahrscheinlich die wichtigste neue Erinnerung.
Direktvermarktung be- und verarbeiteter Produkte (Nudeln, Seife,
Fleischverarbeitung) zählt als Nebentätigkeit, mit einem Freibetrag von 3.700 €
im Jahr. Ob die Ferienwohnung mitzumelden ist, hängt an der Bettenzahl und der
Einstufung. Das klärt die LK oder die SVS.

### 10.2 Ferienwohnung (Tirol, TVB Alpbachtal)

| Pflicht | Frist / Rhythmus | Stand | Quelle |
|---|---|---|---|
| **Aufenthaltsabgabe abführen und melden** (Personen, Nächtigungen, Beträge) | monatlich, **bis Ende des Folgemonats**, ohne Aufforderung (Selbstbemessung) | bestätigt (§ 7 T-AAG) | [RIS: Tiroler Aufenthaltsabgabegesetz](https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=LrT&Gesetzesnummer=10000125), [JUSLINE](https://www.jusline.at/gesetz/t-aag/gesamt) |
| **Gästemeldung** | unverzüglich, spätestens 24 h nach Ankunft – **automatisch aus dem Airbnb-Kalender** (2.3) | bestätigt | [Land Tirol: Aufenthaltsabgabe](https://www.tirol.gv.at/fileadmin/themen/tourismus/tourismusabteilung/Aufenthaltsabgaben/Aufenthaltsabgabe-Folder_.pdf) |
| Tourismus-Pflichtbeitrag | jährliche Vorschreibung durch das Land, zahlen laut Bescheid | prüfen, ob ihr pflichtig seid | [Land Tirol: Pflichtbeitrag](https://tirol.gv.at/tourismus/pflichtbeitrag) |
| Feuerlöscher überprüfen lassen | alle **2 Jahre** durch Sachkundige | bestätigt (Land Tirol) | [Land Tirol: Brandschutz](https://www.tirol.gv.at/presse/meldungen/meldung/brandschutz-beginnt-bei-der-vorsorge/) |
| Rauchwarnmelder testen | jährlich (Empfehlung, keine gefundene Pflicht für Bestandsbauten) | Empfehlung | [Land Tirol: Rauchwarnmelder](https://www.tirol.gv.at/fileadmin/buergerservice/Bilder_Div/Rauchwarnmelder/LT_Rauchwarnmelder_Folder_final.pdf) |
| Trinkwasser untersuchen lassen | **nur bei eigener Quelle bzw. eigenem Brunnen**: Wer Wasser an Gäste abgibt, fällt unter die Trinkwasserverordnung. Den Rhythmus legt die Behörde fest | prüfen (Gemeindewasser oder eigene Quelle?) | [Land NÖ: Wasserversorgung, Recht](https://noe.gv.at/noe/Wasser/wasserversorgung_recht.html) |

Wenn Airbnb die Aufenthaltsabgabe selbst abführt, entfällt die Abfuhr für diese
Buchungen. Für Direktbuchungen bleibt sie. Das klärt der TVB Alpbachtal.

### 10.3 Tiere

| Pflicht | Frist / Rhythmus | Stand | Quelle |
|---|---|---|---|
| **Rinder:** Geburt, Zugang, Abgang, Schlachtung an die AMA-Rinderdatenbank | binnen **7 Tagen** – Schnellknopf (2.3) | bestätigt | [USP: Rinder](https://www.usp.gv.at/themen/brancheninformationen/landwirtschaft/rinder/rinder-meldung-an-die-elektronische-datenbank.html) |
| **Schafe:** Bestandsmeldung an das VIS | Stichtag **01.04.**, Meldung bis **15.04.** (bei MFA-Teilnahme über den Mehrfachantrag) | bestätigt | [USP: Schafe und Ziegen](https://www.usp.gv.at/themen/brancheninformationen/landwirtschaft/schweine-schafe-und-ziegen/schweine-schafe-und-ziegen-stamm-und-betriebsdaten.html), [TKZVO § 5](https://gesetzefinden.at/bundesrecht/verordnungen/tkzvo-2009/para-5) |
| **Bienen:** Völkerzahl an das VIS | zweimal jährlich: Stichtag **30.04.** (Meldung bis 30.06.) und **31.10.** (Meldung bis 31.12.). Neue Bienenstände binnen 7 Tagen | bestätigt (BH OÖ, LK Wien), Daten in Tirol prüfen | [Land OÖ](https://www.land-oberoesterreich.gv.at/175292.htm), [LK Wien](https://wien.lko.at/evidenzmeldung-und-meldeverpflichtung-von-bienenvölkern+2400+4131258) |
| **Legehennen:** Salmonellen-Eigenkontrolle | **ab 350 Hennen** alle 15 Wochen (EU-Vorgabe). Darunter gilt laut Bio Austria die Geflügelhygieneverordnung nicht, wenn nur kleine Mengen direkt abgegeben werden | prüfen (Herdengröße?) | [Bio Austria: Eier](https://www.bio-austria.at/app/uploads/2022/03/direktvermarktung-und-kennzeichnung-von-eiern-150623.pdf), [USP: Eier](https://www.usp.gv.at/themen/brancheninformationen/landwirtschaft/eier.html) |
| Alpakas | keine eigene Meldepflicht gefunden | bei der BH nachfragen | – |
| Tiergesundheitsdienst: Betriebserhebung | jährlich, **nur bei TGD-Teilnahme** | prüfen | [TGD-VO 2009](https://www.jusline.at/gesetz/tgd-vo_2009/paragraf/10.pdf) |

Die Bienen-Meldung mit Stichtag 31.10. ist **gerade aktuell** (Meldung bis 31.12.).

### 10.4 Direktvermarktung und Hofladen

| Pflicht | Frist / Rhythmus | Stand | Quelle |
|---|---|---|---|
| **Waage nacheichen** | für die meisten Waagen **alle 2 Jahre** (Brückenwaagen 3), gezählt ab dem Kalenderjahr nach der letzten Eichung. Betrifft die Waage, mit der Fleisch für den Verkauf gewogen wird | bestätigt (BEV) | [BEV: Masse](https://www.bev.gv.at/Themen/Mess-und-Eichwesen/Messtechnische-Fachbereiche/Masse-Gehaltsermittlung-Dichte/Masse.html), [BEV: FAQ Eichstellen](https://www.bev.gv.at/dam/jcr:59e64696-74d1-4b39-a5e3-779c8ae489bf/FAQ-Eichstellen_Waagen_Vers02.pdf) |
| Hygieneschulung | **alle 3 Jahre** (laut LK) | prüfen (Tirol) | [LK Kärnten](https://ktn.lko.at/was-direktvermarkter-in-der-fleischproduktion-beachten-müssen+2400+3821213) |
| Eigenkontrolle: Proben / Aufzeichnungen | regelmäßig, laut Handbuch | prüfen | [Handbuch Eigenkontrolle](https://www.urlaubambauernhof.at/de/handbuch-zur-eigenkontrolle_hygiene-5.auflage.pdf_dl_117818) |

Die Waage wird beim Hofladen mitgedacht: Das Cockpit erinnert rechtzeitig vor der
Nacheichung, weil die Übergabe gewogener Ware davon abhängt.

### 10.5 Förderung und Betrieb

| Pflicht | Frist / Rhythmus | Stand | Quelle |
|---|---|---|---|
| **AMA-Mehrfachantrag** | Einreichung ab November, **Fallfrist 15.04.** – Aufgabe „MFA vorbereiten“ im Februar, „MFA einreichen“ bis 15.04. | bestätigt (LK Tirol, 2024) | [LK Tirol](https://tirol.lko.at/mehrfachantrag-2024-antragsfrist-beachten+2400+4012524), [USP: MFA](https://www.usp.gv.at/brancheninformationen/landwirtschaft/agrarmarkt/agrarfoerderungen/agrarpolitik-eu-mehrfachantrag-auf-flaechen-und-tierbezogene-foerderungen.html) |
| Pflanzenschutz-Sachkundeausweis | gilt **6 Jahre**, Verlängerung mit 5 Weiterbildungsstunden (nicht älter als 3 Jahre). Verlängert sich nicht von selbst | bestätigt (LFI) – **nur wenn ihr einen habt** | [LFI OÖ](https://ooe.lfi.at/weiterbildungen-für-den-pflanzenschutz-sachkundeausweis+2500+1590608) |
| Feuerungsanlage (Rauchfangkehrer) | kommt nach Plan des Rauchfangkehrers, keine eigene Aufgabe | – | [Tiroler Feuerpolizeiordnung](https://www.ris.bka.gv.at/Dokumente/Landesnormen/LTI40044773/LTI40044773.html) |
| Eigene Erinnerungen | §57a-Pickerl (Traktor, Anhänger), Versicherungsprämien, Wartungen | trägt ihr selbst ein | – |

---

## 11. Offene Fragen

| # | Frage | nötig für |
|---|---|---|
| 1 | Hat **LBG Business** einen Belegeingang (Beleg hochladen und beim Buchen anhängen)? Sonst Google-Drive-Ordner je Jahr | C2 |
| 2 | Kann **LBG AbHof** Lieferscheine bzw. Positionen als CSV einlesen? (software@lbg.at) | später |
| 3 | Beispiel-Export aus **George** (Kopfzeile und 2–3 Zeilen, Namen geschwärzt) | C5 |
| 4 | Gibt es eine **Registrierkasse**? Besteht für die Barumsätze eine Registrierkassen- bzw. Belegerteilungspflicht? (Steuerberatung) | C1 (Vorlage), C2b |
| 5 | **Eigene Quelle bzw. Brunnen** oder Gemeindewasser? | C1 (Vorlage) |
| 6 | Wie viele **Legehennen**? Teilnahme am **TGD**? **Pflanzenschutz-Ausweis** vorhanden? | C1 (Vorlagen) |
| 7 | Führt **Airbnb** die Aufenthaltsabgabe ab, oder macht ihr alles selbst? | C1 (Vorlage) |
| 8 | Wann wurde die **Waage** zuletzt geeicht, wann die **Feuerlöscher** zuletzt geprüft? (Startdatum für „alle n Jahre“) | C1 |
| 9 | Montagsbrief an beide oder nur an Florian? | C6 |
| 10 | Steuerberatung: Passt der Eigenbeleg aus 5b (Pflichtangaben, Unterschrift des Empfängers) so? Soll das Kassabuch in einer bestimmten Form an LBG Business gehen? | C2b |

---

## 12. Kosten

| Posten | Kosten |
|---|---|
| D1, Pages Functions, Cron-Worker | 0 € (Gratis-Kontingent) |
| Weiterleitung `rechnungen@` bei world4you | im bestehenden Vertrag |
| Bertha-Function | voraussichtlich im Gratis-Kontingent von Firebase |
