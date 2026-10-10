import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { NO_TAPS, formatTokens, formatUsd, registerTap, usageByMonth, type TapState } from './admin';

describe('registerTap', () => {
  const run = (times: number[], needed = 5, gap = 1500) => {
    let state: TapState = NO_TAPS;
    const unlocked: boolean[] = [];
    for (const t of times) {
      const r = registerTap(state, t, needed, gap);
      state = r.state;
      unlocked.push(r.unlocked);
    }
    return { unlocked, state };
  };

  it('fünf schnelle Tipps schalten frei, vorher nicht', () => {
    expect(run([1000, 1200, 1400, 1600, 1800]).unlocked).toEqual([false, false, false, false, true]);
    expect(run([1000, 1200, 1400, 1600]).unlocked.some(Boolean)).toBe(false);
  });

  it('eine Pause bricht die Folge ab, es zählt von vorn', () => {
    expect(run([1000, 1200, 1400, 1600, 3500, 3600]).unlocked.some(Boolean)).toBe(false);
    expect(run([1000, 1200, 1400, 4000, 4100, 4200, 4300, 4400]).unlocked).toEqual([false, false, false, false, false, false, false, true]);
  });

  it('nach dem Freischalten beginnt der Zähler neu', () => {
    const r = run([0 + 1, 100, 200, 300, 400, 500, 600]);
    expect(r.unlocked).toEqual([false, false, false, false, true, false, false]);
    expect(r.state.count).toBe(2);
  });

  it('genau an der Grenze zählt noch, knapp darüber nicht', () => {
    expect(run([1000, 2500, 4000, 5500, 7000], 5, 1500).unlocked[4]).toBe(true);
    expect(run([1000, 2500, 4000, 5500, 7001], 5, 1500).unlocked[4]).toBe(false);
  });

  it('die Werte kommen aus der Konfiguration', () => {
    expect(CONFIG.admin.tapsNeeded).toBe(5);
    const gap = CONFIG.admin.tapGapMs;
    const times = Array.from({ length: CONFIG.admin.tapsNeeded }, (_, i) => 1000 + i * (gap - 1));
    expect(run(times, CONFIG.admin.tapsNeeded, gap).unlocked.at(-1)).toBe(true);
  });

  it('ändert den übergebenen Zustand nicht', () => {
    const s: TapState = { count: 2, last: 100 };
    registerTap(s, 200);
    expect(s).toEqual({ count: 2, last: 100 });
  });
});

describe('usageByMonth', () => {
  const prices = CONFIG.ai.prices;
  const rows = [
    { month: '2026-09', model: 'claude-sonnet-5-5', requests: 3, input_tokens: 100_000, output_tokens: 10_000 },
    { month: '2026-10', model: 'claude-haiku-5-5', requests: 5, input_tokens: 1_000_000, output_tokens: 100_000 },
    { month: '2026-10', model: 'claude-sonnet-5-5', requests: 2, input_tokens: 50_000, output_tokens: 5_000 },
  ];

  it('gruppiert nach Monat, neuester zuerst, mit Kosten je Modell und Summe', () => {
    const r = usageByMonth(rows, prices);
    expect(r.map((m) => m.month)).toEqual(['2026-10', '2026-09']);
    const oct = r[0];
    expect(oct.requests).toBe(7);
    expect(oct.models.map((m) => m.model)).toEqual(['claude-haiku-5-5', 'claude-sonnet-5-5']); // 0,15 $ gegen 0,15 $: bei Gleichstand nach Name
    expect(oct.models[0].costUsd).toBeCloseTo(0.15, 10);
    expect(oct.models[1].costUsd).toBeCloseTo(0.15, 10);
    expect(oct.costUsd).toBeCloseTo(0.3, 10);
    expect(r[1].costUsd).toBeCloseTo(0.3, 10);
  });

  it('fasst mehrere Zeilen desselben Modells zusammen und kommt mit Texten als Zahlen und leerer Eingabe klar', () => {
    const r = usageByMonth([...rows, { month: '2026-10', model: 'claude-haiku-5-5', requests: 1, input_tokens: 1_000_000, output_tokens: 0 }], prices);
    expect(r[0].models.find((m) => m.model === 'claude-haiku-5-5')!.requests).toBe(6);
    expect(usageByMonth([], prices)).toEqual([]);
    const strings = usageByMonth([{ month: '2026-10', model: 'claude-sonnet-5-5', requests: '2' as never, input_tokens: '1000000' as never, output_tokens: '0' as never }], prices);
    expect(strings[0].costUsd).toBeCloseTo(2, 10);
  });

  it('ein unbekanntes Modell rechnet mit dem teuersten Preis', () => {
    const r = usageByMonth([{ month: '2026-10', model: 'neu', requests: 1, input_tokens: 1_000_000, output_tokens: 0 }], prices);
    expect(r[0].costUsd).toBeCloseTo(2, 10);
  });
});

describe('Formatierung', () => {
  it('Dollar mit passender Genauigkeit', () => {
    expect(formatUsd(0)).toBe('0,00 $');
    expect(formatUsd(0.0714)).toBe('0,0714 $');
    expect(formatUsd(1.2345)).toBe('1,23 $');
  });
  it('Token lesbar', () => {
    expect(formatTokens(950)).toBe('950');
    expect(formatTokens(25_270)).toBe('25.270');
    expect(formatTokens(1_250_000)).toBe('1,3 Mio.');
  });
});
