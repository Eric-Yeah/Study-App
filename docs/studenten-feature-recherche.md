# Studierenden-Modus: Recherche und Planung

> **Stand 29.10.2026:** Die Stufen 0 bis 3 und der Kern von Stufe 4 (Kalender-Link) sind umgesetzt, siehe CLAUDE.md, Abschnitt Stand, Eintrag „Studium“. Offen bleiben Notenspiegel-Import, Übungsfragen aus Skripten und Anki-Import.


Stand der Recherche: 29.10.2026 (vor dem Bau, die Abschnitte 6 und 7 beschreiben die Planung).

**Kennzeichnung der Aussagen** (damit klar bleibt, was belegt ist):

- **[Code]** steht im Projekt und wurde gelesen (Datei genannt).
- **[Web n]** stammt aus dem Web, n verweist auf die Quellenliste in Abschnitt 9. Die Web-Suche liefert Auszüge. Wo eine Quelle nur ein Beispiel einer einzelnen Hochschule ist, steht das dabei, denn Hochschulen regeln vieles unterschiedlich.
- **[Einschätzung]** ist meine Schlussfolgerung oder Schätzung, nicht belegt.

Aufwand: **klein** = bis etwa 1 Tag, **mittel** = 2 bis 4 Tage, **groß** = mehr als eine Woche (alles [Einschätzung] für einen Entwickler, der die Codebasis kennt).

---

## 1. Kurzfassung

1. Die App ist für die Oberstufe in Hessen gebaut, aber ein Studierenden-Zweig ist schon halb vorbereitet: `Role` kennt `student_university`, die Datenbank erlaubt den Wert, das Onboarding bietet ihn an ("Abitur-Logik wird ausgeblendet (folgt später)"), nur benutzt wird er nirgends [Code: `types.ts`, `20261006000000_init.sql`, `Onboarding.tsx`, `remote.ts` Zeile 72].
2. Der Kern passt fast unverändert: Fokus-Timer, Heute, Aufgaben, Notizen, Karteikarten, Plan über mehrere Prüfungen, Konzentrationsscore, Erinnerungen, Wochenrückblick. Alles hängt an `Subject` und `Exam`, und das lässt sich als Modul und Prüfung wiederverwenden [Code].
3. Neu gebaut werden müssen vor allem vier Dinge: (a) **Module mit ECTS und Semester**, (b) **Prüfungsarten und Prüfungsversuche** (Klausur, Hausarbeit, Referat, Freiversuch, Anmeldefrist), (c) **Noten 1,0 bis 5,0** mit ECTS-gewichtetem Schnitt und Studienfortschritt statt Notenpunkte und Abiturrechner, (d) ein **Stundenplan mit wiederkehrenden Veranstaltungen** (Import einer .ics-Datei), weil der vorhandene Stundenplan ein Schul-Raster Montag bis Freitag aus Lanis ist.
4. Schulspezifisch und im Studierenden-Modus auszublenden: Lanis, DSBmobile, Vertretungen, Fehlstunden, Lanis-Hausaufgaben, Abiturrechner, Notenpunkte 0 bis 15, Q-Phasen, OAVO-Korrektur, Übungsklausuren im Hessen-Format, Schwächen nach Operatoren (Liste in Abschnitt 5).
5. Der Lernaufwand eines Studiums lässt sich aus ECTS ableiten: 1 ECTS entspricht etwa 25 bis 30 Stunden Arbeit [Web 1, 2, 3]. Das ersetzt die Priorität nach Notenpunkten und Leistungskurs als Grundlage für die Lernzeit pro Prüfung.
6. Sicherheitsempfehlung: **keine Zugangsdaten von Uni-Portalen speichern oder abfragen.** Viele Hochschulordnungen verbieten die Weitergabe von Zugangsdaten an Apps ausdrücklich [Web 31]. Stattdessen: .ics-Datei hochladen (kein Passwort nötig), später optional der iCal-Link.
7. Vorschlag zum Einschalten: Modus aus `profile.role` ableiten (kein neues Feld nötig), in den Einstellungen umschaltbar, Schuldaten bleiben erhalten. Wichtigste offene Entscheidung: Schule und Studium parallel oder Wechsel? (Abschnitt 8).
8. **MVP** (Stufe 1): Modus-Schalter mit Begriffen (Fach heißt Modul, Klausur heißt Prüfung), Module mit ECTS und Semester, Prüfungen mit Art und Versuch, Noten 1,0 bis 5,0 mit Gesamtschnitt und ECTS-Fortschritt, Lernplan aus ECTS-Workload über die vorhandene Planlogik. Der Stundenplan-Import folgt in Stufe 2.

---

## 2. Glossar für Einsteiger

| Begriff | Bedeutung (einfach) |
|---|---|
| **Hochschule, Uni, FH/HAW** | Uni = forschungsnah, FH/HAW = praxisnäher. Für die App egal, beide arbeiten mit Modulen und ECTS. |
| **Bachelor / Master** | Erster Abschluss (meist 6 Semester, 180 bis 240 ECTS) und darauf aufbauender (meist 2 bis 4 Semester, 60 bis 120 ECTS) [Web 3]. |
| **Semester** | Ein Studienhalbjahr. **Wintersemester (WiSe)** 1. Oktober bis 31. März, **Sommersemester (SoSe)** 1. April bis 30. September (Beispiel Hessen: Gießen, Frankfurt) [Web 29]. |
| **Vorlesungszeit** | Die Wochen, in denen Lehrveranstaltungen stattfinden, etwa 14 bis 16 Wochen. Beispiel WiSe 2026/27 in Frankfurt und Gießen: 12.10.2026 bis 12.02.2027 [Web 23, 29]. |
| **Vorlesungsfreie Zeit** | Die Zeit zwischen den Vorlesungszeiten, umgangssprachlich "Semesterferien". Viele Prüfungen, Hausarbeiten und Praktika liegen genau hier [Web 24, 29]. |
| **Prüfungsphase / Klausurenphase** | Der Zeitraum, in dem die meisten Klausuren geschrieben werden (je nach Hochschule am Ende der Vorlesungszeit oder in der vorlesungsfreien Zeit) [Einschätzung]. |
| **Modul** | Ein Bündel zusammengehöriger Lehrveranstaltungen mit gemeinsamer Prüfung und festen ECTS (zum Beispiel "Analysis I", 9 ECTS). Das Modul ist die eigentliche Einheit, nicht die einzelne Vorlesung. |
| **Modulhandbuch** | Dokument des Studiengangs, das für jedes Modul ECTS, Inhalte, Prüfungsform und Voraussetzungen festlegt. |
| **Prüfungsordnung (PO)** | Rechtliche Regeln des Studiengangs: Prüfungsarten, Versuche, Fristen, Notenberechnung. Hier steht, was für diese Person gilt. Die App kann sie nicht kennen. |
| **ECTS / Leistungspunkte (LP, CP, Credits)** | Maß für den Arbeitsaufwand eines Moduls, **nicht** für die Note. 1 ECTS sind etwa 25 bis 30 Arbeitsstunden. Wer besteht, bekommt alle Punkte, egal wie gut die Note ist [Web 1, 2, 4]. Ein Vollzeit-Semester hat meist 30 ECTS (180 : 6 Semester, abgeleitet [Einschätzung]). |
| **Workload** | Gesamter Arbeitsaufwand eines Moduls: Anwesenheit, Vor- und Nachbereitung, Prüfungsvorbereitung und Prüfung selbst [Web 2]. |
| **SWS (Semesterwochenstunden)** | Maß für die Veranstaltungszeit pro Woche. 1 SWS = 45 Minuten pro Woche über die Vorlesungszeit. Vor- und Nachbereitung sind darin **nicht** enthalten [Web 23]. |
| **Vorlesung** | Dozent/in trägt vor, viele Zuhörer, meist keine Anwesenheitspflicht [Einschätzung]. |
| **Übung** | Aufgaben zur Vorlesung, oft mit wöchentlichen Abgaben ("Übungsblätter") [Einschätzung]. |
| **Seminar** | Kleine Gruppe, Referate und Diskussion, oft Anwesenheitspflicht und eine Hausarbeit [Einschätzung]. |
| **Tutorium** | Zusatztermin von älteren Studierenden zur Vertiefung [Einschätzung]. |
| **Praktikum / Labor** | Praktische Veranstaltung, oft unbenotet (z. B. Praktikumsleistungen bleiben bei der Gesamtnote unberücksichtigt) [Web 10]. |
| **Prüfungsleistung** | Benotete Leistung innerhalb eines Moduls (Modulprüfung), geht in die Gesamtnote ein [Web 17]. |
| **Studienleistung** | Meist **unbenotete** Voraussetzung (bestanden/nicht bestanden), zum Beispiel Übungsblätter oder Anwesenheit. Zählt nicht als Prüfung, es gibt keine begrenzten "Fehlversuche" [Web 16]. Oft Bedingung für die Zulassung zur Prüfung [Web 17, 18]. Namen schwanken (Prüfungsnebenleistung, Testat), maßgeblich ist Modulhandbuch bzw. PO [Web 17]. |
| **Testat** | Meist eine Bestätigung, dass eine Studienleistung erbracht wurde. Die Bedeutung ist nicht einheitlich [Web 17]. |
| **Klausur** | Schriftliche Prüfung unter Aufsicht. |
| **Hausarbeit / Seminararbeit** | Schriftliche Arbeit zu einem Thema mit Abgabefrist, oft in der vorlesungsfreien Zeit. Zitieren und Literatur sind wichtig. |
| **Referat / Präsentation** | Vortrag, oft mit Handout. |
| **Mündliche Prüfung** | Gespräch mit Prüfenden. |
| **Prüfungsanmeldung / -abmeldung** | In vielen Hochschulen muss man sich für Prüfungen online in einer Frist anmelden (und ggf. bis zu einer Frist wieder abmelden). Ohne Anmeldung zählt die Prüfung nicht [Web 37 (Beispiel HISinOne)]. |
| **Prüfungsversuch / Wiederholung** | Nicht bestandene Prüfungen darf man wiederholen, die Zahl ist begrenzt (häufig insgesamt drei Versuche, steht in der PO) [Web 20]. Ist kein Versuch mehr übrig, gilt die Prüfung als **endgültig nicht bestanden**, mit schweren Folgen für den Studiengang [Web 11, 20]. |
| **Freiversuch** | Eine Prüfung im vorgesehenen Semester, die bei Nichtbestehen als "nicht unternommen" gilt. Bedingungen und Fristen sind je Hochschule verschieden [Web 19, 20, 21, 22]. |
| **Notenverbesserung** | Manche Hochschulen erlauben eine bestandene Prüfung einmal freiwillig zu wiederholen (Antrag in der Anmeldefrist) [Web 22]. |
| **Rückmeldung** | Pflicht-Meldung pro Semester, mit der man den Studienplatz behält (inklusive Zahlung des Semesterbeitrags). Wer sich nicht rückmeldet, wird exmatrikuliert [Einschätzung]. Auch im Urlaubssemester ist Rückmeldung nötig, Prüfungen sind dann nicht erlaubt [Web 24]. |
| **Semesterbeitrag** | Pflichtbeitrag pro Semester (oft mit Semesterticket). Höhe je Hochschule [Einschätzung]. |
| **Exmatrikulation** | Ausschreibung von der Hochschule. |
| **Regelstudienzeit** | Vorgesehene Studiendauer in Semestern, z. B. 6 beim Bachelor. Wichtig u. a. für BAföG [Web 27]. |
| **Fachsemester / Hochschulsemester** | Fachsemester = Semester im aktuellen Studiengang, Hochschulsemester = insgesamt an Hochschulen [Einschätzung]. |
| **Transcript of Records / Notenspiegel** | Auflistung aller Module mit ECTS und Note. |
| **BAföG** | Staatliche Studienförderung. Wichtig sind Fristen: **Leistungsnachweis** (Formblatt 5 oder Leistungsübersicht) meist zum 5. Fachsemester, und der **Wiederholungsantrag** etwa zwei Monate vor Ende des Bewilligungszeitraums [Web 27]. |
| **Mensa / Studentenwerk** | Studentisches Essen und Wohnen, BAföG-Amt ist meist beim Studentenwerk [Einschätzung]. |
| **Stud.IP, Moodle, ILIAS, OPAL** | Lernplattformen (Kurse, Material, Termine). Moodle und Stud.IP können Termine als iCal exportieren [Web 6, 25]. |
| **HISinOne, TUCaN, QIS/LSF, Campus-System** | Verwaltungssysteme der Hochschule (Anmeldung, Stundenplan, Noten). Welche eine Hochschule hat, ist verschieden [Web 9, 37]. |
| **iCal / .ics** | Standard-Dateiformat für Kalender-Termine. Fast jedes Uni-System kann den Stundenplan so exportieren [Web 6, 7, 8, 9]. |
| **Skript / Folien** | Lehrmaterial, meist PDF. Anders als Schul-Arbeitsblätter oft 50 bis 300 Seiten [Einschätzung]. |
| **Zotero / Citavi** | Programme zur Literaturverwaltung und zum Zitieren. Zotero ist frei und plattformunabhängig, Citavi läuft an manchen Unis über eine Campuslizenz [Web 36]. |

---

## 3. Was Studierende brauchen

Priorität: **Muss** (ohne das ist der Modus nicht sinnvoll), **Sollte**, **Kann**.

### 3.1 Studienstruktur

| Bedarf | Stufe | Begründung / Quelle |
|---|---|---|
| Semester anlegen (WiSe/SoSe, Jahr, Beginn und Ende der Vorlesungszeit, Prüfungsphase) | Muss | Alle Planung hängt an diesen Daten. Die Zeiten legt jede Hochschule fest, Beispiele [Web 29]. App kann sie nicht erraten, also Eingabe von Hand (später evtl. aus .ics). |
| Module mit Name, ECTS, Semester, Veranstaltungstypen, Dozent/in | Muss | Modul ist die Planungseinheit [Web 1, 2]. |
| Studiengang (Abschluss, Regelstudienzeit, ECTS gesamt, aktuelles Fachsemester) | Muss | Grundlage für Fortschritt und BAföG-Hinweise [Web 3, 27]. |
| Pflicht/Wahlpflicht/Wahl-Kennzeichnung | Sollte | Für Fortschrittsanzeige [Einschätzung]. |
| Studienleistung als Zulassung zur Prüfung (Haken: Übungsblätter erfüllt) | Sollte | [Web 17, 18]. |
| Fristenliste (Rückmeldung, Prüfungsan- und -abmeldung, BAföG, Semesterbeitrag) als eigene Termine mit Erinnerung | Muss | Fristen sind je Hochschule verschieden, die App kann nur erinnern, nicht ermitteln [Web 22, 27]. |
| Prüfungsordnung/Modulhandbuch als Datei ablegen | Kann | Nur Ablage (PDF) [Einschätzung]. |
| Studienverlaufsplan (welches Modul in welchem Semester) | Kann | Gerät zur Planung des gesamten Studiums [Einschätzung]. |

### 3.2 Veranstaltungen und Stundenplan

| Bedarf | Stufe | Begründung / Quelle |
|---|---|---|
| Wochenplan mit wiederkehrenden Veranstaltungen (Wochentag, Uhrzeit, Raum, Dozent/in, Veranstaltungstyp), nur in der Vorlesungszeit | Muss | Kern jeder Studi-App (Studo, iStudiez, Power Planner) [Web 14, 33]. Unterschied zum Schul-Stundenplan: freie Uhrzeiten statt nummerierter Stunden, auch Samstag, 14-tägige Termine, Einzeltermine. |
| Import aus **.ics-Datei** | Sollte (Stufe 2, mit großer Wirkung) | Stud.IP (Export aller Termine) [Web 6], ZEuS Konstanz [Web 7], Mannheim Portal2 (Abo-Link) [Web 8], TU Darmstadt TUCaN (Export pro Woche oder Monat, **UTF-16**, nur Momentaufnahme, bei Änderungen neu exportieren) [Web 9], Moodle (URL-Export, auch Abgabefristen) [Web 25]. Die Formate unterscheiden sich, also tolerant parsen. |
| iCal-**Abo-Link** mit automatischer Aktualisierung | Kann | Bequemer, aber die URL wirkt wie ein Geheimnis: Moodle erzeugt eine URL, mit der **ohne Anmeldung** alle Termine abrufbar sind [Web 25]. Siehe Abschnitt 6, Sicherheit. |
| Einzeltermine/Ausfälle/Raumwechsel | Sollte | Einzelne Veranstaltungen fallen aus oder wechseln [Einschätzung]. Die App hat dafür bei Schule "Ausfälle", das Prinzip lässt sich nachbauen (`day_overrides`). |
| Lücken zwischen Veranstaltungen als Lerngelegenheit | Sollte | Entspricht der "Freistunde" in der Schul-Version [Code: `daily.ts`]. |
| Pendelzeit, Mensa, Nebenjob als geblockte Zeiten | Kann | Alltag [Einschätzung]. |

### 3.3 Prüfungs- und Leistungsarten

| Bedarf | Stufe | Begründung / Quelle |
|---|---|---|
| Art der Prüfung: Klausur, mündlich, Hausarbeit, Referat, Projekt/Abgabe, Portfolio, Testat/Studienleistung | Muss | Jede Art braucht eine andere Vorbereitung [Web 16, 17, 18]. |
| Benotet / unbenotet / bestanden-nicht bestanden | Muss | [Web 16, 17]. |
| Prüfungsversuch (1., 2., 3.), Freiversuch ja/nein, "letzter Versuch" | Muss | Folgen sind einschneidend [Web 19, 20, 21, 22]. Die Regel steht in der PO, also **Eingabe von Hand**, App warnt nur ("Hinweise blockieren nichts"). |
| Anmeldefrist und Abmeldefrist als Termine mit Erinnerung | Muss | Verpasste Anmeldung = Prüfung entfällt [Web 37]. Frist liefert die Hochschule. |
| Abgabefristen von Hausarbeiten/Übungsblättern (mit Rückwärtsplanung) | Sollte | Kein "Lernen", sondern Schreiben. Plan nach Arbeitsschritten (Recherche, Gliederung, Rohfassung, Überarbeitung) [Einschätzung]. |
| Zulassungsvoraussetzungen (Studienleistung erfüllt?) | Sollte | [Web 17, 18]. |
| Nachteilsausgleich, Krankmeldung, Härtefälle | Nicht Ziel | Verwaltungsvorgang, nur Link/Hinweis [Einschätzung]. |

### 3.4 Noten

| Bedarf | Stufe | Begründung / Quelle |
|---|---|---|
| Deutsche Skala 1,0 bis 5,0, Einzelnoten in Schritten 1,0 / 1,3 / 1,7 / 2,0 / 2,3 / 2,7 / 3,0 / 3,3 / 3,7 / 4,0 / 5,0 (0,7; 4,3; 4,7 und 5,3 ausgeschlossen) | Muss | Beispiel Saarland und Erfurt [Web 11, 12]. Nicht überall gleich, daher als Konfiguration. |
| Bestanden ab 4,0 (alles darüber, also 5,0, nicht bestanden) | Muss | [Web 10] (Bamberg: "nicht ausreichend" über 4,0). |
| **Gesamtnote = Durchschnitt gewichtet nach ECTS**, eine Nachkommastelle, weitere Stellen **gestrichen statt gerundet** | Muss (Regel konfigurierbar) | Beispiel Bamberg [Web 10]. Andere Hochschulen können anders runden oder anders gewichten (z. B. Gewichtungsfaktoren, nicht alle Module zählen) [Einschätzung]. |
| Notenbezeichnung ("sehr gut" bis "ausreichend") | Sollte | Beispiel Bamberg: bis 1,5 sehr gut, bis 2,5 gut, bis 3,5 befriedigend, bis 4,0 ausreichend, 1,0 bis 1,2 zusätzlich "mit Auszeichnung" [Web 10], Lübeck weicht ab (1,3 bis 1,5 sehr gut) [Web 13]. |
| Unbenotete Module (nur ECTS, kein Notenanteil) | Muss | Z. B. Praktika [Web 10]. |
| Studienfortschritt: ECTS erreicht gegenüber Soll (Soll ≈ 30 pro Semester) | Muss | Wichtig für BAföG [Web 27] und Regelstudienzeit. |
| "Welche Note brauche ich für Ziel-Schnitt X?" | Sollte | Funktion in Student-Planner-Apps (Zielnote) [Web 33], im Projekt gibt es das Prinzip bereits als `neededPoints` [Code: `grades.ts`]. |
| Prognose Gesamtnote ("wenn die offenen Module X bekommen") | Kann | [Einschätzung]. |
| Bachelorarbeit/Abschlussarbeit mit Sondergewicht | Sollte | Zählt in vielen POs stärker [Einschätzung]. |
| Noten-Push bei neuer Note (Studo macht das) | Nicht Ziel | Setzt Zugriff aufs Uni-Konto voraus [Web 14]. |
| Anerkennung (Leistungen von anderer Hochschule) | Kann | Nur Eingabe als Modul mit Vermerk [Einschätzung]. |

**Unterschied zur Schule:** Schule = Punkte 0 bis 15, höher ist besser, Note 1 ab 13 Punkten [Code: `hessen.ts`]. Studium = Note 1,0 bis 5,0, **niedriger ist besser**. Das ist eine Falle für jeden Code, der "mehr ist besser" annimmt (Priorität, Trend, "Was brauche ich?").

### 3.5 Lernplanung

| Bedarf | Stufe | Begründung / Quelle |
|---|---|---|
| Aufwand pro Modul aus ECTS (1 ECTS ≈ 25 bis 30 h) | Muss | [Web 1, 2]. |
| Lernplan pro Prüfung mit Startzeitpunkt, verteilt über mehrere Prüfungen | Muss | Existiert (`planAll`), muss auf längere Vorläufe und mehrere gleichzeitige Prüfungen ausgelegt werden. |
| Regelmäßiges, früh beginnendes Lernen statt Aufschieben | Muss (Haltung) | Studie: prompte Bearbeitung der Materialien und konstante Arbeitsdauer erhöhen die Chance, zur Prüfung anzutreten; Prokrastination und Prüfungsangst wirken negativ [Web 32 (Freudinger 2023)]. |
| Spaced Repetition und Selbsttest (Karteikarten, Übungsaufgaben) | Muss (vorhanden) | Review von Dunlosky u. a. 2013: Selbsttests und verteiltes Üben erhalten die höchste Nutzenbewertung, Zusammenfassen, Markieren, Wiederlesen die niedrigste [Web 26]. |
| Kurze Lerneinheiten mit Pausen | vorhanden | z. B. 20 Minuten lernen, 2 bis 5 Minuten Pause [Web 32 (HS Flensburg)]. Timer kann das. |
| Kapazität pro Tag: Vorlesungstage weniger, vorlesungsfreie Zeit mehr | Sollte | Siehe Abschnitt 7.2. |
| Lerngruppen | Kann | Hessens Kultusministerium nennt "in der Gruppe lernen" als Hilfe [Web 32]. Für die App wäre es nur ein Etikett an einem Block, kein Mehrbenutzer-Feature [Einschätzung]. |
| Wiederholung des Stoffs während der Vorlesungszeit (Nachbereitung wöchentlich) | Sollte | Sonst entsteht alles in der Prüfungsphase [Einschätzung]. |

### 3.6 Material

| Bedarf | Stufe | Begründung |
|---|---|---|
| Skripte und Folien (PDF) pro Modul ablegen und durchsuchen | Muss | Bestehendes Notizen-/PDF-System, aber für große PDFs anpassen [Code]. |
| Mitschriften (Text, Foto) | vorhanden | `NoteUpload`, `lesson_notes` [Code]. |
| Zusammenfassung per KI | Sollte | Vorhanden für Arbeitsblätter, braucht Anpassung (Länge, Kosten) [Code]. |
| Karteikarten pro Modul | vorhanden | [Code: `cards.ts`]. Anki-Import wäre "Kann" [Web 30]. |
| Literatur und Zitieren | Kann | Zotero (frei) oder Citavi (Campuslizenz an manchen Unis) [Web 36]. Nicht selbst bauen, höchstens ein Feld "Literatur" an der Hausarbeit [Einschätzung]. |
| Altklausuren/Übungsfragen | Kann | Datei-Ablage am Modul; KI-Übungsfragen später [Einschätzung]. |

### 3.7 Alltag

| Bedarf | Stufe | Begründung |
|---|---|---|
| Schlaf, Energie, Training → Konzentrationsscore | vorhanden | [Code: `concentration.ts`, Overload-Kopplung]. Bleibt unverändert. |
| Nebenjob (Arbeitszeiten als gesperrte Zeit) | Sollte | Als wiederkehrender Termin mit Art "Job". |
| BAföG-Fristen | Sollte | Erinnerungen zu Leistungsnachweis (meist 5. Fachsemester, Formblatt 5 oder Leistungsübersicht) und Wiederholungsantrag (zwei Monate vor Ende des Bewilligungszeitraums) [Web 27]. Datum und Fall liefert der Bescheid, Eingabe von Hand. |
| Rückmeldung/Semesterbeitrag | Sollte | Frist je Hochschule, Eingabe von Hand. |
| Mensa-Plan | Nicht Ziel | Je Studentenwerk eigene Quelle, Studo bietet es [Web 14]. Hoher Aufwand, geringer Gewinn [Einschätzung]. |
| Wohnen/WG, Finanzen | Nicht Ziel | Außerhalb des Zwecks [Einschätzung]. |

### 3.8 Datenschutz und Rechtliches (grob, keine Rechtsberatung)

- Keine Zugangsdaten zum Uni-Portal speichern oder abfragen: Hochschulen untersagen die Weitergabe von Kennungen an Dritte, teils ausdrücklich an "Apps auf dem Smartphone" (Viadrina), Verstöße können zur Sperrung der Kennung führen (UDE) [Web 31]. Studo verlangt bei einigen Hochschulen Zugangsdaten [Web 14], das ist der Weg, den die App **nicht** gehen sollte [Einschätzung].
- Noten und Prüfungsversuche sind personenbezogene Daten. Das bestehende Konzept (Konto, Row Level Security, Löschfunktion `delete-account`) trägt das [Code]. Neue Tabellen brauchen dieselben Richtlinien wie `grades` (inklusive "nur aktive Konten", Verknüpfungen nur mit eigenen Datensätzen) [Code: `20261030000000_grades.sql`].
- Wie bei Lanis ("Absprache: Die App liest nur") gilt: die App meldet nichts an die Hochschule und setzt keine Prüfungsanmeldung [Code: CLAUDE.md].
- Skripte/Folien unterliegen dem Urheberrecht und oft den Regeln der Lehrenden (Weitergabe, KI-Nutzung). Die KI-Zusammenfassung sendet Inhalte an einen externen Anbieter (Anthropic). Ein Hinweis in der Oberfläche ist sinnvoll [Einschätzung].
- Ein iCal-Link kann ein Geheimnis sein (siehe Moodle) [Web 25]: nicht im Klartext ins Log, nicht in URL-Parameter der App.

---

## 4. Was die App schon kann und unverändert bleibt

Alles [Code], soweit nicht anders gekennzeichnet.

### 4.1 Unverändert nutzbar (Kern, Pflicht laut Auftrag)

| Funktion | Dateien | Bemerkung |
|---|---|---|
| **Fokus-Timer (Pomodoro), Abgleich zwischen Geräten** | `apps/web/src/timer/TimerProvider.tsx`, `timer/types.ts`, `pages/Focus.tsx`, Tabelle `timer_state` (Realtime), `focus_sessions`, `components/TimerPill.tsx`, `TimerSoundCard.tsx`, `SoundQuestion.tsx`, `lib/timerSound.ts` | Hängt nur an `subjectId`. Länge (`timer.setLength`) einstellbar, also 45 bis 90 Minuten möglich. Nur die Beschriftung "Fach" wird "Modul". **Nichts ändern, nur Begriff.** |
| Aufgaben und Schnell-Hinzufügen | `Task`, `components/QuickAdd.tsx`, `HomeworkComposer.tsx` (eigene Hausaufgaben `own:ID` sind generisch) | Taugt für Übungsblätter und Abgaben ("Blatt 5 bis Freitag"). Der Parser `parseHomeworkEntry` liest "bis Freitag", "nächste Stunde des Fachs" und braucht dann den Studierenden-Stundenplan. |
| Notizen, PDF-Zusammenführung, Suche, Lernordner | `pages/Notes.tsx`, `NoteUpload.tsx`, `lib/mergePdf.ts`, `folderPdf.ts`, `pdfEdit.ts`, `notesSearch.ts`, `notesView.ts`, `worksheetPrep.ts` | Funktioniert; Schul-Details (Q-Phase, Lehrkraft) siehe 4.2. |
| Karteikarten (Leitner, Lernmodi, KI-Karten) | `cards.ts`, `quiz.ts`, `cardsAi.ts`, `pages/Cards.tsx`, `components/cards/*` | Intervalle bis 60 Tage (`CONFIG.cards.intervalsDays`) passen zu einem Semester. Passt zu den Befunden aus [Web 26]. |
| Gemeinsamer Plan über mehrere Prüfungen, Ausfälle, Realitätscheck | `schedule.ts` (`planAll`, `realityCheck`), `state/selectors.ts`, `pages/Plan.tsx` Teile, Tabelle `day_overrides` | Kern ist generisch (Frist, Gesamtminuten, Tageslimit, freie Wochentage, Überschreibungen pro Datum). |
| Konzentrationsscore, Check-in, Overload-Kopplung | `concentration.ts`, `ConcentrationCard.tsx`, `FitnessLink.tsx`, Edge Function `fitness-ingest` | Rein persönlich, kein Schulbezug. |
| Erinnerungen (Web-Push) | `pushPlan.ts`, `PushCard.tsx`, `PushSync.tsx`, `sw.js`, `push-send` | Funktioniert; Texte sagen "Klausur", bei Studierenden besser "Prüfung" (siehe 4.2). Fristen-Erinnerungen wären neu. |
| Wochenrückblick, Serie mit Gnade, "Als Nächstes" (ohne Stundenplan-Teil) | `weekly.ts`, `Review.tsx`, `daily.ts` (`studyStreak`, `nextUp`) | `nextUp` nimmt Plan, Aufgaben, Karten. |
| Themenliste je Prüfung | `exam_topics`, `components/Topics.tsx` | Entspricht den Lernzielen/Kapiteln eines Moduls. |
| Konto, Hell/Dunkel, Auto-Update, Release Notes, Geräte-Sync | `lib/auth.tsx`, `Settings.tsx` Teile, `UpdateManager`, `DevicesCard` | Unverändert. |
| Zugriffskontrolle für KI | `lib/access.ts`, `RequireAi.tsx`, `access.ts` | Unabhängig vom Modus. |

### 4.2 Passt mit kleiner Anpassung

| Bereich | Was anzupassen ist | Dateien |
|---|---|---|
| Begriffe | "Fach" zu "Modul", "Klausur" zu "Prüfung", "Hausaufgabe" zu "Aufgabe/Abgabe". Allein in `apps/web/src` gibt es "Klausur" in 48 Dateien (186 Zeilen in .tsx) und "Fach/Fächer" in 126 Zeilen [Code, gezählt]. Das braucht eine zentrale Begriffstabelle. | gesamte UI, `pushPlan.ts` (Texte "Klausur naht"), `weekly.ts` |
| Fächer-Seite / Fach-Editor | Felder Leistungskurs, Prüfungsfach, Status "Abwählen", Notenpunkte 0 bis 15 passen nicht; neu: ECTS, Semester, Pflicht/Wahl, Dozent/in, Veranstaltungstypen | `pages/Subjects.tsx`, `components/SubjectEditor.tsx`, `GradeField.tsx` |
| Prüfung anlegen/bearbeiten | Priorität berechnet sich aus Leistungskurs, Prüfungsfach, Notenpunkten (`priorityBreakdown`); für Module stattdessen aus ECTS, Schwierigkeit, Versuch. Gesamtzeit-Obergrenze 40 h (`totalTime.capHours`) ist für 9-ECTS-Module zu niedrig. Vorlauf 3 + 1,2·p Tage (höchstens etwa 15) ist für Hochschul-Klausuren zu kurz. | `logic.ts` (`planExam`, `priorityBreakdown`, `totalHoursAuto`, `leadDaysAuto`), `config.ts`, `pages/ExamEditor.tsx`, `ExamCards.tsx` |
| Onboarding | Fächerliste Hessen und Schritte (Leistungskurse, Prüfungsfächer, Notenpunkte) ersetzen durch Studiengang, Semester, Module | `pages/Onboarding.tsx`, `state/defaults.ts` |
| Profil | `federalState` immer Hessen, `stage` nur E/Q1–Q4 (Datenbank-Check) | `store.tsx`, `remote.ts`, `Settings.tsx`, Migration init (`stage ... check`) |
| Notizen-Metadaten | `quarter` (Q1–Q4, DB-Check in `lesson_notes`), `teacher` (Kürzel aus Stundenplan), Dateiname aus Datum_Fach_Lehrkraft_Q-Phase | `documents.ts` (`quarterFor`, `pdfFileName`), `Notes.tsx`, `NoteUpload.tsx`, Migration `20261013` |
| "Als Nächstes" und Freistunde | `currentFreeSlot`, `guessSubjectId` erwarten den Lanis-`Timetable` (Raster mit Stundennummern). Für Studierende ein Gegenstück für Terminlücken nötig. | `daily.ts`, `state/daily.ts`, `components/today/NextUpCard.tsx` |
| Plan-Seite | Wochenraster `TimetableGrid` zeigt das Lanis-Raster | `pages/Plan.tsx`, `components/TimetableGrid.tsx` |
| Heute | Karten SchoolDay, AbsencesCard, LanisDateNotice ausblenden; "Nächste Klausur" zu "Nächste Prüfung" | `pages/Today.tsx` |
| KI-Zusammenfassung | Prompt für "Arbeitsblatt der Schulstunde"; Seitenobergrenzen (`ai.maxPagesPerUpload` 40, `pdf.maxPages` 100) für Skripte zu klein; Kostenbudget 5 $ im Monat | `worksheets.ts` (`summaryPrompt`), `config.ts`, Edge Function `summarize-worksheet` |
| Navigation | Bereiche und Reiter je Modus | `nav.ts`, `SectionTabs.tsx`, `PhoneNav.tsx` |

---

## 5. Was schulspezifisch ist und im Studierenden-Modus wegfällt

Ausblenden heißt hier: in der Oberfläche nicht zeigen. Daten und Code bleiben (Schule und Studium sollen sich nicht stören). [Code]

| Bereich | Module / Dateien |
|---|---|
| **Lanis** (Schulportal Hessen) | `lanis.ts`, `lanisPlans.ts`, `pages/LanisImport.tsx`, `lib/lanisAuto.tsx` (`LanisAutoProvider` umschließt die ganze App in `App.tsx`), `lanisApply.ts`, `lanisFiles.ts`, `components/LanisAutoCard.tsx`, `LanisDateNotice.tsx`, Reiter "Lanis" im Bereich Plan, Edge Function `lanis-calendar`, Tabelle `lanis_snapshots`, Felder `exams.external_id`, `lanis_date`, `lanis_notice`, `lanis_ack` |
| **DSBmobile / Vertretungsplan** | `dsbPlan.ts`, `dsbCheck.ts`, `components/DsbCard.tsx`, `SchoolDay.tsx`, Edge Function `dsb-plan` |
| **Fehlstunden** | `absences.ts`, `components/AbsencesCard.tsx` |
| **Hausaufgaben und Arbeitsblätter aus Lanis** | `homework.ts`, `pages/Homework.tsx` (Teil Lanis, Reiter "Arbeitsblätter"), `lanisFiles.ts`. Der Teil "von Hand eintragen" (`homeworkEntry.ts`, `HomeworkComposer.tsx`) ist generisch und bleibt (als "Aufgaben/Abgaben") |
| **Abiturrechner** | `abitur.ts`, `pages/Abitur.tsx`, Tabelle `abitur_plans`, Reiter "Abiturrechner" |
| **Notenpunkte 0 bis 15 / OAVO** | `hessen.ts`, `grades.ts` (Skala, Q1–Q4, Kursnote Klausur/sonstige), `pages/Grades.tsx`, `components/grades/*`, Tabellen `grades`, `grade_settings` (Check `points between 0 and 15`, `quarter in Q1..Q4`), `GradeField.tsx`, `Subject.points` (0–15) |
| **Q-Phasen** | `Stage`, `Quarter`, `QUARTERS` in `documents.ts`, Profil-Feld `stage` |
| **Leistungskurs, Prüfungsfach, Abwählen** | `Subject.isAdvanced`, `isExamSubject`, `status` (`active/drop_q3/dropped`), `effectiveStatus`, Teile von `priorityBreakdown`, `STATUS_LABELS` |
| **Hessen-Klausurenkorrektur und -Übung** | `examGrading.ts` (OAVO-Notenrechnung, Anlagen 9a bis 9c), `examReviews.ts`, `practiceExam.ts` (Aufbau nach Hessen-Fachgruppen, Anforderungsbereiche I–III), `taskStyle.ts`, `weaknesses.ts` (Operatoren, AFB), Seiten `ExamCorrect`, `ExamReviewPage`, `PracticeNew`, `PracticeView`, `RubricPage`, `StylePage`, `Weaknesses`, Edge Functions `correct-exam`, `generate-exam`, `learn-style`, Tabellen `exam_reviews`, `practice_exams`, `subject_rubrics`, `task_styles`. Die Mechanik (KI korrigiert, App rechnet die Note) ließe sich später mit Hochschul-Regeln wiederverwenden, aber nicht mit den Hessen-Regeln. |
| **Konten für Freunde / KI-Kosten** | Nicht schulspezifisch, aber relevant: `accounts` (Freigabe durch Admin), KI-Topf der Freunde (`friendsBudgetUsd` 3 $), `AccountGate`, Admin-Protokoll. Gilt für beide Modi gleich. |

---

## 6. Abgleich: Anforderung gegen Bestand

Status: **vorhanden** / **Anpassung** / **neu**. Aufwand [Einschätzung].

### 6.1 Daten und Logik

| Anforderung | Status | Aufwand | Betroffen (core / DB / UI) |
|---|---|---|---|
| Modus-Schalter (Schule / Studium) | Anpassung (Feld da) | klein | core: neue Hilfe `appMode(profile)` + Test; kein DB-Zwang (`profiles.role` existiert); UI: `Settings.tsx` (Schalter), `state/store.tsx` (Profil), neuer Hook `lib/mode.ts` |
| Begriffe je Modus (Modul/Fach, Prüfung/Klausur) | neu | mittel | core: `terms.ts`; UI: viele Dateien (186 + 126 Zeilen Treffer) |
| Navigation je Modus | Anpassung | klein bis mittel | `nav.ts` (AREAS, RULES, PHONE_BAR), `SectionTabs.tsx`, `PhoneNav.tsx`, `App.tsx` (Routen) |
| Studiengang und Semester (Profil) | neu | klein | DB: Migration (`profiles`: Abschluss, Beginn, Regelsemester, ECTS-Soll; `stage`-Check lockern); core: `studies.ts` |
| **Module** (ECTS, Semester, Pflicht/Wahl, Dozent) | Anpassung von `Subject` | mittel | DB: neue Spalten an `subjects` oder Zusatztabelle `modules` (1:1 zu `subjects`), `points` ist nullable (Migration 20261014), aber Check 0–15; core: `modules.ts`, `types.ts`; UI: `Subjects.tsx`, `SubjectEditor.tsx`, Onboarding |
| Schul- und Studienfächer trennen | neu | mittel | DB: `subjects.scope` oder `archived`; `remote.ts` (Laden filtert), Reducer-Löschlogik |
| **Prüfung**: Art, Versuch, Freiversuch, Anmelde-/Abmeldefrist, benotet, ECTS | Anpassung von `Exam` | mittel | DB: neue Spalten an `exams` (nullable); core: `types.ts`, `examKinds` in `config.ts`; UI: `ExamEditor.tsx`, `ExamCards.tsx` |
| Lernaufwand aus ECTS (Workload) | neu | mittel | core: `studyEffort.ts` (Gesamtstunden = ECTS × Stunden je ECTS minus Veranstaltungszeit, Anteil Prüfungsvorbereitung), Zahlen in `CONFIG.study`; Anbindung an `planExam` über eine Strategie je Modus; Tests |
| Längere Vorläufe, Obergrenze (40 h, ca. 15 Tage) | Anpassung | klein | `CONFIG` mit Modus-Variante; `logic.ts` (`totalHoursAuto`, `leadDaysAuto` bekommen Parameter) |
| Mehrere Prüfungen gleichzeitig verteilen, Engpass melden | vorhanden (Kern), CLAUDE.md nennt "Auto-Plan über mehrere Klausuren, die sich überschneiden" als noch offen | mittel | `schedule.ts` prüfen, Tests mit Klausurenphase (viele Prüfungen in 2 Wochen) |
| Kapazität je Phase (Vorlesungszeit, Prüfungsphase, vorlesungsfrei) | Anpassung | mittel | `schedule.ts` nimmt bereits `overrides` pro Datum; core: `semester.ts` erzeugt Overrides aus Semesterdaten und Veranstaltungen; kein neues Planverfahren nötig |
| Hausarbeit mit Arbeitsschritten | neu | mittel | core: `writingPlan.ts` (Rückwärtsplanung aus Abgabe); Wiederverwendung `planAll` mit Teilblöcken oder eigene Teilaufgaben (Tabelle `tasks`) |
| Studienleistungen/Zulassung (Haken, Frist) | neu | klein | DB: Spalte oder Tabelle `requirements`; UI: Abschnitt im Modul |
| **Noten 1,0–5,0**, ECTS-Gewichtung, Rundungsregel | neu | mittel | core: `uniGrades.ts` (Skala, Schritte, Bestehen, `weightedAverage`, Notenbezeichnung, "Was brauche ich?"); DB: neue Tabelle `module_results` (Modul, Prüfung, Note `numeric(2,1)` oder `null`, bestanden, Versuch, ECTS, Gewicht); `grades` bleibt Schule |
| Studienfortschritt (ECTS erreicht, Soll, Regelstudienzeit) | neu | klein | core in `uniGrades.ts`; UI-Seite "Studium" |
| BAföG- und Rückmeldefristen | neu | klein bis mittel | DB: Tabelle `deadlines` (Titel, Datum, Art, Erinnerung), `pushPlan.ts` erweitern, UI: Liste in Plan |
| Datenbankschutz für neue Tabellen | Muster vorhanden | klein je Tabelle | Migration nach Vorlage `20261030000000_grades.sql` (RLS, `is_active`, Verknüpfungen, Limit-Trigger), Tabelle in `SYNC_TABLES` und `supabase_realtime` |

### 6.2 Stundenplan und Alltag

| Anforderung | Status | Aufwand | Betroffen |
|---|---|---|---|
| Wöchentlicher Stundenplan mit freier Uhrzeit und Typen | neu | mittel | core: Typ `Event` (Wochentag, Start, Ende, Raum, Dozent, Typ, Wochenrhythmus, gültig von/bis); DB: Tabelle `events`; UI: neuer Plan-Reiter |
| .ics-Datei lesen (inkl. wiederkehrender Termine, Zeitzonen, Kodierung, Änderungen/Ausnahmen) | neu | mittel bis groß | core: `ics.ts` (Parser, reine Funktion, viele Tests mit echten Beispieldateien); UI: Upload; Hinweis auf UTF-16 bei TUCaN [Web 9]. Bibliothek erwägen, vorher prüfen, ob sie im Browser läuft. |
| iCal-Link (Abo) | neu | mittel | Edge Function zum Abrufen (Browser-Abruf scheitert vermutlich an CORS [Einschätzung]), Link wie Zugangsdaten schützen, Abruf nur https, Größen- und Zeitlimit, keine privaten Adressen (SSRF-Schutz). Die vorhandene `dsb-plan`-Function darf nur wenige Hosts aufrufen; hier gibt es keine feste Hostliste, also anderes Schutzkonzept. |
| Lücken als Lerngelegenheit und "Als Nächstes" | Anpassung | mittel | `daily.ts` auf eine gemeinsame Schnittstelle (Lücken aus Terminen) bringen |
| Fach aus Termin erraten (Fokus-Vorauswahl) | Anpassung | klein | `guessSubjectId` für Veranstaltungen |
| Nebenjob/Pendeln als gesperrte Zeit | neu | klein | Ereignisart "gesperrt" in `events`, mindert Tageskapazität |
| Tageslimit-Hinweise passend zu Vollzeit-Studium | Anpassung | klein | `CONFIG`, siehe 7.2 |

### 6.3 Material und Lernen

| Anforderung | Status | Aufwand | Betroffen |
|---|---|---|---|
| Skripte/Folien groß (100+ Seiten) ablegen | Anpassung | mittel | `CONFIG.pdf.maxPages`, `ai.maxPagesPerUpload`, Speichergrenzen (max. 1000 PDFs pro Konto laut CLAUDE.md), `NoteUpload.tsx` |
| KI-Zusammenfassung für Skripte | Anpassung | mittel | `summaryPrompt`, Seiten in Kapitel-Päckchen (`chunkPages`, `mergeSummaries` existieren [Code: `worksheets.ts`]), Kostengrenze beachten: Haiku-Preis steigt über 100.000 Eingabetoken (`CONFIG.ai.prices`) |
| Notizen nach Semester statt Q-Phase | Anpassung | klein | Migration (`lesson_notes.term`), `Notes.tsx` Filter |
| Karteikarten mit Bezug zum Prüfungstermin (heute fällig, was vor der Prüfung noch fehlt) | Anpassung | mittel | `cards.ts` (neue Auswahl), optional |
| Übungsfragen/Altklausuren pro Modul | neu | mittel | Datei-Ablage am Modul; KI-Teil optional |
| Lerngruppen | neu | – | nicht empfohlen im MVP |
| Zitieren/Literatur | – | – | extern (Zotero/Citavi), nur Verweis [Web 36] |

---

## 7. Vorschlag für Aufbau und Ausbaustufen

### 7.1 Wie man den Modus einschaltet

**Empfehlung [Einschätzung]:**

1. **Quelle der Wahrheit ist `profile.role`.** `'student_school'` bedeutet Schule (Standard), `'student_university'` Studium. Das Feld, die Typen und den Datenbank-Check gibt es schon [Code]. Eine reine Funktion `appMode(profile): 'school' | 'university'` in `packages/core` (mit Test) liefert den Modus, ein Hook `useMode()` in der Web-App gibt ihn an die UI weiter. Kein Migrationszwang für den Schalter selbst.
2. **Einschalten:** im Onboarding (Schritt "Wer bist du?" gibt es schon) und **zusätzlich in Einstellungen → Profil** (heute gibt es dort keine Möglichkeit, die Rolle zu ändern [Code: `Settings.tsx`]). Ein Satz erklärt: "Deine Schul-Daten bleiben erhalten."
3. **Parallel oder Wechsel?** Beide Varianten sind möglich (Frage in Abschnitt 8). Empfehlung: Daten tragen eine Markierung (`scope = 'school' | 'uni'`), die App zeigt immer nur einen Modus. Damit der restliche Code unverändert bleibt, filtert man **an der Datengrenze** (`state/remote.ts`, beim Laden): Fächer des anderen Modus werden gar nicht erst in `state.subjects` geladen, und Prüfungen, Sitzungen, Aufgaben, Notizen, Karten zu diesen Fächern ebenfalls. Risiko: Schreibpfade (`persist`) und das "alles löschen" müssen das mitdenken, das braucht Tests [Einschätzung].
4. **Nicht aufteilen** in zwei Apps oder zwei Codebasen. Der Kern (Timer, Notizen, Karten) bleibt eins.

### 7.2 Navigation im Studierenden-Modus

Sichtbar gemacht über Konfiguration in `nav.ts` (eine Liste pro Modus; `locate()` bekommt Regeln für neue Adressen).

| Bereich (Mac/iPad) | Reiter im Studierenden-Modus | Anmerkung |
|---|---|---|
| Heute | – | Karten "Als Nächstes", Lernzeit, Aufgaben, Karten fällig, Konzentration. Schul-Karten weg, neu: "Heute im Hörsaal" (Veranstaltungen) und Fristen. |
| Fokus | – | Unverändert. |
| Plan | Plan, Semester (neu: Vorlesungszeit, Prüfungsphase), Stundenplan (neu), Rückblick | Reiter "Lanis" weg. |
| Aufgaben (heute "Hausaufgaben") | Aufgaben/Abgaben | Reiter "Arbeitsblätter" (Lanis) weg. |
| Notizen | Notizen, Karteikarten (+ später Material/Skripte) | Notizen nach Modul und Semester. |
| Prüfungen (heute "Klausuren") | Termine (mit Art, Versuch, Frist) | Korrekturen/Übung/Schwächen aus (Hessen-spezifisch), eventuell später Übungsfragen. |
| Studium (heute "Noten") | Module, Noten, Fortschritt | Reiter "Abiturrechner" weg. |
| Einstellungen | wie bisher; Lanis- und DSB-Karte aus | |

Handy-Leiste: wie bisher vier Einträge plus "Mehr" [Code: `PHONE_BAR`]. Für Studierende vermutlich Heute, Fokus, Plan, Notizen [Einschätzung], weil Hausaufgaben nicht der Alltag sind.

**Kapazität und Limit:** Ein Vollzeit-Semester mit 30 ECTS sind grob 750 bis 900 Arbeitsstunden (30 ECTS × 25 bis 30 h, Rechnung aus [Web 1, 2]), verteilt auf etwa 15 Wochen Vorlesungszeit plus Prüfungszeit. Das ist deutlich mehr als die 180 Minuten "echte Lernzeit" pro Tag, mit denen die App Warnungen auslöst (`plan.defaultDailyLimitMin`, Konzentrations-Obergrenze 3 bis 4 h laut Spezifikation). Die Warnungen sind Hinweise und blockieren nichts [Code], würden aber ständig erscheinen. Vorschlag [Einschätzung]: Veranstaltungszeit (SWS) gar nicht auf das Limit anrechnen, dafür Limit und freie Tage in vorlesungsfreier Zeit anheben, und im Text klar machen, dass "konzentrierte Lernzeit" nicht dasselbe ist wie die ganze Wochenarbeitszeit.

**Rechenbeispiel Workload** (nur Illustration, aus [Web 1, 2, 23]): Ein Modul mit 6 ECTS entspricht etwa 150 bis 180 Stunden. Eine Vorlesung mit 2 SWS hat bei 15 Wochen etwa 22,5 Stunden Anwesenheit (2 × 0,75 h × 15), eine Übung mit 2 SWS nochmals so viel. Der Rest (grob 100 bis 130 Stunden) ist Vor-/Nachbereitung und Prüfungsvorbereitung. Welcher Anteil auf die Prüfungsvorbereitung fällt, ist nicht belegt [Einschätzung] und gehört als Startwert in `CONFIG`, wie die Spezifikation es für alle Zahlen vorgibt.

### 7.3 Ausbaustufen

Alle Stufen halten die Konventionen aus CLAUDE.md ein: Logik nur in `packages/core` als reine Funktionen mit Tests, Zahlen nur in `config.ts`, UI deutsch, Bezeichner englisch, neue Felder mit Migration, neue Tabellen in `SYNC_TABLES`, Hinweise blockieren nichts. Nach Änderungen an gemeinsam genutzten Dateien `npm run sync:shared`. Neuer Eintrag oben in `releaseNotes.ts` pro Release.

**Stufe 0: Vorbereitung (klein)**
- `appMode`, `useMode`, Schalter in Einstellungen, Onboarding-Zweig für Studierende anlegen (leer, nur Modus).
- Begriffstabelle `terms.ts` und Nutzung an wenigen zentralen Stellen (Navigation, Heute, Prüfungsseite).
- Navigation je Modus, Schul-Karten und -Routen bei Studium ausgeblendet.
- **Prüfpunkt:** Timer, Notizen, Karten, Aufgaben laufen im Studierenden-Modus ohne Funktionsverlust.

**Stufe 1: MVP "Module, Prüfungen, Noten, Plan aus ECTS" (mittel bis groß)**
1. Studiengang und Semester im Profil (Migration).
2. Module (ECTS, Semester, Pflicht/Wahl, Dozent/in) und Onboarding-Zweig "Module".
3. Prüfungen mit Art, Versuch, Freiversuch, Anmelde- und Abmeldefrist (Migration auf `exams`), Anzeige in `ExamCards`.
4. Lernzeit aus ECTS (`studyEffort.ts`, Test), Prüfungsplan mit längerem Vorlauf; Plan über mehrere Prüfungen bleibt `planAll`.
5. Noten 1,0 bis 5,0 (`uniGrades.ts`, Tabelle `module_results`), Gesamtschnitt nach ECTS, Studienfortschritt, "Was brauche ich?".
6. Fristenliste (Rückmeldung, BAföG, Anmeldung) mit Erinnerung über die vorhandene Push-Technik.
- **Ergebnis:** Jemand kann sein Semester anlegen, sieht seine Prüfungen und Fristen, bekommt einen realistischen Lernplan und verfolgt ECTS und Schnitt, ohne dass er den Stundenplan eintippen muss.

**Stufe 2: Stundenplan und Alltag (mittel bis groß)**
- Veranstaltungen von Hand (Wochentag, Zeit, Raum, Typ, Dozent).
- .ics-Datei-Import (Parser in core, viele Testdateien, Kodierung UTF-8/UTF-16, wiederkehrende Termine, Zeitzonen).
- Lücken als Lerngelegenheit, "Als Nächstes" und Fach-Vorauswahl aus Terminen, Kapazität pro Tag aus Veranstaltungen.
- Gesperrte Zeiten (Job, Pendeln), Ausfall einzelner Termine.

**Stufe 3: Material und Arbeitsweise (mittel)**
- Skripte/Folien mit größeren Seitengrenzen, Zusammenfassung in Päckchen und Kostenkontrolle.
- Notizen/Karten nach Semester und Modul, Karten bis zum Prüfungstermin planen.
- Hausarbeit mit Arbeitsschritten (Rückwärtsplanung), Literaturfeld, Verweis auf Zotero.
- Notenziel und Prognose.

**Stufe 4: Komfort (optional, später)**
- iCal-Abo über eine Edge Function mit SSRF-Schutz.
- Notenspiegel-Import aus PDF (Texterkennung ist fehleranfällig, Einschätzung).
- Übungsfragen aus Skripten (Wiederverwendung der KI-Karten).
- Anki-Import.
- Lerngruppen nur als Etikett, kein Mehrbenutzer.

**Bewusst nicht**: Zugriff auf Portale mit Zugangsdaten, Prüfungsanmeldung durch die App, Mensa-Plan.

---

## 8. Offene Fragen und Annahmen

### 8.1 Fragen an den Auftraggeber

1. **Wer nutzt den Modus?** Nur du (Admin-Konto), oder auch andere Studierende? Das entscheidet über Freigabe der Konten und das KI-Budget (Freunde teilen einen Topf von 3 $, du hast 5 $ im Monat [Code: `CONFIG.access`, `CONFIG.ai`]).
2. **Schule und Studium parallel, oder Wechsel nach dem Abitur?** Daran hängt, ob Daten getrennt gehalten werden müssen (`scope`) oder ob ein sauberer Wechsel mit "Schulfächer archivieren" reicht.
3. **Welche Hochschule, welcher Studiengang, welches Fachsemester?** Beeinflusst Semesterzeiten, Notenregeln (Rundung, Gewichtung), Versuche und Fristen. Staatsexamens-Studiengänge (zum Beispiel Medizin, Jura) funktionieren anders als Bachelor/Master mit ECTS [Einschätzung].
4. **Welches System hat die Hochschule?** (Stud.IP, Moodle, ILIAS, HISinOne, TUCaN, QIS ...) und kann es den Stundenplan als .ics exportieren? Ich habe keine Information gefunden, welche hessischen Hochschulen welches System nutzen, bis auf TU Darmstadt mit TUCaN [Web 9].
5. **Wie wichtig ist Stundenplan-Import gegenüber Handeingabe?** (Entscheidet, ob Stufe 2 vor die Noten rückt.)
6. **Sollen Karteikarten- und Notiz-KI auch für Skripte laufen?** Und wie hoch darf das Budget werden?
7. **Brauchst du BAföG-Hilfen?** (Fristen im Bescheid, Leistungsnachweis.)
8. **Sprache und Beschriftung:** "Modul" und "Prüfung" okay, oder lieber "Kurs"/"Klausur"?
9. **Lanis weiter parallel nötig?** (Falls du die Schulphase noch laufen hast, bleibt `LanisAutoProvider` aktiv, solange Zugangsdaten gespeichert sind.)

### 8.2 Annahmen

- Bachelor/Master an einer deutschen Hochschule mit Modulen und ECTS; Studienstart im Wintersemester möglich; Hessen als Beispielland.
- Die App bleibt eine einzige Web-App mit Supabase; ein Studierenden-Modus ist ein Zweig, kein Neubau.
- Nutzer pflegt Semesterdaten, Prüfungsregeln und Fristen von Hand. Die App erinnert, prüft aber nichts, was nur die Hochschule weiß.
- Kein Zugriff auf Uni-Portale.
- Aufwandsangaben sind Schätzungen eines Entwicklers, der die Codebasis kennt.
- Regeln zu Notenrundung, Versuchen, Freiversuch und Fristen sind **Beispiele einzelner Hochschulen**, nicht allgemeingültig. Sie gehören in `CONFIG` und lassen sich pro Studiengang überschreiben ("Manuelle Werte überschreiben automatische", Konvention aus CLAUDE.md).

### 8.3 Lücken der Recherche

- Keine Primärquelle gelesen zu **Hessischen Hochschulgesetzen** und den **Prüfungsordnungen** konkreter Hessen-Hochschulen; nur Auszüge aus Suchtreffern. Für Versuchszahlen, Freiversuch und Fristen immer die eigene PO prüfen.
- BAföG: Angaben stammen aus einer Ratgeber-Seite [Web 27]; Förderungshöchstdauer und aktuelle Beträge nicht geprüft. Für verbindliche Aussagen BAföG-Amt oder Studentenwerk.
- Feature-Umfang von Studo, iStudiez, Power Planner, Smart Diary stammt aus Store-Beschreibungen (Herstellerangaben) [Web 14, 33]. Notion-Vorlagen und Forest habe ich nur über Anbieterseiten gesehen, nicht ausprobiert [Web 34, 35]. Todoist wurde nicht gesondert recherchiert.
- Das Verhalten von iCal-Exporten (Wiederholungsregeln, Zeitzonen, Kodierung) ist nur an wenigen Beispielen belegt; vor dem Bau mit echten Dateien der Zielhochschule testen.
- Die Annahme, dass ein Browser-Abruf von iCal-Links an CORS scheitert, ist nicht geprüft [Einschätzung].

---

## 9. Quellen

Abgerufen über Websuche am 29.10.2026. Es sind überwiegend Auszüge aus Trefferlisten, keine vollständig gelesenen Seiten.

1. Uni Marburg, ECTS-Infos: https://www.uni-marburg.de/de/fb04/studium/informationen/ects-infos
2. Uni Marburg, Glossar ECTS: https://www.uni-marburg.de/de/fb12/studium/module-veranstaltungen/glossar-ects
3. Profiling-Institut, Bologna-Reform (Bachelor 180 bis 240, Master 60 bis 120 LP): https://www.profiling-institut.de/?p=25477
4. uni-assist, Glossar ECTS: https://www.uni-assist.de/tools/glossar/erklaerung/begriff/ects/
5. BayAPO 38 (Vergabe von Leistungspunkten): https://www.gesetze-bayern.de/Content/Document/BayAPO-38
6. Uni Göttingen, Stud.IP für Studierende (iCal-Export): https://uni-goettingen.de/de/127902.html
7. Uni Konstanz, ZEuS iCal Export: https://en.zeus-wiki.uni-konstanz.de/wiki/ZEuS_iCal_Export
8. Uni Mannheim, Portal2 Stundenplan (iCal-Abo): https://www.uni-mannheim.de/it/anleitungen/portal2/studierende/stundenplan/
9. TU Darmstadt, TUCaN Stundenplan/Kalender ex- und importieren (UTF-16, pro Woche/Monat): https://www.tu-darmstadt.de/studieren/studierende_tu/studienorganisation_und_tucan/hilfe_und_faq/artikel_details_de_en_17152.de.jsp
10. Uni Bamberg, Prüfungsordnung (gewichteter Schnitt, Notenbezeichnungen, Streichen statt Runden): https://www.uni-bamberg.de/fileadmin/abt-studium/amtliche-veroeffentlichungen/2007/2007-72.pdf
11. Uni Erfurt, Noten & Leistungen: https://www.uni-erfurt.de/to/JoGgxb2MBgWbvawC
12. Uni Saarland, Notengebung: https://www.uni-saarland.de/fileadmin/upload/archiv/qms_15.3.23/notengebung.pdf
13. Uni Lübeck, Grading scheme: https://www.uni-luebeck.de/fileadmin/uzl_international/dokumente/aus_dem_Ausland/Austauschstudenten/grading_scheme_MINT_2011-13.pdf
14. Studo, App Store und Hersteller: https://apps.apple.com/de/app/studo-die-app-f%C3%BCr-dein-studium/id1095630119 und https://studo.com/en/students/studo-app
16. Uni Tübingen, Studien- und Prüfungsleistungen: https://uni-tuebingen.de/en/253514
17. Uni Potsdam, Prüfungs-FAQ: https://www.uni-potsdam.de/fileadmin/projects/e-assessment/Dokumente/PruefungsFAQs.pdf
18. Uni Köln, Studien- versus Prüfungsleistungen: https://neuere-geschichte.phil-fak.uni-koeln.de/fileadmin/home/Abteilungen/Neuere_Geschichte/Mitarbeiter/Prof_Gersmann/Studien-_versus_Pruefungsleistungen.pdf
19. Uni Rostock, Infoschreiben Freiversuch: https://www.chemie.uni-rostock.de/storages/uni-rostock/Alle_MNF/Chemie/Studium_Lehre/Freiversuch/Infoschreiben_Freiversuch_01.pdf
20. FU Berlin, Bestehen, Nichtbestehen, Freiversuch: https://www.jura.fu-berlin.de/studium/rewi24/sp-orga/02_schwerpunkt/101_Bestehen_Nichtbest_Freivers.html
21. Uni Jena, Verkündungsblatt 05/2018 (Freiversuch, Frist 15. Werktag): https://uni-jena.de/unijenamedia/28615/vkb-05-2018-s-258.pdf
22. HHU Düsseldorf, Prüfungsordnung (Freiversuch, Notenverbesserung): https://e-pflicht.ub.uni-duesseldorf.de/download/pdf/237402
23. Semesterwochenstunde (SWS): Uni Hohenheim https://uni-hohenheim.de/begriff-sws , FAU https://www.fau.eu/glossary/semester-hours/ , FernUni Hagen https://www.fernuni-hagen.de/studium/studienorganisation/sws.shtml
24. PH Heidelberg, Glossar wichtiger Studienbegriffe: https://www.ph-heidelberg.de/beta/infos-zum-studium/glossar-wichtiger-studienbegriffe
25. Moodle-Dokumentation, Kalender nutzen (Export-URL): https://docs.moodle.org/37/de/Kalender_nutzen
26. Dunlosky u. a. 2013, Zusammenfassung der APS: https://www.psychologicalscience.org/news/releases/which-study-strategies-make-the-grade.html
27. studierenplus.de, BAföG-Leistungsnachweis: https://www.studierenplus.de/bafoeg/bafoeg-leistungsnachweis
29. Semesterzeiten: Uni Gießen https://www.uni-giessen.de/de/studium/semesterzeiten , Goethe-Uni Frankfurt https://www.uni-frankfurt.de/semestertermine
30. Anki-FAQ, Algorithmus (SM-2, FSRS): https://docs.ankiweb.net/faqs/what-spaced-repetition-algorithm
31. Weitergabe von Zugangsdaten: Viadrina https://www.ikmz.europa-uni.de/en/it-dienste/studierendenkonto/index.html , UDE https://www.uni-due.de/apps/rss.php?db=zim&id=1815
32. Lernen und Aufschieben: Freudinger 2023 https://www.wbv.de/shop/openaccess-download/HSL2319W , HS Flensburg https://hs-flensburg.de/sites/default/files/pdf/2022/Pr%C3%BCfungsphase_LSZ.pdf , Hessisches Kultusministerium https://kultus.hessen.de/sites/kultus.hessen.de/files/2025-11/zielgerichtert_fuer_pruefungen_lernen_2025-26.pdf
33. Student-Planner-Apps: Power Planner https://apps.apple.com/app/id1278178608 , iStudiez Pro https://eastersealstech.com/2024/09/24/istudiez-pro-helps-students-plan-study-and-track-grades , Smart Diary https://apps.apple.com/us/app/smart-diary-student-planner/id1063078386
34. Notion-Vorlagen für Studierende: https://www.allesgelingt.de/p/notion-for-students-bq69r ; Notenübersicht-Formular Uni Bremen: https://www.uni-bremen.de/fileadmin/user_upload/fachbereiche/fb2/fb2/Verwaltung/Formulare/MSC-Chemie/4.Noten_UEbersicht_Masterstudium.pdf
35. Forest: https://www.appgefahren.de/forest-baeume-pflanzen-fuer-mehr-konzentration-132139.html
36. Literaturverwaltung: Uni Kassel https://www.uni-kassel.de/ub/literaturverwaltung.html
37. HISinOne-Stundenplan und Prüfungsanmeldung: PH Freiburg https://wiki.ph-freiburg.de/!hisinone/_media/stundenplan.pdf , UDE https://www.uni-due.de/zim/services/studiumsverwaltung.php

(Die Nummer 15 ist bewusst nicht vergeben.)

**Belegte Codestellen (Auswahl):** `packages/core/src/types.ts` (Role, Stage, Subject, Exam), `packages/core/src/config.ts` (alle Zahlen), `logic.ts` (`planExam`, `priorityBreakdown`), `schedule.ts` (`planAll`, `overrides`), `grades.ts`, `abitur.ts`, `hessen.ts`, `daily.ts`, `lanisPlans.ts`, `documents.ts`, `apps/web/src/nav.ts`, `App.tsx`, `pages/Onboarding.tsx`, `pages/Settings.tsx`, `pages/Today.tsx`, `state/store.tsx`, `state/remote.ts`, `supabase/migrations/20261006000000_init.sql`, `20261013000000_documents.sql`, `20261030000000_grades.sql`.
