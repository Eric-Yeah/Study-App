import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import {
  concentration,
  energyFactor,
  latestLoadRatio,
  loadFactor,
  loadRatio,
  manualTrainingLoad,
  loadStatus,
  sleepFactor,
  trainingFactor,
  trainingLoadPoints,
  type ConcentrationInput,
} from './concentration';

const base: ConcentrationInput = {
  sleepHours: null,
  energy: null,
  trainingSessions: null,
  trainingMinutes: null,
  learnedMin: 0,
  plannedMin: 0,
};

describe('Faktoren', () => {
  it('Schlaf: voller Wert ab 7,5 h, darunter linear bis zum Minimum', () => {
    expect(sleepFactor(null)).toBe(1);
    expect(sleepFactor(8)).toBe(1);
    expect(sleepFactor(5)).toBeCloseTo(CONFIG.concentration.sleepMinFactor);
    expect(sleepFactor(3)).toBeCloseTo(CONFIG.concentration.sleepMinFactor);
    expect(sleepFactor(6.25)).toBeCloseTo((1 + CONFIG.concentration.sleepMinFactor) / 2);
  });

  it('Energie: 1 bis 5 linear, 3 liegt in der Mitte', () => {
    expect(energyFactor(null)).toBe(1);
    expect(energyFactor(1)).toBeCloseTo(CONFIG.concentration.energyMinFactor);
    expect(energyFactor(5)).toBeCloseTo(CONFIG.concentration.energyMaxFactor);
    expect(energyFactor(3)).toBeCloseTo((CONFIG.concentration.energyMinFactor + CONFIG.concentration.energyMaxFactor) / 2);
    expect(energyFactor(9)).toBeCloseTo(CONFIG.concentration.energyMaxFactor);
  });

  it('Training: eine moderate Einheit hilft, viel Training kostet', () => {
    expect(trainingFactor(null, null)).toBe(1);
    expect(trainingFactor(0, 0)).toBe(1);
    expect(trainingFactor(1, 60)).toBe(CONFIG.concentration.trainingLightBonus);
    expect(trainingFactor(2, 60)).toBe(CONFIG.concentration.trainingHeavyFactor);
    expect(trainingFactor(1, 130)).toBe(CONFIG.concentration.trainingHeavyFactor);
    expect(trainingFactor(1, 100)).toBe(1);
  });
});

describe('concentration', () => {
  it('ohne Angaben gilt die Basis und es gibt einen Hinweis', () => {
    const r = concentration(base);
    expect(r.hasInput).toBe(false);
    expect(r.capacityMin).toBe(CONFIG.concentration.baseMin);
    expect(r.tips).toContain('no_data');
  });

  it('wenig Schlaf und wenig Energie senken die Kapazität und die Sessionlänge', () => {
    const r = concentration({ ...base, sleepHours: 5, energy: 1 });
    expect(r.capacityMin).toBeLessThan(CONFIG.concentration.baseMin);
    expect(r.capacityMin).toBeGreaterThanOrEqual(CONFIG.concentration.minMin);
    expect(r.sessionMin).toBe(CONFIG.concentration.sessionLowMin);
    expect(r.tips).toEqual(expect.arrayContaining(['sleep_low', 'energy_low']));
  });

  it('gute Tagesform erhöht die Kapazität, aber nie über das Maximum', () => {
    const r = concentration({ ...base, sleepHours: 8, energy: 5, trainingSessions: 1, trainingMinutes: 60 });
    expect(r.capacityMin).toBe(CONFIG.concentration.maxMin);
    expect(r.sessionMin).toBe(CONFIG.concentration.sessionHighMin);
  });

  it('rundet auf 5 Minuten', () => {
    expect(concentration({ ...base, sleepHours: 6.7, energy: 2 }).capacityMin % 5).toBe(0);
  });

  it('Status und Rest aus der gelernten Zeit', () => {
    const cap = CONFIG.concentration.baseMin;
    expect(concentration({ ...base, learnedMin: 30 })).toMatchObject({ status: 'free', remainingMin: cap - 30 });
    expect(concentration({ ...base, learnedMin: cap - 10 })).toMatchObject({ status: 'near', remainingMin: 10 });
    const over = concentration({ ...base, learnedMin: cap + 20 });
    expect(over).toMatchObject({ status: 'over', remainingMin: 0 });
    expect(over.tips).toContain('over_capacity');
  });

  it('warnt, wenn der Plan über der Kapazität liegt', () => {
    expect(concentration({ ...base, plannedMin: 300 }).tips).toContain('planned_over_capacity');
    expect(concentration({ ...base, plannedMin: 60 }).tips).not.toContain('planned_over_capacity');
  });
});

describe('Belastung aus Overload', () => {
  const l = CONFIG.concentration.load;
  const c = CONFIG.concentration;

  it('Punkte: Minuten mal Anstrengung, Anstrengung von 1 bis 10', () => {
    expect(trainingLoadPoints(60, 5)).toBe(300);
    expect(trainingLoadPoints(60, 15)).toBe(600); // über 10 zählt als 10
    expect(trainingLoadPoints(60, 0)).toBe(60);
    expect(trainingLoadPoints(-5, 5)).toBe(0);
  });

  it('Training mit bekannter Belastung: moderate Einheit hilft, viel kostet, dazwischen neutral', () => {
    expect(trainingFactor(1, 60, c, 300, 5)).toBe(c.trainingLightBonus);
    expect(trainingFactor(1, 60, c, l.moderateLoadMax, 7)).toBe(c.trainingLightBonus);
    expect(trainingFactor(1, 60, c, l.moderateLoadMax + 1, 7)).toBe(1);
    expect(trainingFactor(1, 60, c, l.heavyLoadMin - 1, 8)).toBe(1);
    expect(trainingFactor(1, 90, c, l.heavyLoadMin, 7)).toBe(c.trainingHeavyFactor);
  });

  it('eine kurze, sehr harte Einheit gibt keinen Bonus', () => {
    expect(trainingFactor(1, 30, c, 270, 9)).toBe(1);
    expect(trainingFactor(1, 30, c, 270, 10)).toBe(1);
    expect(trainingFactor(1, 30, c, 270, 8)).toBe(c.trainingLightBonus);
  });

  it('zwei lockere Einheiten sind kein "viel Training" mehr, wenn die Belastung klein ist', () => {
    expect(trainingFactor(2, 60, c)).toBe(c.trainingHeavyFactor); // ohne Belastung gilt die Minutenregel
    expect(trainingFactor(2, 60, c, 180, 3)).toBe(c.trainingLightBonus);
  });

  it('die Standard-Anstrengung 5 verhält sich wie die Minutenregel bei einer Einheit', () => {
    const rpe = l.defaultRpe;
    expect(trainingFactor(1, 60, c, trainingLoadPoints(60, rpe), rpe)).toBe(trainingFactor(1, 60, c));
    expect(trainingFactor(1, 90, c, trainingLoadPoints(90, rpe), rpe)).toBe(trainingFactor(1, 90, c));
    expect(trainingFactor(1, 120, c, trainingLoadPoints(120, rpe), rpe)).toBe(trainingFactor(1, 120, c));
  });

  it('ohne Training bleibt es bei 1, auch mit Belastungswerten', () => {
    expect(trainingFactor(0, 0, c, 0, null)).toBe(1);
    expect(trainingFactor(null, null, c, null, null)).toBe(1);
  });
});

describe('7:28 Belastung', () => {
  const l = CONFIG.concentration.load;

  it('Verhältnis aus akut und chronisch', () => {
    expect(loadRatio(120, 100)).toBeCloseTo(1.2);
    expect(loadRatio(0, 100)).toBe(0);
    expect(loadRatio(50, 0)).toBeNull();
    expect(loadRatio(null, 100)).toBeNull();
    expect(loadRatio(100, undefined)).toBeNull();
    expect(loadRatio(-1, 100)).toBeNull();
  });

  it('Status wie in Overload: unter 0,8 erholt, bis 1,3 optimal, bis 1,5 hoch, darüber sehr hoch', () => {
    expect(loadStatus(null)).toBeNull();
    expect(loadStatus(undefined)).toBeNull();
    expect(loadStatus(Number.NaN)).toBeNull();
    expect(loadStatus(0.79)).toBe('low');
    expect(loadStatus(l.ratioLow)).toBe('ok');
    expect(loadStatus(1)).toBe('ok');
    expect(loadStatus(l.ratioHigh)).toBe('ok');
    expect(loadStatus(1.31)).toBe('high');
    expect(loadStatus(l.ratioVeryHigh)).toBe('high');
    expect(loadStatus(1.51)).toBe('very');
  });

  it('nur hohe und sehr hohe Belastung dämpfen', () => {
    expect(loadFactor(null)).toBe(1);
    expect(loadFactor(0.5)).toBe(1);
    expect(loadFactor(1.1)).toBe(1);
    expect(loadFactor(1.4)).toBe(l.highFactor);
    expect(loadFactor(1.8)).toBe(l.veryHighFactor);
  });

  const base: ConcentrationInput = { sleepHours: 8, energy: 3, trainingSessions: null, trainingMinutes: null, learnedMin: 0, plannedMin: 0 };

  it('senkt die Kapazität und gibt einen Hinweis', () => {
    const normal = concentration({ ...base, loadRatio: 1.0 });
    const high = concentration({ ...base, loadRatio: 1.4 });
    const very = concentration({ ...base, loadRatio: 1.8 });
    expect(normal.parts.load).toBe(1);
    expect(normal.loadStatus).toBe('ok');
    expect(normal.tips).not.toContain('load_high');
    expect(high.parts.load).toBe(l.highFactor);
    expect(high.capacityMin).toBeLessThan(normal.capacityMin);
    expect(high.tips).toContain('load_high');
    expect(very.capacityMin).toBeLessThan(high.capacityMin);
    expect(very.tips).toContain('load_very_high');
    expect(very.tips).not.toContain('load_high');
  });

  it('ohne Wert keine Änderung gegenüber früher', () => {
    const without = concentration(base);
    expect(without.parts.load).toBe(1);
    expect(without.loadStatus).toBeNull();
    expect(concentration({ ...base, loadRatio: null }).capacityMin).toBe(without.capacityMin);
  });

  it('ein Wert allein zählt als Eingabe (kein "keine Daten")', () => {
    const r = concentration({ sleepHours: null, energy: null, trainingSessions: null, trainingMinutes: null, loadRatio: 1.0, learnedMin: 0, plannedMin: 0 });
    expect(r.hasInput).toBe(true);
    expect(r.tips).not.toContain('no_data');
  });

  it('Belastung und viel Training zusammen bleiben über dem Minimum', () => {
    const r = concentration({ ...base, sleepHours: 5, energy: 1, trainingSessions: 1, trainingMinutes: 90, trainingLoad: 700, trainingRpe: 8, loadRatio: 1.8 });
    expect(r.capacityMin).toBeGreaterThanOrEqual(CONFIG.concentration.minMin);
    expect(r.capacityMin).toBeLessThan(CONFIG.concentration.baseMin / 2); // alles zusammen: 210 mal 0,75 mal 0,8 mal 0,9 mal 0,9
    expect(r.tips).toEqual(expect.arrayContaining(['training_heavy', 'load_very_high']));
  });
});

describe('Werte aus Overload auswählen', () => {
  const day = (date: string, acute: number | null, chronic: number | null, loadReady: boolean | null = true) => ({ date, load: null, rpe: null, rpeSet: null, acute, chronic, loadReady });

  it('nimmt den letzten Wert bis zu diesem Tag', () => {
    const days = [day('2026-10-05', 100, 100), day('2026-10-07', 150, 100), day('2026-10-08', 999, 100)];
    const r = latestLoadRatio(days, '2026-10-07');
    expect(r).toEqual({ ratio: 1.5, acute: 150, chronic: 100, known: true });
  });

  it('Werte, die älter als zwei Tage sind, zählen nicht mehr', () => {
    expect(latestLoadRatio([day('2026-10-04', 150, 100)], '2026-10-07')).toEqual({ ratio: null, acute: null, chronic: null, known: false });
    expect(latestLoadRatio([day('2026-10-05', 150, 100)], '2026-10-07').ratio).toBe(1.5);
    expect(latestLoadRatio([day('2026-10-04', 150, 100)], '2026-10-07', 5).ratio).toBe(1.5);
  });

  it('zu wenig Daten in Overload: bekannt, aber noch kein Verhältnis', () => {
    expect(latestLoadRatio([day('2026-10-07', 40, 10, false)], '2026-10-07')).toEqual({ ratio: null, acute: 40, chronic: 10, known: true });
    expect(latestLoadRatio([day('2026-10-07', 40, 10, null)], '2026-10-07').ratio).toBeNull();
  });

  it('ohne Belastungswerte (ältere Overload-Version) unbekannt', () => {
    expect(latestLoadRatio([day('2026-10-07', null, null)], '2026-10-07').known).toBe(false);
    expect(latestLoadRatio([], '2026-10-07').known).toBe(false);
    expect(latestLoadRatio([day('2026-10-07', 10, null)], '2026-10-07').known).toBe(false);
  });

  it('Training von Hand: Dauer mal Anstrengung, ohne Angabe schätzt die App', () => {
    expect(manualTrainingLoad(1, 60, 7)).toEqual({ load: 420, rpe: 7, set: true });
    expect(manualTrainingLoad(1, 60, null)).toEqual({ load: 300, rpe: CONFIG.concentration.load.defaultRpe, set: false });
    expect(manualTrainingLoad(2, 90, 3)).toEqual({ load: 270, rpe: 3, set: true });
  });

  it('kein Training oder keine Dauer: keine Belastung', () => {
    expect(manualTrainingLoad(0, 60, 5)).toBeNull();
    expect(manualTrainingLoad(null, 60, 5)).toBeNull();
    expect(manualTrainingLoad(1, 0, 5)).toBeNull();
    expect(manualTrainingLoad(1, null, 5)).toBeNull();
  });
});
