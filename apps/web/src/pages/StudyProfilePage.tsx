import { CONFIG, DEGREE_LABELS, PHASE_LABELS, readStudyProfile, semesterNumber, semesterPhase, toIsoDate, type DegreeKind, type StudyProfile } from '@study/core';
import { useState } from 'react';
import { Segmented } from '../components/Segmented';
import { formatDateShort } from '../lib/format';
import { useStore } from '../state/store';

const sameProfile = (a: StudyProfile, b: StudyProfile) => JSON.stringify(a) === JSON.stringify(b);

/** Studiengang, Startsemester und die Zeiten des Semesters. Daraus folgen Fachsemester, Fortschritt und die Tageskapazität im Plan. */
export function StudyProfilePage() {
  const { state, dispatch } = useStore();
  const [draft, setDraft] = useState<StudyProfile>(state.study);
  const [saved, setSaved] = useState(false);
  const set = (patch: Partial<StudyProfile>) => {
    setSaved(false);
    setDraft((d) => ({ ...d, ...patch }));
  };
  const today = new Date();
  const phase = semesterPhase(toIsoDate(today), draft);
  const dateField = (label: string, key: 'lectureStart' | 'lectureEnd' | 'examStart' | 'examEnd') => (
    <label className="field">
      <span>{label}</span>
      <input className="input" type="date" value={draft[key] ?? ''} onChange={(e) => set({ [key]: e.target.value || null } as Partial<StudyProfile>)} />
    </label>
  );

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>Studiengang</h1>
          <p className="sub">Du bist im {semesterNumber(draft, today)}. Fachsemester.</p>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card stack" style={{ gap: 16 }}>
          <h2>Dein Studium</h2>
          <div className="field">
            <span>Abschluss</span>
            <Segmented<DegreeKind>
              label="Abschluss"
              value={draft.degree}
              onChange={(degree) =>
                set({ degree, totalEcts: CONFIG.study.defaultTotalEcts[degree], regularSemesters: CONFIG.study.defaultRegularSemesters[degree] })
              }
              options={(Object.keys(DEGREE_LABELS) as DegreeKind[]).map((d) => ({ value: d, label: DEGREE_LABELS[d] }))}
            />
          </div>
          <label className="field">
            <span>Studiengang</span>
            <input className="input" value={draft.program} onChange={(e) => set({ program: e.target.value })} placeholder="Informatik" />
          </label>
          <label className="field">
            <span>Hochschule</span>
            <input className="input" value={draft.university} onChange={(e) => set({ university: e.target.value })} placeholder="Name der Hochschule" />
          </label>
          <div className="field">
            <span>Studienbeginn</span>
            <div className="row" style={{ gap: 8 }}>
              <Segmented<'WS' | 'SS'>
                label="Semester"
                value={draft.startTerm}
                onChange={(startTerm) => set({ startTerm })}
                options={[
                  { value: 'WS', label: 'Winter' },
                  { value: 'SS', label: 'Sommer' },
                ]}
              />
              <input
                className="input"
                type="number"
                inputMode="numeric"
                min={1990}
                max={2100}
                value={draft.startYear}
                onChange={(e) => set({ startYear: Math.round(Number(e.target.value)) || draft.startYear })}
                aria-label="Jahr des Studienbeginns"
                style={{ maxWidth: 110 }}
              />
            </div>
            <span className="hint">Das Wintersemester beginnt im Oktober, das Sommersemester im April. Daraus rechnet die App das Fachsemester.</span>
          </div>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="field">
              <span>ECTS insgesamt</span>
              <input className="input" type="number" inputMode="numeric" min={1} max={600} value={draft.totalEcts} onChange={(e) => set({ totalEcts: Math.round(Number(e.target.value)) || draft.totalEcts })} />
            </label>
            <label className="field">
              <span>Regelstudienzeit (Semester)</span>
              <input className="input" type="number" inputMode="numeric" min={1} max={20} value={draft.regularSemesters} onChange={(e) => set({ regularSemesters: Math.round(Number(e.target.value)) || draft.regularSemesters })} />
            </label>
          </div>
          <p className="hint">Beides steht in deiner Prüfungsordnung. Die Startwerte sind übliche Werte.</p>
        </div>

        <div className="card stack" style={{ gap: 16 }}>
          <h2>Dieses Semester</h2>
          <p className="muted">
            Heute: <strong>{PHASE_LABELS[phase]}</strong>
            {draft.lectureStart && draft.lectureEnd && (
              <>
                {' '}
                · Vorlesungen {formatDateShort(draft.lectureStart)} bis {formatDateShort(draft.lectureEnd)}
              </>
            )}
          </p>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {dateField('Vorlesungen ab', 'lectureStart')}
            {dateField('Vorlesungen bis', 'lectureEnd')}
            {dateField('Prüfungsphase ab', 'examStart')}
            {dateField('Prüfungsphase bis', 'examEnd')}
          </div>
          <p className="hint">
            In der Prüfungsphase und vorlesungsfrei rechnet der Plan mit mehr Lernzeit pro Tag ({Math.round(CONFIG.study.plan.examPhaseLimitMin / 60)} Stunden statt deines Tageslimits, falls das niedriger ist). Die Termine stehen im Akademischen Kalender deiner Hochschule.
          </p>
        </div>
      </div>

      <div className="row">
        <button
          type="button"
          className="btn btn-primary"
          disabled={sameProfile(draft, state.study)}
          onClick={() => {
            const clean = readStudyProfile(draft);
            dispatch({ type: 'setStudy', study: clean });
            setDraft(clean);
            setSaved(true);
          }}
        >
          Speichern
        </button>
        {saved && <span className="hint">Gespeichert.</span>}
      </div>
    </div>
  );
}
