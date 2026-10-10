import { describe, expect, it } from 'vitest';
import { fmtMinutes, weeklyReview, type WeekData } from './weekly';

// Woche vom Montag 5. bis Sonntag 11. Oktober 2026, "heute" ist Donnerstag der 8.
const base = (o: Partial<WeekData> = {}): WeekData => ({
  weekStart: '2026-10-07', // Mittwoch, wird auf den Montag gerechnet
  today: '2026-10-08',
  subjects: [
    { id: 'ph', name: 'Physik', color: '#00f' },
    { id: 'm', name: 'Mathe', color: '#f00' },
  ],
  sessions: [],
  planned: [],
  energy: [],
  sleep: [],
  training: [],
  tasks: [],
  noteDates: [],
  cardReviewDates: [],
  exams: [],
  ...o,
});

describe('fmtMinutes', () => {
  it('Minuten und Stunden', () => {
    expect(fmtMinutes(0)).toBe('0 min');
    expect(fmtMinutes(45)).toBe('45 min');
    expect(fmtMinutes(60)).toBe('1 h');
    expect(fmtMinutes(80)).toBe('1 h 20 min');
    expect(fmtMinutes(-5)).toBe('0 min');
  });
});

describe('weeklyReview', () => {
  it('rechnet auf Montag bis Sonntag und markiert heute und die Zukunft', () => {
    const r = weeklyReview(base());
    expect(r.weekStart).toBe('2026-10-05');
    expect(r.weekEnd).toBe('2026-10-11');
    expect(r.isCurrent).toBe(true);
    expect(r.days.map((d) => d.date)[0]).toBe('2026-10-05');
    expect(r.days.map((d) => d.future)).toEqual([false, false, false, false, true, true, true]);
    expect(r.days[3].isToday).toBe(true);
  });

  it('zählt gelernte Minuten nur in dieser Woche, mit Vorwoche zum Vergleich', () => {
    const r = weeklyReview(
      base({
        sessions: [
          { date: '2026-10-04', subjectId: 'ph', minutes: 100 }, // Sonntag davor
          { date: '2026-10-05', subjectId: 'ph', minutes: 40 },
          { date: '2026-10-05', subjectId: 'm', minutes: 20 },
          { date: '2026-10-07', subjectId: 'ph', minutes: 10 }, // unter 15 min: kein Lerntag
          { date: '2026-10-12', subjectId: 'ph', minutes: 60 }, // Woche danach
        ],
      }),
    );
    expect(r.learned).toBe(70);
    expect(r.prevLearned).toBe(100);
    expect(r.studyDays).toBe(1);
    expect(r.best).toEqual({ date: '2026-10-05', minutes: 60 });
    expect(r.subjects.map((s) => [s.name, s.learned])).toEqual([['Physik', 50], ['Mathe', 20]]);
  });

  it('Fächer mit Plan, aber ohne Lernzeit, erscheinen auch; Fach ohne Eintrag heißt "Ohne Fach"', () => {
    const r = weeklyReview(
      base({
        planned: [{ date: '2026-10-06', subjectId: 'm', minutes: 45 }],
        sessions: [{ date: '2026-10-06', subjectId: null, minutes: 25 }],
      }),
    );
    expect(r.subjects.map((s) => s.name).sort()).toEqual(['Mathe', 'Ohne Fach']);
    expect(r.planned).toBe(45);
  });

  it('Befinden: Schnitt aus den vorhandenen Werten, leere Tage zählen nicht', () => {
    const r = weeklyReview(
      base({
        energy: [{ date: '2026-10-05', value: 4 }, { date: '2026-10-06', value: 3 }, { date: '2026-10-07', value: null }, { date: '2026-10-20', value: 1 }],
        sleep: [{ date: '2026-10-05', hours: 8 }, { date: '2026-10-06', hours: 7.5 }],
        training: [
          { date: '2026-10-05', sessions: 1, minutes: 55 },
          { date: '2026-10-06', sessions: 0, minutes: 0 },
          { date: '2026-10-07', sessions: null, minutes: 30 },
        ],
      }),
    );
    expect(r.energyAvg).toBe(3.5);
    expect(r.sleepAvg).toBe(7.8);
    expect(r.trainingDays).toBe(2);
    expect(r.trainingMinutes).toBe(85);
    expect(weeklyReview(base()).energyAvg).toBeNull();
    expect(weeklyReview(base()).sleepAvg).toBeNull();
  });

  it('Aufgaben, Notizen, Karten und Klausuren der nächsten Tage', () => {
    const r = weeklyReview(
      base({
        tasks: [{ date: '2026-10-05', done: true }, { date: '2026-10-06', done: false }, { date: '2026-11-01', done: true }],
        noteDates: ['2026-10-05', '2026-10-09', '2026-09-30'],
        cardReviewDates: ['2026-10-08', '2026-10-01'],
        exams: [
          { date: '2026-10-20', title: 'Mathe Q1', subjectId: 'm' },
          { date: '2026-10-10', title: 'Physik', subjectId: 'ph' },
          { date: '2026-10-01', title: 'Vorbei', subjectId: 'ph' },
          { date: '2026-12-01', title: 'Zu weit', subjectId: 'ph' },
        ],
      }),
    );
    expect(r.tasks).toEqual({ done: 1, total: 2 });
    expect(r.notes).toBe(2);
    expect(r.cards).toBe(1);
    expect(r.exams.map((e) => [e.title, e.daysLeft])).toEqual([['Physik', 2], ['Mathe Q1', 12]]);
  });

  describe('Hinweise', () => {
    it('Fach hinter dem Plan, nur abgeschlossene Tage zählen', () => {
      const r = weeklyReview(
        base({
          planned: [
            { date: '2026-10-05', subjectId: 'ph', minutes: 60 },
            { date: '2026-10-06', subjectId: 'ph', minutes: 60 },
            { date: '2026-10-08', subjectId: 'ph', minutes: 60 }, // heute, zählt noch nicht
          ],
          sessions: [{ date: '2026-10-05', subjectId: 'ph', minutes: 30 }],
        }),
      );
      expect(r.hints).toContain('Physik: 1 h 30 min weniger gelernt als geplant.');
    });

    it('kleine Abweichungen bleiben still', () => {
      const r = weeklyReview(base({ planned: [{ date: '2026-10-05', subjectId: 'ph', minutes: 60 }], sessions: [{ date: '2026-10-05', subjectId: 'ph', minutes: 45 }] }));
      expect(r.hints.some((h) => h.includes('weniger gelernt als geplant'))).toBe(false);
    });

    it('geplante, aber ausgefallene Tage', () => {
      const r = weeklyReview(base({ planned: [{ date: '2026-10-05', subjectId: 'ph', minutes: 40 }, { date: '2026-10-06', subjectId: 'ph', minutes: 40 }] }));
      expect(r.hints.some((h) => h.startsWith('An 2 Tagen war Lernzeit geplant'))).toBe(true);
      expect(r.hints.find((h) => h.startsWith('An 2 Tagen'))).toContain('Mo, Di');
    });

    it('Vergleich mit der Vorwoche nur für vergangene Wochen', () => {
      const sessions = [
        { date: '2026-09-29', subjectId: 'ph', minutes: 100 },
        { date: '2026-10-06', subjectId: 'ph', minutes: 200 },
      ];
      const done = weeklyReview(base({ weekStart: '2026-10-05', today: '2026-10-14', sessions }));
      expect(done.hints).toContain('1 h 40 min mehr gelernt als in der Woche davor.');
      const running = weeklyReview(base({ sessions }));
      expect(running.hints.some((h) => h.includes('als in der Woche davor'))).toBe(false);
      const fewer = weeklyReview(base({ weekStart: '2026-10-05', today: '2026-10-14', sessions: [{ date: '2026-09-29', subjectId: 'ph', minutes: 200 }, { date: '2026-10-06', subjectId: 'ph', minutes: 60 }] }));
      expect(fewer.hints).toContain('2 h 20 min weniger gelernt als in der Woche davor.');
    });

    it('nichts gelernt in einer vergangenen Woche', () => {
      expect(weeklyReview(base({ weekStart: '2026-09-21' })).hints).toContain('In dieser Woche wurde nichts gelernt.');
      expect(weeklyReview(base()).hints).not.toContain('In dieser Woche wurde nichts gelernt.');
    });

    it('wenig Schlaf, Training und nahe Klausur', () => {
      const r = weeklyReview(
        base({
          sleep: [{ date: '2026-10-05', hours: 6 }, { date: '2026-10-06', hours: 6.5 }],
          training: [{ date: '2026-10-05', sessions: 1, minutes: 50 }, { date: '2026-10-07', sessions: 1, minutes: 50 }],
          exams: [{ date: '2026-10-10', title: 'Physik Klausur', subjectId: 'ph' }],
        }),
      );
      expect(r.hints).toContain('Im Schnitt nur 6,3 h Schlaf, darunter lässt die Konzentration oft nach.');
      expect(r.hints).toContain('2 Trainingstage in dieser Woche, das hilft beim Lernen.');
      expect(r.hints).toContain('Physik Klausur ist in 2 Tagen.');
    });

    it('höchstens maxHints, wichtigste zuerst', () => {
      const r = weeklyReview(
        base({
          planned: [{ date: '2026-10-05', subjectId: 'ph', minutes: 90 }, { date: '2026-10-06', subjectId: 'm', minutes: 90 }],
          sleep: [{ date: '2026-10-05', hours: 5 }],
          training: [{ date: '2026-10-05', sessions: 1, minutes: 50 }, { date: '2026-10-07', sessions: 1, minutes: 50 }],
          exams: [{ date: '2026-10-09', title: 'Mathe', subjectId: 'm' }],
        }),
      );
      expect(r.hints.length).toBeLessThanOrEqual(4);
      expect(r.hints[0]).toContain('weniger gelernt als geplant');
    });
  });

  it('leere Woche bricht nichts', () => {
    const r = weeklyReview(base({ subjects: [] }));
    expect(r.learned).toBe(0);
    expect(r.best).toBeNull();
    expect(r.subjects).toEqual([]);
    expect(r.hints).toEqual([]);
  });
});
