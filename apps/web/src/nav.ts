import type { AppMode } from '@study/core';
import { CalendarDays, ClipboardCheck, GraduationCap, Home, LayoutGrid, ListChecks, NotebookPen, Settings as SettingsIcon, Timer, type LucideIcon } from 'lucide-react';

/**
 * Aufbau der Navigation: acht Bereiche. Mac und iPad zeigen alle in der Seitenleiste (Einstellungen unten).
 * Am Handy (unter 768 px) stehen nur die Bereiche aus PHONE_BAR in der unteren Leiste, dazu „Mehr“ mit allen übrigen und den Einstellungen.
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
  | 'faecher'
  | 'stundenplan'
  | 'fristen'
  | 'studiengang';

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
  icon: LucideIcon;
  tabs?: NavTab[];
}

/** Schule (Lanis, Abitur). Das Studium hat eigene Bereiche, siehe UNI_AREAS. */
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

/**
 * Studium: dieselben Bereichs-Ids und Adressen, andere Namen und Reiter. Kein Lanis, keine Hausaufgaben aus Lanis, keine Hessen-Korrektur,
 * kein Abiturrechner. Neu sind Stundenplan, Fristen und der Studiengang.
 */
export const UNI_AREAS: NavArea[] = [
  { id: 'heute', to: '/', label: 'Heute', icon: Home },
  { id: 'fokus', to: '/fokus', label: 'Fokus', icon: Timer },
  {
    id: 'plan',
    to: '/plan',
    label: 'Plan',
    icon: CalendarDays,
    tabs: [
      { id: 'plan', to: '/plan', label: 'Plan' },
      { id: 'stundenplan', to: '/stundenplan', label: 'Stundenplan' },
      { id: 'fristen', to: '/fristen', label: 'Fristen' },
      { id: 'rueckblick', to: '/rueckblick', label: 'Rückblick' },
    ],
  },
  { id: 'hausaufgaben', to: '/hausaufgaben', label: 'Aufgaben', icon: ListChecks },
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
  { id: 'klausuren', to: '/klausuren', label: 'Prüfungen', icon: ClipboardCheck },
  {
    id: 'noten',
    to: '/noten',
    label: 'Studium',
    icon: GraduationCap,
    tabs: [
      { id: 'noten', to: '/noten', label: 'Noten' },
      { id: 'faecher', to: '/faecher', label: 'Module' },
      { id: 'studiengang', to: '/studiengang', label: 'Studiengang' },
    ],
  },
  { id: 'einstellungen', to: '/einstellungen', label: 'Einstellungen', icon: SettingsIcon },
];

export function areasFor(mode: AppMode): NavArea[] {
  return mode === 'university' ? UNI_AREAS : AREAS;
}

/** Oben in der Seitenleiste (Mac, iPad); die Einstellungen stehen dort unten. */
export const MAIN_AREAS = AREAS.filter((a) => a.id !== 'einstellungen');
export const SETTINGS_AREA = AREAS.find((a) => a.id === 'einstellungen')!;
export const mainAreasFor = (mode: AppMode) => areasFor(mode).filter((a) => a.id !== 'einstellungen');
export const settingsAreaFor = (mode: AppMode) => areasFor(mode).find((a) => a.id === 'einstellungen')!;

/**
 * Handy: höchstens fünf Einträge in der unteren Leiste, damit die Namen ausgeschrieben bleiben und die Tippflächen groß.
 * Schule: Unterwegs braucht man vor allem den Tag (Heute: Als Nächstes, Schule heute, Aufgaben), den Timer, Hausaufgaben
 * und Notizen (Blatt fotografieren, Karteikarten). Plan, Klausuren, Noten und Einstellungen sind eher Schreibtischarbeit
 * und stehen unter „Mehr“, erreichbar mit einem Tipp mehr, samt ihren Reitern.
 * Studium: Hausaufgaben sind nicht der Alltag, dafür der Plan mit Stundenplan und Fristen.
 */
export const PHONE_BAR: AreaId[] = ['heute', 'fokus', 'hausaufgaben', 'notizen'];
export const PHONE_BAR_UNI: AreaId[] = ['heute', 'fokus', 'plan', 'notizen'];
export const phoneBarIds = (mode: AppMode): AreaId[] => (mode === 'university' ? PHONE_BAR_UNI : PHONE_BAR);
export const phoneBarAreasFor = (mode: AppMode) => phoneBarIds(mode).map((id) => areasFor(mode).find((a) => a.id === id)!);
/** Unter „Mehr“, in der Reihenfolge von AREAS (Einstellungen zuletzt). */
export const phoneMoreAreasFor = (mode: AppMode) => areasFor(mode).filter((a) => !phoneBarIds(mode).includes(a.id));
export const PHONE_BAR_AREAS = phoneBarAreasFor('school');
export const PHONE_MORE_AREAS = phoneMoreAreasFor('school');
export const MORE_ICON = LayoutGrid;

/** Welcher Eintrag der Handy-Leiste zu einem Bereich leuchtet: der Bereich selbst oder „Mehr“. */
export function phoneSlot(area: AreaId | null, mode: AppMode = 'school'): AreaId | 'mehr' | null {
  if (!area) return null;
  return phoneBarIds(mode).includes(area) ? area : 'mehr';
}

// Reihenfolge zählt: die erste passende Regel gilt (/korrektur/uebung vor /korrektur).
const RULES: { test: RegExp; area: AreaId; tab: TabId | null }[] = [
  { test: /^\/$/, area: 'heute', tab: null },
  { test: /^\/fokus(\/|$)/, area: 'fokus', tab: null },
  { test: /^\/plan(\/|$)/, area: 'plan', tab: 'plan' },
  { test: /^\/rueckblick(\/|$)/, area: 'plan', tab: 'rueckblick' },
  { test: /^\/import(\/|$)/, area: 'plan', tab: 'lanis' },
  { test: /^\/stundenplan(\/|$)/, area: 'plan', tab: 'stundenplan' },
  { test: /^\/fristen(\/|$)/, area: 'plan', tab: 'fristen' },
  { test: /^\/studiengang(\/|$)/, area: 'noten', tab: 'studiengang' },
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
