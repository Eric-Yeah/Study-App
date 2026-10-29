import { describe, expect, it } from 'vitest';
import { appMode, hiddenSubjectIds, roleFor, scopeFor, subjectsInMode, termsFor, visibleBySubject } from './mode';

describe('Modus', () => {
  it('Studium nur bei der Rolle student_university', () => {
    expect(appMode('student_university')).toBe('university');
    expect(appMode('student_school')).toBe('school');
    expect(appMode('other')).toBe('school');
    expect(appMode(null)).toBe('school');
    expect(roleFor('university')).toBe('student_university');
    expect(scopeFor('university')).toBe('uni');
  });

  const subjects = [
    { id: 'a', scope: undefined },
    { id: 'b', scope: 'school' as const },
    { id: 'c', scope: 'uni' as const },
  ];

  it('zeigt je Modus nur die eigenen Fächer; ohne Angabe gilt Schule', () => {
    expect(subjectsInMode(subjects, 'school').map((s) => s.id)).toEqual(['a', 'b']);
    expect(subjectsInMode(subjects, 'university').map((s) => s.id)).toEqual(['c']);
  });

  it('versteckt, was am Fach des anderen Modus hängt, Einträge ohne Fach bleiben', () => {
    const hidden = hiddenSubjectIds(subjects, 'university');
    expect([...hidden].sort()).toEqual(['a', 'b']);
    const items = [{ subjectId: 'a' }, { subjectId: 'c' }, { subjectId: null }];
    expect(visibleBySubject(items, hidden)).toEqual([{ subjectId: 'c' }, { subjectId: null }]);
    expect(visibleBySubject(items, new Set())).toBe(items);
  });

  it('Begriffe je Modus', () => {
    expect(termsFor('school').exam).toBe('Klausur');
    expect(termsFor('university').exam).toBe('Prüfung');
    expect(termsFor('university').subjects).toBe('Module');
  });
});
