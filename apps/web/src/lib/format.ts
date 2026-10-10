export function formatMinutes(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

export function formatHours(h: number): string {
  return `${(Math.round(h * 10) / 10).toString().replace('.', ',')} h`;
}

export function formatDays(d: number): string {
  return `${d} ${d === 1 ? 'Tag' : 'Tage'}`;
}

/** "in 1 Tag", "in 14 Tagen" */
export function formatInDays(d: number): string {
  return `in ${d} ${d === 1 ? 'Tag' : 'Tagen'}`;
}

export function formatNumber(n: number, digits = 1): string {
  return (Math.round(n * 10 ** digits) / 10 ** digits).toString().replace('.', ',');
}

export function formatDateLong(date: Date): string {
  return new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
}

export function formatDateShort(iso: string): string {
  const [y, m, d] = (iso ?? '').split('-').map(Number);
  const date = new Date(y, m - 1, d);
  // Ohne gültiges Datum (zum Beispiel ein Eintrag, der gerade erst angelegt wird) lieber nichts anzeigen als abstürzen
  if (!y || !m || !d || Number.isNaN(date.getTime())) return '–';
  return new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short' }).format(date);
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** "Heute", "Morgen" oder "Do., 8. Okt." für eine Agenda-Zeile. */
export function formatAgendaDay(iso: string, todayIso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const [ty, tm, td] = todayIso.split('-').map(Number);
  const diff = Math.round((new Date(y, m - 1, d).getTime() - new Date(ty, tm - 1, td).getTime()) / 86_400_000);
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Morgen';
  return new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(y, m - 1, d));
}

/** "Heute", "Gestern" oder "Mi., 30. Sep." für die Tagesüberschrift bei den Notizen. */
export function formatNoteDay(iso: string, todayIso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const [ty, tm, td] = todayIso.split('-').map(Number);
  const diff = Math.round((new Date(y, m - 1, d).getTime() - new Date(ty, tm - 1, td).getTime()) / 86_400_000);
  if (diff === 0) return 'Heute';
  if (diff === -1) return 'Gestern';
  return new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(y, m - 1, d));
}

/** "Diese Woche", "Letzte Woche" oder "KW 39 · 21. – 27. Sept." */
export function formatWeekLabel(w: { start: string; end: string; weeksAgo: number; kw: number }): string {
  if (w.weeksAgo === 0) return 'Diese Woche';
  if (w.weeksAgo === 1) return 'Letzte Woche';
  const fmt = (iso: string, withMonth: boolean) => {
    const [y, m, d] = iso.split('-').map(Number);
    return withMonth
      ? new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short' }).format(new Date(y, m - 1, d))
      : `${d}.`;
  };
  const sameMonth = w.start.slice(0, 7) === w.end.slice(0, 7);
  return `KW ${w.kw} · ${fmt(w.start, !sameMonth)} – ${fmt(w.end, true)}`;
}
