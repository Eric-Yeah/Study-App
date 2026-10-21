import type { AiFeature } from '@study/core';
import { Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAccess } from '../lib/access';

/** Seiten, die eine KI-Funktion brauchen. Ohne Freischaltung ein freundlicher Hinweis statt der Seite. */
/** alsoIf: auch ohne Freischaltung zeigen, wenn schon eigene Daten da sind (zum Beispiel korrigierte Klausuren). */
export function RequireAi({ feature, alsoIf = false, children }: { feature: AiFeature; alsoIf?: boolean; children: ReactNode }) {
  const access = useAccess();
  if (alsoIf || access.can(feature)) return <>{children}</>;
  return (
    <div className="card empty stack" style={{ gap: 10 }}>
      <Lock size={28} aria-hidden="true" />
      <p className="muted">Diese Funktion ist für dein Konto nicht freigeschaltet.</p>
      <Link className="btn" to="/">
        Zur Startseite
      </Link>
    </div>
  );
}
