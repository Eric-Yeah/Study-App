# Study App: Projektbeschreibung für das Grundgerüst

Du baust das Grundgerüst einer Web-App zum Lernen. Lies zuerst das ganze Dokument, mach dir einen Plan, und frag nach, wenn etwas unklar ist, bevor du größere Entscheidungen triffst. Alle Zahlen und Formeln hier sind Startwerte und müssen als Konfiguration änderbar sein, nicht fest im Code verteilt.

## 1. Ziel und Nutzer

- Eigenes Projekt einer einzelnen Person (Schüler in der gymnasialen Oberstufe in Hessen). Später eventuell mit anderen teilbar, aber das ist jetzt nicht das Ziel.
- Kern: Lernplan mit Deadlines, Fokus-Timer (Pomodoro) mit Lernzeit-Tracking, und eine App, die Priorität, Vorlauf und Lernzeit pro Fach vorschlägt, die der Nutzer jederzeit überschreiben kann.
- Claude wird zum Lernen als separate App genutzt und wird nicht in die Lern-Oberfläche eingebaut. Eine spätere Funktion zur KI-Bewertung von Texten ist vorgesehen (Abschnitt 9), gehört aber nicht zum Grundgerüst.

## 2. Plattform und Aufteilung

Eine Web-App mit einer Codebasis, responsiv für zwei Rollen:

- **Mac (Browser): Arbeitsplatz.** Großer Wochenplan mit Drag-and-drop für Lernblöcke, Fokus-Ansicht mit Timer, Notizen und Aufgaben nebeneinander, Statistiken, Tastatur-Shortcuts (zum Beispiel Leertaste startet und pausiert den Timer).
- **Handy: Begleiter.** Timer, Tagesfortschritt, Aufgaben abhaken, schnell eine Deadline eintragen.
- Timer-Zustand muss geräteübergreifend synchron sein: Wird er am Mac gestartet, läuft er auf dem Handy mit. Dafür Konto und serverseitige Speicherung, kein reiner Local-Storage.

## 3. Technische Vorgaben

- Falls im Zielordner schon ein bestehendes Projekt mit eigenem Stack liegt, übernimm dessen Stack und Konventionen. Der Nutzer hat bereits eine Web-App ("Overload", Fitness) gebaut, die später an die Study App angebunden werden könnte.
- Sonst schlage einen schlichten, gängigen Stack vor (zum Beispiel TypeScript, React, ein Node-Backend, eine SQL-Datenbank) und begründe ihn kurz, bevor du loslegst.
- Die Geschäftslogik (Priorität, Gesamtzeit, Vorlauf, Wiederholungs-Abstände) kommt als reine Funktionen in ein eigenes Modul ohne UI-Abhängigkeit, mit Unit-Tests.
- Alle Zahlen und Gewichte stehen in einer zentralen Konfigurationsdatei.
- Geheimnisse (zum Beispiel ein späterer API-Schlüssel) gehören nur ins Backend und nie ins Frontend.
- Sprache der Oberfläche: Deutsch. Bezeichner im Code: Englisch.

## 4. Design

- Standard ist ein helles, freundliches Design mit viel Luft. Dazu ein Umschalter für Hell, Dunkel und Automatisch (folgt dem System).
- Optional eine Akzentfarbe pro Fach, damit Fächer schneller zuzuordnen sind.
- Gestaltung über Design-Tokens (CSS-Variablen), nicht über hartcodierte Farben, damit beide Themes sauber funktionieren.
- Sichtbarer Tastaturfokus und ausreichend Kontrast.

## 5. Datenmodell (Entwurf, darf verfeinert werden)

```
User            id, name, rolle (schueler | student | sonstige), bundesland, stufe
Subject         id, userId, name, farbe,
                istLeistungskurs, istPruefungsfach,
                status (weiter | ab_q3_abwaehlen | abgewaehlt),
                fachtyp (aufgaben | wissen | schreiben),
                aktuellePunkte (0-15), schwierigkeit (1-5)
Exam            id, subjectId, datum, titel,
                prioritaetAuto, prioritaetManuell (nullable),
                gesamtzeitAutoH, gesamtzeitManuellH (nullable),
                startVorKlausurAuto, startVorKlausurManuell (nullable)
Plan settings   userId, lernfreieTageProWoche (0-2, Standard 1),
                tageslimitMin (Standard 180)
StudyBlock      id, examId, datum, geplanteMin, art (lernen | wiederholen), erledigt
FocusSession    id, subjectId, examId (nullable), start, ende, geplanteMin,
                pausenMin, status (laeuft | pausiert | beendet)
TimerSettings   userId, sessionMin (Standard 25), kurzePauseMin (5),
                langePauseMin (15), sessionsBisLangePause (4)
Rubric          (siehe Abschnitt 9, im Grundgerüst nur das Schema anlegen)
```

Manuelle Werte überschreiben immer die automatischen. Die App muss zu jedem überschriebenen Wert anzeigen können, was sie selbst vorgeschlagen hätte.

## 6. Geschäftslogik (reine Funktionen, mit Tests)

Alle Konstanten kommen aus der Konfiguration.

**Priorität (1 bis 10)**

```
gewichtung        = (istLeistungskurs ? 2 : 0) + (istPruefungsfach ? 2 : 0)
noteBonus         = (15 - aktuellePunkte) / 15 * 3
schwierigkeitBonus= (schwierigkeit - 1) / 4 * 3
raw               = clamp(round(1 + gewichtung + noteBonus + schwierigkeitBonus), 1, 10)

effektiverStatus  = (istLeistungskurs || istPruefungsfach) ? "weiter" : status
prioritaetAuto    = effektiverStatus == "ab_q3_abwaehlen" ? max(1, raw - 2)
                  : effektiverStatus == "abgewaehlt"      ? 1
                  : raw
```

Leistungskurse und Prüfungsfächer lassen sich nicht abwählen. Der Status wird dann ignoriert und die UI zeigt einen Hinweis. Ein abgewähltes Fach bekommt keinen Lernplan.

**Gesamtlernzeit (Stunden) pro Klausur**

```
p                 = Priorität (manuell, sonst auto)
gesamtzeitAutoH   = abgewaehlt ? 0 : min(40, round( ((3 + 1.2*p) * (20 + 8*p) / 60) * 2 ) / 2)
```

(also auf halbe Stunden gerundet)

**Vorlauf und Verteilung**

```
tageBisKlausur    = Klausurdatum - heute (mindestens 1)
startAuto         = round(3 + 1.2*p) + (fachtyp == "schreiben" ? 3 : 0)
startVorKlausur   = manuell, sonst min(startAuto, tageBisKlausur), mindestens 1
lerntage          = max(1, startVorKlausur - floor(startVorKlausur / 7) * lernfreieTageProWoche)
zeitProLerntagMin = round(gesamtzeitH * 60 / lerntage)
```

Drei Werte hängen zusammen: Gesamtzeit, Starttag, Zeit pro Lerntag. Zwei legt der Nutzer fest (Standard: Gesamtzeit von der App, Starttag vom Nutzer), der dritte ergibt sich.

**Warnung beim Tageslimit**

Ist `zeitProLerntagMin > tageslimitMin`, zeige eine Warnung mit einem Vorschlag, wann man spätestens anfangen sollte: das kleinste d mit `lerntage(d) >= ceil(gesamtzeitH*60 / tageslimitMin)`. Reicht die Zeit bis zur Klausur nicht, sag das und schlage vor, Gesamtzeit oder Limit anzupassen. Die Warnung blockiert nichts.

**Wiederholungs-Abstand (grobe Näherung aus der Spacing-Forschung)**

```
share(d) = d <= 7 ? 0.43 : 0.43 * (0.08/0.43) ^ ( ln(d/7) / ln(50) )
gap      = max(1, round(share(d) * d))      // d = startVorKlausur
```

**Zeitleiste vom Starttag bis zur Klausur** (Tag t = 0 bis d, Klausur an t = d):

- Klausurtag: t == d
- Lernfreier Tag: t < d und (t mod 7 == 6, bei 2 freien Tagen zusätzlich t mod 7 == 3)
- Wiederholungstag: t > 0 und t mod gap == 0 (und nicht frei)
- sonst Lerntag

Fachtyp wirkt auf den Plan, nicht auf die Priorität: Schreiben bekommt früheren Start und später einen Feedback-Block, Wissen mehr Wiederholungs-Blöcke, Aufgaben kürzere, häufigere Einheiten. Im Grundgerüst genügt der Startpuffer, der Rest ist eine spätere Phase.

## 7. Screens für das Grundgerüst

1. **Onboarding** in fünf Schritten: Rolle, Bundesland und Stufe, zwei Leistungskurse, voraussichtlich fünf Prüfungsfächer (später änderbar), Fächer mit aktuellem Notenstand und gefühlter Schwierigkeit. Danach schlägt die App für jedes Fach eine Priorität vor.
2. **Heute:** Tagesziel mit Fortschritt, nächste Deadline mit Countdown, Aufgaben des Tages zum Abhaken, Button "Fokus starten".
3. **Fokus:** Fach wählen, Timer mit Fortschrittsring, Start und Pause, Zurücksetzen, Pause überspringen, "Heute gelernt". Sessionlänge und Pausen frei einstellbar.
4. **Plan:** Wochenübersicht der geplanten Lernzeit, Liste der Deadlines mit Fortschritt, Zeitleiste pro Klausur wie in Abschnitt 6.
5. **Klausur anlegen und bearbeiten:** der Rechner aus Abschnitt 6 mit allen Reglern. Jeder Regler zeigt den Vorschlag der App an, wenn der Nutzer ihn geändert hat.
6. **Fächer verwalten:** Status pro Fach (Läuft weiter, Ab Q3 abwählen, Abgewählt) und alle Fach-Eigenschaften.
7. **Einstellungen:** Theme, Timer, lernfreie Tage, Tageslimit.

## 8. Regeln für Hessen (nur als Wissensbasis, später prüfen)

Quellen waren teils Schulinformationen von 2022 bis 2025. Vor der Nutzung gegen die aktuelle Broschüre des Hessischen Kultusministeriums ("Abitur in Hessen – ein guter Weg") abgleichen.

- Qualifikationsphase mit vier Halbjahren (Q1 bis Q4). Block I sind die Kursnoten, Block II die Abiturprüfung.
- Block I: 24 Grundkurse (einfache Wertung) plus 8 Leistungskurse (doppelte Wertung), maximal 600 Punkte, mindestens 200.
- Block II: 5 Prüfungsfächer, vierfache Wertung, 100 bis 300 Punkte. Deutsch und Mathematik müssen dabei sein. Die verbindliche Wahl fällt zu Beginn von Q4.
- Bestanden ab 300 von 900 Punkten.
- Höchstens 6 Kurse unter 5 Punkten, davon maximal 2 Leistungskurse (Defizit-Zähler als spätere Warnung).
- Pflicht-Einbringung (Auszug): Deutsch 4 Kurse, Fremdsprache 4, Kunst oder Musik 2, Gesellschaftswissenschaften mindestens 6 (darunter je 2 in Geschichte und Politik und Wirtschaft), Mathe 4, Naturwissenschaft 4 plus 2 in einer weiteren Naturwissenschaft, Informatik oder Fremdsprache, Sport 3 (außer Sport ist Prüfungsfach).
- Ob beim Abwählen eines Fachs auch Pflicht-Einbringungen verletzt würden, soll die App später prüfen. Im Grundgerüst gilt nur die Sperre für Leistungskurse und Prüfungsfächer.
- Punkte und Noten: Note 1 entspricht 13 bis 15 Punkten, 2 entspricht 10 bis 12, 3 entspricht 7 bis 9, 4 entspricht 4 bis 6, 5 entspricht 1 bis 3, 6 entspricht 0.

## 9. Spätere Phasen (nicht im Grundgerüst, aber das Schema berücksichtigen)

**Raster für Texte (Deutsch zuerst) und KI-Bewertung**

```
Rubric   fach, aufgabenart, halbjahr (Q1-Q4), quelle (standard | eigen),
         basiertAuf (Rubric-ID), gewichtung {verstehen, darstellung},
         kriterien[]: { name, bereich (I | II | III | Darstellung),
                        gewichtProzent, stufen[0..3] mit Beschreibung },
         hinweise (freies Feld, zum Beispiel Schwerpunkte der Lehrkraft)
```

- Raster können pro Halbjahr verschieden sein. Der Nutzer kann Standard-Raster kopieren und ändern oder ein eigenes anlegen.
- Standard-Entwurf für Sachtextanalyse: Textverständnis (Bereich I, 20 %), Analyse von Argumentation und Sprache (II, 30 %), Beurteilung (III, 20 %), Aufbau und Gedankenführung (10 %), Fachsprache und Zitieren (10 %), Sprachrichtigkeit (10 %). Das ergibt 70 zu 30 zwischen Verstehens- und Darstellungsleistung. Das ist ein Entwurf und kein offizielles Raster.
- Bewertung läuft über das Backend an die Claude-API mit Text, Aufgabenstellung, Raster und Hinweisen. Das Modell liefert pro Kriterium Stufe, Belegstelle und Verbesserungshinweis. Die Punkte berechnet die App selbst. Mehrere Durchläufe und eine Spanne statt einer genauen Zahl, weil Bewertungen schwanken.

**Konzentrationsscore**

- Schätzung der Tageskapazität aus gelernter Zeit, Anzahl der Sessions und Training, mit optionaler Selbsteinschätzung. Er ist eine Empfehlung und blockiert nichts. Als Obergrenze für echte Konzentration gelten grob 3 bis 4 Stunden pro Tag, mit Sessions von 45 bis 90 Minuten.
- Die Kopplung an die Fitness-App soll über eine kleine Schnittstelle laufen (zum Beispiel Anzahl der heutigen Trainingseinheiten). Anfangs reicht die manuelle Eingabe.

**Weitere Ideen (Backlog)**

Auto-Plan über mehrere Klausuren, Realitätscheck von geplanter und echter Lernzeit pro Fach, Wochenrückblick, Karteikarten mit Wiederholungsrhythmus, Ablenkungs-Blocker am Mac, Tagesenergie per Morgen-Check, Streak mit Gnade (ein Ausfalltag bricht die Serie nicht), Lernmaterial am Fach.

## 10. Vorgehen und Abnahme für das Grundgerüst

Arbeite in kleinen Schritten und fasse nach jedem Schritt kurz zusammen, was fertig ist.

1. Projekt aufsetzen, Konfigurationsdatei und Design-Tokens, Theme-Umschalter.
2. Datenmodell und Datenbank, Konto und Anmeldung.
3. Das Logik-Modul aus Abschnitt 6 mit Unit-Tests (mindestens: Priorität, Abwahl-Regeln, Gesamtzeit, Lerntage, Limit-Warnung, Wiederholungs-Abstand, Zeitleiste).
4. Fächer-Verwaltung und Onboarding.
5. Klausur anlegen mit dem Rechner (Vorschlag und Überschreiben).
6. Fokus-Timer mit synchronem Zustand zwischen Geräten.
7. Screens Heute und Plan, responsiv für Mac und Handy.

Das Grundgerüst ist fertig, wenn:

- ein neuer Nutzer das Onboarding durchläuft und für jedes Fach eine Priorität sieht,
- eine Klausur mit Datum angelegt werden kann, und Priorität, Gesamtzeit und Starttag sich überschreiben lassen, wobei der Vorschlag der App sichtbar bleibt,
- Leistungskurse und Prüfungsfächer nicht abwählbar sind und abgewählte Fächer keinen Plan bekommen,
- der Timer auf zwei Geräten synchron läuft und die gelernte Zeit pro Fach speichert,
- Hell, Dunkel und Automatisch funktionieren,
- die Logik-Tests durchlaufen.

Bevor du anfängst: Nenne kurz deinen geplanten Stack und die Reihenfolge, und stell höchstens die Fragen, die du wirklich für den Start brauchst.
