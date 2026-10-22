import { addDays, fmtMinutes, isoWeek, toIsoDate, weeklyReview } from '@study/core';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { formatDateShort } from '../lib/format';
import { weekReviewData } from '../state/selectors';
import { useStore } from '../state/store';

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const MAX_WEEKS_BACK = 8; // so weit reichen Check-ins und Overload-Daten

const dayLabel = (days: number) => (days === 0 ? 'heute' : days === 1 ? 'morgen' : `in ${days} Tagen`);

export function Review() {
  const { state } = useStore();
  const today = new Date();
  const todayIso = toIsoDate(today);
  const [params] = useSearchParams();
  const [back, setBack] = useState(() => Math.min(MAX_WEEKS_BACK, Math.max(0, Math.floor(Number(params.get('zurueck')) || 0)))); // 0 = diese Woche, 1 = letzte Woche, ...
  const anyDay = addDays(todayIso, -7 * back);
  const review = useMemo(() => weeklyReview(weekReviewData(state, anyDay, today)), [state, anyDay]); // eslint-disable-line react-hooks/exhaustive-deps
  const maxMin = Math.max(60, ...review.days.map((d) => Math.max(d.learned, d.planned)));
  const maxSubject = Math.max(30, ...review.subjects.map((s) => Math.max(s.learned, s.planned)));
  const delta = review.learned - review.prevLearned;
  const title = back === 0 ? 'Diese Woche' : back === 1 ? 'Letzte Woche' : `KW ${isoWeek(review.weekStart)}`;

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>Wochenrückblick</h1>
          <p className="sub">
            {title} · KW {isoWeek(review.weekStart)}, {formatDateShort(review.weekStart)} bis {formatDateShort(review.weekEnd)}
          </p>
        </div>
      </div>

      <div className="row review-nav" style={{ gap: 8 }}>
        <button type="button" className="btn" disabled={back >= MAX_WEEKS_BACK} onClick={() => setBack(back + 1)}>
          <ChevronLeft size={16} aria-hidden="true" /> Woche davor
        </button>
        <button type="button" className="btn" disabled={back === 0} onClick={() => setBack(back - 1)}>
          Woche danach <ChevronRight size={16} aria-hidden="true" />
        </button>
        {back > 0 && (
          <button type="button" className="link-btn" onClick={() => setBack(0)}>
            Diese Woche
          </button>
        )}
      </div>

      <div className="grid cols-2 review-tiles">
        <div className="card">
          <p className="hint">Gelernt</p>
          <div className="big-num">{fmtMinutes(review.learned)}</div>
          <p className="hint">
            {review.planned > 0 ? `von ${fmtMinutes(review.planned)} geplant` : 'kein Plan in dieser Woche'}
            {review.prevLearned > 0 || review.learned > 0 ? ` · ${delta === 0 ? 'wie' : delta > 0 ? `+${fmtMinutes(delta)} gegenüber` : `−${fmtMinutes(-delta)} gegenüber`} der Woche davor` : ''}
          </p>
        </div>
        <div className="card">
          <p className="hint">Lerntage</p>
          <div className="big-num">{review.studyDays} von 7</div>
          <p className="hint">{review.best ? `Bester Tag: ${WEEKDAYS[review.days.findIndex((d) => d.date === review.best!.date)]}, ${fmtMinutes(review.best.minutes)}` : 'Noch kein Lerntag'}</p>
        </div>
      </div>

      <div className="card">
        <div
          className="wk"
          role="img"
          aria-label={`Tage dieser Woche: ${review.days.map((d, i) => `${WEEKDAYS[i]} ${fmtMinutes(d.learned)} gelernt, ${fmtMinutes(d.planned)} geplant`).join(', ')}`}
        >
          {review.days.map((d, i) => (
            <div key={d.date} className={`wk-col${d.isToday ? ' today' : ''}`}>
              <div className="wk-bars">
                <div className="wk-plan" style={{ height: `${(d.planned / maxMin) * 100}%` }}>
                  <i style={{ flexGrow: 1, background: 'var(--accent)' }} />
                </div>
                <div className="wk-learned" style={{ height: `${(d.learned / maxMin) * 100}%` }} />
              </div>
              <span className="wk-label">{WEEKDAYS[i]}</span>
            </div>
          ))}
        </div>
        <div className="legend" style={{ marginTop: 12 }}>
          <span>
            <i style={{ background: 'var(--accent)', opacity: 0.55 }} />
            Geplant
          </span>
          <span>
            <i style={{ background: 'var(--ok)' }} />
            Gelernt
          </span>
        </div>
      </div>

      {review.hints.length > 0 && (
        <section className="stack" style={{ gap: 8 }}>
          <h2>Auffällig</h2>
          <ul className="review-hints">
            {review.hints.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </section>
      )}

      {review.subjects.length > 0 && (
        <section className="stack" style={{ gap: 10 }}>
          <h2>Nach Fach</h2>
          <div className="card stack" style={{ gap: 14 }}>
            {review.subjects.map((s) => (
              <div key={s.subjectId ?? 'none'} className="stack" style={{ gap: 4 }}>
                <div className="between">
                  <span className="row" style={{ gap: 8 }}>
                    <i className="dot" style={{ background: s.color }} />
                    {s.name}
                  </span>
                  <span className="hint">
                    {fmtMinutes(s.learned)}
                    {s.planned > 0 ? ` von ${fmtMinutes(s.planned)}` : ''}
                  </span>
                </div>
                <div className="review-bar" aria-hidden="true">
                  {s.planned > 0 && <i className="plan" style={{ width: `${(s.planned / maxSubject) * 100}%` }} />}
                  <i className="done" style={{ width: `${(s.learned / maxSubject) * 100}%`, background: s.color }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="stack" style={{ gap: 10 }}>
        <h2>Befinden und Erledigtes</h2>
        <div className="card review-facts">
          <div>
            <span className="hint">Energie</span>
            <strong>{review.energyAvg === null ? '–' : `Ø ${String(review.energyAvg).replace('.', ',')} von 5`}</strong>
          </div>
          <div>
            <span className="hint">Schlaf</span>
            <strong>{review.sleepAvg === null ? '–' : `Ø ${String(review.sleepAvg).replace('.', ',')} h`}</strong>
          </div>
          <div>
            <span className="hint">Training</span>
            <strong>{review.trainingDays === 0 ? '–' : `${review.trainingDays} ${review.trainingDays === 1 ? 'Tag' : 'Tage'}, ${fmtMinutes(review.trainingMinutes)}`}</strong>
          </div>
          <div>
            <span className="hint">Aufgaben</span>
            <strong>{review.tasks.total === 0 ? '–' : `${review.tasks.done} von ${review.tasks.total} erledigt`}</strong>
          </div>
          <div>
            <span className="hint">Notizen</span>
            <strong>{review.notes === 0 ? '–' : `${review.notes} neu`}</strong>
          </div>
          <div>
            <span className="hint">Karteikarten</span>
            <strong>{review.cards === 0 ? '–' : `${review.cards} gelernt`}</strong>
          </div>
        </div>
      </section>

      {review.exams.length > 0 && (
        <section className="stack" style={{ gap: 8 }}>
          <h2>Als Nächstes</h2>
          <div className="card stack" style={{ gap: 8 }}>
            {review.exams.map((e) => (
              <div key={`${e.date}${e.title}`} className="between">
                <span>{e.title}</span>
                <span className="hint">
                  {formatDateShort(e.date)} · {dayLabel(e.daysLeft)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
