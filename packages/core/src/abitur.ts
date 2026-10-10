/**
 * Abiturrechner Hessen: Gesamtqualifikation aus Block I (Kurse der Qualifikationsphase) und Block II (Prüfungen), Abiturnote,
 * Prüfung der Einbringung. Grundlage ist die OAVO in der Fassung von 2025 (§§ 24 und 26) nach den Schulinformationen 2026,
 * alle Zahlen stehen in CONFIG.abitur. Der Rechner ersetzt nicht die Beratung der Schule. Reine Funktionen, nur Web-App.
 */
import { CONFIG } from './config';
import type { Subject } from './types';

export type Category =
  | 'deutsch'
  | 'fremdsprache'
  | 'mathe'
  | 'naturwiss'
  | 'informatik'
  | 'geschichte'
  | 'powi'
  | 'geographie'
  | 'religion_ethik'
  | 'kunst_musik'
  | 'sport'
  | 'sonst';

/** Aufgabenfeld: I sprachlich-literarisch-künstlerisch, II gesellschaftswissenschaftlich, III mathematisch-naturwissenschaftlich-technisch. */
export type Area = 'I' | 'II' | 'III' | null;

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim();

/** Fachgruppe zum Fachnamen (für Aufgabenfeld und Einbringverpflichtung). */
export function categoryFor(name: string): Category {
  const n = fold(name);
  if (/^(deutsch|german)/.test(n)) return 'deutsch';
  if (/^(mathe|mathematik|math\b)/.test(n)) return 'mathe';
  if (/^(bio|biologie|chemie|physik|nawi|naturwissenschaft)/.test(n)) return 'naturwiss';
  if (/^(informatik|info\b)/.test(n)) return 'informatik';
  if (/^(geschichte|history)/.test(n)) return 'geschichte';
  if (/^(powi|politik|wirtschaft|sozialkunde)/.test(n)) return 'powi';
  if (/^(erdkunde|geographie|geografie|geography)/.test(n)) return 'geographie';
  if (/^(religion|reli\b|ev\b|evang|kath|ethik|philosophie)/.test(n)) return 'religion_ethik';
  if (/^(kunst|art\b|musik|music|darstellendes spiel|ds\b|theater)/.test(n)) return 'kunst_musik';
  if (/^sport/.test(n)) return 'sport';
  if (/^(englisch|english|franzo|french|francais|spanisch|spanish|espanol|italienisch|latein|latin|russisch|turkisch|chinesisch|portugiesisch|polnisch|griechisch)/.test(n)) return 'fremdsprache';
  return 'sonst';
}

export const AREA_OF: Record<Category, Area> = {
  deutsch: 'I',
  fremdsprache: 'I',
  kunst_musik: 'I',
  geschichte: 'II',
  powi: 'II',
  geographie: 'II',
  religion_ethik: 'II',
  mathe: 'III',
  naturwiss: 'III',
  informatik: 'III',
  sport: null,
  sonst: null,
};

export const CATEGORY_LABEL: Record<Category, string> = {
  deutsch: 'Deutsch',
  fremdsprache: 'Fremdsprache',
  mathe: 'Mathematik',
  naturwiss: 'Naturwissenschaft',
  informatik: 'Informatik',
  geschichte: 'Geschichte',
  powi: 'Politik und Wirtschaft',
  geographie: 'Geographie',
  religion_ethik: 'Religion, Ethik oder Philosophie',
  kunst_musik: 'Kunst, Musik oder Darstellendes Spiel',
  sport: 'Sport',
  sonst: 'Sonstiges',
};

/** Was der Nutzer im Rechner einträgt. Alles, was fehlt, rechnet die App als Prognose. */
export interface AbiturPlan {
  courses: Record<string, (number | null)[]>; // je Fach die Punkte von Q1 bis Q4, null: noch offen
  picks: Record<string, boolean[]>; // gewählte freie Grundkurse (Q1 bis Q4), Pflichtkurse sind immer dabei
  examSubjects: (string | null)[]; // Prüfungsfach 1 bis 5, leer: aus den Fächern vorbelegt
  examPoints: (number | null)[]; // Ergebnis der Prüfung 1 bis 5
  assumption: number; // Annahme für Kurse ohne Zahl, wenn am Fach keine Note steht
}

export const emptyPlan = (): AbiturPlan => ({
  courses: {},
  picks: {},
  examSubjects: Array<string | null>(CONFIG.abitur.exams).fill(null),
  examPoints: Array<number | null>(CONFIG.abitur.exams).fill(null),
  assumption: CONFIG.abitur.assumption,
});

const isPoints = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 15;

/** Liest einen gespeicherten Plan sicher (aus der Datenbank), sonst ein leerer Plan. */
export function readAbiturPlan(v: unknown): AbiturPlan {
  const out = emptyPlan();
  if (typeof v !== 'object' || v === null) return out;
  const o = v as Record<string, unknown>;
  const q = CONFIG.abitur.quarters;
  if (typeof o.courses === 'object' && o.courses !== null) {
    for (const [id, arr] of Object.entries(o.courses as Record<string, unknown>)) {
      if (Array.isArray(arr)) out.courses[id] = Array.from({ length: q }, (_, i) => (isPoints(arr[i]) ? Math.round(arr[i]) : null));
    }
  }
  if (typeof o.picks === 'object' && o.picks !== null) {
    for (const [id, arr] of Object.entries(o.picks as Record<string, unknown>)) {
      if (Array.isArray(arr)) out.picks[id] = Array.from({ length: q }, (_, i) => arr[i] === true);
    }
  }
  if (Array.isArray(o.examSubjects)) out.examSubjects = out.examSubjects.map((_, i) => (typeof o.examSubjects?.[i as never] === 'string' ? (o.examSubjects as string[])[i]! : null));
  if (Array.isArray(o.examPoints)) out.examPoints = out.examPoints.map((_, i) => (isPoints((o.examPoints as unknown[])[i]) ? Math.round((o.examPoints as number[])[i]!) : null));
  if (isPoints(o.assumption)) out.assumption = Math.round(o.assumption);
  return out;
}

/** Abiturnote aus den Gesamtpunkten (Vereinbarung der Kultusministerkonferenz): Note = 17/3 minus Punkte/180, abgeschnitten auf eine Stelle. */
export function abiturGrade(total: number): number | null {
  if (!Number.isFinite(total) || total < CONFIG.abitur.totalMin) return null; // unter 300 Punkten nicht bestanden
  const p = Math.min(Math.round(total), CONFIG.abitur.totalMax);
  return Math.max(10, Math.floor((1020 - p) / 18)) / 10;
}

/** Kleinste Punktzahl für eine Note (zum Beispiel 1,0 ab 823). */
export function pointsForGrade(grade: number): number {
  const g10 = Math.round(grade * 10);
  for (let p = CONFIG.abitur.totalMax; p >= CONFIG.abitur.totalMin; p -= 1) {
    if ((abiturGrade(p) ?? 99) * 10 > g10 + 0.001) return p + 1;
  }
  return CONFIG.abitur.totalMin;
}

// ---------------------------------------------------------------------------------------------------------------
// Kurse und Prognose

export interface Course {
  subjectId: string;
  q: number; // 0 bis 3 (Q1 bis Q4)
  available: boolean; // das Fach läuft in diesem Halbjahr noch (abgewählte Fächer haben Q3 und Q4 nicht)
  entered: number | null; // vom Nutzer eingetragen
  points: number | null; // eingetragen oder Prognose, null wenn es den Kurs nicht gibt
  predicted: boolean;
  forced: boolean; // muss eingebracht werden (Leistungskurs oder Grundkurs-Prüfungsfach)
  included: boolean;
  advanced: boolean;
}

type SubjectLite = Pick<Subject, 'id' | 'name' | 'isAdvanced' | 'isExamSubject' | 'status' | 'points'>;

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Prognose für einen offenen Kurs: Schnitt der eingetragenen Kurse des Fachs, sonst die Note am Fach, sonst die Annahme. */
function projection(s: SubjectLite, entered: (number | null)[], assumption: number): number {
  const have = entered.filter((x): x is number => x !== null);
  if (have.length > 0) return Math.round(mean(have));
  if (s.points !== null) return Math.round(s.points);
  return assumption;
}

/** Prüfungsfächer 1 bis 5: eigene Wahl, sonst Leistungskurse zuerst, dann die als Prüfungsfach markierten Fächer. */
export function examSlots(subjects: readonly SubjectLite[], plan: AbiturPlan): (string | null)[] {
  const live = new Set(subjects.map((s) => s.id));
  const chosen = plan.examSubjects.map((id) => (id && live.has(id) ? id : null));
  const taken = new Set(chosen.filter((x): x is string => x !== null));
  const lks = subjects.filter((s) => s.isAdvanced && !taken.has(s.id));
  const gks = subjects.filter((s) => !s.isAdvanced && s.isExamSubject && !taken.has(s.id));
  const queue = [...lks, ...gks];
  return chosen.map((id, i) => {
    if (id) return id;
    // Platz 1 und 2 sind Leistungskurse, die übrigen Grundkurse
    const pos = queue.findIndex((s) => (i < CONFIG.abitur.lkCount ? s.isAdvanced : !s.isAdvanced));
    if (pos < 0) return null;
    return queue.splice(pos, 1)[0]!.id;
  });
}

export type CheckStatus = 'ok' | 'warn' | 'fail';
export interface Check {
  id: string;
  status: CheckStatus;
  text: string;
  predicted: boolean; // hängt von Prognosen ab
}

export interface AbiturExam {
  slot: number; // 1 bis 5
  subjectId: string | null;
  advanced: boolean;
  entered: number | null;
  points: number | null;
  predicted: boolean;
}

export interface AbiturResult {
  courses: Course[];
  exams: AbiturExam[];
  gkCount: number;
  lkCount: number;
  gkSum: number; // einfache Wertung
  lkSum: number; // zweifach gezählt
  blockI: number;
  blockII: number;
  total: number;
  grade: number | null; // null unter 300 Punkten
  predictedCourses: number; // so viele Kurse und Prüfungen sind Prognosen
  checks: Check[];
  passed: boolean; // alle Prüfungen ok (nur bei fail ist es nicht bestanden)
  nextGrade: { grade: number; missing: number } | null; // so viele Punkte fehlen bis zur nächstbesseren Note
}

const lite = (s: Subject): SubjectLite => s;
/** Anforderungen an die Einbringung: Anzahl der Kurse je Fachgruppe, nach den Schulinformationen 2026. */
interface Need {
  id: string;
  label: string;
  min: number;
  count: (c: Course, s: SubjectLite) => boolean;
  /** true: so viele Kurse in einem einzigen Fach (nicht verteilt auf mehrere) */
  oneSubject?: boolean;
  subjectFilter?: (s: SubjectLite) => boolean;
}

const cat = (s: SubjectLite) => categoryFor(s.name);

function needs(): Need[] {
  const q = CONFIG.abitur.quarters;
  return [
    { id: 'deutsch', label: 'Deutsch: vier Kurse', min: q, count: () => true, oneSubject: true, subjectFilter: (s) => cat(s) === 'deutsch' },
    { id: 'mathe', label: 'Mathematik: vier Kurse', min: q, count: () => true, oneSubject: true, subjectFilter: (s) => cat(s) === 'mathe' },
    { id: 'fs', label: 'Fortgeführte Fremdsprache: vier Kurse', min: q, count: () => true, oneSubject: true, subjectFilter: (s) => cat(s) === 'fremdsprache' },
    { id: 'nw', label: 'Naturwissenschaft: vier Kurse in einem Fach', min: q, count: () => true, oneSubject: true, subjectFilter: (s) => cat(s) === 'naturwiss' },
    { id: 'ku', label: 'Kunst, Musik oder Darstellendes Spiel: zwei Kurse', min: 2, count: () => true, subjectFilter: (s) => cat(s) === 'kunst_musik' },
    { id: 'powi', label: 'Politik und Wirtschaft: zwei Kurse', min: 2, count: () => true, subjectFilter: (s) => cat(s) === 'powi' },
    { id: 'g', label: 'Geschichte: Q3 und Q4 (ersatzweise Geographie Q3 und Q4)', min: 2, count: (c) => c.q >= 2, subjectFilter: (s) => cat(s) === 'geschichte' || cat(s) === 'geographie' },
  ];
}

const sumOf = (cs: Course[]) => cs.reduce((n, c) => n + (c.points ?? 0), 0);

/**
 * Rechnet die Gesamtqualifikation. Eingebracht werden Leistungskurse (zweifach) und Grundkurs-Prüfungsfächer immer, dazu
 * die gewählten freien Grundkurse bis zu den geforderten 24. Fehlendes rechnet die App als Prognose (siehe projection).
 */
export function computeAbitur(subjects: readonly Subject[], plan: AbiturPlan): AbiturResult {
  const A = CONFIG.abitur;
  const subs = subjects.map(lite);
  const slots = examSlots(subs, plan);
  const examGk = new Set(slots.slice(A.lkCount).filter((x): x is string => x !== null));
  const lkIds = new Set(subs.filter((s) => s.isAdvanced).map((s) => s.id));

  const courses: Course[] = [];
  for (const s of subs) {
    const entered = plan.courses[s.id] ?? Array<number | null>(A.quarters).fill(null);
    const proj = projection(s, entered, plan.assumption);
    const dropsEarly = !s.isAdvanced && !examGk.has(s.id) && s.status !== 'active';
    for (let q = 0; q < A.quarters; q += 1) {
      const available = !(dropsEarly && q >= 2);
      const e = entered[q] ?? null;
      const advanced = lkIds.has(s.id);
      const forced = available && (advanced || examGk.has(s.id));
      courses.push({
        subjectId: s.id,
        q,
        available,
        entered: available ? e : null,
        points: available ? (e ?? proj) : null,
        predicted: available && e === null,
        forced,
        included: forced || (available && plan.picks[s.id]?.[q] === true),
        advanced,
      });
    }
  }

  const inc = courses.filter((c) => c.included);
  const lk = inc.filter((c) => c.advanced);
  const gk = inc.filter((c) => !c.advanced);
  const gkSum = sumOf(gk);
  const lkSum = sumOf(lk) * A.lkWeight;

  const exams: AbiturExam[] = slots.map((id, i) => {
    const s = subs.find((x) => x.id === id);
    const mine = courses.filter((c) => c.subjectId === id && c.available && c.points !== null);
    const guess = mine.length > 0 ? Math.round(mean(mine.map((c) => c.points as number))) : s?.points ?? plan.assumption;
    const e = plan.examPoints[i] ?? null;
    return { slot: i + 1, subjectId: id, advanced: Boolean(s?.isAdvanced), entered: e, points: id ? (e ?? Math.round(guess)) : null, predicted: id !== null && e === null };
  });
  const blockII = exams.reduce((n, e) => n + (e.points ?? 0), 0) * A.examWeight;
  const blockI = gkSum + lkSum;
  const total = blockI + blockII;
  const grade = abiturGrade(total);
  const predictedCourses = inc.filter((c) => c.predicted).length + exams.filter((e) => e.predicted).length;

  const checks = runChecks(subs, courses, exams, slots, { gkSum, lkSum, blockI, blockII, total, gk, lk });

  const next = grade !== null && grade > 1 ? Math.round((grade - 0.1) * 10) / 10 : null;
  const nextGrade = next !== null ? { grade: next, missing: Math.max(0, pointsForGrade(next) - total) } : null;

  return {
    courses,
    exams,
    gkCount: gk.length,
    lkCount: lk.length,
    gkSum,
    lkSum,
    blockI,
    blockII,
    total,
    grade,
    predictedCourses,
    checks,
    passed: !checks.some((c) => c.status === 'fail'),
    nextGrade,
  };
}

interface Sums {
  gkSum: number;
  lkSum: number;
  blockI: number;
  blockII: number;
  total: number;
  gk: Course[];
  lk: Course[];
}

function runChecks(subs: SubjectLite[], courses: Course[], exams: AbiturExam[], slots: (string | null)[], sums: Sums): Check[] {
  const A = CONFIG.abitur;
  const out: Check[] = [];
  const byId = new Map(subs.map((s) => [s.id, s]));
  const anyPredicted = (cs: Course[]) => cs.some((c) => c.predicted);
  const add = (id: string, status: CheckStatus, text: string, predicted = false) => out.push({ id, status, text, predicted });
  const lks = subs.filter((s) => s.isAdvanced);
  const lkNeeded = A.lkCount * A.quarters;

  // Anzahl der Kurse
  if (lks.length !== A.lkCount) add('lk', 'warn', `Leistungskurse: ${lks.length} von ${A.lkCount} eingetragen. Markiere sie unter Fächer.`);
  if (sums.gk.length < A.gkRequired) add('gk-count', 'warn', `Grundkurse: ${sums.gk.length} von ${A.gkRequired} gewählt, noch ${A.gkRequired - sums.gk.length} frei zu wählen.`);
  else if (sums.gk.length > A.gkRequired) add('gk-count', 'fail', `Grundkurse: ${sums.gk.length} gewählt, es zählen genau ${A.gkRequired}. Nimm ${sums.gk.length - A.gkRequired} heraus.`);
  else add('gk-count', 'ok', `${A.gkRequired} Grundkurse gewählt.`);
  if (lks.length === A.lkCount && sums.lk.length !== lkNeeded) add('lk-count', 'warn', `Leistungskurse: ${sums.lk.length} von ${lkNeeded} Kursen verfügbar.`);

  // Block I
  if (sums.gk.length === A.gkRequired) {
    const p = anyPredicted(sums.gk);
    add('gk-min', sums.gkSum >= A.gkMin ? 'ok' : 'fail', `Grundkurse: ${sums.gkSum} Punkte, mindestens ${A.gkMin} nötig.`, p);
  }
  if (sums.lk.length === lkNeeded) {
    add('lk-min', sums.lkSum >= A.lkMin ? 'ok' : 'fail', `Leistungskurse (zweifach): ${sums.lkSum} Punkte, mindestens ${A.lkMin} nötig.`, anyPredicted(sums.lk));
  }
  const inc = [...sums.gk, ...sums.lk];
  const low = inc.filter((c) => (c.points ?? 0) < A.deficitBelow);
  const lowLk = low.filter((c) => c.advanced);
  add('deficit-courses', low.length <= A.deficitMax ? 'ok' : 'fail', `Kurse unter ${A.deficitBelow} Punkten: ${low.length}, höchstens ${A.deficitMax} erlaubt.`, anyPredicted(low));
  add('deficit-lk', lowLk.length <= A.deficitLkMax ? 'ok' : 'fail', `davon Leistungskurse: ${lowLk.length}, höchstens ${A.deficitLkMax} erlaubt.`, anyPredicted(lowLk));
  const zero = inc.filter((c) => c.entered === 0);
  if (zero.length > 0) add('zero', 'warn', `${zero.length} Kurs${zero.length === 1 ? '' : 'e'} mit 0 Punkten: ein solcher Kurs gilt als nicht besucht und kann die Belegverpflichtung nicht erfüllen.`);

  // Block II
  const exPred = exams.some((e) => e.predicted);
  const full = exams.filter((e) => e.subjectId !== null);
  if (full.length < A.exams) add('exams', 'warn', `Prüfungsfächer: ${full.length} von ${A.exams} festgelegt.`);
  if (full.length > 0) {
    add('block2-min', sums.blockII >= A.blockIIMin || full.length < A.exams ? 'ok' : 'fail', `Block II: ${sums.blockII} Punkte, mindestens ${A.blockIIMin} nötig.`, exPred);
    const lowEx = full.filter((e) => (e.points ?? 0) < A.deficitBelow);
    const lowExLk = lowEx.filter((e) => e.advanced);
    add('deficit-exams', lowEx.length <= A.examDeficitMax ? 'ok' : 'fail', `Prüfungen unter ${A.deficitBelow} Punkten: ${lowEx.length}, höchstens ${A.examDeficitMax} erlaubt.`, exPred);
    add('deficit-exam-lk', lowExLk.length <= A.examDeficitLkMax ? 'ok' : 'fail', `davon Leistungskurse: ${lowExLk.length}, höchstens ${A.examDeficitLkMax} erlaubt.`, exPred);
  }

  // Gesamt
  add('total', sums.total >= A.totalMin ? 'ok' : 'fail', `Gesamtqualifikation: ${sums.total} Punkte, mindestens ${A.totalMin} nötig.`, anyPredicted(inc) || exPred);
  add('block1-min', sums.blockI >= A.blockIMin || sums.gk.length < A.gkRequired ? 'ok' : 'fail', `Block I: ${sums.blockI} Punkte, mindestens ${A.blockIMin} nötig.`, anyPredicted(inc));

  // Prüfungsfächer (§ 24)
  const exSubs = slots.map((id) => (id ? byId.get(id) : undefined));
  const cats = exSubs.map((s) => (s ? categoryFor(s.name) : null));
  if (full.length === A.exams) {
    const has = (c: Category) => cats.includes(c);
    add('exam-dm', has('deutsch') && has('mathe') ? 'ok' : 'fail', 'Deutsch und Mathematik müssen Prüfungsfächer sein.');
    add('exam-nw', cats.some((c) => c === 'fremdsprache' || c === 'naturwiss' || c === 'informatik') ? 'ok' : 'fail', 'Ein Prüfungsfach muss eine Fremdsprache, eine Naturwissenschaft oder Informatik sein.');
    const areas = (cs: (Category | null)[]) => new Set(cs.map((c) => (c ? AREA_OF[c] : null)).filter((a): a is 'I' | 'II' | 'III' => a !== null));
    add('exam-af2', cats.some((c) => c && AREA_OF[c] === 'II') ? 'ok' : 'fail', 'Ein Prüfungsfach muss aus dem Aufgabenfeld II sein (Geschichte, PoWi, Geographie, Religion oder Ethik).');
    add('exam-written', areas(cats.slice(0, 3)).size >= 2 ? 'ok' : 'fail', 'Die drei schriftlichen Prüfungsfächer müssen mindestens zwei Aufgabenfelder abdecken.');
    add('exam-areas', areas(cats).size === 3 ? 'ok' : 'fail', 'Die fünf Prüfungsfächer müssen alle drei Aufgabenfelder abdecken.');
  }

  // Einbringverpflichtung der freien Kurse
  const incl = courses.filter((c) => c.included);
  for (const n of needs()) {
    const mine = subs.filter(n.subjectFilter ?? (() => true));
    let got = 0;
    if (n.oneSubject) {
      for (const s of mine) got = Math.max(got, incl.filter((c) => c.subjectId === s.id && n.count(c, s)).length);
    } else {
      got = incl.filter((c) => mine.some((s) => s.id === c.subjectId) && n.count(c, mine[0]!)).length;
    }
    // Geschichte oder Geographie: Q3 und Q4 desselben Fachs
    if (n.id === 'g') {
      got = 0;
      for (const s of mine) got = Math.max(got, incl.filter((c) => c.subjectId === s.id && c.q >= 2).length);
    }
    const have = mine.length > 0;
    add(`need-${n.id}`, got >= n.min ? 'ok' : have ? 'fail' : 'warn', got >= n.min ? n.label : have ? `${n.label}: erst ${got} eingebracht.` : `${n.label}: kein passendes Fach in deiner Liste.`);
  }
  // Aufgabenfeld II insgesamt sechs Kurse
  const af2 = incl.filter((c) => {
    const s = byId.get(c.subjectId);
    return s ? AREA_OF[categoryFor(s.name)] === 'II' : false;
  }).length;
  add('need-af2', af2 >= 6 ? 'ok' : 'fail', af2 >= 6 ? 'Aufgabenfeld II: mindestens sechs Kurse.' : `Aufgabenfeld II: erst ${af2} von sechs Kursen eingebracht.`);
  // weitere zwei Kurse aus zweiter Fremdsprache, zweiter Naturwissenschaft oder Informatik
  const extra = new Set(
    subs
      .filter((s) => ['fremdsprache', 'naturwiss', 'informatik'].includes(categoryFor(s.name)) && incl.filter((c) => c.subjectId === s.id).length >= 2)
      .map((s) => s.id),
  );
  add('need-extra', extra.size >= 3 ? 'ok' : 'fail', extra.size >= 3 ? 'Zwei weitere Kurse aus zweiter Fremdsprache, zweiter Naturwissenschaft oder Informatik.' : 'Zwei weitere Kurse fehlen aus einer zweiten Fremdsprache, einer zweiten Naturwissenschaft oder Informatik (in einem dritten Fach).');
  const sport = incl.filter((c) => {
    const s = byId.get(c.subjectId);
    return s ? categoryFor(s.name) === 'sport' : false;
  }).length;
  if (sport > A.sportMax) add('need-sport', 'fail', `Sport: höchstens ${A.sportMax} Kurse einbringbar, ${sport} gewählt.`);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Vorschlag für die Auswahl der freien Grundkurse

/**
 * Wählt die freien Grundkurse so, dass die Einbringverpflichtung erfüllt ist und die Summe möglichst hoch wird. Das Verfahren
 * ist ein Vorschlag (erst die Pflicht mit den besten Kursen, dann die besten übrigen), kein Beweis der besten Lösung.
 */
export function suggestPicks(subjects: readonly Subject[], plan: AbiturPlan): Record<string, boolean[]> {
  const A = CONFIG.abitur;
  const base = computeAbitur(subjects, { ...plan, picks: {} });
  const byId = new Map(subjects.map((s) => [s.id, s]));
  const chosen = new Set(base.courses.filter((c) => c.included).map((c) => `${c.subjectId}:${c.q}`));
  const key = (c: Course) => `${c.subjectId}:${c.q}`;
  const pool = base.courses.filter((c) => c.available && !c.included);
  const pts = (c: Course) => c.points ?? 0;
  let free = A.gkRequired - base.courses.filter((c) => c.included && !c.advanced).length;
  const take = (c: Course) => {
    if (free <= 0 || chosen.has(key(c))) return;
    chosen.add(key(c));
    free -= 1;
  };
  const sportLeft = () => A.sportMax - [...chosen].filter((k) => { const s = byId.get(k.split(':')[0]!); return s && categoryFor(s.name) === 'sport'; }).length;

  for (const n of needs()) {
    const mine = subjects.filter((s) => (n.subjectFilter ?? (() => true))(lite(s)));
    if (n.oneSubject) {
      // das Fach mit der besten Summe der Kurse, schon eingebrachte Kurse zählen mit
      let best: { id: string; sum: number; add: Course[] } | null = null;
      for (const s of mine) {
        const all = base.courses.filter((c) => c.subjectId === s.id && c.available);
        if (all.length < n.min) continue;
        const have = all.filter((c) => chosen.has(key(c)));
        const rest = all.filter((c) => !chosen.has(key(c))).sort((a, b) => pts(b) - pts(a));
        const need = Math.max(0, n.min - have.length);
        const add = rest.slice(0, need);
        const sum = [...have, ...add].reduce((x, c) => x + pts(c), 0);
        if (!best || add.length < best.add.length || (add.length === best.add.length && sum > best.sum)) best = { id: s.id, sum, add };
      }
      best?.add.forEach(take);
    } else {
      const matches = (c: Course) => mine.some((s) => s.id === c.subjectId) && n.count(c, lite(mine[0]!));
      const have = [...chosen].filter((k) => base.courses.some((c) => key(c) === k && matches(c))).length;
      let need = n.min - have;
      if (n.id === 'g') {
        // Q3 und Q4 desselben Fachs
        let best: Course[] = [];
        let bestSum = -1;
        for (const s of mine) {
          const two = base.courses.filter((c) => c.subjectId === s.id && c.q >= 2 && c.available);
          const sum = two.filter((c) => !chosen.has(key(c))).reduce((x, c) => x + pts(c), 0);
          if (two.length === 2 && (bestSum < 0 || sum > bestSum || two.every((c) => chosen.has(key(c))))) {
            best = two;
            bestSum = sum;
          }
        }
        best.forEach(take);
        continue;
      }
      for (const c of pool.filter(matches).sort((a, b) => pts(b) - pts(a))) {
        if (need <= 0) break;
        if (!chosen.has(key(c))) {
          take(c);
          need -= 1;
        }
      }
    }
  }
  // Aufgabenfeld II: sechs Kurse
  const af2 = (c: Course) => {
    const s = byId.get(c.subjectId);
    return s ? AREA_OF[categoryFor(s.name)] === 'II' : false;
  };
  let haveAf2 = base.courses.filter((c) => chosen.has(key(c)) && af2(c)).length;
  for (const c of [...pool].filter(af2).sort((a, b) => pts(b) - pts(a))) {
    if (haveAf2 >= 6) break;
    if (!chosen.has(key(c))) {
      take(c);
      haveAf2 += 1;
    }
  }
  // zwei weitere Kurse aus Fremdsprache, Naturwissenschaft, Informatik in einem dritten Fach
  const fsnw = (c: Course) => {
    const s = byId.get(c.subjectId);
    return s ? ['fremdsprache', 'naturwiss', 'informatik'].includes(categoryFor(s.name)) : false;
  };
  const countIn = (id: string) => base.courses.filter((c) => c.subjectId === id && chosen.has(key(c))).length;
  const distinct = () => new Set(base.courses.filter((c) => fsnw(c) && countIn(c.subjectId) >= 2).map((c) => c.subjectId)).size;
  if (distinct() < 3) {
    const ids = [...new Set(base.courses.filter(fsnw).map((c) => c.subjectId))].filter((id) => countIn(id) < 2);
    const options = ids
      .map((id) => ({ id, add: pool.filter((c) => c.subjectId === id && !chosen.has(key(c))).sort((a, b) => pts(b) - pts(a)).slice(0, 2 - countIn(id)) }))
      .filter((o) => o.add.length === 2 - countIn(o.id))
      .sort((a, b) => b.add.reduce((x, c) => x + pts(c), 0) - a.add.reduce((x, c) => x + pts(c), 0));
    options[0]?.add.forEach(take);
  }
  // Rest: die besten übrigen Kurse
  for (const c of [...pool].sort((a, b) => pts(b) - pts(a))) {
    if (free <= 0) break;
    const s = byId.get(c.subjectId);
    if (chosen.has(key(c))) continue;
    if (s && categoryFor(s.name) === 'sport' && sportLeft() <= 0) continue;
    take(c);
  }

  const picks: Record<string, boolean[]> = {};
  for (const c of base.courses) {
    if (c.advanced || c.forced) continue;
    picks[c.subjectId] ??= Array<boolean>(A.quarters).fill(false);
    picks[c.subjectId]![c.q] = chosen.has(key(c));
  }
  return picks;
}
