# Hofladen ↔ Bertha – Umsetzungsplan der Schnittstelle

Stand: Oktober 2026 · Status: **Konzept – noch nichts programmiert**

> Kurzfassung: Das Sortiment wird **einmal** gepflegt, in der
> Website-Verwaltung (Artikel, Fotos, Bestellrunden). Bestellt wird an zwei
> Stellen: auf `kruckenhaus.at` (für alle) und im **Bertha-Kundenportal**
> (für Eierkunden). Frischfleisch wickelt immer die Website ab (Abholung oder
> eigene Fleischtour). Dauerartikel wie Nudeln und Seife kommen bei
> Eierkunden mit der Eierlieferung, abgewickelt in Bertha.
>
> Die beiden Systeme reden **nur Server zu Server** miteinander, über eine
> kleine, abgesicherte Schnittstelle auf der Website (`/api/extern/v1/`).
> Das Kundenportal und die Android-App kennen keinen Schlüssel.

Grundlage: `docs/HOFLADEN-VORBESTELLUNG.md` (Bestellrunden, Verwaltung,
Kundenseite). Dieser Plan ergänzt ihn, er ersetzt ihn nicht.

---

## 0. Entscheidungen (Oktober 2026)

| Frage | Entscheidung |
|---|---|
| Wo wird das Sortiment gepflegt? | **Website-Verwaltung** – Artikel, Fotos und Bestellrunden lassen sich dort am PC komfortabler pflegen als in der App |
| Werden Eier und Fleisch gemeinsam ausgeliefert? | **Nein, nie.** Bertha fährt Eiertouren, die Website plant Fleischtouren |
| Frischfleisch | Bestellrunden mit Menge wie bisher. Bestellen über Website **und** Bertha-Portal, Abwicklung (Abholung, Zustellung, Wiegen, Zahlung) **nur auf der Website** |
| Dauerartikel (Nudeln, Seife u. a.) | Bestellen über Website (für alle) **und** Bertha-Portal (Eierkunden). Portal-Bestellungen kommen mit der Eierlieferung und stehen auf dem Lieferschein |
| Bestand der Dauerartikel | **Nur verfügbar / ausverkauft**, von Hand umgeschaltet. Keine Stückzahlen |
| Bertha allgemein oder nur für den Kruckenhaus? | **Allgemein:** Bertha bekommt ein Modul „Externer Hofladen“, kruckenhaus.at ist die erste Anbindung |
| Liefertour auf der Website | **Bleibt** – sie ist die Fleischtour |

---

## 1. Die zwei Abläufe

| | Frischfleisch | Dauerartikel |
|---|---|---|
| Pflege | Website (Bestellrunde, Menge, Termine) | Website (Preis, verfügbar/ausverkauft) |
| Bestellen | Website + Bertha-Portal | Website + Bertha-Portal |
| Abwicklung | Website: Abholung am Hof oder Fleischtour | Website-Bestellung: Website · Portal-Bestellung: Bertha-Lieferrunde |
| Bezahlung | wie bisher auf der Website (bar / Überweisung mit QR-Code) | Website: wie bisher · Portal: Lieferschein bzw. Monatsaufstellung in Bertha |
| Was die Schnittstelle tut | Portal-Bestellung wird **auf der Website angelegt** | Bertha **liest nur die Artikelliste** |

```
                     ┌──────────────────────────────────────┐
  Florian / Kathrin  │  WEBSITE  kruckenhaus.at             │
  pflegen hier ────► │  Verwaltung: Sortiment, Fotos,       │
                     │  Bestellrunden, Fleischbestellungen  │
                     │  D1-Datenbank = Quelle der Wahrheit  │
                     └──────┬──────────────────▲────────────┘
                            │ ① Katalog lesen  │ ② Fleisch bestellen
                            │   (Dauerartikel, │    (Kontingent prüft
                            │    Fleischangebot)│     die Website)
                     ┌──────▼──────────────────┴────────────┐
                     │  BERTHA – Server (Cloud Functions)   │
                     │  einziger Ort mit dem Schlüssel      │
                     └──────┬──────────────────▲────────────┘
                            │                  │
              ┌─────────────▼──┐        ┌──────┴─────────────┐
              │ Kundenportal   │        │ Android-App        │
              │ (Eierkunden)   │        │ Lieferrunde,       │
              │ kein Schlüssel │        │ Lieferschein       │
              └────────────────┘        └────────────────────┘
```

**Wer ist wofür die Quelle der Wahrheit?**

- **Website:** Sortiment, Preise, Fotos, Bestellrunden, Mengen, alle
  Fleischbestellungen, Dauerartikel-Bestellungen von Nicht-Eierkunden.
- **Bertha:** Eierkunden, Lieferrunden, Dauerartikel-Bestellungen aus dem
  Portal, Lieferscheine, Monatsaufstellung.

Keine Bestellung lebt in beiden Systemen gleichzeitig. Dadurch gibt es
nichts, was sich gegenseitig überschreiben oder auseinanderlaufen kann.

---

## 2. Änderungen auf der Website (Datenmodell)

Alle Änderungen kommen als **eigene Migrationsdatei**
(`migration-2026-xx-schnittstelle.sql`), wie schon bei
`migration-2026-10-bereiche.sql`, weil `ALTER TABLE … ADD COLUMN` nicht
mehrfach ausführbar ist. `schema-hofladen.sql` wird für neue Datenbanken
nachgezogen. **Vor jeder Migration eine Sicherung:**
`npx wrangler d1 export kruckenhaus --remote --output=sicherung.sql`.

### 2.1 Dauerartikel

Bisher hängt jede Ware an einer Bestellrunde (`charge_artikel`). Nudeln und
Seife werden aber laufend verkauft. Neu in `produkte`:

| Spalte | Inhalt |
|---|---|
| `verkaufsart` | `'runde'` (Fleisch, wie bisher) oder `'dauer'` |
| `dauerpreis_cent` | fester Preis, nur bei `'dauer'` |
| `verfuegbar` | 1 = verfügbar, 0 = ausverkauft (nur bei `'dauer'`) |
| `im_portal` | 1 = auch im Bertha-Portal anbieten |
| `geaendert_am` | Zeitpunkt der letzten Änderung (für den Abgleich mit Bertha) |

`geaendert_am` wird bei **jeder** Änderung am Produkt (Text, Preis, Foto,
Schalter) in der Verwaltung mitgesetzt.

### 2.2 Dauerartikel auf der Website bestellen (alle Kunden)

Damit Bestellliste, Übergabe, Zahlungen, Export und „Meine Bestellungen“
unverändert weiterlaufen, bekommen Dauerartikel eine **ständige
Bestellrunde** „Dauersortiment“:

- Neue Spalte `chargen.art`: `'runde'` (Standard) oder `'dauer'`. Es gibt
  genau eine Runde mit `art = 'dauer'`, sie ist immer offen und wird nie
  archiviert.
- Ihre Artikel werden automatisch aus allen Produkten mit
  `verkaufsart = 'dauer'` gebildet, Preis = `dauerpreis_cent`.
- **Keine Mengenprüfung:** Die Überbuchungsprüfung
  (`SQL_UEBERBUCHT_ZUR_WARTELISTE`) überspringt Runden mit `art = 'dauer'`.
  Stattdessen nimmt die Bestellung nur Artikel an, die `verfuegbar = 1`
  sind.
- Übergabe: siehe offene Frage 1 (Vorschlag: Abholung nach Absprache).

### 2.3 Fleischrunden im Portal

Neue Spalte `chargen.im_portal` (Standard 1): Die Runde erscheint auch im
Bertha-Portal. Für Runden, die nur über den Stammkunden-Link laufen
sollen, abschaltbar.

### 2.4 Neue Tabellen für die Schnittstelle

```sql
-- Zugänge: wer die Schnittstelle nutzen darf (z. B. „Bertha“, „Bertha Test“)
schnittstellen_zugaenge  id, name, schluessel_hash (SHA-256, UNIQUE),
                         rechte ('katalog,angebot,bestellen'),
                         erstellt_am, zuletzt_genutzt, gesperrt_am

-- Zuordnung Bertha-Kunde ↔ Website-Kunde
extern_kunden            zugang_id, externe_id, kunde_id, erstellt_am
                         UNIQUE (zugang_id, externe_id)

-- Schutz vor Doppelbestellungen bei Wiederholung (Idempotenz)
extern_anfragen          zugang_id, anfrage_id, bestellung_id, antwort,
                         erstellt_am
                         UNIQUE (zugang_id, anfrage_id)

-- Protokoll OHNE personenbezogene Daten, 90 Tage
schnittstellen_protokoll id, zeitpunkt, zugang_id, aufruf, http_status,
                         fehlercode, dauer_ms

-- Einfache Einstellungen (z. B. Schnittstelle pausiert)
einstellungen            name (PRIMARY KEY), wert
```

**Warum kein neuer Wert `'bertha'` in `bestellungen.quelle`?** SQLite kann
eine CHECK-Bedingung nicht nachträglich ändern. Dafür müsste die Tabelle
mit allen Bestellungen neu aufgebaut werden. Ob eine Bestellung über Bertha
kam, ergibt sich sicherer aus `extern_anfragen`. `quelle` bleibt `'web'`.

---

## 3. Die Schnittstelle (Version 1)

Adresse: `https://kruckenhaus.at/api/extern/v1/…`
Code: `functions/api/extern/v1/[[pfad]].js` plus
`functions/api/extern/_middleware.js` für die Zugangsprüfung.

### 3.1 Anmeldung

Jeder Aufruf trägt den Schlüssel im Header:

```
Authorization: Bearer kh_live_3vQ8…(43 Zeichen)
```

- Der Schlüssel wird **in der Verwaltung erzeugt** (32 Byte Zufall,
  `crypto.getRandomValues`), **einmal angezeigt** und nur als
  SHA-256-Prüfsumme in D1 gespeichert. Das ist dasselbe Muster wie bei den
  „Meine Bestellungen“-Links: Wer die Datenbank sieht, kann daraus keinen
  gültigen Schlüssel bauen.
- Die Middleware bildet die Prüfsumme, sucht den Zugang, prüft
  `gesperrt_am` und die nötigen Rechte und setzt `zuletzt_genutzt`.
- Fehlt der Header oder passt er nicht, kommt einheitlich `401`, ohne
  Hinweis, *was* falsch war.

**Warum ein Bearer-Schlüssel und keine Signatur (HMAC)?** Die Verbindung
läuft immer über HTTPS. Damit sind Abhören und Verändern unterwegs schon
ausgeschlossen. Eine Signatur bringt hier wenig zusätzlichen Schutz,
verlangt aber, dass die Website den Schlüssel im Klartext kennt. Er
dürfte dann nicht mehr als Prüfsumme gespeichert werden. Der einfache Weg
ist hier auch der sicherere.

### 3.2 Aufrufe

| Aufruf | Recht | Zweck |
|---|---|---|
| `GET /ping` | – | Verbindung testen: Name des Zugangs, Rechte, Serverzeit |
| `GET /katalog` | `katalog` | alle Dauerartikel mit `im_portal = 1` (auch ausverkaufte, mit `verfuegbar: false`) |
| `GET /angebot` | `angebot` | offene Fleischrunden mit `im_portal = 1`: Artikel, freie Menge, Termine, Liefergebiet |
| `POST /bestellungen` | `bestellen` | Fleischbestellung aus dem Portal anlegen |
| `GET /bestellungen?kunde=<externe_id>` | `status` | *später:* Stand der über Bertha angelegten Bestellungen |

Bewusst **nicht** möglich: Kundenliste lesen, fremde Bestellungen sehen,
Produkte ändern, stornieren, irgendetwas aus der Verwaltung. Das bleibt bei
der Verwaltung mit Cloudflare Access.

### 3.3 Beispiel `GET /katalog`

```json
{
  "ok": true,
  "stand": "2026-10-13T08:15:00Z",
  "artikel": [
    {
      "id": 12,
      "name": "Eiernudeln Spirelli 500 g",
      "bereich": "Eiernudeln",
      "preis_cent": 400,
      "einheit": "Stück",
      "verfuegbar": true,
      "beschreibung": "…",
      "pflichtangaben": "Hartweizengrieß, Eier, Salz, Wasser …",
      "allergene": "Weizen (Gluten), Ei",
      "bild_url": "https://kruckenhaus.at/api/hofladen/foto/7",
      "bild_version": "7",
      "geaendert_am": "2026-10-12T17:40:00Z"
    }
  ]
}
```

Antwortet mit `ETag`. Schickt Bertha `If-None-Match` mit und hat sich nichts
geändert, kommt `304` ohne Inhalt. Das spart Abrufe.

### 3.4 Beispiel `POST /bestellungen`

```
Authorization: Bearer kh_live_…
Idempotency-Key: 6f1c2b0e-8d1a-4c47-9a7e-2b4f3d9c1a55
Content-Type: application/json
```

```json
{
  "runde_id": 31,
  "positionen": [{ "artikel_id": 88, "menge": 2 }],
  "termin_id": 54,
  "zahlart": "ueberweisung",
  "anmerkung": "Gerne eher größere Hühner",
  "kunde": {
    "externe_id": "c_8Hk2…",
    "name": "Maria Muster",
    "email": "maria@example.at",
    "telefon": "+43 664 …",
    "strasse": "Dorfstraße 5", "plz": "6252", "ort": "Breitenbach am Inn"
  },
  "zustimmung": { "bestellbedingungen": "2026-10", "zeitpunkt": "2026-10-13T08:20:11Z" }
}
```

Antwort `201` (bzw. `200` mit derselben Antwort bei Wiederholung):

```json
{
  "ok": true,
  "nummer": "2026-047",
  "status": "vorgemerkt",
  "summe_ca_cent": 8640,
  "geschaetzt": true,
  "termin": "Abholung Sa 25.10., 9–12 Uhr",
  "hinweis": "Den genauen Betrag erfahrt ihr bei der Übergabe."
}
```

`status` kann auch `"warteliste"` sein, wenn die Menge inzwischen vergeben
ist. Die Bestätigungsmail samt „Meine Bestellungen“-Link verschickt **die
Website**, genau wie bei einer Bestellung über `hofladen.html`. Damit gibt
es nur eine Mailvorlage, und Widerrufsbutton sowie Zahlungsinfo gelten
automatisch.

**Ablauf intern** (wiederverwendet, was es schon gibt):

1. Middleware: Schlüssel, Rechte, Schnittstelle nicht pausiert
2. `Idempotency-Key` schon bekannt? → gespeicherte Antwort zurück, nichts neu anlegen
3. Eingaben prüfen wie auf `hofladen.html` (`kontaktPruefen`, Größenlimit,
   Runde offen, Bestellschluss, `im_portal`, Termin, Liefergebiet,
   Höchstmengen)
4. Kunde: zuerst über `extern_kunden`, sonst wie bisher über die E-Mail
   (`kundeFinden`, überschreibt nie Vorhandenes), dann Zuordnung speichern
5. `bestellungAnlegen()` – überbuchungssicher, sonst Warteliste.
   `extern_anfragen` wird **in derselben Transaktion** (`optionen.zusatz`)
   geschrieben
6. Mail an Kunden und Hof, Protokollzeile, Antwort

### 3.5 Fehler

Immer dasselbe Format, mit festem `code` für Bertha und einem Satz für den
Kunden:

```json
{ "ok": false, "fehler": { "code": "bestellschluss", "text": "Der Bestellschluss für diese Runde ist vorbei." } }
```

| HTTP | `code` | Bedeutung |
|---|---|---|
| 400 | `ungueltig` | Eingabe fehlt oder ist falsch |
| 401 | `nicht_angemeldet` | Schlüssel fehlt, falsch oder gesperrt |
| 403 | `keine_berechtigung` | Zugang hat dieses Recht nicht |
| 404 | `nicht_gefunden` | Runde/Artikel/Termin gibt es nicht (mehr) |
| 409 | `bestellschluss`, `nicht_im_portal`, `ausserhalb_liefergebiet` | Bestellung so nicht möglich |
| 413 | `zu_gross` | Anfrage über dem Größenlimit |
| 429 | `zu_viele` | Limit erreicht, später erneut versuchen |
| 503 | `pausiert` | Schnittstelle in der Verwaltung pausiert |

Ausverkauft ist **kein** Fehler. Die Bestellung landet auf der Warteliste,
wie auf der Website.

### 3.6 Versionierung

`/v1/` bleibt stabil. Neue Felder kommen nur **hinzu**, und Bertha ignoriert
Felder, die es nicht kennt. Wird je etwas Grundlegendes geändert, gibt es
`/v2/`, und `/v1/` läuft eine Übergangszeit weiter.

---

## 4. Datensicherheit

### 4.1 Der Schlüssel

- **Nur im Bertha-Server.** Er liegt bei Google im Secret Manager oder in
  einer Firestore-Sammlung, die die Security Rules für jeden Client sperren
  (`allow read, write: if false`). Er steht nie in der Android-App, nie im
  Portal-Code (alles, was im Browser läuft, ist auslesbar) und nie in Git.
- **Ein Schlüssel je System:** „Bertha“ und „Bertha Test“ getrennt. Die
  Bertha-Demo teilt sich die Firestore-Datenbank mit dem Echtbetrieb, sie
  bekommt daher **keinen** Echt-Schlüssel.
- **Wechseln ohne Ausfall:** neuen Schlüssel anlegen → in Bertha eintragen
  → „Verbindung testen“ → alten sperren. Empfehlung: einmal im Jahr und
  sofort, wenn ein Gerät oder Konto verloren geht.
- **Sperren** wirkt sofort (`gesperrt_am`), ohne neues Deployment.

### 4.2 Transport und Browser

- Nur HTTPS (Cloudflare erzwingt das).
- **Keine CORS-Header** auf `/api/extern/*`. Ein Browser darf die
  Schnittstelle von fremden Seiten gar nicht aufrufen. Das ist gewollt,
  denn nur der Bertha-Server soll sie nutzen.
- `Cache-Control: no-store` und `X-Robots-Tag: noindex` in `_headers`.
- Cloudflare Access schützt nur `/verwaltung/*` und `/api/verwaltung/*`
  und darf `/api/extern/*` **nicht** abdecken. Beim Einrichten prüfen.

### 4.3 Nur das Nötigste darf rein

- Eingaben werden genauso geprüft wie auf `hofladen.html`, mit denselben
  Funktionen, nicht nachgebaut.
- Größenlimit je Anfrage (20 KB, wie `MAX_ANFRAGE_BYTES`).
- D1 nur über gebundene Prepared Statements. Alles, was in Mails landet,
  läuft durch `escapeHtml`.

### 4.4 Missbrauch begrenzen

Die Website vertraut Bertha bei der Frage, *wer* bestellt. Deshalb ist der
Schaden auch dann klein, wenn ein Schlüssel in falsche Hände gerät:

- **Limits je Zugang:** z. B. höchstens 30 Bestellungen pro Stunde (gezählt
  im Protokoll), je Bertha-Kunde höchstens 3 offene Bestellungen pro Runde.
- **Cloudflare-Regel** (Rate Limiting im kostenlosen Tarif) auf
  `/api/extern/*` als zweite Schranke.
- **Kennzeichnung:** Portal-Bestellungen tragen in der Verwaltung ein
  sichtbares Zeichen „über Bertha“.
- **Not-Aus:** In der Verwaltung „Schnittstelle pausieren“. Dann antworten
  alle Aufrufe mit `503`, die Website selbst läuft weiter.

### 4.5 Nachvollziehbarkeit

`schnittstellen_protokoll` hält fest, *wann*, *welcher Zugang*, *welcher
Aufruf*, *mit welchem Ergebnis* und *wie schnell*. Es enthält **keine**
Namen, E-Mails, Adressen oder Bestellinhalte. Einträge älter als 90 Tage
werden beim nächsten Schreiben gelöscht. Damit lassen sich Fehler und
Missbrauch erkennen, ohne eine zweite Kundendatei aufzubauen.

### 4.6 Testen ohne echte Daten

**Achtung:** Die Vorschau-Adressen (`*.kruckenhaus.pages.dev`) nutzen
derzeit **dieselbe D1-Datenbank** wie die Live-Seite. Eine Testbestellung
dort wäre eine echte Bestellung. Vor dem ersten Schnittstellentest daher:

- eigene Datenbank `kruckenhaus-test` anlegen und in `wrangler.toml` unter
  `[[env.preview.d1_databases]]` als Datenbank für Vorschauen eintragen.
  Achtung: Wer in `env.preview` die Datenbank überschreibt, muss dort auch
  `[env.preview.vars]` vollständig wiederholen. Sonst lehnt Cloudflare das
  Deployment ab,
- dort Schema + Produkte einspielen,
- „Bertha Test“-Schlüssel nur auf der Vorschau anlegen.

### 4.7 Bertha-Seite

- Das Portal ruft **nie** die Website auf, sondern immer eine eigene Bertha
  Cloud Function. Diese prüft: Ist der Portal-Nutzer angemeldet, gehört er
  zu dieser Organisation, ist „Externer Hofladen“ für sie eingerichtet?
  Erst dann ruft sie die Website auf.
- Mitgeschickt werden nur die Daten **dieses** Kunden und nur für diese
  Bestellung.
- `externe_id` ist eine nicht sprechende Bertha-Kennung, kein Name und keine
  E-Mail.

---

## 5. Datenschutz

Keine Rechtsberatung. Vor dem Start mit der Landwirtschaftskammer Tirol bzw.
einer Beratung abstimmen.

- **Rollen:** Für den Kruckenhaus ist Florian in beiden Systemen
  Verantwortlicher. Daten fließen nur, wenn ein Eierkunde im Portal
  tatsächlich Fleisch bestellt, zur Erfüllung dieser Bestellung
  (Art. 6 Abs. 1 lit. b DSGVO).
- **Datenminimierung:** Bertha schickt nur Bestelldaten. Die Website
  schickt keine Kundendaten an Bertha zurück. Der Katalog enthält keine
  personenbezogenen Daten.
- **Datenschutzerklärung** der Website (Weitergabe an/von Bertha, Firebase
  als Dienstleister) und der Hinweis im Portal sind zu ergänzen. Das
  passiert **nur auf ausdrücklichen Auftrag**, weil die Rechtstexte
  abgestimmt sind.
- **Andere Höfe später:** Jeder Hof bekommt seinen eigenen Zugang zu seinem
  eigenen Shop. Für Bertha als Dienstleister braucht es den
  Auftragsverarbeitungsvertrag (AVV), der für Bertha ohnehin geplant ist.
- **Fernabsatz:** Eine Fleischbestellung im Portal ist ein Kauf aus der
  Ferne. Daher zeigt das Portal **vor** der Bestellung die Pflichtangaben
  (`pflichtangaben`, `allergene` aus der Schnittstelle) und einen Link zu den
  Bestellbedingungen auf `hofladen.html`. Gespeichert wird die Zustimmung
  mit Version und Zeitpunkt. Widerruf und „Meine Bestellungen“ laufen über
  die Bestätigungsmail der Website.

---

## 6. Bedienung

Leitlinie: **Nichts doppelt eintippen, nichts Neues lernen müssen.** Wer
die Verwaltung kennt, findet alles an derselben Stelle.

### 6.1 Website-Verwaltung (Kathrin und Florian)

- **Produkt bearbeiten:** neue Auswahl *„Bestellrunde“ / „Dauerartikel“*.
  Bei Dauerartikel: Preis und ein großer Schalter **„verfügbar /
  ausverkauft“**, dazu „Auch im Bertha-Portal anbieten“ (vorbelegt: ja).
- **Schnell umschalten:** In der Sortimentsliste lässt sich „ausverkauft“
  direkt per Tipp setzen, ohne das Produkt zu öffnen. Das ist der häufigste
  Handgriff am Handy.
- **Bestellrunde:** Häkchen „Auch im Bertha-Portal anbieten“ (vorbelegt: ja).
- **Bestellliste:** Portal-Bestellungen tragen das Zeichen „über Bertha“.
  Sonst sind sie ganz normale Bestellungen: wiegen, übergeben und kassieren
  wie gewohnt.
- **Neuer Bereich „Verbindung zu Bertha“** (PC-Seitenleiste bzw. Übersicht):
  - Ampel: *„Bertha hat zuletzt vor 6 Minuten abgerufen – alles in Ordnung“*
    bzw. die letzten Fehler in Klartext
  - „Neuen Schlüssel anlegen“ (wird einmal angezeigt, mit Knopf „Kopieren“),
    „Sperren“
  - Schalter „Schnittstelle pausieren“

### 6.2 Bertha (Einstellungen der Organisation)

- **„Hofladen verbinden“:** Adresse (`https://kruckenhaus.at`) und Schlüssel
  einfügen, dann **„Verbindung testen“**. Das ruft `/ping` auf und zeigt
  „Verbunden mit: Bertha“. Der Schlüssel geht beim Speichern direkt an den
  Server und wird danach nie wieder angezeigt.
- **Dauerartikel aus dem Hofladen** erscheinen in der Artikelverwaltung mit
  dem Kennzeichen *„vom Hofladen“*. Name, Preis und Foto sind dort
  schreibgeschützt („wird auf kruckenhaus.at gepflegt“). Kategorie (Farbe)
  und Reihenfolge lassen sich wie gewohnt setzen.
- **Lieferrunde:** Dauerartikel-Bestellungen aus dem Portal stehen beim
  Kunden wie Extras und auf dem Lieferschein. Der Preis wird zum
  Bestellzeitpunkt eingefroren.

### 6.3 Kundenportal (Eierkunden)

Zwei klar getrennte Bereiche, damit niemand Fleisch mit der Eierlieferung
erwartet:

1. **„Zur nächsten Eierlieferung dazu“** – Nudeln, Seife u. a. Antippen,
   Menge wählen, fertig. Ausverkauftes erscheint ausgegraut.
2. **„Fleisch vorbestellen“** – offene Runden mit Foto, Preis (bei
   Gewichtsware „ca.“), Bestellschluss. Abholung am Hof oder Zustellung
   wählen, Termin wählen. Kontaktdaten sind aus Bertha vorausgefüllt und
   werden nur bestätigt. Ein deutlicher Satz: *„Fleisch kommt nicht mit den
   Eiern, sondern zum gewählten Termin.“*

Nach der Fleischbestellung: Bestätigung im Portal (Nummer, Termin,
„ca.“-Summe), die Mail kommt von kruckenhaus.at.

### 6.4 Wenn etwas nicht klappt

| Lage | Was der Kunde sieht |
|---|---|
| Website nicht erreichbar | Fleischbereich: *„Gerade nicht verfügbar – bitte später nochmal oder anrufen.“* Dauerartikel gehen weiter (Bertha hat den Katalog zwischengespeichert) |
| Menge ist zwischen Anzeigen und Bestellen weg | *„Leider ausverkauft – ihr steht auf der Warteliste.“* |
| Bestellschluss ist inzwischen vorbei | Klartext aus `fehler.text` |
| Schnittstelle pausiert | wie „nicht erreichbar“ |

---

## 7. Abgleich und Robustheit

- **Katalog:** Bertha holt ihn alle 15 Minuten (zeitgesteuerte Cloud
  Function) sowie über einen Knopf „Jetzt abgleichen“. Mit `ETag` kostet ein
  unveränderter Abruf praktisch nichts. „Ausverkauft“ kommt also nach
  höchstens 15 Minuten im Portal an. Bestellt in der Zwischenzeit jemand
  einen gerade ausverkauften Artikel, landet das als Hinweis beim Packen,
  nicht als Fehler.
- **Fotos:** Bertha kopiert ein Foto nur, wenn sich `bild_version` ändert,
  in den eigenen Speicher (Firebase Storage). Das Portal lädt so nichts von
  einer fremden Adresse und hängt nicht von der Website ab.
- **Artikel entfernt oder ausgeblendet:** Bertha blendet ihn aus und löscht
  ihn nicht, weil alte Lieferscheine auf ihn verweisen.
- **Fleischangebot:** wird beim Öffnen des Portals live abgefragt (Bertha
  darf es 60 Sekunden zwischenspeichern). Die **verbindliche** Mengenprüfung
  macht ausschließlich die Website beim `POST`.
- **Zeitüberschreitung und Wiederholung:** Bertha wartet höchstens
  10 Sekunden. Kommt keine Antwort, wiederholt Bertha **mit demselben
  `Idempotency-Key`**. So entsteht nie eine Doppelbestellung, auch wenn die
  erste Anfrage doch angekommen war.
- **Keine Warteschlange für Fleisch:** Ist die Website nicht erreichbar,
  wird die Bestellung **nicht** in Bertha zwischengespeichert und später
  nachgereicht. Der Kunde muss sofort wissen, ob er etwas bekommt.

---

## 8. Umsetzung in Phasen

Arbeitsweise wie in `docs/HOFLADEN-VORBESTELLUNG.md`: **eine Sitzung = ein
Thema = ein Commit**, auf einem eigenen Branch, erst nach dem Test auf
`master`. **W** = Website-Repository, **B** = Bertha-Repository.

Reihenfolge bewusst: Die ersten zwei Phasen sind **auch ohne Bertha**
sofort nützlich.

| Phase | Wo | Inhalt | Ergebnis |
|---|---|---|---|
| **W1 – Dauerartikel** | W | Migration (2.1, 2.2), Produktformular, Schnell-Schalter „ausverkauft“, ständige Runde „Dauersortiment“, Überbuchungsprüfung anpassen, Tests | Nudeln und Seife ohne Bestellrunde pflegen |
| **W2 – Dauersortiment bestellen** | W | `hofladen.html`: Bereich „Immer erhältlich“, Bestellung ohne Bestellschluss, Übergabe laut offener Frage 1 | Alle Kunden können Dauerartikel bestellen |
| **W3 – Schnittstelle: Grundgerüst** | W | Tabellen (2.4), Test-Datenbank (4.6), Middleware, `/ping`, `/katalog` mit ETag, Protokoll, Bereich „Verbindung zu Bertha“ in der Verwaltung, `_headers`, Tests | Bertha kann den Katalog lesen |
| **B1 – Katalog in Bertha** | B | Einstellung „Hofladen verbinden“, Schlüssel nur serverseitig, zeitgesteuerter Abgleich, Fotos kopieren, Artikel „vom Hofladen“, Portal-Bereich „Zur Eierlieferung dazu“, Lieferschein | Eierkunden bestellen Dauerartikel im Portal |
| **W4 – Fleisch bestellen über die Schnittstelle** | W | `/angebot`, `POST /bestellungen` mit Idempotenz, `extern_kunden`, Limits, Kennzeichnung „über Bertha“, Pausieren, Tests | Website nimmt Portal-Bestellungen an |
| **B2 – Fleisch im Portal** | B | Bereich „Fleisch vorbestellen“, Pflichtangaben und Bestellbedingungen, Fehlerfälle (6.4), Wiederholung mit Idempotenz | Eierkunden bestellen Fleisch im Portal |
| **T – Testlauf** | W+B | Auf der Vorschau mit Test-Datenbank und „Bertha Test“, danach eine kleine echte Runde mit 2–3 Eierkunden | Freigabe |
| **später** | W+B | Bestellstatus im Portal (`GET /bestellungen`), Stornieren bis Bestellschluss, Stammkunden-Vorlauf für Eierkunden, andere Höfe anbinden | nach Bedarf |

**Vor W4/B2 erledigen:** Datenschutzerklärung und Portal-Hinweis (Abschnitt
5, nur mit Freigabe), Bestellbedingungen geprüft (offener Punkt aus dem
Hofladen-Plan).

**So startest du eine Phase in Claude Code** (Beispiel W1):

> Lies `docs/SCHNITTSTELLE-BERTHA.md` und setze Phase W1 um. Eigener
> Branch, zuerst die Migration mit Sicherungshinweis, dann Verwaltung,
> dann Tests. Bestehende Bestellrunden dürfen sich nicht verändern.

Für Bertha-Phasen den Plan als Datei ins Bertha-Repository mitnehmen und
dort genauso beginnen.

---

## 9. Tests

**Website** (`scripts/test-extern-api.mjs`, mit dem vorhandenen
D1-Nachbau, ohne echte Datenbank), mindestens:

- ohne / mit falschem / mit gesperrtem Schlüssel → `401`
- Zugang ohne Recht `bestellen` → `403`
- Katalog: nur `im_portal = 1`, Ausverkauftes mit `verfuegbar: false`, `304` bei gleichem ETag
- Bestellung zweimal mit demselben `Idempotency-Key` → **eine** Bestellung, gleiche Antwort
- Menge erschöpft → `warteliste`; Bestellschluss vorbei → `409`; PLZ außerhalb → `409`
- Runde mit `im_portal = 0` → `409`
- zu große Anfrage → `413`; Limit überschritten → `429`; pausiert → `503`
- Protokoll enthält keine Namen, E-Mails oder Adressen
- bestehende Tests (`test-hofladen-*.mjs`) laufen weiter grün

**Bertha:** Abgleich und Bestellung gegen den Firebase-Emulator mit einer
nachgebauten Website-Antwort, danach Ende-zu-Ende gegen die Vorschau mit
Test-Datenbank.

---

## 10. Offene Fragen

| # | Frage | Vorschlag | nötig für |
|---|---|---|---|
| 1 | Dauerartikel-Bestellung über die **Website**: Abholung zu festen Zeiten oder nach Absprache? | nach Absprache: Hof meldet sich, wenn es fertig ist (WhatsApp-Knopf) | W2 |
| 2 | Dürfen Dauerartikel bei einer **Fleischbestellung** mit (Abholung/Zustellung)? | ja, wie heute als Zusatzartikel in der Bestellrunde | W2 |
| 3 | Bezahlung von Fleisch aus dem Portal | wie auf der Website (bar / Überweisung mit QR-Code), getrennt von der Eier-Monatsaufstellung | W4 |
| 4 | Bekommen Eierkunden den **Stammkunden-Vorlauf** bei Fleischrunden? | später entscheiden; technisch einfach (Recht für Runden mit Status `stammkunden`) | später |
| 5 | Bestellschluss für Dauerartikel im Portal vor einer Eierlieferung? | z. B. Vortag 18 Uhr, je Organisation einstellbar | B1 |
| 6 | Haben alle Eierkunden in Bertha eine E-Mail-Adresse? | für Fleisch Pflicht (Bestätigung, Widerruf); fehlt sie, fragt das Portal danach | B2 |
| 7 | Wie melden sich Kunden im Portal an, und welche Kennung wird `externe_id`? | im Bertha-Repository prüfen | B1 |

---

## 11. Kosten

| Posten | Kosten |
|---|---|
| Cloudflare Functions, D1, Rate-Limiting-Regel | 0 € (Gratis-Kontingent) |
| Zweite D1-Datenbank für Tests | 0 € |
| Bertha: Cloud Functions, zeitgesteuerter Abruf, Storage für Fotos | voraussichtlich im Gratis-Kontingent von Firebase, beim Einrichten prüfen |
