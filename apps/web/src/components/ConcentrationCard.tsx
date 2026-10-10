import { CONFIG, concentration, toIsoDate, type ConcentrationTip, type LoadStatus } from '@study/core';
import { Segmented } from './Segmented';
import { formatMinutes, formatNumber } from '../lib/format';
import { checkinFor, learnedMinutesOn, loadRatioOn, sleepOn, trainingLoadOn, trainingOn } from '../state/selectors';
import { useStore, type Checkin } from '../state/store';

const TIPS: Record<ConcentrationTip, string> = {
  no_data: 'Trag unten Energie, Schlaf und Training ein, dann passt die App den Wert an deinen Tag an.',
  sleep_low: 'Wenig Schlaf: plane heute kürzere Einheiten und gönn dir früh Schlaf.',
  energy_low: 'Wenig Energie: starte mit der leichtesten Aufgabe und mach längere Pausen.',
  training_heavy: 'Viel Training heute: Der Kopf ist danach oft müder. Lege schwere Themen eher davor.',
  load_high: 'Deine Trainingsbelastung der letzten Woche ist höher als gewohnt. Das kann müde machen, plane den Kopf etwas leichter.',
  load_very_high: 'Deine Trainingsbelastung der letzten Woche ist viel höher als gewohnt. Plane heute kürzere Lerneinheiten und gönn dir Erholung.',
  planned_over_capacity: 'Der Plan für heute ist länger als sinnvoll. Verschiebe etwas auf einen anderen Tag.',
  near_capacity: 'Du bist fast am Limit für heute. Eine letzte leichte Einheit geht noch.',
  over_capacity: 'Mehr als sinnvoll gelernt. Jetzt zählt Erholung, mehr bringt heute kaum noch etwas.',
};

const ENERGY = [
  { value: 0, label: '–' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4' },
  { value: 5, label: '5' },
];
const SLEEP = Array.from({ length: 13 }, (_, i) => 4 + i * 0.5);
const TRAIN_MIN = [30, 45, 60, 90, 120];

const hoursLabel = (h: number) => `${String(h).replace('.', ',')} h`;

const LOAD_LABEL: Record<LoadStatus, string> = { low: 'erholt', ok: 'optimal', high: 'hoch', very: 'sehr hoch' };
const LOAD_TEXT: Record<LoadStatus, string> = {
  low: 'Du trainierst gerade weniger als gewohnt, der Körper ist erholt.',
  ok: 'Deine Belastung der letzten Woche passt zu dem, was dein Körper gewohnt ist.',
  high: 'Deine Belastung der letzten Woche ist höher als gewohnt.',
  very: 'Deine Belastung der letzten Woche ist viel höher als gewohnt.',
};
const RPE_VALUES = Array.from({ length: 10 }, (_, i) => i + 1);

/** Konzentrationsscore: wie viel konzentrierte Lernzeit heute sinnvoll ist. Eine Empfehlung, keine Sperre. */
export function ConcentrationCard({ plannedMin }: { plannedMin: number }) {
  const { state, dispatch } = useStore();
  const iso = toIsoDate(new Date());
  const checkin = checkinFor(state.checkins, iso);
  const training = trainingOn(state, iso);
  const sleep = sleepOn(state, iso);
  const learned = learnedMinutesOn(state.sessions, iso);
  const load = trainingLoadOn(state, iso);
  const ratio = loadRatioOn(state, iso);
  const result = concentration({
    sleepHours: sleep.hours,
    energy: checkin.energy,
    trainingSessions: training.sessions,
    trainingMinutes: training.minutes,
    trainingLoad: load.load,
    trainingRpe: load.rpe,
    loadRatio: ratio.ratio,
    learnedMin: learned,
    plannedMin,
  });

  const set = (patch: Partial<Checkin>) => dispatch({ type: 'setCheckin', checkin: { ...checkin, ...patch } });
  const trainChoice = checkin.trainingSessions === null ? '' : String(Math.min(2, checkin.trainingSessions));

  return (
    <div className="card stack">
      <div className="between">
        <h2>Konzentration heute</h2>
        <strong>ca. {formatMinutes(result.capacityMin)}</strong>
      </div>
      <div className="bar">
        <i
          style={{
            width: `${Math.min(100, (learned / result.capacityMin) * 100)}%`,
            background: result.status === 'over' ? 'var(--warn)' : undefined,
          }}
        />
      </div>
      <p className="hint">
        {formatMinutes(learned)} gelernt, noch {formatMinutes(result.remainingMin)} sinnvoll. Einheiten von etwa{' '}
        {result.sessionMin} Minuten passen heute gut. Das ist eine Schätzung, kein Verbot.
      </p>
      {result.tips.map((t) => (
        <p key={t} className={t === 'no_data' ? 'hint' : 'notice'}>
          {TIPS[t]}
        </p>
      ))}

      <div className="field">
        <span>Energie jetzt (1 leer, 5 top)</span>
        <Segmented<number>
          label="Energie"
          value={checkin.energy ?? 0}
          onChange={(v) => set({ energy: v === 0 ? null : v })}
          options={ENERGY}
        />
      </div>

      {sleep.source === 'overload' ? (
        <p className="hint">Schlaf aus Overload: {hoursLabel(sleep.hours ?? 0)}.</p>
      ) : (
      <label className="field">
        <span>Schlaf letzte Nacht</span>
        <select
          className="input"
          value={checkin.sleepHours ?? ''}
          onChange={(e) => set({ sleepHours: e.target.value === '' ? null : Number(e.target.value) })}
        >
          <option value="">Nicht angegeben</option>
          {SLEEP.map((h) => (
            <option key={h} value={h}>
              {hoursLabel(h)}
            </option>
          ))}
        </select>
      </label>
      )}

      {training.source === 'overload' ? (
        <p className="hint">
          Training aus Overload: {training.sessions} {training.sessions === 1 ? 'Einheit' : 'Einheiten'}, {training.minutes}{' '}
          Minuten{training.kinds.length ? ` (${training.kinds.map((k) => (k === 'gym' ? 'Gym' : k === 'run' ? 'Laufen' : 'Sonstiges')).join(', ')})` : ''}.
          {load.load !== null && load.rpe !== null
            ? ` Anstrengung ${formatNumber(load.rpe, 1).replace(/,0$/, '')} von 10 (${load.set ? 'von dir in Overload eingestellt' : 'von Overload geschätzt'}), Belastung ${load.load} Punkte. Ändern kannst du die Anstrengung in Overload.`
            : ''}
        </p>
      ) : (
        <div className="field">
          <span>Training heute</span>
          <Segmented<string>
            label="Training heute"
            value={trainChoice}
            onChange={(v) =>
              v === ''
                ? set({ trainingSessions: null, trainingMinutes: null })
                : set({ trainingSessions: Number(v), trainingMinutes: v === '0' ? 0 : checkin.trainingMinutes || 60 })
            }
            options={[
              { value: '', label: 'Offen' },
              { value: '0', label: 'Keins' },
              { value: '1', label: 'Eine Einheit' },
              { value: '2', label: 'Zwei' },
            ]}
          />
          {(checkin.trainingSessions ?? 0) > 0 && (
            <select
              className="input"
              aria-label="Dauer des Trainings"
              value={checkin.trainingMinutes ?? 60}
              onChange={(e) => set({ trainingMinutes: Number(e.target.value) })}
            >
              {TRAIN_MIN.map((m) => (
                <option key={m} value={m}>
                  {formatMinutes(m)} insgesamt
                </option>
              ))}
            </select>
          )}
          {(checkin.trainingSessions ?? 0) > 0 && (
            <>
              <span className="form-label">Wie anstrengend war es? (1 sehr leicht, 10 maximal)</span>
              <div className="points-pick" role="group" aria-label="Anstrengung des Trainings">
                {RPE_VALUES.map((v) => (
                  <button
                    key={v}
                    type="button"
                    className="diff-pill"
                    aria-pressed={checkin.trainingRpe === v}
                    onClick={() => set({ trainingRpe: checkin.trainingRpe === v ? null : v })}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <p className="hint">
                {checkin.trainingRpe === null
                  ? `Die App schätzt ${CONFIG.concentration.load.defaultRpe} (mittel). Tippe eine Zahl, wenn es anders war.`
                  : 'Tippe die Zahl nochmal, um zur Schätzung der App zurückzukehren.'}
              </p>
            </>
          )}
        </div>
      )}

      {ratio.ratio !== null && result.loadStatus !== null ? (
        <div className="tile stack" style={{ gap: 4 }}>
          <div className="between">
            <strong>Belastung 7:28</strong>
            <span className={result.parts.load < 1 ? 'pill pill-warn' : 'pill'}>
              {formatNumber(ratio.ratio, 2)} · {LOAD_LABEL[result.loadStatus]}
            </span>
          </div>
          <p className="hint">
            {LOAD_TEXT[result.loadStatus]}{' '}
            {result.parts.load < 1
              ? `Das senkt die Konzentration heute um etwa ${Math.round((1 - result.parts.load) * 100)} %.`
              : 'Das ändert den Wert für heute nicht.'}{' '}
            Verglichen werden deine letzten 7 Tage mit den letzten 28 aus Overload. Eine Orientierung, keine medizinische Aussage.
          </p>
        </div>
      ) : ratio.known ? (
        <p className="hint">Das 7:28-Verhältnis zeigt Overload erst nach etwa 14 Tagen mit Einheiten. Bis dahin zählt nur das Training von heute.</p>
      ) : null}
    </div>
  );
}
