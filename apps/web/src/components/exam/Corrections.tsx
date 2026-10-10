import { LEVEL_LABELS, reviewView } from '@study/core';
import { ChevronRight, ClipboardCheck, FilePlus2, GraduationCap, ListChecks, TrendingUp } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { formatDateShort } from '../../lib/format';
import { useStore } from '../../state/store';
import { useAccess } from '../../lib/access';

/** Übersicht der korrigierten Klausuren und der Korrekturmuster pro Fach (Ansicht auf der Seite Notizen). */
export function Corrections({ tabs }: { tabs: ReactNode }) {
  const { state } = useStore();
  const access = useAccess();
  const correct = access.can('correct');
  const practice = access.can('practice');
  const subjectOf = useMemo(() => new Map(state.subjects.map((s) => [s.id, s])), [state.subjects]);
  const list = useMemo(
    () =>
      [...state.examReviews]
        .sort((a, b) => b.examDate.localeCompare(a.examDate) || b.createdAt.localeCompare(a.createdAt))
        .map((r) => ({ review: r, view: reviewView(r, state.examReviews, state.subjects) })),
    [state.examReviews, state.subjects],
  );

  const practices = useMemo(() => [...state.practiceExams].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [state.practiceExams]);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>Klausuren</h1>
          <p className="sub">
            {correct
              ? 'Lass Klausuren nach dem Korrekturmuster deines Fachs korrigieren. Mit jeder zurückgegebenen Klausur wird es genauer.'
              : 'Deine Übungsklausuren und korrigierten Klausuren.'}
          </p>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {state.examReviews.some((r) => r.main) && (
            <Link className="btn" to="/korrektur/schwaechen">
              <TrendingUp size={18} aria-hidden="true" /> Schwächen
            </Link>
          )}
          {practice && (
            <Link className="btn" to="/korrektur/uebung/neu">
              <FilePlus2 size={18} aria-hidden="true" /> Übungsklausur erstellen
            </Link>
          )}
          {correct && (
            <Link className="btn btn-primary" to="/korrektur/neu">
              <ClipboardCheck size={18} aria-hidden="true" /> Klausur korrigieren
            </Link>
          )}
        </div>
      </div>
      {tabs}

      {correct && state.subjects.length > 0 && (
        <section className="stack" style={{ gap: 8 }}>
          <h2 className="section-head">Korrekturmuster</h2>
          <div className="chip-grid">
            {state.subjects.map((s) => {
              const r = state.rubrics.find((x) => x.subjectId === s.id);
              const extra = (r?.teacherText.trim() ? 1 : 0) + (r?.lessons.length ?? 0);
              return (
                <Link key={s.id} className="chip" to={`/korrektur/muster/${s.id}`}>
                  <i className="dot" style={{ background: s.color }} />
                  {s.name}
                  {extra > 0 && <span className="chip-count">{extra}</span>}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {access.can('style') && practice && state.subjects.length > 0 && (
        <section className="stack" style={{ gap: 8 }}>
          <h2 className="section-head">Aufgabenstil</h2>
          <p className="hint">Lade Aufgabenblätter deiner Lehrkraft hoch, dann schreibt die KI Übungsklausuren in deren Stil.</p>
          <div className="chip-grid">
            {state.subjects.map((s) => {
              const n = state.taskStyles.filter((x) => x.subjectId === s.id).length;
              return (
                <Link key={s.id} className="chip" to={`/korrektur/stil/${s.id}`}>
                  <i className="dot" style={{ background: s.color }} />
                  {s.name}
                  {n > 0 && <span className="chip-count">{n}</span>}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {(practice || practices.length > 0) && (
      <section className="stack" style={{ gap: 8 }}>
        <h2 className="section-head">Übungsklausuren</h2>
        {practices.length === 0 ? (
          <div className="card empty stack" style={{ gap: 8 }}>
            <FilePlus2 size={28} aria-hidden="true" />
            <p className="muted">
              Noch keine Übungsklausur. Die KI schreibt dir eine Klausur wie im Unterricht, passend zu deinen Notizen, in drei Stufen und als PDF mit Erwartungshorizont.
            </p>
            {practice && (
              <Link className="btn" to="/korrektur/uebung/neu">
                Erste Übungsklausur erstellen
              </Link>
            )}
          </div>
        ) : (
          <ul className="review-rows">
            {practices.map((p) => {
              const s = p.subjectId ? subjectOf.get(p.subjectId) : undefined;
              const done = state.examReviews.filter((r) => r.practiceId === p.id && r.main).length;
              return (
                <li key={p.id}>
                  <Link className="review-row" to={`/korrektur/uebung/${p.id}`}>
                    <i className="dot" style={{ background: s?.color ?? 'var(--ink-3)' }} />
                    <span className="review-row-main">
                      <strong>{p.title}</strong>
                      <span className="hint">
                        {s?.name ?? 'Ohne Fach'} · {formatDateShort(p.createdAt.slice(0, 10))} · {String(p.content.gesamt_be).replace('.', ',')} BE
                      </span>
                    </span>
                    <span className="review-row-points">
                      <span className="pill">{LEVEL_LABELS[p.level]}</span>
                      <span className="hint">{done > 0 ? `${done} gelöst` : 'noch offen'}</span>
                    </span>
                    <ChevronRight size={18} aria-hidden="true" className="review-row-chev" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      )}

      {(correct || list.length > 0) && (
      <section className="stack" style={{ gap: 8 }}>
        <h2 className="section-head">Korrigiert</h2>
        {list.length === 0 ? (
          <div className="card empty stack" style={{ gap: 8 }}>
            <ListChecks size={28} aria-hidden="true" />
            <p className="muted">Noch keine Klausur korrigiert. Fotografiere deine Lösung und am besten auch die Aufgaben, die KI korrigiert nach dem Muster deines Fachs.</p>
          </div>
        ) : (
          <ul className="review-rows">
            {list.map(({ review: r, view }) => {
              const s = r.subjectId ? subjectOf.get(r.subjectId) : undefined;
              return (
                <li key={r.id}>
                  <Link className="review-row" to={`/korrektur/${r.id}`}>
                    <i className="dot" style={{ background: s?.color ?? 'var(--ink-3)' }} />
                    <span className="review-row-main">
                      <strong>{r.title}</strong>
                      <span className="hint">
                        {r.practiceId ? 'Übung · ' : ''}
                        {s?.name ?? 'Ohne Fach'} · {formatDateShort(r.examDate)}
                        {r.teacher ? ` · ${r.teacher}` : ''}
                      </span>
                    </span>
                    <span className="review-row-points">
                      {view.shown !== null ? <strong>{view.shown} P</strong> : <span className="hint">ohne Ergebnis</span>}
                      {r.teacherPoints !== null && (
                        <span className="hint">
                          <GraduationCap size={13} aria-hidden="true" /> {r.teacherPoints} P
                        </span>
                      )}
                    </span>
                    <ChevronRight size={18} aria-hidden="true" className="review-row-chev" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      )}
    </div>
  );
}
