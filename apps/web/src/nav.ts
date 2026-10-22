import { CalendarDays, ClipboardCheck, GraduationCap, Home, ListChecks, NotebookPen, Settings as SettingsIcon, Timer, type LucideIcon } from 'lucide-react';

/**
 * Aufbau der Navigation: acht Bereiche, sieben davon in der unteren Leiste und der Seitenleiste, Einstellungen am Handy oben in der Kopfzeile.
 * Jeder Bereich kann Reiter haben (SectionTabs). Welche Adresse zu welchem Bereich und Reiter gehört, steht nur hier.
 * Alte Adressen bleiben gültig: Eine Unterseite wie /korrektur/ID hält ihren Bereich in der Leiste aktiv.
 */
export type AreaId = 'heute' | 'fokus' | 'plan' | 'hausaufgaben' | 'notizen' | 'klausuren' | 'noten' | 'einstellungen';

export type TabId =
  | 'plan'
  | 'rueckblick'
  | 'lanis'
  | 'notizen'
  | 'karten'
  | 'hausaufgaben'
  | 'arbeitsblaetter'
  | 'termine'
  | 'korrekturen'
  | 'uebung'
  | 'schwaechen'
  | 'noten'
  | 'abitur'
  | 'faecher';

/** Wann ein Reiter erscheint: immer, oder nur mit Freischaltung oder vorhandenen Daten (entschieden in SectionTabs). */
export type TabGate = 'correct' | 'practice' | 'weaknesses';

export interface NavTab {
  id: TabId;
  to: string;
  label: string;
  gate?: TabGate;
}

export interface NavArea {
  id: AreaId;
  to: string;
  label: string;
  /** kürzere Beschriftung für die schmale untere Leiste am Handy */
  short?: string;
  icon: LucideIcon;
  tabs?: NavTab[];
}

export const AREAS: NavArea[] = [
  { id: 'heute', to: '/', label: 'Heute', icon: Home },
  { id: 'fokus', to: '/fokus', label: 'Fokus', icon: Timer },
  {
    id: 'plan',
    to: '/plan',
    label: 'Plan',
    icon: CalendarDays,
    tabs: [
      { id: 'plan', to: '/plan', label: 'Plan' },
      { id: 'rueckblick', to: '/rueckblick', label: 'Rückblick' },
      { id: 'lanis', to: '/import', label: 'Lanis' },
    ],
  },
  {
    id: 'hausaufgaben',
    to: '/hausaufgaben',
    label: 'Hausaufgaben',
    short: 'Hausaufg.',
    icon: ListChecks,
    tabs: [
      { id: 'hausaufgaben', to: '/hausaufgaben', label: 'Hausaufgaben' },
      { id: 'arbeitsblaetter', to: '/arbeitsblaetter', label: 'Arbeitsblätter' },
    ],
  },
  {
    id: 'notizen',
    to: '/notizen',
    label: 'Notizen',
    icon: NotebookPen,
    tabs: [
      { id: 'notizen', to: '/notizen', label: 'Notizen' },
      { id: 'karten', to: '/karten', label: 'Karteikarten' },
    ],
  },
  {
    id: 'klausuren',
    to: '/klausuren',
    label: 'Klausuren',
    icon: ClipboardCheck,
    tabs: [
      { id: 'termine', to: '/klausuren', label: 'Termine' },
      { id: 'korrekturen', to: '/korrektur', label: 'Korrekturen', gate: 'correct' },
      { id: 'uebung', to: '/korrektur/uebung', label: 'Übung', gate: 'practice' },
      { id: 'schwaechen', to: '/korrektur/schwaechen', label: 'Schwächen', gate: 'weaknesses' },
    ],
  },
  {
    id: 'noten',
    to: '/noten',
    label: 'Noten',
    icon: GraduationCap,
    tabs: [
      { id: 'noten', to: '/noten', label: 'Noten' },
      { id: 'abitur', to: '/abitur', label: 'Abiturrechner' },
      { id: 'faecher', to: '/faecher', label: 'Fächer' },
    ],
  },
  { id: 'einstellungen', to: '/einstellungen', label: 'Einstellungen', icon: SettingsIcon },
];

/** In der unteren Leiste und der Seitenleiste oben; Einstellungen stehen am Handy in der Kopfzeile, sonst unten in der Seitenleiste. */
export const MAIN_AREAS = AREAS.filter((a) => a.id !== 'einstellungen');
export const SETTINGS_AREA = AREAS.find((a) => a.id === 'einstellungen')!;

// Reihenfolge zählt: die erste passende Regel gilt (/korrektur/uebung vor /korrektur).
const RULES: { test: RegExp; area: AreaId; tab: TabId | null }[] = [
  { test: /^\/$/, area: 'heute', tab: null },
  { test: /^\/fokus(\/|$)/, area: 'fokus', tab: null },
  { test: /^\/plan(\/|$)/, area: 'plan', tab: 'plan' },
  { test: /^\/rueckblick(\/|$)/, area: 'plan', tab: 'rueckblick' },
  { test: /^\/import(\/|$)/, area: 'plan', tab: 'lanis' },
  { test: /^\/notizen(\/|$)/, area: 'notizen', tab: 'notizen' },
  { test: /^\/karten(\/|$)/, area: 'notizen', tab: 'karten' },
  { test: /^\/hausaufgaben(\/|$)/, area: 'hausaufgaben', tab: 'hausaufgaben' },
  { test: /^\/arbeitsblaetter(\/|$)/, area: 'hausaufgaben', tab: 'arbeitsblaetter' },
  { test: /^\/klausuren(\/|$)/, area: 'klausuren', tab: 'termine' },
  { test: /^\/klausur(\/|$)/, area: 'klausuren', tab: 'termine' },
  { test: /^\/korrektur\/(uebung|stil)(\/|$)/, area: 'klausuren', tab: 'uebung' },
  { test: /^\/korrektur\/schwaechen(\/|$)/, area: 'klausuren', tab: 'schwaechen' },
  { test: /^\/korrektur(\/|$)/, area: 'klausuren', tab: 'korrekturen' },
  { test: /^\/noten(\/|$)/, area: 'noten', tab: 'noten' },
  { test: /^\/abitur(\/|$)/, area: 'noten', tab: 'abitur' },
  { test: /^\/faecher(\/|$)/, area: 'noten', tab: 'faecher' },
  { test: /^\/einstellungen(\/|$)/, area: 'einstellungen', tab: null },
];

/** Bereich und Reiter zu einer Adresse (ohne Suchteil). Unbekannte Adressen gehören zu keinem Bereich. */
export function locate(pathname: string): { area: AreaId | null; tab: TabId | null } {
  const rule = RULES.find((r) => r.test.test(pathname));
  return rule ? { area: rule.area, tab: rule.tab } : { area: null, tab: null };
}
