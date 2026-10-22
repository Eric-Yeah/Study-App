/**
 * Zentrale Konfiguration. Alle Zahlen hier sind Startwerte aus der Ideenphase
 * und dürfen angepasst werden. Nirgends sonst im Code sollen diese Werte stehen.
 */
export const CONFIG = {
  priority: {
    base: 1,
    min: 1,
    max: 10,
    advancedBonus: 2, // Leistungskurs zählt doppelt
    examSubjectBonus: 2, // Prüfungsfach zählt vierfach
    gradeMaxBonus: 3, // 0 Punkte -> +3, 15 Punkte -> +0
    // Ohne Note rechnet die App neutral: die Mitte der Skala (+1,5). 0 Punkte hieße höchste Dringlichkeit, kein Bonus
    // hieße eine perfekte Note. Beides wäre geraten.
    unknownGradePoints: 7.5,
    difficultyMaxBonus: 3, // Schwierigkeit 1 -> +0, 5 -> +3
    dropQ3Penalty: 2,
  },
  totalTime: {
    daysBase: 3,
    daysPerPriority: 1.2,
    minutesBase: 20,
    minutesPerPriority: 8,
    roundToHours: 0.5,
    capHours: 40,
  },
  lead: {
    daysBase: 3,
    daysPerPriority: 1.2,
    writingBufferDays: 3, // Fachtyp Schreiben: Puffer für Feedback
  },
  plan: {
    defaultFreeDaysPerWeek: 1 as 0 | 1 | 2,
    defaultDailyLimitMin: 180, // grob 3 h echte Lernzeit pro Tag
  },
  concentration: {
    // Tageskapazität für konzentriertes Lernen. Grobe Annahmen, kein Messwert: Obergrenze etwa 3 bis 4 h.
    baseMin: 210,
    minMin: 90,
    maxMin: 240,
    // Schlaf: ab sleepFullH voller Wert, darunter linear bis sleepMinFactor bei sleepMinH
    sleepFullH: 7.5,
    sleepMinH: 5,
    sleepMinFactor: 0.75,
    // Energie 1 bis 5 (Selbsteinschätzung), linear zwischen den beiden Faktoren
    energyMinFactor: 0.8,
    energyMaxFactor: 1.1,
    // Training: eine moderate Einheit hilft leicht, viel Training davor kostet Konzentration
    trainingLightBonus: 1.05,
    trainingLightMaxMin: 90,
    trainingHeavyFactor: 0.9,
    trainingHeavySessions: 2,
    trainingHeavyMin: 120,
    // Belastung aus Overload: Punkte einer Einheit = Dauer in Minuten x Anstrengung (1 bis 10, Foster-sRPE). Mit bekannter Anstrengung
    // entscheidet sie statt der groben Minutenregel oben. Das Verhältnis aus dem 7-Tage- und 28-Tage-Mittel (EWMA, "7:28") wirkt zusätzlich:
    // eine Orientierung aus der Sportwissenschaft, in der Forschung umstritten, hier nur eine kleine Dämpfung.
    load: {
      defaultRpe: 5, // ohne Angabe schätzt die App eine mittlere Anstrengung (60 min mal 5 = eine moderate Einheit)
      moderateLoadMax: 450, // bis zu dieser Belastung am Tag hilft Training (leichter Bonus)
      heavyLoadMin: 600, // ab hier kostet Training Konzentration (zum Beispiel 90 min mal 7)
      noBonusRpe: 9, // ab dieser Anstrengung gibt es keinen Bonus mehr, auch wenn die Einheit kurz war
      ratioLow: 0.8, // darunter erholt
      ratioHigh: 1.3, // darüber hoch
      ratioVeryHigh: 1.5, // darüber sehr hoch
      highFactor: 0.95,
      veryHighFactor: 0.9,
      maxAgeDays: 2, // so alt darf der letzte 7:28-Wert aus Overload höchstens sein
    },
    nearShare: 0.8, // ab diesem Anteil der Kapazität: "bald genug"
    // Empfohlene Sessionlänge je nach Tagesform (Spec: 45 bis 90 Minuten)
    sessionLowMin: 45,
    sessionNormalMin: 60,
    sessionHighMin: 90,
    lowFactor: 0.9,
    highFactor: 1.05,
  },
  schedule: {
    // Gemeinsamer Plan über alle Klausuren
    roundMin: 5, // Blöcke werden auf 5 Minuten gerundet
    softOverflow: 0.15, // am letzten möglichen Tag darf das Tageslimit um diesen Anteil überschritten werden
    freeWeekdays: { 0: [] as number[], 1: [0], 2: [0, 3] } as Record<number, number[]>, // 0 = Sonntag, 3 = Mittwoch
  },
  ai: {
    // Arbeitsblätter zusammenfassen (Claude über die Edge Function summarize-worksheet)
    minCharsPerPage: 80, // PDF-Seite mit weniger Zeichen wird als Bild gelesen
    maxImagesPerRequest: 10,
    maxEdge: 1600, // längste Kante der Bilder in Pixeln, nie vergrößern
    jpegQuality: 0.85,
    maxTokens: 2000, // Obergrenze der Antwort. Bei diesem Modell zählt das Denken mit
    monthlyRequestCap: 500, // zweite Sicherung, das Budget unten greift früher (ein Monat mit vielen Notizen, Übungsklausuren und Korrekturen bleibt darunter)
    maxPagesPerUpload: 40, // Schutz vor versehentlich riesigen PDFs
    // Monatsbudget in US-Dollar (5 $ sind je nach Kurs etwa 4,2 bis 4,8 €). Die Function prüft vor jeder Anfrage
    // den schlimmsten Fall und lehnt ab, wenn das Budget überschritten werden könnte.
    monthlyBudgetUsd: 5,
    // Welches Modell mit welchem Effort für welche Aufgabe. Die Modell-IDs müssen unten unter `prices` stehen,
    // sonst rechnet die Kostengrenze mit dem teuersten bekannten Preis. Kein temperature, top_p oder top_k setzen.
    // Bei "unsicher" gelesenen Blättern automatisch noch einmal mit dem stärkeren Modell lesen? Das kostet ein Vielfaches
    // (Sonnet ist 20-mal so teuer wie Haiku) und lief bei jedem schwer lesbaren Foto. Aus: Die Notiz bleibt als "unsicher"
    // markiert und der Knopf "Genauer lesen" macht es auf Wunsch.
    autoEscalate: false,
    // Bilder eines Blatts nach dem Lesen aus dem Speicher löschen, wenn die Lesbarkeit "sicher" war. Sie werden nur noch für
    // "Genauer lesen" gebraucht, und das gibt es nur bei "unsicher". Das PDF der Notiz bleibt.
    deleteSureImages: true,
    models: {
      text: { model: 'claude-haiku-5-5', effort: 'medium' }, // Arbeitsblatt nur aus Text
      image: { model: 'claude-haiku-5-5', effort: 'medium' }, // Arbeitsblatt mit mindestens einem Bild
      escalation: { model: 'claude-sonnet-5-5', effort: 'medium' }, // wenn die Lesbarkeit "unsicher" war, und für "Genauer lesen"
      exam: { model: 'claude-sonnet-5-5', effort: 'medium' }, // Klausurenkorrektur und Lernen aus der Korrektur der Lehrkraft
    } as Record<'text' | 'image' | 'escalation' | 'exam', { model: string; effort: 'low' | 'medium' | 'high' }>,
    // Preise in US-Dollar je Million Token, laut Preisliste der Anthropic-Doku. Haiku 5.5: bis 100.000 Token Eingabe,
    // darüber 0,50 und 2,50 (eine Anfrage hier bleibt weit darunter, ein Test prüft das).
    prices: {
      // Haiku 5.5 über 100.000 Token Eingabe: 0,50 und 2,50 für die ganze Anfrage (die Kostengrenze rechnet damit)
      'claude-haiku-5-5': { inputUsdPerMTok: 0.1, outputUsdPerMTok: 0.5, longAboveInputTokens: 100_000, longInputUsdPerMTok: 0.5, longOutputUsdPerMTok: 2.5 },
      'claude-sonnet-5-5': { inputUsdPerMTok: 2, outputUsdPerMTok: 10 },
    } as Record<string, { inputUsdPerMTok: number; outputUsdPerMTok: number; longAboveInputTokens?: number; longInputUsdPerMTok?: number; longOutputUsdPerMTok?: number }>,
    // Bild-Tokens laut Anthropic-Doku (Vision): ⌈Breite/28⌉ x ⌈Höhe/28⌉, größere Bilder verkleinert Claude. Höchstwert bei Haiku 5.5 und
    // Sonnet 5.5 (hohe Auflösung, Claude 4.7 und neuer): 4784 Token. Die Kostengrenze rechnet mit den Maßen aus dem JPEG-Kopf
    // (A4 bei 1600 px: 41 x 58 = 2378) plus Zuschlag, ohne lesbare Maße mit dem Höchstwert. So bleibt sie immer eine Obergrenze.
    maxImageTokens: 4800,
    imagePatchPx: 28,
    imageTokenMargin: 16,
    textCharsPerToken: 2.5, // vorsichtig für deutschen Text
    promptOverheadTokens: 700, // System-Prompt und Beschriftungen (ein Test prüft, dass der Prompt darunter bleibt)
    // Kurze Ausgabe spart am meisten, denn Ausgabe-Tokens kosten fünfmal so viel wie Eingabe-Tokens.
    summaryLimits: { topicWords: 8, keyPoints: 8, wordsPerPoint: 18, terms: 10, formulas: 6, openQuestions: 5 },
    // Fast leere Seiten werden nicht an die KI geschickt: Anteil dunkler Pixel im verkleinerten Bild
    blankGridEdge: 200, // längste Kante des Prüfbilds in Pixeln
    blankInkDelta: 30, // so viel dunkler als der Hintergrund (0 bis 255) zählt als Tinte
    blankInkShare: 0.001, // weniger Tinte als dieser Anteil heißt leer (0,1 %)
  },
  cardsAi: {
    // KI-Karten über die Edge Function generate-cards (Groq, kostenloser Tarif). Das Modell kann sich ändern: Es muss strikte
    // JSON-Schemas können, siehe https://console.groq.com/docs/structured-outputs
    model: 'openai/gpt-oss-120b',
    maxCards: 8, // pro Notiz und Anfrage
    maxFrontChars: 300,
    maxBackChars: 600,
    maxExistingFronts: 40, // vorhandene Karten, die das Modell nicht wiederholen soll
    maxTokens: 3000, // Obergrenze der Antwort, das Denken zählt vermutlich mit
  },
  exam: {
    // Klausurenkorrektur (Edge Function correct-exam, Modell CONFIG.ai.models.exam). Rechenregeln Hessen: OAVO § 9 Abs. 12 bis 14
    // mit Anlagen 9a bis 9c (Fassung GVBl. 2025 Nr. 32), moderne Fremdsprachen: Erlass vom 7. August 2020. Bei neuer Fassung prüfen.
    maxTokens: 8000, // Antwort mit Rückmeldung je Aufgabe, das Denken zählt mit
    learnMaxTokens: 4000, // Lernen aus der Korrektur der Lehrkraft: Punkte ablesen und Erfahrungen ableiten
    maxPages: 24, // Seiten pro Korrektur (Aufgaben, Lösung, Erwartungshorizont zusammen)
    maxTeacherTextChars: 6000, // Vorgaben der Lehrkraft für ein Fach (eigenes Korrekturmuster)
    maxHorizonChars: 12000, // Erwartungshorizont als getippter Text (auch der einer Übungsklausur)
    // Zum Vergleich (freiwillig): dieselbe Klausur zusätzlich mit diesem Modell, so zeigt sich, ob ein günstigeres reicht
    compareModel: { model: 'claude-haiku-5-5', effort: 'high' } as { model: string; effort: 'low' | 'medium' | 'high' },
    // Anlage 9a: ab so viel Prozent gibt es 1, 2, ... 15 Notenpunkte, darunter 0. Prozent werden nicht gerundet.
    percentThresholds: [20, 27, 34, 41, 46, 51, 56, 61, 66, 71, 76, 81, 86, 91, 96],
    // Anlage 9b: Fehlerindex = Fehler x 100 / Wörter (ganzzahlig, nicht gerundet). Ab Index 3 ein Punkt Abzug, ab 6 zwei.
    // Ist der sprachliche Anteil der Arbeit kleiner als die Hälfte, gehen statt der Punkte 5 bzw. 10 Prozent der
    // Bewertungseinheiten dieses Anteils ab.
    languageDeduction: [
      { fromIndex: 3, points: 1, percentOfShare: 5 },
      { fromIndex: 6, points: 2, percentOfShare: 10 },
    ],
    deutsch: { understanding: 70, presentation: 30 }, // § 9 Abs. 12a: Verstehens- zu Darstellungsleistung
    foreignLanguage: { language: 60, content: 40, accuracy: 50, expression: 50 }, // Erlass 2020: Sprache zu Inhalt, Richtigkeit zu Ausdruck
    failCapPoints: 3, // null Punkte in Darstellung (Deutsch) oder Sprache bzw. Inhalt (Fremdsprachen): höchstens 3 Punkte
    // Anlage 9c Latein und Griechisch: Fehlerindex bis zu diesem Wert ergibt 15, 14, ... 1 Punkte, darüber 0
    latinIndexMax: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13.5, 15, 16.5],
    // Übersetzung zu Interpretation in Latein: in der OAVO nicht festgelegt, 2:1 ist üblich. Vorgaben der Lehrkraft gehen vor.
    latinWeights: { translation: 2, interpretation: 1 },
    // Lernen aus zurückgegebenen Klausuren: Abweichung der KI von der Lehrkraft. prior zieht wenige Werte zur Null
    // (bei einer Klausur zählt die Abweichung zu einem Drittel, bei zwei zur Hälfte), höchstens maxShift Punkte.
    calibration: { prior: 2, maxShift: 3, minTeacherSamples: 2 },
    maxLessons: 15, // Erfahrungen pro Fach, die in den Prompt gehen
    maxLessonChars: 220,
    maxNewLessons: 5, // pro zurückgegebener Klausur
  },
  practice: {
    // Übungsklausuren (Edge Function generate-exam, Modell CONFIG.ai.models.exam). Zahlen für den Aufbau und die drei Stufen.
    // Zwei Anfragen, weil eine Edge Function nach etwa 150 Sekunden abbricht: erst die Klausur, dann Erwartungshorizont und Musterlösung
    maxTokens: 10000, // Klausur mit Material und Aufgaben, das Denken zählt mit
    solutionsMaxTokens: 10000, // Erwartungshorizont und Musterlösung
    maxMaterialChars: 12000, // Unterrichtsmaterial aus den gewählten Notizen (Zusammenfassungen) im Prompt
    maxNotes: 12, // so viele Notizen lassen sich als Material wählen
    maxTopicChars: 400,
    durationMin: { basic: 90, advanced: 135 } as { basic: number; advanced: number }, // Grundkurs, Leistungskurs
    totalBe: { basic: 60, advanced: 90 } as { basic: number; advanced: number }, // Gesamtpunkte, wenn es keine echten Klausuren als Vorbild gibt
    // Anteile der Anforderungsbereiche I, II, III in Prozent für "mittel", wenn es keine echten Klausuren als Vorbild gibt
    afbDefault: [25, 50, 25] as [number, number, number],
    // Mit echten Klausuren des Fachs gilt deren Mischung als "mittel". Je Stufe wandern so viele Prozentpunkte von I und II nach III
    // (schwer) oder zurück (leicht), und je Schritt aus der Rückmeldung noch einmal so viele.
    afbShiftPerStep: 9,
    levelStep: { leicht: -1, mittel: 0, schwer: 1 } as Record<'leicht' | 'mittel' | 'schwer', number>,
    // Rückmeldung und Ergebnisse früherer Übungsklausuren verschieben die Stufe um höchstens maxShift Schritte
    maxShift: 2,
    ratingsWindow: 5, // so viele letzte Übungsklausuren einer Stufe zählen
    gapPerStep: 10, // Prozentpunkte Abweichung des Ergebnisses von der Erwartung, die einen halben Schritt ergeben
    gapTarget: { leicht: 15, mittel: 0, schwer: -15 } as Record<'leicht' | 'mittel' | 'schwer', number>, // erwartetes Ergebnis minus echte Klausuren in Prozentpunkten
    minRealForProfile: 1, // so viele echte Klausuren braucht ein Profil
    limits: { parts: 4, materials: 6, tasks: 14, subtasks: 8, textChars: 6000, taskChars: 1800, items: 8, tableCols: 8, tableRows: 30, cellChars: 60, diagramSeries: 4, diagramPoints: 40, diagramCategories: 12, diagramMarks: 6, exprChars: 120 },
  },
  abitur: {
    // Abiturrechner Hessen (OAVO Fassung 2025, §§ 24 und 26, Schulinformationen 2026). Verbindlich prüft die Schule.
    quarters: 4, // Kurse je Fach in der Qualifikationsphase
    gkRequired: 24, // einzubringende Grundkurse in einfacher Wertung (Block I)
    lkCount: 2, // Leistungskurse, je vier Kurse in zweifacher Wertung
    lkWeight: 2,
    gkMin: 120, // Block I: Grundkurse mindestens, Leistungskurse (zweifach gezählt) mindestens, zusammen
    lkMin: 80,
    blockIMin: 200,
    blockIMax: 600,
    exams: 5, // Prüfungsfächer: 1 und 2 Leistungskurse, 3 schriftlich, 4 und 5 mündlich, Präsentation oder BLL
    examWeight: 4,
    blockIIMin: 100,
    blockIIMax: 300,
    totalMin: 300,
    totalMax: 900,
    deficitBelow: 5, // unter so vielen Punkten gilt ein Kurs oder eine Prüfung als Defizit
    deficitMax: 6, // einzubringende Kurse unter 5 Punkten, davon höchstens deficitLkMax Leistungskurse
    deficitLkMax: 2,
    examDeficitMax: 2, // Prüfungen unter 5 Punkten, davon höchstens examDeficitLkMax Leistungskurse
    examDeficitLkMax: 1,
    sportMax: 3, // so viele Sportkurse lassen sich einbringen
    assumption: 8, // Annahme in Punkten für Kurse ohne eigene Zahl, wenn auch keine Note am Fach steht
  },
  grades: {
    // Einzelnoten und Kursnote. Wie Lehrkräfte Klausuren und sonstige Leistungen gewichten, regelt die Schule und die Lehrkraft:
    // das Verhältnis ist darum je Fach einstellbar, dies ist nur der Startwert.
    writtenShare: 50, // Anteil der Klausuren an der Kursnote in Prozent
    shareStep: 5,
    weightMin: 0.5, // Gewicht einer einzelnen Note innerhalb ihrer Gruppe
    weightMax: 5,
    weightStep: 0.5,
    trendWindow: 3, // so viele letzte Noten gegen den Rest für den Trend
    trendMin: 1, // so viele Punkte Unterschied sind ein Trend
    maxPerSubject: 200, // Grenze der Einträge je Fach (Schutz vor Unsinn)
    pendingExamDays: 120, // vergangene Klausuren ohne Note werden so lange angeboten
    kinds: {
      exam: { label: 'Klausur', group: 'written', weight: 1 },
      oral: { label: 'Mündliche Mitarbeit', group: 'other', weight: 1 },
      test: { label: 'Test', group: 'other', weight: 1 },
      presentation: { label: 'Referat / Präsentation', group: 'other', weight: 1 },
      homework: { label: 'Hausaufgabe / Protokoll', group: 'other', weight: 0.5 },
      project: { label: 'Projekt / Portfolio', group: 'other', weight: 1 },
      other: { label: 'Sonstiges', group: 'other', weight: 1 },
    },
  },
  access: {
    // Konten für Freunde: Freigabe durch den Admin, KI pro Funktion, gemeinsamer Topf der Freunde (Betrag in app_settings)
    friendsBudgetUsd: 3, // Standard des gemeinsamen Topfs, im Admin-Protokoll einstellbar
    friendsRequestCap: 300, // KI-Anfragen aller Freunde zusammen im Monat (zweite Sicherung)
    cardsDailyLimit: 30, // KI-Karten (Groq) je Freund und Tag, im Admin-Protokoll einstellbar
    adminMaxAttempts: 5, // falsche Passwörter, dann Sperre
    adminLockMinutes: 15,
  },
  push: {
    // Erinnerungen auf dem Handy (Web-Push). Die App berechnet die Mitteilungen aus dem Plan, der Server verschickt sie zur Uhrzeit.
    planTime: '07:00', // Tagesplan morgens
    examTime: '18:00', // Klausur naht und Rückstand am Abend
    earliest: '06:30', // ruhige Zeit: davor und danach kommt nichts
    latest: '21:30',
    planDays: 2, // Tagesplan für heute und morgen (der Plan ändert sich, darum nicht weiter voraus)
    examLeadDays: [7, 3, 1] as number[], // so viele Tage vor einer Klausur kommt die Erinnerung
    maxSubjects: 4, // Fächer im Text des Tagesplans
    syncDelayMs: 4000, // so lange nach der letzten Änderung wird die Warteschlange erneuert
  },
  style: {
    // Stil der echten Aufgabenblätter lernen (Edge Function learn-style, Haiku, Kosten unter einem halben Cent je Blatt)
    maxPages: 8, // Seiten pro Blatt
    maxTokens: 1800, // Obergrenze der Antwort, das Denken zählt mit
    maxItems: 8, // Einträge je Liste beim Lernen
    itemChars: 220,
    summaryChars: 500,
    maxSheets: 12, // gelernte Blätter je Fach, danach muss man eines löschen
    promptSheets: 4, // so viele Blätter (neueste zuerst) fließen in eine Übungsklausur
    promptItems: 8, // Einträge je Liste im Prompt
    promptChars: 2800,
    maxTitleChars: 80,
  },
  weaknesses: {
    // Schwächen über alle Klausuren (Seite Klausuren → Schwächen, ohne KI, aus den gespeicherten Korrekturen)
    minTasks: 2, // so viele Aufgaben braucht ein Operator, bevor er als Schwäche gilt
    weakShare: 0.7, // unter diesem Anteil der Punkte gilt ein Operator oder Bereich als schwach
    afbGap: 0.15, // AFB III so weit unter AFB I: eigener Hinweis
    trendPoints: 1, // so viele Notenpunkte Unterschied zwischen den letzten Quartalen sind ein Trend
    maxItems: 5, // schwächste Operatoren in der Anzeige
    recentReviews: 3, // aus so vielen letzten Korrekturen stammen die genannten Schwächen und nächsten Schritte
  },
  topics: {
    // Themenliste aus Notizen vorschlagen (Edge Function suggest-topics, Modell CONFIG.ai.models.text, also Haiku)
    maxNotes: 15, // so viele Notizen lassen sich als Grundlage wählen
    maxSuggestions: 12, // Themen pro Vorschlag
    minSuggestions: 6,
    maxTitleChars: 80,
    maxMaterialChars: 14000, // Zusammenfassungen der Notizen im Prompt
    maxTokens: 1500, // Obergrenze der Antwort, das Denken zählt mit
    fallbackNotes: 8, // ohne frühere Klausur im Fach: so viele neueste Notizen vorwählen
  },
  admin: {
    // Verstecktes Protokoll (Einstellungen → Version mehrmals antippen, dann Passwort)
    tapsNeeded: 5,
    tapGapMs: 1500, // so schnell muss der nächste Tipp kommen, sonst zählt es von vorn
    logLimit: 200, // so viele KI-Anfragen zeigt das Protokoll
    logKeepDays: 90, // ältere Einträge löscht die Function beim Abruf
    wrongPasswordDelayMs: 700, // Wartezeit nach falschem Passwort, bremst das Durchprobieren
  },
  review: {
    // Wochenrückblick
    studyDayMinMinutes: 15, // ab so vielen Minuten zählt ein Tag als Lerntag
    behindMinMinutes: 30, // so viel weniger als geplant, damit es erwähnt wird
    behindMinShare: 0.25, // und mindestens dieser Anteil des Plans
    lowSleepHours: 7,
    examLookaheadDays: 14,
    maxHints: 4,
  },
  cards: {
    // Karteikarten: Leitner-Kästen. Eine Karte im Kasten b kommt nach intervalsDays[b] Tagen wieder.
    intervalsDays: [0, 1, 3, 7, 14, 30, 60],
    // Schwierigkeit 1 bis 4 (einfach bis sehr schwer): schwere Karten kommen früher wieder, einfache später
    difficultyFactor: [1.5, 1, 0.75, 0.6],
    maxNewPerSession: 10, // neue Karten pro Lernrunde
    maxPerSession: 30, // Karten pro Lernrunde insgesamt
    minSentenceChars: 25, // kürzere Aussagen ergeben keine Lückenkarte
    minTermChars: 3,
    maxSuggestionsPerNote: 12,
  },
  pdf: {
    // Arbeitsblätter zu einem PDF zusammenfügen (im Browser, ohne KI)
    imageEdge: 1600, // längste Kante der Fotos im PDF in Pixeln, nie vergrößern (1600 px auf A4 sind etwa 190 dpi, gut lesbar)
    imageQuality: 0.75, // spart Speicher, Text bleibt scharf
    maxPages: 100,
    maxBytes: 30 * 1024 * 1024, // passt zur Grenze des Speichers "documents"
    a4: { width: 595.28, height: 841.89 }, // Punkte
    folderMaxPages: 400, // Lernordner (alle PDFs eines Fachs zu einem), Schutz für den Speicher auf dem iPad
  },
  dsb: {
    // Plausibilität der Pläne aus DSBmobile: Stunden 1 bis maxPeriod, ein Eintrag höchstens maxSpan Stunden lang
    maxPeriod: 14,
    maxSpan: 8,
    // Pläne von gestern an bis in so vielen Tagen werden akzeptiert (Datum davor oder danach gilt als unplausibel)
    pastDays: 1,
    futureDays: 21,
    // Ab so vielen Stunden seit dem Abruf gilt der Stand als veraltet (die App prüft DSBmobile bei geöffneter App alle paar Minuten)
    staleHours: 18,
    // Prüfung auf Neues bei DSBmobile (nur das Menü, ein Aufruf): frühestens alle checkGapMin Minuten je Gerät, bei sichtbarer App
    // alle checkEveryMin Minuten. Die Function erlaubt 20 Aufrufe je Konto in 10 Minuten, hier kommen höchstens 3 je Gerät.
    checkGapMin: 4,
    checkEveryMin: 8,
    // Voller Abruf spätestens nach so vielen Stunden, auch wenn DSBmobile nichts Neues meldet
    fullMaxAgeHours: 3,
    // Nach einem Abruf, dessen Plan nicht übernommen wurde (kaputt oder unvollständig), frühestens nach so vielen Minuten erneut
    retryGapMin: 10,
  },
  homework: {
    // Hausaufgaben und Anhänge aus den Kursmappen in Lanis ("Mein Unterricht"): so lange bleiben Einträge in der App
    keepDays: 60,
    // Nur Hausaufgaben aus Einträgen der letzten Tage werden zu Aufgaben (beim ersten Abruf soll nicht das ganze Halbjahr auftauchen)
    taskDays: 7,
    // Länge des Aufgabentitels aus dem Hausaufgabentext
    titleMax: 90,
    // Obergrenzen für den Abruf (die Function hält dieselben Zahlen ein): Kursmappen je Abruf, Dateien je Download
    maxCourses: 20,
    maxDownloads: 12,
    // Hausaufgabenabruf höchstens alle so viele Stunden (bei Start und Rückkehr in die App)
    maxAgeHours: 2,
  },
  school: {
    // Eine Freistunde zwischen diesen beiden Stunden (ausschließlich) ist Mittagspause zum Essen, nicht zum Lernen.
    lunchAfterPeriod: 6,
    lunchBeforePeriod: 8,
  },
  reality: {
    // Soll gegen Ist: ab wann gilt jemand als im Plan, zurück oder weit zurück
    toleranceMin: 30,
    toleranceShare: 0.1,
    farBehindMin: 90,
    farBehindShare: 0.3,
  },
  spacing: {
    // Grobe Näherung: optimaler Abstand ~43 % bei 7 Tagen, ~8 % bei 350 Tagen
    shortDays: 7,
    shortShare: 0.43,
    longDays: 350,
    longShare: 0.08,
  },
  timer: {
    focusMin: 25,
    shortBreakMin: 5,
    longBreakMin: 15,
    sessionsUntilLongBreak: 4,
  },
  daily: {
    // Alltag: "Als Nächstes" auf Heute, Serie, kurze Kartenrunden
    minSessionMin: 10, // kürzere Einheiten schlägt die App nicht vor (auch nicht für eine kurze Freistunde)
    minRemainingMin: 5, // weniger Rest eines Blocks zählt als erledigt
    freeSlotLookaheadMin: 20, // eine Freistunde, die in so vielen Minuten beginnt, gilt schon als Gelegenheit
    secondsPerCardEstimate: 30, // Schätzung für "ca. 3 min" bei einer Kartenrunde
    miniRoundCards: 5, // "5 Karten jetzt"
    secondsPerCardCap: 45, // Lernzeit einer Kartenrunde: höchstens so viele Sekunden je beantworteter Karte (vergessene Tabs zählen nicht)
    streakMinMinutes: 10, // ab so vielen Minuten Lernzeit zählt ein Tag für die Serie
    streakGraceEveryDays: 7, // ein Ausfalltag bricht die Serie nicht, höchstens einer in so vielen Tagen
    streakLookbackDays: 400,
    overdueTaskDays: 14, // offene Aufgaben der letzten Tage erscheinen noch auf Heute
  },
} as const;

export type Config = typeof CONFIG;
