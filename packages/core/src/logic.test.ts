import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import {
  buildTimeline,
  daysUntil,
  latestStartForLimit,
  leadDaysAuto,
  planExam,
  plannedMinutesOn,
  priorityBreakdown,
  resolveStartDays,
  reviewGap,
  spacingShare,
  studyDays,
  totalHoursAuto,
} from './logic';
import { pointsToGrade } from './hessen';
import type { Exam, Subject } from './types';

const subject = (over: Partial<Subject> = {}): Subject => ({
  language: 'de',
  id: 's1',
  name: 'Mathematik',
  color: '#4257E8',
  isAdvanced: false,
  isExamSubject: false,
  status: 'active',
  type: 'problems',
  points: 9,
  difficulty: 3,
  ...over,
});

const exam = (over: Partial<Exam> = {}): Exam => ({
  id: 'e1',
  subjectId: 's1',
  title: 'Klausur',
  date: '2026-10-20',
  priorityManual: null,
  totalHoursManual: null,
  startDaysManual: null,
  ...over,
});

const TODAY = new Date(2026, 9, 6); // 6. Okt 2026

describe('Priorität', () => {
  it('Grundkurs mittel: Basis + Note + Schwierigkeit', () => {
    const p = priorityBreakdown(subject());
    expect(p.weighting).toBe(0);
    expect(p.gradeBonus).toBeCloseTo(1.2);
    expect(p.difficultyBonus).toBeCloseTo(1.5);
    expect(p.auto).toBe(4); // round(1 + 0 + 1.2 + 1.5) = round(3.7)
  });

  describe('ohne Note', () => {
    it('rechnet neutral mit der Mitte der Skala und meldet, dass keine Note bekannt ist', () => {
      const p = priorityBreakdown(subject({ points: null }));
      expect(p.gradeKnown).toBe(false);
      expect(p.gradeBonus).toBeCloseTo(CONFIG.priority.gradeMaxBonus / 2);
      expect(priorityBreakdown(subject()).gradeKnown).toBe(true);
    });

    it('liegt zwischen einer schlechten und einer sehr guten Note', () => {
      const bonus = (points: number | null) => priorityBreakdown(subject({ points })).gradeBonus;
      expect(bonus(null)).toBeLessThan(bonus(2));
      expect(bonus(null)).toBeGreaterThan(bonus(14));
    });

    it('ist nicht 0 Punkte (höchste Dringlichkeit) und nicht 15 Punkte (kein Bonus)', () => {
      const bonus = (points: number | null) => priorityBreakdown(subject({ points })).gradeBonus;
      expect(bonus(null)).toBeLessThan(bonus(0));
      expect(bonus(null)).toBeGreaterThan(bonus(15));
    });

    it('Grundkurs mittel ohne Note ergibt Priorität 4, Abwahl und Abwahl-Regeln gelten weiter', () => {
      expect(priorityBreakdown(subject({ points: null })).auto).toBe(4); // round(1 + 0 + 1,5 + 1,5)
      expect(priorityBreakdown(subject({ points: null, status: 'drop_q3' })).auto).toBe(2);
      expect(priorityBreakdown(subject({ points: null, status: 'dropped' })).auto).toBe(1);
    });

    it('LK und Prüfungsfach ohne Note bleiben hoch', () => {
      expect(priorityBreakdown(subject({ points: null, isAdvanced: true, isExamSubject: true, difficulty: 5 })).auto).toBeGreaterThanOrEqual(9);
    });
  });

  it('LK und Prüfungsfach mit schwacher Note landet bei 10', () => {
    expect(priorityBreakdown(subject({ isAdvanced: true, isExamSubject: true, points: 3, difficulty: 5 })).auto).toBe(10);
  });

  it('Abwahl ab Q3 senkt um 2, aber nicht unter 1', () => {
    expect(priorityBreakdown(subject({ status: 'drop_q3' })).auto).toBe(2);
    expect(priorityBreakdown(subject({ status: 'drop_q3', points: 15, difficulty: 1 })).auto).toBe(1);
  });

  it('abgewählt ergibt Minimum', () => {
    expect(priorityBreakdown(subject({ status: 'dropped', points: 0, difficulty: 5 })).auto).toBe(1);
  });

  it('LK und Prüfungsfach ignorieren den Abwahl-Status', () => {
    const lk = priorityBreakdown(subject({ isAdvanced: true, status: 'dropped' }));
    expect(lk.status).toBe('active');
    expect(lk.statusIgnored).toBe(true);
    const pf = priorityBreakdown(subject({ isExamSubject: true, status: 'drop_q3' }));
    expect(pf.status).toBe('active');
    expect(pf.statusIgnored).toBe(true);
  });
});

describe('Gesamtzeit und Vorlauf', () => {
  it('Priorität 5 ergibt 9 h', () => {
    expect(totalHoursAuto(5, 'active')).toBe(9);
  });
  it('wird auf halbe Stunden gerundet und bei 40 h gedeckelt', () => {
    expect(totalHoursAuto(1, 'active')).toBe(2);
    expect(totalHoursAuto(10, 'active')).toBe(25);
    expect(totalHoursAuto(5, 'dropped')).toBe(0);
  });
  it('Schreiben bekommt 3 Tage Puffer', () => {
    expect(leadDaysAuto(5, 'problems')).toBe(9);
    expect(leadDaysAuto(5, 'writing')).toBe(12);
  });
  it('Starttag wird durch die verbleibenden Tage begrenzt', () => {
    expect(resolveStartDays(null, 12, 5)).toBe(5);
    expect(resolveStartDays(20, 12, 10)).toBe(10);
    expect(resolveStartDays(3, 12, 10)).toBe(3);
    expect(resolveStartDays(null, 12, -2)).toBe(1);
  });
});

describe('Lerntage und Limit', () => {
  it('zieht lernfreie Tage pro voller Woche ab', () => {
    expect(studyDays(14, 1)).toBe(12);
    expect(studyDays(14, 2)).toBe(10);
    expect(studyDays(6, 1)).toBe(6);
  });
  it('findet den spätesten Start für das Limit', () => {
    // 9 h bei 60 min/Tag -> 9 Lerntage nötig; mit 1 freien Tag pro Woche sind das 10 Tage
    expect(latestStartForLimit(9, 60, 1)).toBe(10);
    expect(latestStartForLimit(0, 60, 1)).toBe(0);
  });
});

describe('Wiederholungen und Zeitleiste', () => {
  it('Anteil bei 7 Tagen 43 %, bei 350 Tagen 8 %', () => {
    expect(spacingShare(7)).toBeCloseTo(0.43);
    expect(spacingShare(350)).toBeCloseTo(0.08);
  });
  it('Abstand bei 14 und 30 Tagen', () => {
    expect(reviewGap(14)).toBe(4);
    expect(reviewGap(30)).toBe(7);
    expect(reviewGap(1)).toBe(1);
  });
  it('baut die Zeitleiste mit Klausur am Ende', () => {
    const tl = buildTimeline(9, 3, 1, true);
    expect(tl).toHaveLength(10);
    expect(tl[9]).toBe('exam');
    expect(tl[6]).toBe('free');
    expect(tl[3]).toBe('review');
    expect(tl[0]).toBe('study');
  });
  it('ohne Plan nur die Klausur', () => {
    expect(buildTimeline(3, 1, 1, false)).toEqual(['none', 'none', 'none', 'exam']);
  });
});

describe('planExam', () => {
  it('berechnet einen vollständigen Plan', () => {
    const plan = planExam(subject(), exam(), { freeDaysPerWeek: 1, dailyLimitMin: 180 }, TODAY);
    expect(plan.daysLeft).toBe(14);
    expect(plan.priority.value).toBe(4);
    expect(plan.totalHours.value).toBe(7); // ((3+4.8)*(20+32))/60 = 6.76 -> 7
    expect(plan.startDays.value).toBe(8); // round(3 + 4.8)
    expect(plan.studyDays).toBe(7);
    expect(plan.minutesPerStudyDay).toBe(60);
    expect(plan.overLimit).toBe(false);
  });

  it('manuelle Werte überschreiben und werden markiert', () => {
    const plan = planExam(
      subject(),
      exam({ priorityManual: 8, totalHoursManual: 20, startDaysManual: 4 }),
      { freeDaysPerWeek: 1, dailyLimitMin: 180 },
      TODAY,
    );
    expect(plan.priority.overridden).toBe(true);
    expect(plan.totalHours.value).toBe(20);
    expect(plan.startDays.value).toBe(4);
    expect(plan.minutesPerStudyDay).toBe(300);
    expect(plan.overLimit).toBe(true);
    expect(plan.latestStart).toBe(8);
    expect(plan.notEnoughTime).toBe(false);
  });

  it('abgewähltes Fach bekommt keinen Plan', () => {
    const plan = planExam(subject({ status: 'dropped' }), exam(), { freeDaysPerWeek: 1, dailyLimitMin: 180 }, TODAY);
    expect(plan.hasPlan).toBe(false);
    expect(plan.totalHours.value).toBe(0);
    expect(plan.timeline.filter((d) => d === 'study')).toHaveLength(0);
  });

  it('plannedMinutesOn liefert Minuten am Lerntag und 0 am Klausurtag', () => {
    const plan = planExam(subject(), exam(), { freeDaysPerWeek: 1, dailyLimitMin: 180 }, TODAY);
    expect(plannedMinutesOn(plan, '2026-10-20', '2026-10-12')).toBe(60); // t = 0, Starttag
    expect(plannedMinutesOn(plan, '2026-10-20', '2026-10-20')).toBe(0);
    expect(plannedMinutesOn(plan, '2026-10-20', '2026-10-06')).toBe(0); // vor dem Start
  });

  it('daysUntil zählt Kalendertage', () => {
    expect(daysUntil('2026-10-07', TODAY)).toBe(1);
    expect(daysUntil('2026-10-06', TODAY)).toBe(0);
  });
});

describe('Hessen', () => {
  it('Punkte zu Noten', () => {
    expect(pointsToGrade(15)).toBe(1);
    expect(pointsToGrade(10)).toBe(2);
    expect(pointsToGrade(7)).toBe(3);
    expect(pointsToGrade(4)).toBe(4);
    expect(pointsToGrade(1)).toBe(5);
    expect(pointsToGrade(0)).toBe(6);
  });
});
