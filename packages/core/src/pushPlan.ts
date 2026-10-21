/**
 * Erinnerungen auf dem Handy: aus dem Plan werden die Mitteilungen der nächsten Tage berechnet (Tagesplan morgens, Klausur naht,
 * Rückstand). Die App lädt sie in die Warteschlange, der Server verschickt sie zur Uhrzeit. Reine Funktionen, nur Web-App.
 */
import { CONFIG } from './config';
import { addDays } from './schedule';

export interface PushPrefs {
  on: boolean; // Hauptschalter
  plan: boolean; // Tagesplan morgens
  exam: boolean; // Klausur naht und Rückstand
  planTime: string; // HH:MM
  examTime: string; // HH:MM
}

export const defaultPushPrefs = (): PushPrefs => ({ on: false, plan: true, exam: true, planTime: CONFIG.push.planTime, examTime: CONFIG.push.examTime });

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Uhrzeit auf die erlaubte Spanne begrenzen (ruhige Zeit nachts), ungültige Eingaben werden zum Standard. */
export function clampTime(value: unknown, fallback: string): string {
  const v = typeof value === 'string' && TIME.test(value) ? value : fallback;
  if (v < CONFIG.push.earliest) return CONFIG.push.earliest;
  if (v > CONFIG.push.latest) return CONFIG.push.latest;
  return v;
}

/** Gespeicherte Einstellungen sicher lesen. */
export function readPushPrefs(v: unknown): PushPrefs {
  const d = defaultPushPrefs();
  if (typeof v !== 'object' || v === null) return d;
  const o = v as Record<string, unknown>;
  return {
    on: o.on === true,
    plan: o.plan !== false,
    exam: o.exam !== false,
    planTime: clampTime(o.planTime, d.planTime),
    examTime: clampTime(o.examTime, d.examTime),
  };
}

export interface PushDay {
  date: string; // YYYY-MM-DD
  blocks: { subject: string; minutes: number }[]; // geplante Blöcke, gleiche Fächer schon zusammengefasst
}

export interface PushExam {
  id: string;
  subject: string;
  date: string; // YYYY-MM-DD
  remainingMin: number; // laut Plan noch zu lernen
  behindMin: number; // Minuten hinter dem Plan bis gestern, 0 wenn im Plan oder voraus
  behind: boolean; // zurück oder weit zurück
}

export type PushKind = 'plan' | 'exam' | 'behind' | 'test';

export interface PushItem {
  kind: PushKind;
  dueAt: string; // ISO (UTC)
  title: string;
  body: string;
  url: string; // Route in der App, zum Beispiel "/klausur/ID"
}

const at = (date: string, time: string): Date => {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return new Date(y!, m! - 1, d!, h!, mi!, 0, 0);
};

const dayDiff = (from: string, to: string): number => Math.round((at(to, '12:00').getTime() - at(from, '12:00').getTime()) / 86_400_000);

export function pushMinutes(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h} Std.` : `${h} Std. ${r} min`;
}

const inDays = (n: number) => (n === 0 ? 'heute' : n === 1 ? 'morgen' : `in ${n} Tagen`);

/**
 * Berechnet die Mitteilungen ab jetzt. Nur Zeitpunkte in der Zukunft, nie vor der ruhigen Zeit. Der Tagesplan kommt für heute und
 * morgen (danach ändert sich der Plan zu oft), "Klausur naht" 7, 3 und 1 Tag vorher, "Rückstand" nur heute Abend für die dringendste
 * Klausur. Jede Mitteilung enthält nur, was für den Tag stimmt.
 */
export function buildPushItems(input: {
  now: Date;
  today: string;
  days: PushDay[];
  exams: PushExam[];
  prefs: PushPrefs;
  /** Karten, die heute fällig sind (kommt in den Tagesplan von heute). */
  cardsDue?: number;
  /** Serie: erinnert am Abend (CONFIG.push.streakTime), wenn heute noch nichts passiert ist. Gehört zum Schalter "Tagesplan". */
  streak?: { current: number; todayDone: boolean };
}): PushItem[] {
  const { now, today, days, exams, prefs } = input;
  const out: PushItem[] = [];
  const future = (d: Date) => d.getTime() > now.getTime() + 30_000;
  const upcoming = exams.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));

  if (prefs.plan) {
    for (let i = 0; i < CONFIG.push.planDays; i++) {
      const date = addDays(today, i);
      const due = at(date, prefs.planTime);
      if (!future(due)) continue;
      const examToday = upcoming.find((e) => e.date === date);
      const day = days.find((d) => d.date === date);
      const total = day?.blocks.reduce((s, b) => s + b.minutes, 0) ?? 0;
      const label = i === 0 ? 'Heute' : 'Morgen';
      const next = upcoming.find((e) => e.date > date);
      const nextLine = next ? ` Nächste Klausur: ${next.subject} ${inDays(dayDiff(date, next.date))}.` : '';
      if (examToday) {
        out.push({ kind: 'plan', dueAt: due.toISOString(), title: `${label} Klausur in ${examToday.subject}`, body: `Viel Erfolg! Schlaf gut, iss etwas und geh ruhig in die Klausur.`, url: `/klausur/${examToday.id}` });
      } else if (total > 0 && day) {
        const subjects = day.blocks.slice(0, CONFIG.push.maxSubjects).map((b) => `${b.subject} ${pushMinutes(b.minutes)}`);
        const more = day.blocks.length > CONFIG.push.maxSubjects ? ` und ${day.blocks.length - CONFIG.push.maxSubjects} weitere` : '';
        const cards = i === 0 && (input.cardsDue ?? 0) > 0 ? ` Dazu ${input.cardsDue} ${input.cardsDue === 1 ? 'Karte' : 'Karten'} zum Üben.` : '';
        out.push({ kind: 'plan', dueAt: due.toISOString(), title: `${label}: ${pushMinutes(total)} lernen`, body: `${subjects.join(' · ')}${more}.${cards}${nextLine}`, url: '/' });
      }
    }
  }

  if (prefs.plan && input.streak && !input.streak.todayDone && input.streak.current >= CONFIG.daily.streakNudgeMinDays) {
    const due = at(today, CONFIG.push.streakTime);
    if (future(due)) {
      out.push({
        kind: 'plan',
        dueAt: due.toISOString(),
        title: `Deine Serie: ${input.streak.current} Tage`,
        body: `Heute zählen schon ${CONFIG.daily.streakMinMinutes} Minuten Fokus oder ${CONFIG.daily.streakMinCards} Karten, dann bleibt sie bestehen.`,
        url: '/',
      });
    }
  }

  if (prefs.exam) {
    for (const e of upcoming) {
      const left = dayDiff(today, e.date);
      for (const lead of CONFIG.push.examLeadDays) {
        if (left < lead) continue;
        const due = at(addDays(e.date, -lead), prefs.examTime);
        if (!future(due) || left > lead + 14) continue;
        const open = e.remainingMin > 0 ? `Laut Plan sind noch etwa ${pushMinutes(e.remainingMin)} offen.` : 'Laut Plan bist du fertig, wiederhole nur noch.';
        out.push({ kind: 'exam', dueAt: due.toISOString(), title: `${e.subject}: Klausur ${lead === 1 ? 'morgen' : `in ${lead} Tagen`}`, body: open, url: `/klausur/${e.id}` });
      }
    }
    const due = at(today, prefs.examTime);
    const behind = upcoming.filter((e) => e.behind && e.behindMin > 0 && e.date > today);
    if (future(due) && behind.length > 0) {
      const first = behind[0]!;
      const others = behind.length > 1 ? ` Außerdem hinten: ${behind.length - 1} weitere ${behind.length === 2 ? 'Klausur' : 'Klausuren'}.` : '';
      out.push({
        kind: 'behind',
        dueAt: due.toISOString(),
        title: `Du liegst bei ${first.subject} zurück`,
        body: `${pushMinutes(first.behindMin)} hinter dem Plan, die Klausur ist ${inDays(dayDiff(today, first.date))}. Heute noch ein Block hilft.${others}`,
        url: `/klausur/${first.id}`,
      });
    }
  }
  return out.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}
