import type { ReactNode } from 'react';
import { useMode } from '../lib/mode';

/** Zeigt je nach Modus (Schule oder Studium) die eine oder die andere Seite. */
export function ByMode({ school, uni }: { school: ReactNode; uni: ReactNode }) {
  const { isUni } = useMode();
  return <>{isUni ? uni : school}</>;
}
