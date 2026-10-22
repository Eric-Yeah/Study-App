import { CONFIG, subjectOverview, weaknessReport, type BucketStat } from '@study/core';
import { ChevronRight, Lightbulb, TrendingDown, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { formatNumber } from '../lib/format';
import { useStore } from '../state/store';
import { useAccess } from '../lib/access';

const pct = (x: number) => `${Math.round(x * 100)} %`;
const num = (n: number) => formatNumber(n, 1).replace(/,0$/, '');

function Row({ s }: { s: BucketStat }) {
  const weak = s.share < CONFIG.weaknesses.weakShare;
  return (
    <li className="weak-row">
      <div className="between" style={{ gap: 8 }}>
        <strong>{s.label}</strong>
        <span className={weak ? 'pill pill-warn' : 'pill'}>{pct(s.share)}</span>
      </div>
      <div className="bar" aria-hidden="true">
        <i style={{ width: `${Math.max(3, s.share * 100)}%`, background: weak ? 'var(--warn)' : undefined }} />
      </div>
      <span className="hint">
        {s.tasks} {s.tasks === 1 ? 'Aufgabe' : 'Aufgaben'} · {num(s.points)} von {num(s.max)} Punkten
      </span>
    </li>
  );
}

/** Wo gehen Punkte verloren? Auswertung aller korrigierten Klausuren, pro Fach und insgesamt, ohne KI. */
export function Weaknesses() {
  const { state } = useStore();
  const access = useAccess();
  const [params, setParams] = useSearchParams();
  const subjectId = params.get('fach') ?? '';
  const practice = params.get('art') === 'uebung';
  const set = (next: { fach?: string; art?: string }) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    setParams(p, { replace: true });
  };

  const report = useMemo(() => weaknessReport(state.examReviews, state.subjects, { practice, subjectId: subjectId || null }), [state.examReviews, state.subjects, practice, subjectId]);
  const overview = useMemo(() => subjectOverview(state.examReviews, state.subjects, { practice }), [state.examReviews, state.subjects, practice]);
  const subject = state.subjects.find((s) => s.id === subjectId);
  const kind = practice ? 'Übungsklausuren' : 'Klausuren';

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>Schwächen</h1>
          <p className="sub">Wo dir in den korrigierten Klausuren Punkte fehlen, nach Operator und Anforderungsbereich. Gerechnet aus den gespeicherten Korrekturen, ohne KI und ohne Kosten.</p>
        </div>
      </div>

      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }} role="group" aria-label="Art">
        <button type="button" className="chip" aria-pressed={!practice} onClick={() => set({ art: '' })}>
          Echte Klausuren
        </button>
        <button type="button" className="chip" aria-pressed={practice} onClick={() => set({ art: 'uebung' })}>
          Übungsklausuren
        </button>
      </div>
      <div className="chip-grid" role="group" aria-label="Fach">
        <button type="button" className="chip" aria-pressed={!subjectId} onClick={() => set({ fach: '' })}>
          Alle Fächer
        </button>
        {state.subjects.map((s) => (
          <button key={s.id} type="button" className="chip" aria-pressed={subjectId === s.id} onClick={() => set({ fach: s.id })}>
            <i className="dot" style={{ background: s.color }} />
            {s.name}
          </button>
        ))}
      </div>

      {report.reviews === 0 ? (
        <div className="card empty stack" style={{ gap: 8 }}>
          <Lightbulb size={28} aria-hidden="true" />
          <p className="muted">
            {practice
              ? `Noch keine korrigierte Übungsklausur${subject ? ` in ${subject.name}` : ''}. Löse eine Übungsklausur und lass sie korrigieren.`
              : `Noch keine korrigierte Klausur${subject ? ` in ${subject.name}` : ''}. Sobald du Klausuren korrigieren lässt, siehst du hier, wo Punkte verloren gehen.`}
          </p>
          {access.can('correct') && (
            <Link className="btn" to="/korrektur/neu">
              Klausur korrigieren
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="card stack">
            <div className="between" style={{ gap: 8, flexWrap: 'wrap' }}>
              <h2 className="section-head">{subject ? subject.name : 'Alle Fächer'}</h2>
              <span className="hint">
                {report.reviews} {report.reviews === 1 ? kind.replace('klausuren', 'klausur') : kind} · {report.tasks} Aufgaben{report.share !== null ? ` · ${pct(report.share)} der Punkte` : ''}
              </span>
            </div>
            {report.hints.length > 0 ? (
              <ul className="mark-list">
                {report.hints.map((h) => (
                  <li key={h}>
                    <Lightbulb size={15} aria-hidden="true" /> {h}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint">Noch keine auffällige Schwäche. Mit mehr korrigierten Klausuren wird die Auswertung genauer.</p>
            )}
          </div>

          {!subjectId && overview.length > 0 && (
            <section className="stack" style={{ gap: 8 }}>
              <h2 className="section-head">Nach Fach</h2>
              <ul className="review-rows">
                {overview.map((o) => {
                  const s = state.subjects.find((x) => x.id === o.subjectId);
                  return (
                    <li key={o.subjectId}>
                      <button type="button" className="review-row weak-subject" onClick={() => set({ fach: o.subjectId })}>
                        <i className="dot" style={{ background: s?.color ?? 'var(--ink-3)' }} />
                        <span className="review-row-main">
                          <strong>{o.name}</strong>
                          <span className="hint">
                            {o.reviews} {o.reviews === 1 ? 'Klausur' : 'Klausuren'}
                            {o.weakest ? ` · schwach: ${o.weakest.label} (${pct(o.weakest.share)})` : o.weakestAfb ? ` · am wenigsten ${o.weakestAfb.label} (${pct(o.weakestAfb.share)})` : ''}
                          </span>
                        </span>
                        <span className="review-row-points">
                          {o.share !== null && <strong>{pct(o.share)}</strong>}
                          {o.trend !== null && o.trend !== 0 && (
                            <span className="hint" style={{ color: o.trend > 0 ? 'var(--ok, var(--accent))' : 'var(--warn)' }}>
                              {o.trend > 0 ? <TrendingUp size={13} aria-hidden="true" /> : <TrendingDown size={13} aria-hidden="true" />} {o.trend > 0 ? '+' : ''}
                              {num(o.trend)} P
                            </span>
                          )}
                        </span>
                        <ChevronRight size={18} aria-hidden="true" className="review-row-chev" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {report.byAfb.length > 0 && (
            <section className="stack" style={{ gap: 8 }}>
              <h2 className="section-head">Anforderungsbereiche</h2>
              <ul className="weak-list card">{report.byAfb.map((s) => <Row key={s.key} s={s} />)}</ul>
            </section>
          )}

          {report.byOperator.length > 0 && (
            <section className="stack" style={{ gap: 8 }}>
              <h2 className="section-head">Operatoren</h2>
              <p className="hint">Schwächster zuerst. Gezeigt werden Operatoren mit mindestens {CONFIG.weaknesses.minTasks} Aufgaben.</p>
              <ul className="weak-list card">{report.byOperator.slice(0, 10).map((s) => <Row key={s.key} s={s} />)}</ul>
            </section>
          )}

          {report.perQuarter.length > 0 && (
            <section className="stack" style={{ gap: 8 }}>
              <h2 className="section-head">Verlauf nach Q-Phase</h2>
              <ul className="weak-list card">
                {report.perQuarter.map((q) => (
                  <li key={q.quarter ?? 'ohne'} className="weak-row">
                    <div className="between" style={{ gap: 8 }}>
                      <strong>{q.quarter ?? 'Ohne Q-Phase'}</strong>
                      <span className="pill">{q.points !== null ? `${num(q.points)} P` : pct(q.share)}</span>
                    </div>
                    <div className="bar" aria-hidden="true">
                      <i style={{ width: `${Math.max(3, q.share * 100)}%` }} />
                    </div>
                    <span className="hint">
                      {q.reviews} {q.reviews === 1 ? 'Klausur' : 'Klausuren'} · {pct(q.share)} der Aufgabenpunkte
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(report.weaknesses.length > 0 || report.nextSteps.length > 0) && (
            <section className="stack" style={{ gap: 8 }}>
              <h2 className="section-head">Aus den letzten Korrekturen</h2>
              <div className="card stack">
                {report.weaknesses.length > 0 && (
                  <>
                    <span className="form-label">Schwächen</span>
                    <ul className="mark-list miss">{report.weaknesses.map((x) => <li key={x}>{x}</li>)}</ul>
                  </>
                )}
                {report.nextSteps.length > 0 && (
                  <>
                    <span className="form-label">Nächste Schritte</span>
                    <ul className="mark-list">{report.nextSteps.map((x) => <li key={x}>{x}</li>)}</ul>
                  </>
                )}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
