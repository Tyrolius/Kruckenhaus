# Kruckenhaus – Optimierungsplan für Direktbuchungen

Stand: September 2026 · Grundlage: vollständige Durchsicht aller 12 Seiten, der
Functions, der Preiskonfiguration sowie Recherche zu Markt, Alpbachtal Card,
Aufenthaltsabgabe und Rechtslage (Österreich).

> Kurzfassung: Die Website ist technisch sauber, schnell und werbefrei. Was
> Direktbuchungen im Moment verhindert, ist nicht die Technik, sondern
> (1) fehlende Fotos, (2) ein Buchungsweg, der auf einem allgemeinen
> Kontaktformular endet, (3) Positionierung, die den Hof statt die Alleinlage
> mit Bergpanorama in den Vordergrund stellt, und (4) rund 20 inhaltliche
> Widersprüche, die Vertrauen kosten. Preislich liegt die Wohnung unter dem,
> was 4,98 Sterne, Superhost-Status, 100 m² und Alleinlage rechtfertigen.

---

## 1. Ausgangslage (was ich vorgefunden habe)

**Stärken**

- Kein Framework, kein Tracking, keine Cookies, lokale Schriften: schnell und
  DSGVO-seitig entspannt.
- Verfügbarkeitskalender per Airbnb-iCal, Kontaktformular mit Datenbank und
  E-Mail, strukturierte Daten (LodgingBusiness, FAQ), llms.txt, Sitemap.
- Starke Beweise: 4,98 von 5 bei 53 Airbnb-Bewertungen, Superhost seit
  9 Jahren, echte Zitate – sie loben genau Lage, Ruhe und Bergblick.
- Impressum und Datenschutzerklärung sind in weiten Teilen sehr sorgfältig.

**Schwächen (nach Wirkung auf Buchungen sortiert)**

1. **Keine Fotos.** Der Ordner `images/` ist leer. 61 Platzhalter-Kacheln
   (Startseite 21, Bauernhof 13, See 8, Ferienwohnung 8, Umgebung 7,
   Workation 4). Logo und Favicon fehlen, das `og:image` zeigt auf eine
   nicht existierende Datei. Ohne Fotos bucht niemand direkt.
2. **Buchungsweg endet im Kontaktformular.** „Jetzt buchen“ führt auf
   `kontakt.html`, ein Formular ohne Preisangabe, ohne Vorbelegung des
   gewählten Zeitraums, ohne Unterscheidung zwischen Frage und
   Buchungsanfrage. Der Kalender zeigt Belegung, ist aber nicht anklickbar.
3. **Positionierung.** Die H1 heißt „Urlaub am Bergbauernhof“, der Slider
   wechselt alle 5 Sekunden zwischen Hof, See, Alpakas und Workation. Gäste
   loben aber vor allem Alleinlage und Bergpanorama. Das stärkste Argument
   ist nur ein kleines Label über der Überschrift.
4. **„Direkt buchen & sparen“ ist für Gäste nicht greifbar.** Airbnb rechnet
   in der EU seit 2026 mit dem Host-only-Modell (15,5 % vom Gastgeber, für den
   Gast keine sichtbare Servicegebühr). Der Gast sieht auf Airbnb also den
   Endpreis und spart bei euch nichts Erkennbares – solange ihr keinen
   konkreten Direktbucher-Vorteil nennt.
5. **Widersprüche zwischen den Seiten** (Liste in Abschnitt 4). Beispiele:
   Hausordnung „maximal 6 Personen“ vs. überall 4; „Rücksicht auf Nachbarn“
   vs. „keine Nachbarn“; Zeitleiste „Zukunft: Ferienwohnung“ obwohl seit
   9 Jahren vermietet; zwei Karten mit 10 km Abstand.
6. **Preisdarstellung** („Preise sind Richtwerte“, obligatorische
   Endreinigung nur im Kleingedruckten) schwächt Vertrauen und ist
   preisauszeichnungsrechtlich angreifbar.

---

## 2. Schritt-für-Schritt-Plan

Reihenfolge nach Hebelwirkung. Jeder Schritt ist für sich abschließbar.

### Schritt 0 – Sofort (1 Abend): Fehler beseitigen, die Vertrauen kosten

Alles aus der Widerspruchsliste in Abschnitt 4 sowie die rechtlichen
Punkte in Abschnitt 5, die mit „Korrigieren“ markiert sind. Kein Design,
nur Fakten geradeziehen. Dazu:

- Eine Telefonnummer als Hauptnummer festlegen (Impressum und llms.txt nennen
  …180, Kontakt und Footer …181) und überall gleich verwenden. Gleiches gilt
  für die E-Mail: auf alpbachtal.at steht eine gmx-Adresse, auf der Website
  info@kruckenhaus.at. Google bewertet Konsistenz von Name, Adresse, Telefon.
- Social-Links im Footer entweder auf echte Profile setzen oder entfernen.

### Schritt 1 – Fotos und Positionierung (1–2 Wochen)

**Fotos (Priorität nach Buchungswirkung):**

| Prio | Motiv | Hinweis |
|---|---|---|
| 1 | Bergpanorama vom Balkon, goldene Stunde | Das Hauptbild. Gipfel später beschriften. |
| 1 | Außenansicht mit Wiesen ringsum, ohne Nachbarhaus im Bild | Belegt „Alleinlage“, ideal als Drohnenbild. |
| 1 | Zirbenstube mit Kachelofen, Wohnzimmer, beide Schlafzimmer, Küche, Bad | Weitwinkel, Tageslicht, aufgeräumt. |
| 2 | Alpakas mit Bergkulisse, Blick vom Balkon auf die Weide | |
| 2 | Berglsteiner See Sommer + Herbst | |
| 2 | Arbeitsplatz mit Bergblick + Speedtest-Screenshot | Belegt die Starlink-Aussage. |
| 3 | Hofladen-Kühlschrank, Gastgeber-Porträt Kathrin & Florian | Persönlichkeit ist ein Direktbuchungs-Argument. |
| 3 | Vier-Jahreszeiten-Set vom gleichen Standpunkt | Für See-Seite und Saisonpreise. |

Upload nach `images/` (die GitHub Action verkleinert automatisch), danach
Platzhalter ersetzen, Logo als `images/logo.png`, `favicon.ico` anlegen,
`og:image` auf ein reales Bild zeigen lassen.

**Positionierung „Alleinlage mit Bergpanorama“:**

- Neue H1 auf der Startseite, zum Beispiel: „Alleinlage am Oberberg.
  100 m² nur für euch, das Rofangebirge vor dem Balkon.“ Der Hof, die
  Alpakas und der See bleiben, rücken aber auf Platz 2 bis 4.
- Slider: Autoplay abschalten oder auf ein Panorama-Standbild reduzieren.
  Ein wechselnder Held sendet vier Botschaften, keine bleibt hängen.
- Reihenfolge der vier USP-Kacheln: 1 Alleinlage & Stille, 2 Panorama-Balkon,
  3 See in 15 Gehminuten, 4 echter Hof mit Alpakas. Starlink als fünfte,
  kleinere Zeile.
- Gästestimmen direkt neben das Panoramafoto stellen, ausgewählt nach
  „Lage“, „ruhig“, „Aussicht“ (drei der vier vorhandenen Zitate passen).
- Vertrauensleiste auf jeder Seite unter dem Header: „4,98 ★ · 53
  Bewertungen · Superhost seit 9 Jahren · Antwort innerhalb 24 h“.
- Etwas, das nur diese Lage hat: eine Panorama-Grafik „Das seht ihr vom
  Balkon“ mit Gipfelnamen, und eine Sternenhimmel-/Stille-Passage
  („kein Durchgangsverkehr, kein Straßenlicht“). Optional später: eine
  Panorama-Webcam, die nur auf die Berge zeigt (ohne Personen, daher
  datenschutzrechtlich unproblematisch) – ein Rückkehr-Magnet und ein
  Alleinstellungsmerkmal, das kaum eine Ferienwohnung hat.

### Schritt 2 – Buchungsweg (1 Woche)

Ziel: Vom Kalender in drei Klicks zur konkreten Anfrage mit Preis.

1. **Kalender anklickbar machen** (An- und Abreise wählen). Freie Nächte
   grün, belegte grau – das gibt es bereits, nur die Auswahl fehlt.
2. **Preisschätzung live anzeigen**, gerechnet aus `preise-config.js`:
   Nächte × Saisonpreis + Endreinigung + Aufenthaltsabgabe = Gesamtpreis.
   Gäste vergleichen Endpreise, nicht Nachtpreise.
3. **Anfrageformular vorbelegen** (Zeitraum, Personen, berechneter Preis)
   und in zwei Varianten anbieten: „Verbindlich anfragen“ und „Nur eine
   Frage“. Beim verbindlichen Weg: Adresse als Pflichtfeld, Hinweis auf
   Mietbedingungen und Storno.
4. **Antwortversprechen** einlösen: automatische Eingangsbestätigung an den
   Gast (Resend ist schon angebunden), mit Zusammenfassung und dem Satz
   „Kathrin meldet sich innerhalb von 24 Stunden“.
5. **WhatsApp-Knopf** behalten, aber mit vorausgefülltem Text inklusive
   Zeitraum aus dem Kalender.
6. Später (Schritt 6): echte Online-Buchung mit Anzahlung via Stripe auf
   Basis des vorhandenen D1-Buchungsmodells.

### Schritt 3 – Preise (siehe Abschnitt 3, 1 Woche)

Preismodell auf Saisonstufen und Personenzahl umbauen, Direktbucher-Vorteil
konkret benennen, Gesamtpreis-Beispiel prominent zeigen.

### Schritt 4 – Messen (1 Abend)

Ohne Zahlen bleibt alles Bauchgefühl. Beides ist im README schon beschrieben:

- Google Search Console (Suchbegriffe, Klicks) und Cloudflare Web Analytics
  (Besucher, Herkunft). Beides cookiefrei; Web Analytics muss dann in die
  Datenschutzerklärung.
- Kennzahlen monatlich notieren: Besucher → Kalenderaufrufe → Anfragen →
  Buchungen. Anfragen liegen in der D1-Tabelle `anfragen`; eine Spalte
  „Quelle“ (Website/WhatsApp/Telefon) und „Ergebnis“ (gebucht/abgesagt)
  ergänzen.
- Ziel für 2027: 25–30 % der Buchungen direkt (Branchenrichtwert 15–30 %).

### Schritt 5 – Sichtbarkeit und Wiederkehr (laufend)

- Google-Unternehmensprofil pflegen: gleiche Fotos, gleiche Preise,
  Bewertungen dort sammeln (nach jedem Aufenthalt per Mail darum bitten).
- `aggregateRating` (4,98 / 53) in die strukturierten Daten aufnehmen,
  sobald die Bewertungen sichtbar auf der Seite stehen (sind sie).
- Sitemap-`lastmod` aktualisieren, `lage.html` und `umgebung.html`
  zusammenführen oder klar trennen (Anfahrt vs. Ausflüge).
- Englische Version der vier Kernseiten (Start, Ferienwohnung, Preise,
  Kontakt) – Workation-Gäste und Airbnb-Publikum sind oft international.
- Wiederkehrer: nach dem Aufenthalt eine persönliche Mail mit
  „Stammgast-Code“ für die Direktbuchung (5 % oder späterer Check-out).
  Newsletter nur mit ausdrücklicher Einwilligung (Double-Opt-in).
- Inhalte, die Suchende anziehen: „Berglsteiner See – Wanderung vom Hof“
  mit echter Route (OpenStreetMap-Einbettung ist auf der See-Seite noch
  Platzhalter), „Workation Tirol“ mit Speedtest, „Rofan-Panorama“.

### Schritt 6 – Optional: Online-Buchung mit Anzahlung

Stripe Checkout für die 30-%-Anzahlung, Buchung in D1, Kalender aus D1
statt nur aus Airbnb. Erst sinnvoll, wenn Schritte 1–3 stehen und die
Anfragen über die Website spürbar sind. Barrierefreiheitsgesetz: Als
Kleinstunternehmen (unter 10 Beschäftigte, unter 2 Mio. € Umsatz) seid ihr
davon ausgenommen; trotzdem die vorhandene Tastaturbedienung erhalten.

---

## 3. Preisgestaltung: Seid ihr zu billig?

**Aktuell:** 120 € Nebensaison / 150 € Hauptsaison pro Nacht für bis zu
4 Personen, 80 € Endreinigung, 3,50 € Aufenthaltsabgabe p. P., 30 %
Anzahlung, 3 % Barzahlungsrabatt, Mindestaufenthalt 3 bzw. 7 Nächte.

**Beispiele als Endpreis (das sieht der Gast auf Airbnb zuerst):**

| Fall | Rechnung | Endpreis | pro Nacht |
|---|---|---|---|
| 2 Pers., 3 Nächte, Nebensaison | 360 + 80 + 21 | 461 € | 154 € |
| 2 Pers., 7 Nächte, Nebensaison | 840 + 80 + 49 | 969 € | 138 € |
| 4 Pers., 7 Nächte, Hauptsaison | 1.050 + 80 + 98 | 1.228 € | 175 € (44 € p. P.) |

**Einordnung:**

- Auf den Portalen liegen die meisten Unterkünfte in Breitenbach unter
  100 €/Nacht – das sind aber überwiegend kleine Wohnungen und Zimmer.
  Vergleichbar sind 100-m²-Wohnungen mit zwei Schlafzimmern auf
  Bauernhöfen im Alpbachtal; die bewegen sich nach meiner Einschätzung
  bei etwa 110–160 € (Nebensaison) und 150–220 € (Hauptsaison) für
  4 Personen. Ich konnte die Portale nicht direkt abrufen; bitte mit
  eurem Airbnb-Marktvergleich gegenprüfen.
- Ihr habt drei Dinge, die die meisten dieser Wohnungen nicht haben:
  Alleinlage ohne Nachbarn, 4,98 Sterne bei 53 Bewertungen, Starlink.
  Dazu die Alpbachtal Card (Bergbahnen, Bus, Badeseen, geführte
  Wanderungen), die pro Person und Tag leicht 30 € wert ist.
- 4 Personen im August für 44 € pro Person und Nacht in dieser Qualität
  ist günstig. Weihnachten/Silvester zum gleichen Preis wie Juli ist
  deutlich zu günstig.
- Einheitspreis für 2 und 4 Personen verschenkt bei Paaren nichts, aber
  bei 4 Personen Reinigungs- und Verschleißkosten.

**Antwort: Ja, tendenziell zu günstig – vor allem in Spitzenzeiten und bei
4 Personen.** Aber nicht blind erhöhen. Entscheidungsregel:

- Ist die Hauptsaison drei Monate vorher ausgebucht → +15 bis 20 %.
- Liegt die Nebensaison-Auslastung über 60 % → +10 %.
- Liegt sie unter 40 % → Preis lassen, stattdessen Mindestaufenthalt auf
  2 Nächte senken und Kurzaufenthalte zulassen.

**Vorschlag für ein neues Preismodell** (Basis 2 Personen, jede weitere
Person +20 €/Nacht inkl. Wäsche; Kinder unter 3 frei):

| Saison | Zeitraum | pro Nacht (2 Pers.) | Mindestaufenthalt |
|---|---|---|---|
| A – ruhig | Nov bis Mitte Dez, nach Ostern bis Mitte Mai | 125 € | 2 Nächte |
| B – mittel | Mitte Mai bis Juni, Sept bis Okt, Jänner (nach Dreikönig) bis März | 145 € | 3 Nächte |
| C – hoch | Juli, August, Semesterferien, Ostern | 175 € | 5 Nächte |
| D – Spitze | 20. Dez bis 6. Jänner | 210 € | 7 Nächte |

- Endreinigung 80 € beibehalten, aber **im Gesamtpreis-Beispiel sichtbar**
  und in „ab“-Preisen berücksichtigen (siehe Rechtsteil). Alternative:
  Reinigung in den Nachtpreis einrechnen und „alles inklusive“ werben –
  bei 3+ Nächten rechnet sich das und wirkt ehrlicher.
- Aufenthaltsabgabe auf **4,00 €** ab 1. Mai 2026 prüfen (siehe Abschnitt 5).
- Langzeit: ab 7 Nächten −7 %, ab 14 Nächten −12 %, ab 28 Nächten
  Monatspreis auf Anfrage. Das ersetzt die 10/15 % der Workation-Seite,
  die derzeit nirgends sonst stehen.
- **Direktbucher-Vorteil konkret machen:** Der Website-Preis liegt 5 %
  unter dem Airbnb-Listenpreis (ihr verdient trotzdem rund 10 % mehr als
  über Airbnb, weil dort 15,5 % Provision abgehen). Dazu ein Begrüßungskorb
  aus dem Hofladen (Eier, Marmelade, Nudeln) – kostet euch 10 €, ist für
  den Gast ein Erlebnis und erzählt eure Geschichte.
- **Barzahlungsrabatt streichen.** Er bringt keine Buchung, wirkt auf
  manche Gäste wie ein Steuertrick und ist mit Registrierkassen-/
  Belegpflicht-Diskussionen unnötig belastet. Frühbucher-Vorteil
  (Buchung > 6 Monate voraus: −5 %) ist das bessere Signal.
- Umsetzung: `preise-config.js` um Saisonstufen mit Datumsbereichen und
  Personenpreise erweitern; die Preisseite rechnet daraus das
  Gesamtpreis-Beispiel; `llms.txt` und die `makesOffer`-Blöcke nachziehen.
- Preise stufenweise anheben (erst Saison C/D, dann B), Airbnb parallel
  anpassen, nach 3 Monaten Auslastung vergleichen.

---

## 4. Widersprüche und Fehler je Seite

Diese Liste ist Schritt 0. Alles hier ist Text- oder Zahlenarbeit.

**Alle Seiten**
- Telefonnummer und E-Mail vereinheitlichen (siehe oben).
- Footer: Social-Links auf `#`.
- Zwei Footer-Varianten (mit/ohne Telefon, unterschiedliche Navigation).
  Lage, Kontakt, Impressum, Datenschutz haben die alte Fußzeile.

**Startseite (index.html)**
- Zeitleiste: „Zukunft – Starlink & Ferienwohnung“ – die Wohnung wird seit
  9 Jahren vermietet (Bewertungen ab 2021, Superhost seit 9 Jahren).
- „Jungtiere werden im April und Juni 2026 erwartet“ – ist vorbei; ersetzen
  durch, was tatsächlich passiert ist.
- „3 Alpaka-Stuten“ (Startseite) vs. „3+“ (Bauernhof).
- Schema: `numberOfRooms: 2`, `petsAllowed: true` – prüfen, ob Haustiere
  „nach Absprache“ wirklich als `true` gemeldet werden sollen.
- `og:image` zeigt auf nicht existierende Datei.

**Ferienwohnung (ferienwohnung.html)**
- Hausordnung: „maximale Belegung 6 Personen“ – überall sonst 4.
- Hausordnung: „Rücksicht auf Nachbarn“ – Website wirbt mit „keine Nachbarn“.
- „Balkon“ (Ausstattung) vs. „Terrasse“ (Hausordnung, Icon-Liste). Eines
  davon festlegen.
- Zimmergrößen 25 + 20 + 18 + 15 = 78 m² plus Bad/Flur – zu 100 m² passt
  das nur knapp; Grundriss würde das klären (Platzhalter).
- Alpbachtal Card: „Freier Eintritt in Freibäder und Hallenbäder“,
  „Minigolf und Freizeitanlagen frei“ (Umgebung: „Minigolf und
  Tennisplätze frei“). Laut Kartenbeschreibung inklusive: vier Bergbahnen
  (Wiedersbergerhorn, Reitherkogel, Markbachjoch, Schatzberg), Regiobus,
  vier Badeanlagen (Reither See, Reintalersee, Freibad Münster, Freibad
  Brixlegg), geführte Wanderungen, Museen. Hallenbad, Tennis und Minigolf
  bitte gegen die aktuelle Leistungsliste prüfen und nur Belegbares nennen.

**Preise (preise.html)**
- „Preise sind Richtwerte und können saisonal variieren“ – streichen.
  Entweder gilt der Preis, oder er steht nicht dort.
- „Kostenlose Stornierung … abzgl. Bearbeitungsgebühr 15 €“ –
  widersprüchlich; „kostenlos“ streichen.
- Storno-Stufen: „bis 30 Tage“, „15–29 Tage“, „weniger als 14 Tage“ – der
  14. Tag ist nicht geregelt. Auf „ab 30 Tage / 14–29 Tage / unter 14 Tage“
  umstellen (Config-Kommentar sagt „< 14“).
- Workation-Rabatte (10 %/15 %) fehlen hier und in der Config.
- Hauptsaison-Mindestaufenthalt 7 Nächte + Workation „ab 7 Nächten 10 %“
  hieße: jede Hauptsaisonbuchung bekommt 10 % Rabatt. Klären.

**Kontakt (kontakt.html)**
- Datenschutzhinweis nennt Name, E-Mail, Nachricht – gespeichert werden
  zusätzlich IP-Adresse und Browser-Kennung (siehe Rechtsteil).

**Lage (lage.html)**
- Alte Navigation mit nur 5 Punkten und einem „DE | EN“-Schalter ohne
  Funktion.
- „Nächster Bahnhof ist Breitenbach am Inn“ – Umgebung sagt „Bahnhof
  Brixlegg, 5 Min. mit dem Auto“. Bitte klären, welcher Bahnhof real der
  nächste ist; nach meinem Kenntnisstand hat Breitenbach keinen eigenen
  Bahnhof an der Unterinntalbahn.
- Ski Juwel „ca. 15–25 km“, SkiWelt „ca. 30 km“ vs. Umgebung „20 Min.“ /
  „25 Min.“. Eine Angabe, überall gleich.
- Zweite Seite mit fast gleichem Inhalt wie Umgebung; zusammenlegen.

**Umgebung (umgebung.html)**
- Karten-Marker 47.4250 / 12.0410 – Kontakt und Lage nutzen 47.4472 /
  11.9081. Das sind rund 10 km Abstand; mindestens eine Karte zeigt auf
  den falschen Ort. Exakte Koordinaten aus dem Google-Unternehmensprofil
  übernehmen und in allen drei Karten sowie im Schema verwenden.

**Workation (workation.html)**
- „Starlink ist in dieser Region der einzige Anbieter mit stabilen
  200+ Mbit/s – viele andere Unterkünfte haben deutlich schwächeres
  Internet“ und „Einzigartig in der Region“: vergleichende Behauptungen
  über Mitbewerber müssen belegbar sein (UWG). Umformulieren zu eigenen,
  belegbaren Aussagen („Speedtest vom [Datum]: 214 Mbit/s“).
- Externer Monitor „auf Anfrage“ – nur stehen lassen, wenn es ihn gibt.

**Bauernhof (bauernhof.html)**
- „500 Legehennen … artgerechte Haltung … Freilandeier“ – „Freiland“ ist
  ein Rechtsbegriff (Vermarktungsnorm). Nur verwenden, wenn die Eier so
  gekennzeichnet sind; sonst „Eier von unseren Hennen“.
- Hofladen: Liköre, Schnäpse, Fleisch „vom Hof“ – nur, wenn wirklich
  Eigenerzeugung (Direktvermarktung), sonst „aus der Region“.

**Berglsteiner See (berglsteiner-see.html)**
- Seehöhe 795 m: bitte prüfen (die Wohnung liegt laut Ferienwohnung-Seite
  auf ca. 700 m und der See soll in 15 Minuten „hinunter“ erreichbar sein).
- Wanderroute: Kartenplatzhalter.

**llms.txt / sitemap.xml**
- Telefonnummer …180 vs. Website …181.
- `lastmod` 2025 für fünf Seiten, obwohl geändert.

---

## 5. Rechtliche Prüfung (Österreich)

Keine Rechtsberatung; die Punkte sind als Prüfliste für WKO Tirol,
Landwirtschaftskammer oder Anwalt gedacht. Bewertung: **OK** = passt,
**Prüfen** = mit Fachstelle klären, **Korrigieren** = Handlungsbedarf.

### Impressum (§ 5 ECG, §§ 24/25 MedienG)

| Punkt | Status | Anmerkung |
|---|---|---|
| Name, Anschrift, E-Mail, Telefon | OK | |
| UID-Nummer | OK | ATU71717868 |
| Unternehmensgegenstand, Blattlinie (§ 25 Abs. 4 MedienG) | OK | „kleine Website“ ausreichend. |
| Kammerzugehörigkeit (Landwirtschaftskammer Tirol) | OK | |
| Einordnung der Vermietung | Prüfen | Text spricht von „bloßer Raumvermietung im Rahmen der Vermögensverwaltung“. Mit Endreinigung, Wäsche und Gästekarte ist die passende Ausnahme eher die Privatzimmervermietung als häusliche Nebenbeschäftigung (§ 2 Abs. 1 Z 9 GewO, max. 10 Betten; ihr habt 4 + 4). Formulierung mit WKO/LK abstimmen. |
| Verbraucherstreitbeilegung (AStG) | OK | Erklärung vorhanden. EU-OS-Plattform wurde Juli 2025 eingestellt, ein Link darauf fehlt zu Recht. |
| Aufsichtsbehörde | OK | Bei nicht gewerblicher Tätigkeit nicht erforderlich. |
| Haftungsausschluss-Textbausteine | OK | Teilweise überflüssig, aber unschädlich. |

### Datenschutzerklärung (DSGVO, DSG, TKG)

| Punkt | Status | Anmerkung |
|---|---|---|
| Verantwortlicher, Rechte, Beschwerderecht, Speicherdauern | OK | |
| Cloudflare, Resend, WhatsApp, OpenStreetMap genannt | OK | |
| Abschnitt 6 „Cookies“ | Korrigieren | Sagt „keine Cookies“ und danach „Sie können diesen Eintrag in Ihren Browser-Einstellungen löschen“ mit Rechtsgrundlage – Rest vom früheren Cookie-Banner. Den zweiten Absatz streichen. |
| Kontaktformular: IP-Adresse und User-Agent | Korrigieren | `functions/api/kontakt.js` speichert beides in D1, die Erklärung (2.2) nennt es nicht. Entweder ergänzen (Zweck: Missbrauchsschutz, Löschung nach 30 Tagen) oder nicht speichern. |
| Speicherdauer Anfragen | Prüfen | „für die Dauer der Geschäftsbeziehung“ ist unbestimmt. Feste Regel definieren (z. B. Anfragen ohne Buchung nach 12 Monaten löschen) und in D1 tatsächlich löschen. |
| Cloudflare Web Analytics | Prüfen | Sobald aktiviert (README empfiehlt es), als Verarbeitung aufnehmen. |
| OpenStreetMap-Einbettung | Prüfen | Karte auf drei Seiten, Erklärung nennt zwei. Beim Laden geht die IP an die OSMF (UK, Angemessenheitsbeschluss vorhanden). Berechtigtes Interesse ist vertretbar; sicherer wäre ein statisches Kartenbild mit Link. |
| Einwilligungstext unter dem Formular | OK | Rechtsgrundlage ist ohnehin Vertragsanbahnung; „stimmen Sie zu“ ist unschädlich. |
| Gästeblatt / Meldegesetz, BAO-Aufbewahrung | OK | Sauber erklärt. |

### Preise, Verträge, Werbung (PrAG, KSchG, UWG)

| Punkt | Status | Anmerkung |
|---|---|---|
| Bruttopreise inkl. 10 % USt. | OK | |
| Obligatorische Endreinigung 80 € neben „ab 120 €/Nacht“ | Korrigieren | Verpflichtende Nebenkosten gehören in den beworbenen Gesamtpreis oder müssen unmittelbar beim Preis genannt werden. Auf Startseite, Ferienwohnung und Workation steht „ab 120 €“ ohne Hinweis. Lösung: Gesamtpreis-Beispiel neben jedem „ab“-Preis oder Reinigung einrechnen. |
| Aufenthaltsabgabe 3,50 € | Prüfen | Nach der Abgabenübersicht des Landes Tirol gilt für den TVB Alpbachtal & Tiroler Seenland **ab 1. Mai 2026: 4,00 €** pro Person und Nacht. Beim TVB bestätigen und in `preise-config.js`, `llms.txt` und Datenschutz/Impressum nachziehen. |
| „Preise sind Richtwerte“ | Korrigieren | Widerspricht der Preisauszeichnung; streichen. |
| „Kostenlose Stornierung abzgl. 15 €“ | Korrigieren | Irreführend; „kostenlos“ streichen. |
| Stornostaffel insgesamt | OK | Gästefreundlicher als die Hotel-AGB (AGBH). „Bei vorzeitiger Abreise voller Mietpreis“ ist zulässig, ersparte Aufwendungen müssen angerechnet werden (§ 1168 ABGB) – Satz ergänzen. |
| Keine Mietbedingungen/AGB als Dokument | Prüfen | Storno, Kaution, Haftung, Hausordnung stehen verstreut auf zwei Seiten. Eine Seite „Mietbedingungen“, die in der Buchungsbestätigung verlinkt wird, macht sie erst Vertragsbestandteil. |
| Barzahlungsrabatt 3 % | Prüfen | Zulässig, aber Belegpflicht beachten; empfehle Streichung (Abschnitt 3). |
| Vergleichende Aussagen (Workation) | Korrigieren | Siehe Abschnitt 4. |
| „Freilandeier“, „vom Hof“ | Prüfen | Lebensmittelkennzeichnung, siehe Abschnitt 4. |
| Bewertungen | OK | Echte, gekennzeichnete Airbnb-Zitate mit Vorname und Monat. Zustimmung der Gäste zur Nennung einholen oder Vornamen weglassen (Urheber-/Persönlichkeitsrecht bei wörtlichen Zitaten). |

### Sonstiges

| Punkt | Status | Anmerkung |
|---|---|---|
| EU-Kurzzeitvermietungs-Verordnung 2024/1028 | OK | Österreich setzt sie nicht als Registrierungspflicht um; Tirol hat derzeit keine Registrierungsnummer für Websites. Bei Gemeinde nachfragen, ob eine Freizeitwohnsitz-/Nutzungsmeldung vorliegt. |
| Barrierefreiheitsgesetz (seit 28.6.2025) | OK | Kleinstunternehmen ausgenommen; keine Online-Buchung. |
| Sicherheits-Header (`_headers`) | OK | X-Frame-Options, nosniff, Referrer-Policy vorhanden. Optional: Content-Security-Policy. |
| Schriften lokal, kein Tracking | OK | |
| Bildrechte | Prüfen | Sobald Fotos online sind: Bildnachweis stimmt nur, wenn alle Fotos von euch sind; Drohnenaufnahmen brauchen je nach Gewicht eine Registrierung/Betriebserlaubnis. |

---

## 6. Rückfragen an euch

Diese Antworten brauche ich, um Schritt 3 (Preise) und den Buchungsweg
verbindlich umzusetzen:

1. Welche Preise stehen aktuell auf Airbnb (Nebensaison, Hauptsaison,
   Weihnachten), und wie hoch war die Auslastung 2025 pro Monat?
2. Wie viele Anfragen kamen seit dem Livegang über Website, WhatsApp und
   Telefon, und wie viele davon wurden Buchungen?
3. Gilt die Aufenthaltsabgabe von 4,00 € seit Mai 2026 (Schreiben des TVB)?
4. Welche Leistungen der Alpbachtal Card gelten laut aktueller Liste?
   Hallenbad, Tennis, Minigolf: ja oder nein?
5. Balkon oder Terrasse? Bahnhof Breitenbach oder Brixlegg? Wo genau liegt
   der Hof (Koordinaten aus dem Google-Unternehmensprofil)?
6. Sollen Paare günstiger sein als Vierergruppen (Personenpreis), oder
   bleibt es beim Pauschalpreis?
7. Wollt ihr die Endreinigung in den Nachtpreis einrechnen („alles
   inklusive“) oder separat lassen?
8. Gibt es die beiden Zimmer noch bis Wintersaison 2026 auf alpbachtal.at
   (dort stehen sie mit 40 €/Person)? Dann sollten Check-out-Zeit (dort
   9:30, Website 10:00) und Kontaktdaten angeglichen werden.
9. Fotos: Gibt es bereits Aufnahmen (z. B. aus dem Airbnb-Inserat), die ich
   übernehmen darf? Dann ersetze ich die Platzhalter im nächsten Schritt.

Sobald diese Antworten da sind, setze ich Schritt 0 und Schritt 3 direkt im
Code um (Preis-Config, Preisseite, Impressum/Datenschutz-Korrekturen).
