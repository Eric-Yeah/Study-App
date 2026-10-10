/** Versionsnummern im Format JJJJ.MM.TT.N vergleichen. Positiv, wenn a neuer ist als b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((x) => Number(x) || 0);
  const pb = b.split('.').map((x) => Number(x) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export const isNewerVersion = (remote: string, local: string) => compareVersions(remote, local) > 0;
