import type { SubjectType } from '@study/core';

export const SUBJECT_COLORS = [
  '#3F51E0',
  '#E0613F',
  '#1E9E78',
  '#C2407F',
  '#B98712',
  '#7A4FD1',
  '#2E8BC0',
  '#6B7A2E',
];

/** Fächer zur Auswahl im Onboarding (Hessen). Der Fachtyp ist nur ein Vorschlag. */
export const DEFAULT_SUBJECTS: { name: string; type: SubjectType }[] = [
  { name: 'Deutsch', type: 'writing' },
  { name: 'Mathematik', type: 'problems' },
  { name: 'Englisch', type: 'knowledge' },
  { name: 'Französisch', type: 'knowledge' },
  { name: 'Spanisch', type: 'knowledge' },
  { name: 'Latein', type: 'knowledge' },
  { name: 'Geschichte', type: 'knowledge' },
  { name: 'Politik und Wirtschaft', type: 'writing' },
  { name: 'Erdkunde', type: 'knowledge' },
  { name: 'Religion', type: 'writing' },
  { name: 'Ethik', type: 'writing' },
  { name: 'Biologie', type: 'knowledge' },
  { name: 'Chemie', type: 'problems' },
  { name: 'Physik', type: 'problems' },
  { name: 'Informatik', type: 'problems' },
  { name: 'Kunst', type: 'writing' },
  { name: 'Musik', type: 'knowledge' },
  { name: 'Sport', type: 'knowledge' },
];

export const TYPE_LABELS: Record<SubjectType, string> = {
  problems: 'Aufgaben',
  knowledge: 'Wissen',
  writing: 'Schreiben',
};

export const TYPE_HINTS: Record<SubjectType, string> = {
  problems: 'Klare Lösungen, viele Aufgaben, kürzere Einheiten',
  knowledge: 'Abfragen und Wiederholen in wachsenden Abständen',
  writing: 'Feedback ist der Engpass, früher starten',
};

export const STATUS_LABELS = {
  active: 'Läuft weiter',
  drop_q3: 'Ab Q3 abwählen',
  dropped: 'Abgewählt',
} as const;
