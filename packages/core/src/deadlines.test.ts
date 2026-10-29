import { describe, expect, it } from 'vitest';
import { allDeadlines, deadlineText, dueSoon, examsWithoutRegistration, type Deadline } from './deadlines';
import { capacityOverrides, dayCapacity, semesterPhase } from './semester';
import type { StudyEvent } from './events';
import type { Exam } from './types';

const dl = (date: string, extra: Partial<Deadline> = {}): Deadline => ({ id: date, title: 'Frist', date, kind: 'other', done: false, remindDays: 7, ...extra });
const exam = (extra: Partial<Exam>): Exam => ({ id: 'e1', subjectId: 'm', title: '', date: '2026-03-02', priorityManual: null, totalHoursManual: null, startDaysManual: null, ...extra });

describe('Fristen', () => {
  const today = '2026-02-01';
  it('eigene und aus Prüfungen abgeleitete Fristen, nächste zuerst, erledigte hinten', () => {
    const items = allDeadlines(
      [dl('2026-02-20'), dl('2026-01-30', { done: true }), dl('2026-02-03')],
      [exam({ registerBy: '2026-02-10', withdrawBy: '2026-02-25' })],
      [{ id: 'm', name: 'Analysis' }],
      today,
    );
    expect(items.map((i) => i.date)).toEqual(['2026-02-03', '2026-02-10', '2026-02-20', '2026-02-25', '2026-01-30']);
    expect(items[1].title).toBe('Anmeldung: Analysis');
    expect(items[1].examId).toBe('e1');
    expect(items[3].kind).toBe('exam_withdraw');
  });

  it('dringend bei überfällig oder in höchstens drei Tagen', () => {
    const items = allDeadlines([dl('2026-02-03'), dl('2026-02-20'), dl('2026-01-25')], [], [], today);
    expect(items.find((i) => i.date === '2026-02-03')?.urgent).toBe(true);
    expect(items.find((i) => i.date === '2026-02-20')?.urgent).toBe(false);
    expect(items.find((i) => i.date === '2026-01-25')?.urgent).toBe(true);
  });

  it('Fristen vergangener Prüfungen entfallen', () => {
    const items = allDeadlines([], [exam({ date: '2026-01-20', registerBy: '2026-01-10' })], [], today);
    expect(items).toEqual([]);
  });

  it('bald fällig und Text', () => {
    const items = allDeadlines([dl('2026-02-03'), dl('2026-02-20')], [], [], today);
    expect(dueSoon(items, 7)).toHaveLength(1);
    expect(deadlineText(0)).toBe('heute');
    expect(deadlineText(1)).toBe('morgen');
    expect(deadlineText(5)).toBe('in 5 Tagen');
    expect(deadlineText(-1)).toBe('seit gestern überfällig');
    expect(deadlineText(-4)).toBe('seit 4 Tagen überfällig');
  });

  it('Prüfungen ohne Anmeldefrist in den nächsten 90 Tagen', () => {
    const list = examsWithoutRegistration([exam({}), exam({ id: 'e2', registerBy: '2026-02-10' }), exam({ id: 'e3', date: '2027-01-01' }), exam({ id: 'e4', graded: false })], today);
    expect(list.map((e) => e.id)).toEqual(['e1']);
  });
});

describe('Semester und Kapazität', () => {
  const profile = { lectureStart: '2026-04-13', lectureEnd: '2026-07-17', examStart: '2026-07-13', examEnd: '2026-08-07' };
  const blocked = (weekday: number, startMin: number, endMin: number): StudyEvent => ({
    id: 'b', subjectId: null, kind: 'blocked', title: 'Job', room: '', lecturer: '', weekday, date: null, startMin, endMin, every: 1, validFrom: null, validTo: null, skipped: [], uid: null,
  });

  it('Phasen, die Prüfungsphase hat Vorrang bei Überschneidung', () => {
    expect(semesterPhase('2026-05-01', profile)).toBe('lecture');
    expect(semesterPhase('2026-07-15', profile)).toBe('exams');
    expect(semesterPhase('2026-09-01', profile)).toBe('break');
    expect(semesterPhase('2026-05-01', { lectureStart: null, lectureEnd: null, examStart: null, examEnd: null })).toBe('unknown');
  });

  it('Prüfungsphase und vorlesungsfreie Zeit haben mehr Kapazität, Vorlesungszeit nicht', () => {
    expect(dayCapacity('2026-05-05', profile, [], 300)).toBeNull();
    expect(dayCapacity('2026-07-22', profile, [], 300)).toBe(360);
    expect(dayCapacity('2026-09-01', profile, [], 300)).toBe(360);
    expect(dayCapacity('2026-09-01', profile, [], 400)).toBeNull(); // schon höher als die Phase
  });

  it('gesperrte Zeit mindert die Kapazität, mindestens ein Rest', () => {
    const job = [blocked(2, 9 * 60, 15 * 60)]; // Dienstag, 6 Stunden
    expect(dayCapacity('2026-05-05', profile, job, 300)).toBe(30);
    const short = [blocked(2, 9 * 60, 11 * 60)];
    expect(dayCapacity('2026-05-05', profile, short, 300)).toBe(180);
  });

  it('ein lernfreier Wochentag bleibt frei', () => {
    // 2026-07-26 ist ein Sonntag, freeDaysPerWeek 1 = Sonntag frei
    expect(dayCapacity('2026-07-26', profile, [], 300, 1)).toBeNull();
    expect(dayCapacity('2026-07-27', profile, [], 300, 1)).toBe(360);
  });

  it('Überschreibungen für den Plan, eigene Ausfälle gehen vor', () => {
    const o = capacityOverrides('2026-07-20', 3, profile, [], 300, 0, { '2026-07-21': 0 });
    expect(o).toEqual({ '2026-07-20': 360, '2026-07-21': 0, '2026-07-22': 360, '2026-07-23': 360 });
  });
});
