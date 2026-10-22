# Lanis-Test

Prüft lokal, ob sich bei deiner Schule der Kalender aus Lanis lesen lässt und wie Klausuren darin aussehen.

1. `cp secrets.example.json secrets.json` und in `secrets.json` Benutzername, Passwort und Schulnummer eintragen.
2. `node lanis-test.mjs`
3. Die Ausgabe zeigt Felder und mögliche Klausuren. Die Rohdaten stehen in `lanis-output.json`.

`secrets.json` und `lanis-output.json` sind von Git ausgeschlossen. Das Passwort wird nur an
login.schulportal.hessen.de geschickt. Das Skript macht nur lesende Abfragen und meldet sich am Ende ab.

## Hausaufgaben und Anhänge prüfen

`node lanis-homework-probe.mjs [Anzahl Kurse]` liest "Mein Unterricht" (Übersicht und je Kurs die Kursseite) und legt die Rohseiten
in `mu/` ab (von Git ausgeschlossen, enthält deine Kurse, Lehrkräfte und Hausaufgaben). Nur lesen, am Ende wird abgemeldet.

## Stundenplan und Vertretungsplan prüfen

`node lanis-probe.mjs` liest dieselbe Anmeldung wie oben, ruft aber Stundenplan und Vertretungsplan ab und zeigt
deren Struktur. Die Rohdaten (`lanis-timetable.html`, `lanis-vplan-page.html`, `lanis-vplan.json`) enthalten deine Fächer,
Lehrkräfte und Räume und sind von Git ausgeschlossen.
