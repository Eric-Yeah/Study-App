/**
 * Release Notes. Der oberste Eintrag ist die aktuelle Version (siehe vite.config.ts: __APP_VERSION__ und version.json).
 * Bei JEDEM Release: neuen Eintrag oben ergänzen, Format der Version JJJJ.MM.TT.N.
 * Wer die App danach öffnet, sieht die Neuigkeiten einmal; offene Apps holen die neue Version von selbst.
 */
export interface ReleaseNote {
  version: string;
  date: string;
  // only: nur für den Admin oder für Konten mit dieser KI-Funktion (sonst für alle)
  items: { icon: string; title: string; text: string; only?: 'admin' | 'summarize' | 'cards' | 'correct' | 'practice' | 'topics' | 'style' }[];
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '2026.10.22.6',
    date: '22. Oktober 2026',
    items: [
      { icon: '🔎', title: 'DSBmobile: genauere Fehlersuche', text: 'Unter Einstellungen → Vertretungsplan (DSBmobile) zeigt die App jetzt auch, was DSBmobile angeboten hat und was davon geladen wurde. Der kopierte Ausschnitt enthält diese Liste und den Anfang jeder Seite.' },
    ],
  },
  {
    version: '2026.10.22.5',
    date: '22. Oktober 2026',
    items: [
      { icon: '📋', title: 'Vertretungsplan: Entfall wird erkannt', text: 'Der Plan deiner Schule ist nach Klassen gruppiert („Q1“ als Zwischenzeile, alte Werte durchgestrichen). Die App liest das jetzt: „Eigenverantwortliches Arbeiten“ in deiner Geschichtsstunde erscheint auf Heute als Entfall. Auch Kurscodes wie „Q1INFO_LK01“ werden dem Fach zugeordnet.' },
    ],
  },
  {
    version: '2026.10.22.4',
    date: '22. Oktober 2026',
    items: [
      { icon: '🔎', title: 'DSBmobile: Was wurde gelesen?', text: 'Unter Einstellungen → Vertretungsplan (DSBmobile) siehst du jetzt nach jedem Abruf, wie viele Einträge im Plan deiner Schule standen und wie viele davon zu dir passen (und warum der Rest nicht). Passt etwas nicht, kannst du den Plan-Ausschnitt kopieren.' },
    ],
  },
  {
    version: '2026.10.22.3',
    date: '22. Oktober 2026',
    items: [
      { icon: '🔔', title: 'Ton am Ende des Timers', text: 'Auf Wunsch erklingt ein kurzer Ton, wenn eine Fokus- oder Pausenphase abläuft. Er ist standardmäßig aus. Beim ersten Fokus-Start eines Tages fragt dich die App, ob er ertönen soll; in Einstellungen → Timer-Ton kannst du ihn jederzeit ein- und ausschalten und testen. Die Einstellung gilt für das jeweilige Gerät.' },
    ],
  },
  {
    version: '2026.10.22.2',
    date: '22. Oktober 2026',
    items: [
      { icon: '🩺', title: 'Fehlstunden aus Lanis', text: 'Die App liest jetzt auch deine eingetragenen Fehlstunden aus Lanis („Mein Unterricht“, Anwesenheit). Sobald irgendwo eine Fehlzeit steht, erscheint auf Heute die Karte „Fehlstunden“ mit der Summe und den Kursen, in denen du gefehlt hast. Sind Stunden noch unentschuldigt, weist die App darauf hin. Die Zahlen führt die Schule, die App zeigt sie nur an. Sie werden mit dem Stundenplan aktualisiert (etwa alle 12 Stunden).' },
      { icon: '📋', title: 'Vertretungsplan aus DSBmobile', text: 'Steht der Vertretungsplan deiner Schule in der App „DSBmobile“ statt in Lanis? Unter Einstellungen → Vertretungsplan (DSBmobile) gibst du die Zugangsdaten der Schule ein. Die App holt dann den Plan der ganzen Schule und zeigt dir auf Heute nur, was deine Stufe und deine Stunden betrifft. Das Passwort bleibt verschlüsselt nur auf deinem Gerät. Du brauchst dafür deinen Stundenplan aus Lanis.' },
    ],
  },
  {
    version: '2026.10.22.1',
    date: '22. Oktober 2026',
    items: [
      { icon: '✅', title: 'Zuverlässigere KI-Antworten', text: 'Zusammenfassungen, Korrekturen, Themenvorschläge und der Aufgabenstil kommen jetzt immer in der richtigen Form an. Die Meldung „Die Antwort der KI konnte nicht gelesen werden“ sollte damit kaum noch vorkommen.' },
      { icon: '📄', title: 'Kleinere PDFs', text: 'Fotos in deinen Notiz-PDFs werden etwas kleiner gespeichert. Sie bleiben gut lesbar und brauchen weniger Speicher.' },
      { icon: '💸', title: 'Kostengrenze genauer, Speicher geschont', text: 'Die Sicherung vor jeder KI-Anfrage rechnet Bilder jetzt nach ihren echten Maßen (A4 mit 1600 px etwa 2.400 statt pauschal 3.400 Token) und bleibt trotzdem immer eine Obergrenze: Unlesbare oder sehr große Bilder zählen mit dem Höchstwert des Modells (4.784 Token), Haiku über 100.000 Token mit dem höheren Preis. Strukturierte Ausgabe spart bezahlte Fehlversuche. Erinnerungen laufen im Minutentakt statt alle 10 Sekunden, das Cron-Protokoll wird täglich aufgeräumt (sonst bis zu 250 MB Datenbank im Monat). PDF-Fotos mit 1600 px und Qualität 0,75 sparen etwa ein Drittel Speicher.', only: 'admin' },
    ],
  },
  {
    version: '2026.10.21.5',
    date: '21. Oktober 2026',
    items: [
      { icon: '▶️', title: 'Heute sagt dir, was jetzt dran ist', text: 'Ganz oben auf Heute steht „Als Nächstes“: das Fach aus deinem Tagesplan, in einer Freistunde passend gekürzt. Ein Tipp startet den Timer, ohne Fach und Länge auszuwählen. Ist der Plan geschafft, kommen offene Aufgaben, dann fällige Karten. Jeder geplante Block lässt sich ebenfalls direkt starten.' },
      { icon: '➕', title: 'Schnell hinzufügen', text: 'Der runde Plus-Knopf (am Mac auch die Taste N) legt in Sekunden eine Aufgabe, eine Karteikarte oder nachgetragene Lernzeit an. Das Fach ist aus deinem Stundenplan vorgewählt, das Fenster bleibt offen für die nächste Karte. Von dort geht es auch direkt zum Blatt-Hochladen.' },
      { icon: '🃏', title: 'Karten in Häppchen', text: 'Heute zeigt, wie viele Karten fällig sind, und „5 Karten jetzt“ startet eine kurze Runde, danach geht es mit „Noch …“ weiter oder zurück. Kartenrunden zählen jetzt als Lernzeit für Tagesziel, Plan und Serie.' },
      { icon: '🔥', title: 'Serie ohne Druck', text: 'Die Woche als Punkte und die Zahl der Lerntage in Folge stehen bei der Lernzeit. Ein freier Tag bricht die Serie nicht, lernfreie Wochentage und Ausfalltage zählen gar nicht. Ab 10 Minuten zählt ein Tag.' },
      { icon: '⏱️', title: 'Timer immer im Blick', text: 'Läuft der Timer, zeigt eine Leiste oben auf jeder Seite Fach und Restzeit, im Browser-Tab steht die Zeit im Titel. Auf der Fokus-Seite ist das Fach vorgewählt, und die Länge der Runde (15, 25, 45, 60 Minuten) stellst du mit einem Tipp ein.' },
      { icon: '🔔', title: 'Erinnerungen leichter einschalten', text: 'Auf Heute fragt ein Hinweis einmal, ob du den Tagesplan morgens aufs Handy willst, mit einem Tipp eingeschaltet. Die Morgenmitteilung nennt jetzt auch die fälligen Karten und kommt an Tagen ohne Lernblock, wenn Karten warten.' },
      { icon: '🧹', title: 'Kürzere Heute-Seite', text: 'Der Check-in zeigt nur noch die Energie (ein Tipp), Schlaf und Training klappst du bei Bedarf auf. Offene Aufgaben von früher bleiben auf Heute sichtbar, statt unbemerkt zu verschwinden.' },
    ],
  },
  {
    version: '2026.10.21.4',
    date: '21. Oktober 2026',
    items: [
      { icon: '🎨', title: 'Neues Design: klarer und ruhiger', text: 'Eingabefelder, Knöpfe und Auswahl-Chips haben jetzt deutlichere Rahmen und sind besser zu erkennen. Die Farben sind etwas klarer, die Ecken etwas straffer und die Schatten ruhiger, in Hell und Dunkel.' },
      { icon: '🔎', title: 'Kleine Schrift besser lesbar', text: 'Die kleinsten Beschriftungen in Plan, Stundenplan und Tags sind jetzt 12 statt 10 oder 11 Pixel groß.' },
    ],
  },
  {
    version: '2026.10.21.3',
    date: '21. Oktober 2026',
    items: [
      { icon: '🧭', title: 'Neu sortiert: alles auf einen Blick', text: 'Die untere Leiste hat jetzt sechs Bereiche: Heute, Fokus, Plan, Notizen, Klausuren und Noten. Die Einstellungen findest du am Handy oben rechts als Zahnrad, am Tablet und Mac unten in der Seitenleiste.' },
      { icon: '🗂️', title: 'Reiter in jedem Bereich', text: 'Plan, Rückblick und Lanis sind Reiter im Bereich Plan. Notizen und Karteikarten gehören zusammen, ebenso Noten, Abiturrechner und Fächer. Der Bereich in der Leiste bleibt aktiv, auch wenn du eine Unterseite wie eine Korrektur offen hast.' },
      { icon: '📋', title: 'Klausuren als eigener Bereich', text: 'Termine mit Lernfortschritt, Korrekturen mit den Korrekturmustern, Übungsklausuren mit dem Aufgabenstil und die Schwächen-Auswertung haben jetzt einen eigenen Platz. Im Plan führt eine Karte zu den Klausuren. Alte Links funktionieren weiter.' },
    ],
  },
  {
    version: '2026.10.21.2',
    date: '21. Oktober 2026',
    items: [
      { icon: '📝', title: 'Noten: mehr als die Halbjahresnote', text: 'Unter Fächer → Noten trägst du jetzt jede einzelne Note ein: Klausuren, mündliche Mitarbeit, Tests, Referate, Hausaufgaben und Projekte, mit Datum, Punkten und Gewicht. Daraus berechnet die App deine Kursnote je Halbjahr (Q1 bis Q4).' },
      { icon: '⚖️', title: 'Klausuren und Mündliches gewichten', text: 'Wie Klausuren und sonstige Leistungen zählen, entscheidet deine Lehrkraft. Stell das Verhältnis pro Fach ein (Standard 50 : 50). Gibt es nur eine Gruppe, zählt allein sie.' },
      { icon: '🎯', title: 'Was brauche ich?', text: 'Wähle eine Zielnote für den Kurs, die App sagt dir, wie viele Punkte du in der nächsten Klausur oder mündlichen Leistung mindestens brauchst. Dazu Trend, Schnitt und ein Hinweis bei Kursen unter 5 Punkten.' },
      { icon: '🎓', title: 'Weiter in den Abiturrechner', text: 'Ein Tipp übernimmt deine Kursnoten in den Abiturrechner. Vergangene Klausuren aus dem Plan ohne Note erinnern dich ans Eintragen, Noten deiner Lehrkraft aus der Klausurenkorrektur übernimmst du mit einem Tipp, und den Notenstand eines Fachs kannst du aus den Einzelnoten übernehmen.' },
    ],
  },
  {
    version: '2026.10.21.1',
    date: '21. Oktober 2026',
    items: [
      { icon: '📄', title: 'Gescannte PDFs auch in älteren Browsern', text: 'Gescannte PDFs lassen sich auch in älteren Browsern hochladen und zusammenfassen. Fotos werden ebenfalls auf älteren Geräten richtig gedreht und verkleinert.' },
      { icon: '⏱️', title: 'Fokus-Zeit geht nicht mehr verloren', text: 'Läuft der Timer auf einem Gerät im Hintergrund weiter, wird die gelernte Zeit jetzt trotzdem gespeichert, auch wenn ein anderes Gerät das Ende der Phase bemerkt.' },
      { icon: '🔢', title: 'Karten: Zahlen genau prüfen', text: 'Beim Schreiben gilt 1,5 nicht mehr als 15, und eine falsche Ziffer (13,5 statt 12,5) zählt nicht mehr als Tippfehler. Punkt und Komma gelten gleich.' },
      { icon: '👆', title: 'Besser auf dem Handy', text: 'Die Leiste unten schneidet „Einstellungen“ nicht mehr ab, die Schritte beim Blatt-Hochladen laufen nicht mehr über den Rand, und kleine Knöpfe (Aufgaben abhaken, Plan anpassen, Wochen aufklappen) sind leichter zu treffen. Deaktivierte Knöpfe sehen jetzt auch deaktiviert aus. Auf dem iPad schob ein aufgeklapptes Fach die Seite „Fächer“ seitlich auseinander, das ist behoben.' },
      { icon: '🔑', title: 'Anmelden', text: 'Beim Anmelden verlangt das Passwortfeld keine Mindestlänge mehr, nur noch beim Erstellen eines Kontos.' },
      { icon: '🔍', title: 'Besser lesbar', text: 'Graue Hinweistexte haben im hellen und dunklen Design mehr Kontrast.' },
      { icon: '🛟', title: 'Weniger Datenverlust', text: 'Der Abiturrechner speichert die letzte Eingabe auch, wenn du die Seite sofort verlässt. Beim Hochladen und in der Lernrunde lädt sich die App nicht mehr von selbst neu. Ein leeres Datum im Klausur-Editor macht den Plan nicht mehr kaputt. „PDF ansehen“ lädt die Datei nicht mehr zusätzlich herunter.' },
    ],
  },
  {
    version: '2026.10.11.1',
    date: '11. Oktober 2026',
    items: [
      { icon: '🧹', title: 'Weniger Speicher', text: 'Die Bilder eines Arbeitsblatts löscht die App nach dem Lesen von selbst, wenn alles gut lesbar war. Zusammenfassung und PDF bleiben. Bleibt etwas „unsicher“, bleiben die Bilder für „Genauer lesen“ erhalten. Ältere Bilder räumst du unter Einstellungen → Speicher auf.' },
      { icon: '💸', title: 'Schwer lesbare Blätter kosten weniger', text: 'Ein „unsicher“ gelesenes Blatt wird nicht mehr automatisch mit dem teuren Modell wiederholt. Du entscheidest mit „Genauer lesen“.', only: 'admin' },
    ],
  },
  {
    version: '2026.10.10.6',
    date: '10. Oktober 2026',
    items: [
      { icon: '👥', title: 'Die App für Freunde', text: 'Freunde können sich jetzt registrieren. Neue Konten warten, bis du sie im Admin-Protokoll unter „Konten“ freigibst. KI-Funktionen sind für Freunde gesperrt und unsichtbar, bis du sie pro Konto und pro Funktion einschaltest. Freunde teilen sich einen eigenen Topf (Standard 3 $, unter „Einstellungen“), dein Budget bleibt getrennt. Kosten, Modelle und technische Meldungen sieht nur du.', only: 'admin' },
      { icon: '🔐', title: 'Admin-Protokoll sicherer', text: 'Das Protokoll öffnet sich nur noch für dein Konto, nach fünf falschen Passwörtern ist es 15 Minuten gesperrt. Lanis-Abrufe gehen nur für freigegebene Konten und sind begrenzt, ebenso Overload-Sendungen, Dateien und Mitteilungen.', only: 'admin' },
      { icon: '🗑️', title: 'Konto löschen', text: 'Unter Einstellungen → Konto kannst du dein Konto mit allen Daten und Dateien löschen.' },
      { icon: '📱', title: 'Besser auf kleinen Handys', text: 'Auf schmalen Bildschirmen läuft nichts mehr über den Rand, und wenn eine Seite einmal nicht angezeigt werden kann, bleibt der Rest der App nutzbar.' },
    ],
  },
  {
    version: '2026.10.10.5',
    date: '10. Oktober 2026',
    items: [
      { icon: '🔔', title: 'Erinnerungen auf dem Handy', text: 'Unter Einstellungen → Erinnerungen schaltest du Mitteilungen ein (standardmäßig aus, pro Gerät): dein Tagesplan am Morgen (7:00) und am Abend (18:00) eine Erinnerung, wenn eine Klausur naht (7, 3 und 1 Tag vorher) oder du hinter dem Plan liegst. Nachts kommt nichts, die Uhrzeiten kannst du ändern. Auf dem iPhone geht das nur mit der App auf dem Home-Bildschirm und iOS 16.4 oder neuer. Die App berechnet die Mitteilungen aus deinem Plan, sobald du sie öffnest.' },
    ],
  },
  {
    version: '2026.10.10.4',
    date: '10. Oktober 2026',
    items: [
      { icon: '🧠', title: 'Aufgabenstil deiner Lehrkraft lernen', text: 'Unter Notizen → Klausuren → Aufgabenstil lädst du Aufgabenblätter oder Klausuren deiner Lehrkraft hoch (Foto oder PDF). Die KI (das günstige Haiku, etwa 1 bis 3 Cent) liest ab, wie die Lehrkraft Aufgaben stellt: Aufbau, Formulierungen, Operatoren, Material, Bewertung. Du siehst das Ergebnis, kannst es ändern und speichern. Übungsklausuren folgen danach diesem Stil, bei gewählter Lehrkraft zuerst deren Blättern. Die hochgeladenen Seiten werden nach dem Lesen gelöscht.', only: 'style' },
    ],
  },
  {
    version: '2026.10.10.3',
    date: '10. Oktober 2026',
    items: [
      { icon: '📊', title: 'Diagramme in Übungsklausuren', text: 'Übungsklausuren in Mathe und den Naturwissenschaften können jetzt Funktionsgraphen, Messkurven, Säulen-, Linien- und Kreisdiagramme enthalten, auch ein leeres Koordinatensystem zum Eintragen. Die App zeichnet sie im PDF selbst aus den Daten der KI, in Grautönen und Strichmustern, damit sie auch schwarz-weiß gut lesbar sind. Im Erwartungshorizont steht die Lösung eingezeichnet, zum Beispiel die Tangente im Graphen.', only: 'practice' },
    ],
  },
  {
    version: '2026.10.10.2',
    date: '10. Oktober 2026',
    items: [
      { icon: '🎓', title: 'Abiturrechner Hessen', text: 'Unter Fächer → Abiturrechner trägst du die Punkte deiner Kurse und Prüfungen ein, die App rechnet Block I, Block II und die Abiturnote aus und prüft die Regeln der OAVO: 24 Grundkurse, Leistungskurse zweifach, Defizite, Pflicht-Einbringung und Prüfungsfächer. Leere Felder rechnet sie als Prognose aus deinen Noten. „Beste Auswahl vorschlagen“ wählt die freien Grundkurse. Das ersetzt nicht die Beratung deiner Schule.' },
    ],
  },
  {
    version: '2026.10.10.1',
    date: '10. Oktober 2026',
    items: [
      { icon: '🎯', title: 'Schwächen über alle Klausuren', text: 'Unter Notizen → Klausuren → Schwächen siehst du, wo dir Punkte fehlen: nach Operator (zum Beispiel Beurteilen) und Anforderungsbereich, pro Fach und für alle Fächer, dazu der Verlauf von Q-Phase zu Q-Phase. Echte Klausuren und Übungsklausuren sind getrennt. Das rechnet die App aus deinen Korrekturen, ohne KI und ohne Kosten.', only: 'correct' },
    ],
  },
  {
    version: '2026.10.09.4',
    date: '9. Oktober 2026',
    items: [
      { icon: '🏋️', title: 'Training und Belastung im Konzentrationsscore', text: 'Overload schickt jetzt auch, wie anstrengend dein Training war (1 bis 10, von Overload geschätzt oder von dir eingestellt) und deine Belastung. Heute zählt dein Training nach Dauer mal Anstrengung: eine lockere Einheit hilft dem Kopf, ein sehr hartes Training kostet Konzentration.' },
      { icon: '📈', title: 'Belastung 7:28', text: 'Die Konzentrationskarte zeigt das Verhältnis deiner letzten 7 zu den letzten 28 Tagen aus Overload (erholt, optimal, hoch, sehr hoch). Ist die Belastung hoch, senkt das die Konzentration etwas, bei sehr hoch etwas mehr. Ohne Overload trägst du die Anstrengung deines Trainings selbst ein. Dafür muss Overload auf die neue Version aktualisiert sein.' },
    ],
  },
  {
    version: '2026.10.09.3',
    date: '9. Oktober 2026',
    items: [
      { icon: '📋', title: 'Themenliste aus deinen Notizen', text: 'Im Klausur-Editor schlägt dir die KI (das günstige Haiku, weniger als ein Cent pro Liste) Themen aus deinen Notizen vor. Die Notizen seit der letzten Klausur im Fach sind schon gewählt. Du hakst ab, was du übernehmen willst, die Liste bleibt deine.', only: 'topics' },
    ],
  },
  {
    version: '2026.10.09.2',
    date: '9. Oktober 2026',
    items: [
      { icon: '💶', title: 'Mehr Luft für die KI', text: 'Das Monatsbudget für KI-Anfragen liegt jetzt bei 5 Dollar (vorher 3), damit auch eine Klausurenphase mit vielen Übungsklausuren und Korrekturen hineinpasst. Die Obergrenze für Anfragen pro Monat steigt auf 500. Im Admin-Protokoll siehst du weiter genau, was verbraucht wurde.', only: 'admin' },
    ],
  },
  {
    version: '2026.10.09.1',
    date: '9. Oktober 2026',
    items: [
      { icon: '🧪', title: 'Übungsklausuren erstellen', text: 'Unter Notizen → Klausuren lässt du dir für jedes Fach eine Übungsklausur schreiben: mit Operatoren, passend zu den Notizen aus deinem Unterricht, in drei Stufen (leicht, mittel, schwer). Dazu gibt es einen Erwartungshorizont mit Musterlösung.', only: 'practice' },
      { icon: '📄', title: 'Als PDF wie eine echte Klausur', text: 'Kopf mit Zeit, Hilfsmitteln und Punkten, ein Text mit Zeilenzählung bei Deutsch und Fremdsprachen, Teil A und Teil B bei Mathe, Tabellen als Material und eine Punktetabelle am Ende. Du siehst das PDF an oder speicherst es.', only: 'practice' },
      { icon: '🎯', title: 'Wird mit echten Klausuren genauer', text: 'Der Aufbau folgt deinen korrigierten echten Klausuren (Zahl der Aufgaben, Punkte, Operatoren, Anforderungsbereiche). Sagst du „zu leicht“ oder „zu schwer“ oder lässt die Lösung korrigieren, passt die App die nächste Übungsklausur dieser Stufe an.', only: 'practice' },
    ],
  },
  {
    version: '2026.10.08.4',
    date: '8. Oktober 2026',
    items: [
      { icon: '📝', title: 'Klausuren korrigieren lassen', text: 'Unter Notizen → Klausuren lädst du deine Lösung, die Aufgaben und auf Wunsch den Erwartungshorizont hoch. Die KI korrigiert Aufgabe für Aufgabe mit Rückmeldung und Tipp, die Note rechnet die App nach den Regeln der OAVO Hessen (zum Beispiel Deutsch 70 % Verstehen und 30 % Darstellung, Fremdsprachen 60 % Sprache und 40 % Inhalt, Fehlerindex).', only: 'correct' },
      { icon: '📐', title: 'Korrekturmuster pro Fach', text: 'Jedes Fach hat ein ausgearbeitetes Korrekturmuster mit Kriterien, Operatoren und Fachhinweisen. Hast du einen Bewertungsbogen deiner Lehrkraft, trägst du ihn ein und er geht vor.', only: 'correct' },
      { icon: '🎯', title: 'Wird mit jeder Klausur genauer', text: 'Bekommst du die Klausur zurück, trägst du die Note ein oder lädst die korrigierte Klausur hoch. Die App gleicht ihre Einschätzung an deine Lehrkraft an, und die KI merkt sich, worauf sie achtet.', only: 'correct' },
    ],
  },
  {
    version: '2026.10.08.3',
    date: '8. Oktober 2026',
    items: [
      { icon: '🛠️', title: 'Besserer Überblick im Hintergrund', text: 'Die App protokolliert jetzt, welche KI-Anfragen mit welchem Modell liefen und was sie gekostet haben. Das hilft beim Einschätzen des Budgets und bei der Fehlersuche.', only: 'admin' },
    ],
  },
  {
    version: '2026.10.08.2',
    date: '8. Oktober 2026',
    items: [
      { icon: '🔎', title: 'Texte genauer gelesen', text: 'Blätter, die nur aus Text bestehen, liest die KI jetzt mit mittlerem statt niedrigem Aufwand, genauso wie Fotos. Das kostet nur einen Bruchteil mehr, die Zusammenfassungen werden dafür zuverlässiger.', only: 'summarize' },
    ],
  },
  {
    version: '2026.10.08.1',
    date: '8. Oktober 2026',
    items: [
      { icon: '⚡', title: 'Günstigere KI für Arbeitsblätter', text: 'Einfache Blätter liest jetzt ein schnelleres, deutlich billigeres Modell (Haiku). Nur wenn etwas schwer lesbar war oder du „Genauer lesen“ drückst, springt das stärkere Modell (Sonnet) ein. Dein Monatsbudget hält dadurch viel länger, und der Verbrauch wird pro Modell gezählt.', only: 'admin' },
    ],
  },
  {
    version: '2026.10.07.11',
    date: '7. Oktober 2026',
    items: [
      { icon: '🌍', title: 'Sprache pro Fach', text: 'Bei jedem Fach stellst du die Unterrichtssprache ein: Englisch bei Englisch und bilingualen Fächern wie Bio Bili, Französisch, Spanisch, Latein und mehr, Deutsch bei Bio Deutsch. Die KI schreibt Zusammenfassungen und Karteikarten dann in dieser Sprache.' },
      { icon: '🎮', title: 'Lernmodi für Karteikarten', text: 'Wie bei Quizlet: Lernen in wachsenden Abständen, Durchblättern, Schreiben (Tippfehler sind okay), Multiple Choice, Zuordnen gegen die Zeit und ein Test mit gemischten Fragen und Ergebnis am Ende. Schreiben und Multiple Choice zählen für den Wiederholungsplan.' },
      { icon: '🗑️', title: 'Karten auswählen und löschen', text: 'Mit „Auswählen“ markierst du viele Karten auf einmal und löschst sie oder setzt ihre Schwierigkeit. Dazu gibt es Stapel pro Fach mit Fortschritt, eine Suche und eine übersichtlichere Startseite für die Karten.' },
    ],
  },
  {
    version: '2026.10.07.10',
    date: '7. Oktober 2026',
    items: [
      { icon: '🎚️', title: 'Schwierigkeit bei Karteikarten', text: 'Jede Karte hat jetzt eine Stufe: Einfach, Mittel, Schwer oder Sehr schwer. Schwere Karten kommen früher wieder, einfache später. Du kannst nach Stufe filtern und gezielt nur schwere Karten lernen. Der KI-Assistent kann alle Karten auf einer Stufe erstellen oder sie mischen.' },
      { icon: '🖼️', title: 'Schöneres Hochladen', text: 'Das Fenster zum Hochladen von Blättern hat drei Schritte, eine Ablage zum Hineinziehen, Dateikarten mit Vorschaubild und Auswahl von Fach und Q-Phase per Tipp. Auch „Neue Karte“ ist neu gestaltet, mit zwei Kartenseiten und „Speichern und weitere“.' },
    ],
  },
  {
    version: '2026.10.07.9',
    date: '7. Oktober 2026',
    items: [
      { icon: '✨', title: 'Bessere Karteikarten mit KI', text: 'Unter Karteikarten → Vorschläge wählst du eine Notiz, und die KI (Groq, kostenlos) schlägt Fragen und Antworten vor, zum Beispiel „Warum ändert Licht die Richtung?“ statt nur Lückensätzen. Dafür geht nur die Zusammenfassung der Notiz weg. Du übernimmst nur die Karten, die dir gefallen.', only: 'cards' },
    ],
  },
  {
    version: '2026.10.07.8',
    date: '7. Oktober 2026',
    items: [
      { icon: '🔑', title: 'Passwort vergessen', text: 'Auf der Anmeldeseite schickt „Passwort vergessen?“ einen Link per E-Mail, über den du ein neues Passwort setzt. In den Einstellungen kannst du dein Passwort jederzeit ändern.' },
      { icon: '🔎', title: 'Notizen durchsuchen', text: 'Suche in Titel, Begriffen, Aussagen, Formeln, Fach, Lehrkraft und Q-Phase. Groß- und Kleinschreibung und Umlaute spielen keine Rolle, mehrere Wörter müssen alle vorkommen. Die Fundstelle ist markiert. Dazu gibt es einen Filter nach Q-Phase.' },
      { icon: '📄', title: 'PDF bearbeiten und Lernordner', text: 'Vor dem Hochladen siehst du alle Seiten des PDFs und kannst sie verschieben, drehen oder löschen. Aus allen PDFs eines Fachs oder einer Q-Phase machst du mit einem Tipp einen Lernordner als eine PDF.' },
      { icon: '🗂️', title: 'Karteikarten', text: 'Unter Notizen → Karteikarten fragt dich die App in wachsenden Abständen ab, ganz ohne KI. Karten legst du selbst an oder lässt sie aus deinen Notizen vorschlagen: Ein Fachbegriff wird im Satz verdeckt, aus Formeln werden Formelkarten.' },
      { icon: '📊', title: 'Wochenrückblick', text: 'Wie viel hast du gelernt, wie viel war geplant, wie waren Schlaf, Energie und Training? Der Rückblick zeigt es pro Tag und Fach, vergleicht mit der Woche davor und gibt ein paar Hinweise. Du findest ihn im Plan und am Wochenende auf Heute.' },
    ],
  },
  {
    version: '2026.10.07.7',
    date: '7. Oktober 2026',
    items: [
      { icon: '🎯', title: 'Fächer ohne Note', text: 'Hast du in einem Fach noch keine Note oder möchtest sie nicht einbeziehen, setze beim Fach den Haken „Noch keine Note oder nicht einbeziehen“. Die Priorität rechnet dann neutral, mit der Mitte der Skala, statt mit einer erfundenen Zahl. Sobald du eine Note hast, trägst du sie ein.' },
    ],
  },
  {
    version: '2026.10.07.6',
    date: '7. Oktober 2026',
    items: [
      { icon: '✨', title: 'Ladebildschirm', text: 'Beim Start zeigt die App jetzt einen eigenen Ladebildschirm mit animiertem Logo, statt kleinem Text oben links. Er erscheint schon, bevor die App fertig geladen ist, und passt sich dem hellen oder dunklen Design an.' },
    ],
  },
  {
    version: '2026.10.07.5',
    date: '7. Oktober 2026',
    items: [
      { icon: '📄', title: 'Arbeitsblätter zu einem PDF', text: 'Wähle mehrere Fotos und PDFs, ordne sie und die App fügt sie direkt auf deinem Gerät zu einem PDF zusammen, ganz ohne KI. Der Name entsteht aus Datum, Fach, Lehrkraft und Q-Phase, zum Beispiel 2026-10-07_Physik_Müller_Q1.pdf. Lehrkraft und Q-Phase schlägt die App aus deinem Stundenplan vor.' },
      { icon: '✅', title: 'Erst bestätigen, dann hochladen', text: 'Vor dem Hochladen siehst du Name, Seitenzahl und Größe und kannst dir das PDF ansehen. Die KI-Zusammenfassung ist jetzt freiwillig und spart dir Budget, wenn du sie nicht brauchst. In der Notiz kannst du das PDF jederzeit speichern.' },
    ],
  },
  {
    version: '2026.10.07.4',
    date: '7. Oktober 2026',
    items: [
      { icon: '🗂️', title: 'Notizen übersichtlicher', text: 'Die Notizen sind nach Woche und Tag geordnet, die neuesten stehen oben. Jede Notiz ist eine kompakte Zeile mit Titel, Fach und der ersten Aussage, ein Tipp klappt sie zum Bearbeiten auf. Ältere Wochen sind zugeklappt, und oben kannst du nach Fach filtern.' },
    ],
  },
  {
    version: '2026.10.07.3',
    date: '7. Oktober 2026',
    items: [
      { icon: '📝', title: 'Arbeitsblätter zusammenfassen', text: 'Unter „Notizen“ lädst du nach der Stunde Fotos oder PDFs hoch. Die KI fasst zusammen, was auf dem Blatt steht (Thema, Kernaussagen, Begriffe, Formeln, offene Fragen), und du kannst alles bearbeiten. Das Fach wird aus deinem Stundenplan vorgeschlagen, die Notizen liegen pro Fach.', only: 'summarize' },
      { icon: '💶', title: 'Festes Monatsbudget', text: 'Die KI-Zusammenfassungen sind auf rund 3 US-Dollar im Monat begrenzt (etwa 2,5 bis 3 Euro). Auf der Notizen-Seite siehst du, wie viel schon verbraucht ist. Ist das Budget aufgebraucht, geht es im nächsten Monat weiter.', only: 'admin' },
      { icon: '♻️', title: 'Nichts doppelt bezahlen', text: 'Dieselbe Datei wird nicht noch einmal zusammengefasst. Leere und doppelte Seiten schickt die App gar nicht erst an die KI, und die Zusammenfassungen sind kürzer gehalten. So hält das Budget länger.', only: 'admin' },
      { icon: '🔍', title: 'Genauer lesen', text: 'War etwas schwer lesbar, markiert die App das. Mit „Genauer lesen“ schaut die KI die Bilder noch einmal mit mehr Aufwand an.', only: 'summarize' },
    ],
  },
  {
    version: '2026.10.07.2',
    date: '7. Oktober 2026',
    items: [
      { icon: '📲', title: 'Mac, iPad und Handy gekoppelt', text: 'Änderungen auf einem Gerät erscheinen sofort auf den anderen: Aufgaben, Klausuren, Ausfälle, Themen und Einstellungen. Beim Zurückkehren in die App gleicht sie sich automatisch ab. Unter Einstellungen → Geräte siehst du den Stand.' },
      { icon: '🖥️', title: 'Layout fürs iPad', text: 'Im Hoch- und Querformat gibt es jetzt eine schmale Seitenleiste mit Symbolen, größere Tippflächen und zwei Spalten, wo Platz ist.' },
    ],
  },
  {
    version: '2026.10.07.1',
    date: '7. Oktober 2026',
    items: [
      { icon: '🔄', title: 'Automatisch aus Lanis aktualisieren', text: 'Beim Import kannst du „Auf diesem Gerät merken“ wählen. Dann holt die App Stundenplan, Vertretungen und Klausuren von selbst, wenn du sie öffnest und der Stand veraltet ist. Das Passwort bleibt verschlüsselt auf diesem Gerät, nie auf dem Server. Unter Einstellungen kannst du es jederzeit löschen.' },
      { icon: '🍽️', title: 'Mittagspause statt Lernzeit', text: 'Eine Freistunde zwischen der 6. und 8. Stunde zählt jetzt als Mittagspause zum Essen und nicht als Zeit zum Lernen.' },
      { icon: '🗓️', title: 'Nächste Tage neu gestaltet', text: 'Jeder Tag ist jetzt eine Karte mit Lernzeit, Fächern, Schule und Freistunden. Ausfälle stellst du direkt auf der Karte ein.' },
      { icon: '✨', title: 'Logo und Neuigkeiten', text: 'Das Logo steht jetzt oben neben dem Namen. Die App prüft selbst auf neue Versionen, lädt sie und zeigt dir hier, was neu ist.' },
    ],
  },
  {
    version: '2026.10.06.1',
    date: '6. Oktober 2026',
    items: [
      { icon: '🏫', title: 'Stundenplan und Vertretungen', text: 'Aus Lanis importierbar: Heute zeigt „Schule heute“ mit Freistunden und Vertretungen, der Plan das Wochenraster.' },
      { icon: '📅', title: 'Gemeinsamer Plan', text: 'Alle Klausuren werden zusammen geplant. Ausfälle, Themenliste und Soll gegen Ist helfen dir dabei.' },
      { icon: '🧠', title: 'Konzentration und Overload', text: 'Eine Schätzung der sinnvollen Lernzeit pro Tag, optional mit Training und Schlaf aus Overload.' },
    ],
  },
];

export const APP_VERSION: string = __APP_VERSION__;
