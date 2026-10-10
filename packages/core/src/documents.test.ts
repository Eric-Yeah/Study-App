import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { fitOnA4, folderFileName, formatBytes, isQuarter, pdfFileName, quarterFor, quarterFromCourse, teacherFor } from './documents';
import type { Timetable, TimetableLesson } from './lanisPlans';

const lesson = (o: Partial<TimetableLesson>): TimetableLesson => ({
  weekday: 0, period: 1, span: 1, start: '08:00', end: '08:45', course: 'Q1M03', abbr: 'M', isAdvanced: false, room: '', teacher: 'Abc', ...o,
});
const tt = (lessons: TimetableLesson[]): Timetable => ({ validFrom: null, periods: [], lessons });
const subjects = [{ id: 'm', name: 'Mathematik' }, { id: 'ph', name: 'Physik' }, { id: 'p', name: 'Politik und Wirtschaft' }];

describe('pdfFileName', () => {
  it('Datum, Fach, Lehrkraft, Q-Phase', () => {
    expect(pdfFileName({ date: '2026-10-07', subject: 'Physik', teacher: 'Müller', quarter: 'Q1' })).toBe('2026-10-07_Physik_Müller_Q1.pdf');
  });

  it('Leerzeichen werden zu Bindestrichen, verbotene Zeichen fallen weg', () => {
    expect(pdfFileName({ date: '2026-10-07', subject: 'Politik und Wirtschaft', teacher: 'Dr. A/B', quarter: 'Q3' })).toBe(
      '2026-10-07_Politik-und-Wirtschaft_Dr.-AB_Q3.pdf',
    );
    expect(pdfFileName({ date: '2026-10-07', subject: 'a:b*c?"<>|', teacher: '', quarter: null })).toBe('2026-10-07_abc.pdf');
  });

  it('fehlende Teile fallen weg', () => {
    expect(pdfFileName({ date: '2026-10-07', subject: 'Physik', teacher: '', quarter: 'Q2' })).toBe('2026-10-07_Physik_Q2.pdf');
    expect(pdfFileName({ date: '2026-10-07', subject: 'Physik', teacher: '  ', quarter: null })).toBe('2026-10-07_Physik.pdf');
    expect(pdfFileName({ date: '', subject: '', teacher: '', quarter: null })).toBe('Dokument.pdf');
  });

  it('bleibt kurz und endet nie mit Trennzeichen', () => {
    const name = pdfFileName({ date: '2026-10-07', subject: 'x'.repeat(300), teacher: 'y', quarter: 'Q1' });
    expect(name.length).toBeLessThanOrEqual(124);
    expect(name).toMatch(/[^-_.]\.pdf$/);
  });
});

describe('Q-Phase und Lehrkraft aus dem Stundenplan', () => {
  it('quarterFromCourse liest die Q-Phase vorn im Kurscode', () => {
    expect(quarterFromCourse('Q1M03')).toBe('Q1');
    expect(quarterFromCourse('Q3POWI_LK01')).toBe('Q3');
    expect(quarterFromCourse('q4g05')).toBe('Q4');
    expect(quarterFromCourse('EF1')).toBeNull();
    expect(quarterFromCourse('Q5M01')).toBeNull();
    expect(quarterFromCourse('')).toBeNull();
  });

  it('isQuarter', () => {
    expect(isQuarter('Q2')).toBe(true);
    expect(isQuarter('Q5')).toBe(false);
    expect(isQuarter(null)).toBe(false);
  });

  it('teacherFor nimmt die Lehrkraft des Fachs, am selben Wochentag zuerst', () => {
    const t = tt([lesson({ weekday: 0, teacher: 'Ames' }), lesson({ weekday: 2, teacher: 'Bode' }), lesson({ weekday: 1, abbr: 'PH', teacher: 'Chu' })]);
    expect(teacherFor(t, 'm', subjects, '2026-10-07')).toBe('Bode'); // Mittwoch
    expect(teacherFor(t, 'm', subjects, '2026-10-05')).toBe('Ames'); // Montag
    expect(teacherFor(t, 'm', subjects, '2026-10-10')).toBe('Ames'); // Samstag: irgendeine Stunde des Fachs
    expect(teacherFor(t, 'ph', subjects, '2026-10-07')).toBe('Chu');
  });

  it('teacherFor ohne Treffer, ohne Plan oder ohne Fach ist leer', () => {
    expect(teacherFor(null, 'm', subjects, '2026-10-07')).toBe('');
    expect(teacherFor(tt([lesson({ teacher: '' })]), 'm', subjects, '2026-10-05')).toBe('');
    expect(teacherFor(tt([lesson({})]), 'p', subjects, '2026-10-05')).toBe('');
    expect(teacherFor(tt([lesson({})]), '', subjects, '2026-10-05')).toBe('');
  });

  it('quarterFor liest die Q-Phase aus dem Kurs dieses Fachs', () => {
    const t = tt([lesson({ course: 'Q1M03' }), lesson({ abbr: 'PH', course: 'Q2PH01' })]);
    expect(quarterFor(t, 'm', subjects)).toBe('Q1');
    expect(quarterFor(t, 'ph', subjects)).toBe('Q2');
    expect(quarterFor(t, 'p', subjects)).toBeNull();
    expect(quarterFor(null, 'm', subjects)).toBeNull();
  });
});

describe('fitOnA4', () => {
  const a4 = CONFIG.pdf.a4;

  it('Hochformat-Foto: Hochformat-Seite, zentriert und eingepasst', () => {
    const r = fitOnA4(3000, 4000, a4); // 3:4, A4 ist etwa 1:1,414
    expect(r.pageWidth).toBeCloseTo(a4.width);
    expect(r.pageHeight).toBeCloseTo(a4.height);
    expect(r.width).toBeLessThanOrEqual(r.pageWidth + 1e-9);
    expect(r.height).toBeLessThanOrEqual(r.pageHeight + 1e-9);
    expect(r.width / r.height).toBeCloseTo(3 / 4);
    expect(r.x).toBeCloseTo((r.pageWidth - r.width) / 2);
    expect(r.y).toBeCloseTo((r.pageHeight - r.height) / 2);
  });

  it('Querformat-Foto: Querformat-Seite', () => {
    const r = fitOnA4(4000, 3000, a4);
    expect(r.pageWidth).toBeCloseTo(a4.height);
    expect(r.pageHeight).toBeCloseTo(a4.width);
    expect(r.width / r.height).toBeCloseTo(4 / 3);
  });

  it('ein Foto im A4-Seitenverhältnis füllt die Seite ohne Rand', () => {
    const r = fitOnA4(2480, 3508, a4);
    expect(r.x).toBeLessThan(0.5);
    expect(r.y).toBeLessThan(0.5);
  });

  it('Randfälle: Quadrat und 0 Pixel brechen nichts', () => {
    expect(fitOnA4(1000, 1000, a4).pageWidth).toBeCloseTo(a4.width);
    expect(Number.isFinite(fitOnA4(0, 0, a4).width)).toBe(true);
  });
});

describe('formatBytes', () => {
  it('KB und MB mit Komma', () => {
    expect(formatBytes(500)).toBe('1 KB');
    expect(formatBytes(820 * 1024)).toBe('820 KB');
    expect(formatBytes(1.45 * 1024 * 1024)).toBe('1,5 MB');
  });
});

describe('folderFileName', () => {
  it('Fach und Q-Phase', () => {
    expect(folderFileName('Physik', [{ quarter: 'Q1' }, { quarter: 'Q1' }])).toBe('Lernordner_Physik_Q1.pdf');
  });
  it('mehrere Q-Phasen als Spanne, sortiert', () => {
    expect(folderFileName('Physik', [{ quarter: 'Q3' }, { quarter: 'Q1' }, { quarter: 'Q2' }])).toBe('Lernordner_Physik_Q1-Q3.pdf');
  });
  it('ohne Fach und ohne Q-Phase', () => {
    expect(folderFileName(null, [{ quarter: 'Q2' }])).toBe('Lernordner_Alle-Fächer_Q2.pdf');
    expect(folderFileName('Politik und Wirtschaft', [{ quarter: null }])).toBe('Lernordner_Politik-und-Wirtschaft.pdf');
    expect(folderFileName('  ', [])).toBe('Lernordner_Alle-Fächer.pdf');
  });
});
