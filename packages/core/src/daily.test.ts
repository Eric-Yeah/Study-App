import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { cardRoundMinutes, currentFreeSlot, estimateCardMinutes, guessSubjectId, nextUp, sessionLength, studyStreak, timeOf, type NextUpInput } from './daily';
import type { Timetable } from './lanisPlans';

// 2026-10-19 ist ein Montag
const MON = '2026-10-19';
const periods = [
  { period: 1, start: '08:00', end: '08:45' },
  { period: 2, start: '08:50', end: '09:35' },
  { period: 3, start: '09:55', end: '10:40' },
  { period: 4, start: '10:45', end: '11:30' },
  { period: 5, start: '11:50', end: '12:35' },
  { period: 6, start: '12:40', end: '13:25' },
  { period: 7, start: '13:30', end: '14:15' },
  { period: 8, start: '14:20', end: '15:05' },
];
const lesson = (period: number, abbr: string, span = 1) => ({
  weekday: 0,
  period,
  span,
  start: periods[period - 1].start,
  end: periods[period + span - 2].end,
  course: `Q1${abbr}01`,
  abbr,
  isAdvanced: false,
  room: 'A1',
  teacher: 'XY',
});
// Montag: M (1), frei 2, E (3), frei 4 und 5 (zusammen eine lange Freistunde), D (6), Mittag 7, BIO (8)
const tt: Timetable = { validFrom: null, periods, lessons: [lesson(1, 'M'), lesson(3, 'E'), lesson(6, 'D'), lesson(8, 'BIO')] };

describe('currentFreeSlot', () => {
  it('läuft gerade: Rest der Freistunde', () => {
    expect(currentFreeSlot(tt, MON, '08:55')).toEqual({ start: '08:50', end: '09:35', minutes: 40, running: true });
  });
  it('beginnt bald: volle Länge, running false', () => {
    const s = currentFreeSlot(tt, MON, '08:40');
    expect(s).toMatchObject({ start: '08:50', minutes: 45, running: false });
  });
  it('zu früh vor der Freistunde: keine', () => {
    expect(currentFreeSlot(tt, MON, '08:05')).toBeNull();
  });
  it('aufeinanderfolgende Freistunden zählen als eine', () => {
    expect(currentFreeSlot(tt, MON, '10:50')).toEqual({ start: '10:45', end: '12:35', minutes: 105, running: true });
  });
  it('Mittagspause ist keine Gelegenheit', () => {
    expect(currentFreeSlot(tt, MON, '13:40')).toBeNull();
  });
  it('zu kurzer Rest und kein Stundenplan: keine', () => {
    expect(currentFreeSlot(tt, MON, '09:30')).toBeNull(); // nur noch 5 Minuten
    expect(currentFreeSlot(null, MON, '09:00')).toBeNull();
    expect(currentFreeSlot(tt, '2026-10-24', '09:00')).toBeNull(); // Samstag
  });
});

describe('guessSubjectId / timeOf', () => {
  const subjects = [
    { id: 'm', name: 'Mathe' },
    { id: 'e', name: 'Englisch' },
  ];
  it('nimmt die laufende oder zuletzt beendete Stunde', () => {
    expect(guessSubjectId(tt, subjects, MON, '08:20')).toBe('m');
    expect(guessSubjectId(tt, subjects, MON, '10:00')).toBe('e');
    expect(guessSubjectId(null, subjects, MON, '10:00')).toBeNull();
  });
  it('formatiert die Uhrzeit mit führenden Nullen', () => {
    expect(timeOf(new Date(2026, 9, 21, 7, 5))).toBe('07:05');
  });
});

describe('sessionLength', () => {
  it('Timerlänge, gekürzt auf Rest und Freistunde, auf 5 abgerundet, mindestens 10', () => {
    expect(sessionLength(25, 60, null)).toBe(25);
    expect(sessionLength(25, 17, null)).toBe(15);
    expect(sessionLength(25, 8, null)).toBe(CONFIG.daily.minSessionMin);
    expect(sessionLength(45, null, { start: '09:00', end: '09:32', minutes: 32, running: true })).toBe(30);
    expect(sessionLength(25, null, { start: '09:00', end: '09:13', minutes: 13, running: true })).toBe(10);
  });
});

describe('nextUp', () => {
  const base: NextUpInput = {
    blocks: [],
    learnedBySubject: {},
    dueCards: 0,
    openTasks: [],
    slot: null,
    focusMin: 25,
    fallbackSubjectIds: ['m', 'e'],
  };
  const blocks = [
    { examId: 'x1', subjectId: 'e', examDate: '2026-10-30', plannedMin: 40 },
    { examId: 'x2', subjectId: 'm', examDate: '2026-10-26', plannedMin: 30 },
  ];

  it('früheste Klausur zuerst, Länge wie der Timer', () => {
    const n = nextUp({ ...base, blocks });
    expect(n).toMatchObject({ kind: 'study', subjectId: 'm', examId: 'x2', minutes: 25, plannedMin: 30, remainingMin: 30 });
  });
  it('rechnet schon Gelerntes ab und wechselt, wenn das Fach fertig ist', () => {
    const part = nextUp({ ...base, blocks, learnedBySubject: { m: 20 } });
    expect(part).toMatchObject({ kind: 'study', subjectId: 'm', remainingMin: 10, minutes: 10 });
    const done = nextUp({ ...base, blocks, learnedBySubject: { m: 28 } });
    expect(done).toMatchObject({ kind: 'study', subjectId: 'e', remainingMin: 40 });
  });
  it('fasst mehrere Blöcke eines Fachs zusammen', () => {
    const n = nextUp({ ...base, blocks: [...blocks, { examId: 'x3', subjectId: 'm', examDate: '2026-11-02', plannedMin: 20 }] });
    expect(n).toMatchObject({ subjectId: 'm', plannedMin: 50, examId: 'x2' });
  });
  it('eine kurze Freistunde kürzt die Einheit und wird mitgegeben', () => {
    const slot = { start: '09:00', end: '09:20', minutes: 20, running: true };
    const n = nextUp({ ...base, blocks, slot });
    expect(n).toMatchObject({ kind: 'study', minutes: 20, slot });
    const long = nextUp({ ...base, blocks, slot: { ...slot, minutes: 90 } });
    expect(long).toMatchObject({ minutes: 25, slot: { minutes: 90 } }); // die Freistunde bleibt als Hinweis, kürzt aber nichts
  });
  it('ohne Rest im Plan: erst Aufgabe, dann Karten', () => {
    const tasks = [{ id: 't1', title: 'Vokabeln', subjectId: 'e' }];
    expect(nextUp({ ...base, blocks, learnedBySubject: { m: 30, e: 40 }, openTasks: tasks, dueCards: 8 })).toMatchObject({ kind: 'task', taskId: 't1', subjectId: 'e' });
    expect(nextUp({ ...base, blocks, learnedBySubject: { m: 30, e: 40 }, dueCards: 8 })).toEqual({ kind: 'cards', count: 8 });
  });
  it('ohne Plan: wichtigstes Fach, nach genug Lernzeit erledigt', () => {
    expect(nextUp(base)).toMatchObject({ kind: 'free', subjectId: 'm', minutes: 25 });
    expect(nextUp({ ...base, learnedBySubject: { e: 30 } })).toEqual({ kind: 'done', hadPlan: false });
    expect(nextUp({ ...base, fallbackSubjectIds: [] })).toEqual({ kind: 'done', hadPlan: false });
  });
  it('Plan erfüllt: erledigt mit hadPlan', () => {
    expect(nextUp({ ...base, blocks, learnedBySubject: { m: 40, e: 40 } })).toEqual({ kind: 'done', hadPlan: true });
  });
  it('Rest unter der Schwelle gilt als erledigt', () => {
    expect(nextUp({ ...base, blocks: [blocks[1]], learnedBySubject: { m: 27 } })).toEqual({ kind: 'done', hadPlan: true });
  });
});

describe('Kartenrunde', () => {
  it('Lernzeit ist gedeckelt, vergessene Tabs zählen nicht', () => {
    expect(cardRoundMinutes(3 * 60_000, 5)).toBe(3);
    expect(cardRoundMinutes(60 * 60_000, 5)).toBe(4); // 5 mal 45 s = 225 s
    expect(cardRoundMinutes(10_000, 1)).toBe(0);
    expect(cardRoundMinutes(-5, 3)).toBe(0);
  });
  it('Schätzung mindestens eine Minute', () => {
    expect(estimateCardMinutes(1)).toBe(1);
    expect(estimateCardMinutes(10)).toBe(5);
  });
});

describe('studyStreak', () => {
  const T = '2026-10-21'; // Mittwoch
  const days = (list: Record<string, number>) => ({ minutesByDate: list, today: T });

  it('zählt Tage in Folge, heute offen bricht nichts', () => {
    const r = studyStreak(days({ '2026-10-20': 30, '2026-10-19': 15, '2026-10-18': 20 }));
    expect(r.current).toBe(3);
    expect(r.todayDone).toBe(false);
    expect(r.needTodayMin).toBe(CONFIG.daily.streakMinMinutes);
  });
  it('heute zählt dazu, sobald genug gelernt ist', () => {
    const r = studyStreak(days({ [T]: 12, '2026-10-20': 30 }));
    expect(r.current).toBe(2);
    expect(r.todayDone).toBe(true);
    expect(r.needTodayMin).toBe(0);
    expect(studyStreak(days({ [T]: 4 })).needTodayMin).toBe(6);
  });
  it('ein Ausfalltag bricht die Serie nicht, zwei hintereinander schon', () => {
    const one = studyStreak(days({ '2026-10-20': 30, '2026-10-18': 30, '2026-10-17': 30 })); // 19. fehlt
    expect(one.current).toBe(3);
    expect(one.savedDate).toBe('2026-10-19');
    const two = studyStreak(days({ '2026-10-20': 30, '2026-10-17': 30, '2026-10-16': 30 })); // 18. und 19. fehlen
    expect(two.current).toBe(1);
    expect(two.savedDate).toBeNull();
  });
  it('gestern frei und heute noch offen: Serie bleibt, am nächsten Tag ohne Lernen ist sie weg', () => {
    const evening = studyStreak(days({ '2026-10-19': 30, '2026-10-18': 30 })); // 20. fehlt, heute offen
    expect(evening.current).toBe(2);
    const next = studyStreak({ minutesByDate: { '2026-10-19': 30, '2026-10-18': 30 }, today: '2026-10-22' }); // 20. und 21. fehlen
    expect(next.current).toBe(0);
  });
  it('zwei Gnadentage brauchen mindestens eine Woche Abstand', () => {
    const near = studyStreak(days({ '2026-10-20': 30, '2026-10-18': 30, '2026-10-16': 30, '2026-10-15': 30 })); // 19. und 17. fehlen
    expect(near.current).toBe(2); // der zweite Ausfall liegt zu nah am ersten
    const far = studyStreak(days({ '2026-10-20': 30, '2026-10-18': 30, '2026-10-17': 30, '2026-10-16': 30, '2026-10-15': 30, '2026-10-14': 30, '2026-10-13': 30, '2026-10-11': 30 })); // 19. und 12. fehlen
    expect(far.current).toBe(8);
  });
  it('lernfreie Tage zählen nicht und bremsen nicht', () => {
    const r = studyStreak({ minutesByDate: { '2026-10-20': 30, '2026-10-18': 30, '2026-10-16': 30 }, today: T, isNeutral: (d) => d === '2026-10-19' || d === '2026-10-17' });
    expect(r.current).toBe(3);
    expect(r.savedDate).toBeNull();
  });
  it('bester Wert und Woche von Montag bis Sonntag', () => {
    const r = studyStreak(days({ '2026-10-20': 30, '2026-10-01': 20, '2026-10-02': 20, '2026-10-03': 20, '2026-10-04': 20, '2026-10-05': 20 }));
    expect(r.current).toBe(1);
    expect(r.best).toBe(5);
    expect(r.week.map((d) => d.date)).toEqual(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
    expect(r.week[1]).toMatchObject({ active: true, today: false, future: false });
    expect(r.week[2]).toMatchObject({ today: true, active: false });
    expect(r.week[3].future).toBe(true);
  });
  it('leere Daten: Serie 0', () => {
    expect(studyStreak(days({}))).toMatchObject({ current: 0, best: 0, todayDone: false });
  });
});
