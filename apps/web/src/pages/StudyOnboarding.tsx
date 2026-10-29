import { CONFIG, DEGREE_LABELS, emptyStudyProfile, readStudyProfile, semesterNumber, type DegreeKind, type StudyProfile, type Subject } from '@study/core';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Segmented } from '../components/Segmented';
import { uid } from '../lib/format';
import { SUBJECT_COLORS } from '../state/defaults';
import { useStore } from '../state/store';

interface ModuleDraft {
  id: string;
  name: string;
  ects: number;
}

/** Einrichtung für Studierende: Studiengang, Semester, Module. Danach läuft alles wie in der Schule, nur mit ECTS statt Notenpunkten. */
export function StudyOnboarding({ name, onBack }: { name: string; onBack: () => void }) {
  const { dispatch } = useStore();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<StudyProfile>(() => emptyStudyProfile());
  const [modules, setModules] = useState<ModuleDraft[]>([]);
  const [moduleName, setModuleName] = useState('');
  const [moduleEcts, setModuleEcts] = useState(6);
  const set = (patch: Partial<StudyProfile>) => setProfile((p) => ({ ...p, ...patch }));
  const steps = ['Dein Studium', 'Dein Semester', 'Deine Module'];
  const semester = semesterNumber(profile);

  const addModule = () => {
    const n = moduleName.trim();
    if (!n || modules.some((m) => m.name === n)) return;
    setModules((list) => [...list, { id: uid(), name: n, ects: moduleEcts }]);
    setModuleName('');
  };

  const finish = () => {
    const subjects: Subject[] = modules.map((m, i) => ({
      id: m.id,
      name: m.name,
      color: SUBJECT_COLORS[i % SUBJECT_COLORS.length],
      isAdvanced: false,
      isExamSubject: false,
      status: 'active',
      type: 'knowledge',
      points: null,
      difficulty: 3,
      language: 'de',
      scope: 'uni',
      ects: m.ects,
      semester,
      required: true,
      lecturer: '',
    }));
    dispatch({ type: 'completeOnboarding', profile: { name: name.trim(), role: 'student_university', federalState: 'Hessen', stage: 'Q1' }, subjects });
    dispatch({ type: 'setStudy', study: readStudyProfile(profile) });
    dispatch({ type: 'setPlan', plan: { dailyLimitMin: CONFIG.study.plan.defaultDailyLimitMin } });
    navigate('/');
  };

  return (
    <main className="main" style={{ maxWidth: 640 }}>
      <div className="stack" style={{ gap: 20 }}>
        <div className="steps" aria-hidden="true">
          {steps.map((_, i) => (
            <i key={i} className={i <= step ? 'on' : ''} />
          ))}
        </div>
        <div>
          <p className="muted">
            Schritt {step + 1} von {steps.length} · Studium
          </p>
          <h1>{steps[step]}</h1>
        </div>

        {step === 0 && (
          <div className="stack" style={{ gap: 16 }}>
            <div className="field">
              <span>Abschluss</span>
              <Segmented<DegreeKind>
                label="Abschluss"
                value={profile.degree}
                onChange={(degree) => set({ degree, totalEcts: CONFIG.study.defaultTotalEcts[degree], regularSemesters: CONFIG.study.defaultRegularSemesters[degree] })}
                options={(Object.keys(DEGREE_LABELS) as DegreeKind[]).map((d) => ({ value: d, label: DEGREE_LABELS[d] }))}
              />
            </div>
            <label className="field">
              <span>Studiengang</span>
              <input className="input" value={profile.program} onChange={(e) => set({ program: e.target.value })} placeholder="zum Beispiel Informatik" />
            </label>
            <label className="field">
              <span>Hochschule (optional)</span>
              <input className="input" value={profile.university} onChange={(e) => set({ university: e.target.value })} />
            </label>
            <div className="field">
              <span>Wann hast du angefangen?</span>
              <div className="row" style={{ gap: 8 }}>
                <Segmented<'WS' | 'SS'>
                  label="Semester"
                  value={profile.startTerm}
                  onChange={(startTerm) => set({ startTerm })}
                  options={[
                    { value: 'WS', label: 'Wintersemester' },
                    { value: 'SS', label: 'Sommersemester' },
                  ]}
                />
                <input
                  className="input"
                  type="number"
                  inputMode="numeric"
                  min={1990}
                  max={2100}
                  value={profile.startYear}
                  onChange={(e) => set({ startYear: Math.round(Number(e.target.value)) || profile.startYear })}
                  aria-label="Jahr"
                  style={{ maxWidth: 110 }}
                />
              </div>
              <span className="hint">Erstes Semester ist das, in dem du angefangen hast. Heute bist du im {semester}. Fachsemester.</span>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="stack" style={{ gap: 16 }}>
            <p className="muted">
              Wann sind die Vorlesungen und die Prüfungsphase? Das steht im Akademischen Kalender deiner Hochschule. Du kannst das auch später unter Studium → Studiengang eintragen.
            </p>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {(
                [
                  ['Vorlesungen ab', 'lectureStart'],
                  ['Vorlesungen bis', 'lectureEnd'],
                  ['Prüfungsphase ab', 'examStart'],
                  ['Prüfungsphase bis', 'examEnd'],
                ] as const
              ).map(([label, key]) => (
                <label key={key} className="field">
                  <span>{label}</span>
                  <input className="input" type="date" value={profile[key] ?? ''} onChange={(e) => set({ [key]: e.target.value || null } as Partial<StudyProfile>)} />
                </label>
              ))}
            </div>
            <p className="hint">In der Prüfungsphase und vorlesungsfrei plant die App mit mehr Lernzeit pro Tag.</p>
          </div>
        )}

        {step === 2 && (
          <div className="stack" style={{ gap: 16 }}>
            <p className="muted">Welche Module belegst du in diesem Semester? Name und Leistungspunkte (ECTS) stehen im Modulhandbuch. Alles weitere kannst du später ergänzen.</p>
            {modules.map((m) => (
              <div key={m.id} className="card between" style={{ padding: 12 }}>
                <span>
                  <strong>{m.name}</strong> <span className="hint">· {m.ects} ECTS</span>
                </span>
                <button type="button" className="btn btn-ghost btn-icon" aria-label={`${m.name} entfernen`} onClick={() => setModules((list) => list.filter((x) => x.id !== m.id))}>
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
            ))}
            <form
              className="row"
              style={{ flexWrap: 'wrap' }}
              onSubmit={(e) => {
                e.preventDefault();
                addModule();
              }}
            >
              <input className="input" style={{ flex: 1, minWidth: 160 }} value={moduleName} onChange={(e) => setModuleName(e.target.value)} placeholder="Modul, zum Beispiel Analysis I" aria-label="Name des Moduls" />
              <input className="input" style={{ maxWidth: 90 }} type="number" inputMode="decimal" min={0.5} max={60} step={0.5} value={moduleEcts} onChange={(e) => setModuleEcts(Math.min(60, Math.max(0.5, Number(e.target.value) || 6)))} aria-label="ECTS" />
              <button className="btn" type="submit">
                <Plus size={18} aria-hidden="true" /> Hinzufügen
              </button>
            </form>
            {modules.length === 0 && <p className="hint">Du kannst auch ohne Module starten und sie später unter Studium → Module anlegen.</p>}
          </div>
        )}

        <div className="between">
          <button className="btn btn-ghost" type="button" onClick={() => (step === 0 ? onBack() : setStep((s) => s - 1))}>
            Zurück
          </button>
          {step < steps.length - 1 ? (
            <button className="btn btn-primary" type="button" onClick={() => setStep((s) => s + 1)}>
              Weiter
            </button>
          ) : (
            <button className="btn btn-primary" type="button" onClick={finish}>
              Fertig
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
