import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAccess } from '../lib/access';
import { AREAS, locate, type NavTab } from '../nav';
import { useStore } from '../state/store';

/**
 * Reiter des aktuellen Bereichs (zum Beispiel Plan, Rückblick, Lanis). Die Reiter sind echte Adressen,
 * damit Zurück, Lesezeichen und Links funktionieren. Reiter, die eine KI-Funktion brauchen, erscheinen nur mit Freischaltung
 * oder wenn schon Daten da sind; mit nur einem sichtbaren Reiter bleibt die Leiste weg.
 */
export function SectionTabs() {
  const { pathname } = useLocation();
  const { state } = useStore();
  const access = useAccess();
  const { area, tab } = locate(pathname);
  const active = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    // Auf schmalen Bildschirmen den gewählten Reiter ins Bild holen
    active.current?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
  }, [tab]);

  const tabs = AREAS.find((a) => a.id === area)?.tabs;
  if (!tabs) return null;

  const visible = (t: NavTab) => {
    if (t.id === tab) return true; // wer auf der Seite ist, sieht auch ihren Reiter
    switch (t.gate) {
      case 'correct':
        return access.can('correct') || state.examReviews.length > 0;
      case 'practice':
        return access.can('practice') || state.practiceExams.length > 0;
      case 'weaknesses':
        return state.examReviews.some((r) => r.main);
      default:
        return true;
    }
  };
  const shown = tabs.filter(visible);
  if (shown.length < 2) return null;

  return (
    <nav className="subnav" aria-label="Bereich">
      {shown.map((t) => (
        <Link key={t.id} to={t.to} ref={t.id === tab ? active : undefined} aria-current={t.id === tab ? 'page' : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
