import { describe, expect, it } from 'vitest';
import { buildPushItems, clampTime, defaultPushPrefs, pushMinutes, readPushPrefs, type PushExam, type PushPrefs } from './pushPlan';

const exam = (o: Partial<PushExam> = {}): PushExam => ({ id: 'e1', subject: 'Mathe', date: '2026-10-14', remainingMin: 150, behindMin: 0, behind: false, ...o });
const prefs = (o: Partial<PushPrefs> = {}): PushPrefs => ({ ...defaultPushPrefs(), on: true, ...o });
const now = new Date(2026, 9, 10, 6, 0); // 10.10.2026 6:00
const local = (iso: string) => new Date(iso);
const hhmm = (iso: string) => `${String(local(iso).getHours()).padStart(2, '0')}:${String(local(iso).getMinutes()).padStart(2, '0')}`;
const base = {
  now,
  today: '2026-10-10',
  days: [
    { date: '2026-10-10', blocks: [{ subject: 'Mathe', minutes: 45 }, { subject: 'Bio', minutes: 30 }] },
    { date: '2026-10-11', blocks: [{ subject: 'Mathe', minutes: 60 }] },
    { date: '2026-10-12', blocks: [{ subject: 'Mathe', minutes: 60 }] },
  ],
};

describe('Einstellungen', () => {
  it('begrenzt Uhrzeiten auf die ruhige Zeit', () => {
    expect(clampTime('03:00', '07:00')).toBe('06:30');
    expect(clampTime('23:15', '18:00')).toBe('21:30');
    expect(clampTime('07:45', '07:00')).toBe('07:45');
    expect(clampTime('kaputt', '07:00')).toBe('07:00');
    expect(clampTime(5, '18:00')).toBe('18:00');
  });
  it('liest gespeicherte Einstellungen sicher, Standard ist aus', () => {
    expect(defaultPushPrefs().on).toBe(false);
    expect(readPushPrefs(null)).toEqual(defaultPushPrefs());
    expect(readPushPrefs({ on: true, plan: false, planTime: '05:00', examTime: 'x' })).toEqual({ on: true, plan: false, exam: true, planTime: '06:30', examTime: '18:00' });
    expect(readPushPrefs({ on: 'ja' }).on).toBe(false);
  });
  it('schreibt Minuten lesbar', () => {
    expect(pushMinutes(45)).toBe('45 min');
    expect(pushMinutes(60)).toBe('1 Std.');
    expect(pushMinutes(150)).toBe('2 Std. 30 min');
    expect(pushMinutes(-5)).toBe('0 min');
  });
});

describe('Tagesplan morgens', () => {
  it('kommt für heute und morgen zur gewählten Uhrzeit', () => {
    const items = buildPushItems({ ...base, exams: [exam()], prefs: prefs({ exam: false }) });
    expect(items.map((i) => i.kind)).toEqual(['plan', 'plan']);
    expect(items.map((i) => hhmm(i.dueAt))).toEqual(['07:00', '07:00']);
    expect(items[0]).toMatchObject({ title: 'Heute: 1 Std. 15 min lernen', url: '/' });
    expect(items[0]!.body).toBe('Mathe 45 min · Bio 30 min. Nächste Klausur: Mathe in 4 Tagen.');
    expect(items[1]!.title).toBe('Morgen: 1 Std. lernen');
  });
  it('lässt vergangene Zeitpunkte und Tage ohne Lernzeit weg', () => {
    const late = new Date(2026, 9, 10, 8, 0);
    const items = buildPushItems({ ...base, now: late, exams: [], prefs: prefs({ exam: false }), days: [{ date: '2026-10-10', blocks: [] }, { date: '2026-10-11', blocks: [] }] });
    expect(items).toEqual([]);
  });
  it('wünscht am Klausurtag Erfolg', () => {
    const items = buildPushItems({ ...base, exams: [exam({ date: '2026-10-11' })], prefs: prefs({ exam: false }) });
    expect(items[1]).toMatchObject({ title: 'Morgen Klausur in Mathe', url: '/klausur/e1' });
  });
  it('fasst viele Fächer zusammen', () => {
    const blocks = ['A', 'B', 'C', 'D', 'E', 'F'].map((s) => ({ subject: s, minutes: 10 }));
    const items = buildPushItems({ ...base, days: [{ date: '2026-10-10', blocks }], exams: [], prefs: prefs({ exam: false }) });
    expect(items[0]!.body).toBe('A 10 min · B 10 min · C 10 min · D 10 min und 2 weitere.');
  });
  it('nennt fällige Karteikarten im Tagesplan', () => {
    const days = [{ date: '2026-10-10', blocks: [{ subject: 'Mathe', minutes: 45 }], cards: 12 }, { date: '2026-10-11', blocks: [] }];
    const items = buildPushItems({ ...base, days, exams: [], prefs: prefs({ exam: false }) });
    expect(items[0]!.body).toBe('Mathe 45 min. Dazu 12 Karten zum Wiederholen.');
  });
  it('schickt auch ohne Lernblock eine Erinnerung, wenn Karten fällig sind', () => {
    const days = [{ date: '2026-10-10', blocks: [], cards: 8 }, { date: '2026-10-11', blocks: [], cards: 0 }];
    const items = buildPushItems({ ...base, days, exams: [], prefs: prefs({ exam: false }) });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'plan', title: 'Heute: 8 Karten fällig', url: '/karten?runde=5&von=heute' });
    expect(items[0]!.body).toBe('Etwa 4 min, ein kurzer Durchgang reicht.');
    const one = buildPushItems({ ...base, days: [{ date: '2026-10-10', blocks: [], cards: 1 }], exams: [], prefs: prefs({ exam: false }) });
    expect(one[0]!.title).toBe('Heute: 1 Karte fällig');
  });
  it('ist aus, wenn der Tagesplan abgeschaltet ist', () => {
    expect(buildPushItems({ ...base, exams: [exam()], prefs: prefs({ plan: false, exam: false }) })).toEqual([]);
  });
});

describe('Klausur naht und Rückstand', () => {
  it('erinnert 7, 3 und 1 Tag vorher um 18 Uhr, nur was noch kommt', () => {
    const items = buildPushItems({ ...base, exams: [exam({ date: '2026-10-17' })], prefs: prefs({ plan: false }) });
    expect(items.map((i) => [i.kind, i.dueAt.slice(0, 10), hhmm(i.dueAt)])).toEqual([
      ['exam', '2026-10-10', '18:00'],
      ['exam', '2026-10-14', '18:00'],
      ['exam', '2026-10-16', '18:00'],
    ]);
    expect(items[0]!.title).toBe('Mathe: Klausur in 7 Tagen');
    expect(items[2]!.title).toBe('Mathe: Klausur morgen');
    expect(items[0]!.body).toBe('Laut Plan sind noch etwa 2 Std. 30 min offen.');
  });
  it('lässt Zeitpunkte aus, die schon vorbei sind', () => {
    const items = buildPushItems({ ...base, now: new Date(2026, 9, 10, 19, 0), exams: [exam({ date: '2026-10-17' })], prefs: prefs({ plan: false }) });
    expect(items.map((i) => i.dueAt.slice(0, 10))).toEqual(['2026-10-14', '2026-10-16']);
  });
  it('meldet den Rückstand heute Abend für die dringendste Klausur', () => {
    const items = buildPushItems({
      ...base,
      exams: [exam({ id: 'b', subject: 'Bio', date: '2026-10-20', behind: true, behindMin: 90 }), exam({ behind: true, behindMin: 40 }), exam({ id: 'c', subject: 'PoWi', date: '2026-10-22', behind: true, behindMin: 10 })],
      prefs: prefs({ plan: false }),
    });
    const behind = items.filter((i) => i.kind === 'behind');
    expect(behind).toHaveLength(1);
    expect(behind[0]).toMatchObject({ title: 'Du liegst bei Mathe zurück', url: '/klausur/e1' });
    expect(behind[0]!.body).toContain('40 min hinter dem Plan, die Klausur ist in 4 Tagen');
    expect(behind[0]!.body).toContain('Außerdem hinten: 2 weitere Klausuren.');
  });
  it('schweigt, wenn alles im Plan ist, und nach der Uhrzeit', () => {
    const calm = buildPushItems({ ...base, exams: [exam()], prefs: prefs({ plan: false }) }).filter((i) => i.kind === 'behind');
    expect(calm).toEqual([]);
    const evening = buildPushItems({ ...base, now: new Date(2026, 9, 10, 19, 0), exams: [exam({ behind: true, behindMin: 40 })], prefs: prefs({ plan: false }) }).filter((i) => i.kind === 'behind');
    expect(evening).toEqual([]);
  });
  it('ignoriert vergangene Klausuren und ist bei ausgeschaltetem Schalter nutzbar', () => {
    expect(buildPushItems({ ...base, exams: [exam({ date: '2026-10-01', behind: true, behindMin: 99 })], prefs: prefs({ plan: false }) })).toEqual([]);
    expect(buildPushItems({ ...base, exams: [exam()], prefs: prefs({ plan: false, exam: false }) })).toEqual([]);
  });
});
