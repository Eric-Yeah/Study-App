import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAccess } from '../lib/access';
import { AREAS, locate, type NavTab, type TabId } from '../nav';
import { useStore } from '../state/store';

/**
 * Welche Reiter sichtbar sind: Reiter mit KI-Bezug nur mit Freischaltung oder vorhandenen Daten, Schwächen nur mit ausgewerteten Korrekturen.
 * Der Reiter der aktuellen Seite ist immer sichtbar. Auch das Menü „Mehr“ am Handy nutzt diese Regel.
 */
export function useVisibleTabs(): (tabs: NavTab[], current?: TabId | null) => NavTab[] {
  const { state } = useStore();
  const access = useAccess();
  return (tabs, current) =>
    tabs.filter((t) => {
      if (t.id === current) return true; // wer auf der Seite ist, sieht auch ihren Reiter
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
    });
}

/**
 * Reiter des aktuellen Bereichs (zum Beispiel Plan, Rückblick, Lanis). Die Reiter sind echte Adressen,
 * damit Zurück, Lesezeichen und Links funktionieren. Reiter, die eine KI-Funktion brauchen, erscheinen nur mit Freischaltung
 * oder wenn schon Daten da sind; mit nur einem sichtbaren Reiter bleibt die Leiste weg.
 */
export function SectionTabs() {
  const { pathname } = useLocation();
  const visibleTabs = useVisibleTabs();
  const { area, tab } = locate(pathname);
  const active = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    // Auf schmalen Bildschirmen den gewählten Reiter ins Bild holen
    active.current?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
  }, [tab]);

  const tabs = AREAS.find((a) => a.id === area)?.tabs;
  if (!tabs) return null;

  const shown = visibleTabs(tabs, tab);
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
