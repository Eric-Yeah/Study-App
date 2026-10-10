import { describe, expect, it } from 'vitest';
import { compareVersions, isNewerVersion } from './version';

describe('Versionen', () => {
  it('vergleicht Teil für Teil als Zahl', () => {
    expect(isNewerVersion('2026.10.07.1', '2026.10.06.9')).toBe(true);
    expect(isNewerVersion('2026.10.07.2', '2026.10.07.1')).toBe(true);
    expect(isNewerVersion('2026.10.07.10', '2026.10.07.9')).toBe(true); // 10 > 9, nicht als Text
    expect(isNewerVersion('2026.10.07.1', '2026.10.07.1')).toBe(false);
    expect(isNewerVersion('2026.10.06.1', '2026.10.07.1')).toBe(false);
  });

  it('fehlende oder ungültige Teile zählen als 0', () => {
    expect(compareVersions('2026.10.07', '2026.10.07.0')).toBe(0);
    expect(isNewerVersion('2026.10.07.1', '2026.10.07')).toBe(true);
    expect(compareVersions('x', '0')).toBe(0);
  });
});
