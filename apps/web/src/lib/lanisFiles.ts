/**
 * Übergabe von Anhängen aus Lanis an das Hochladen von Notizen: Die Seite Hausaufgaben lädt die Dateien aus Lanis
 * und legt sie hier ab, NoteUpload übernimmt sie beim Öffnen (Dateien, Fach, Datum, Lehrkraft) und führt wie gewohnt weiter.
 * Nur im Speicher des Tabs, nichts davon wird gespeichert, bevor der Nutzer in NoteUpload bestätigt.
 */
export interface PendingUpload {
  files: File[];
  /** Dateiname -> Schlüssel `KURS:EINTRAG:Name`, damit die Notiz merkt, welche Anhänge aus Lanis stammen */
  keys: Record<string, string>;
  subjectId: string | null;
  /** Datum des Eintrags (YYYY-MM-DD) */
  date: string;
  /** Kürzel der Lehrkraft wie im Stundenplan, leer wenn unbekannt */
  teacher: string;
}

let pending: PendingUpload | null = null;

export const setPendingUpload = (p: PendingUpload) => {
  pending = p;
};

/** Ansehen, ohne zu entfernen (React ruft Initialisierer in der Entwicklung doppelt auf). */
export const peekPendingUpload = () => pending;

export const clearPendingUpload = () => {
  pending = null;
};
