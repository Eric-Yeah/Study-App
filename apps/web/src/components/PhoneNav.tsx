import { ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useMode } from '../lib/mode';
import { MORE_ICON, locate, phoneBarAreasFor, phoneMoreAreasFor, phoneSlot } from '../nav';
import { useVisibleTabs } from './SectionTabs';

/**
 * Untere Leiste am Handy (unter 768 px): vier Bereiche und „Mehr“. „Mehr“ öffnet über der Leiste eine Liste der übrigen Bereiche
 * mit ihren Reitern als direkte Sprünge und den Einstellungen. Ist man in einem dieser Bereiche, leuchtet „Mehr“.
 * Auf iPad und Mac ist die Leiste ausgeblendet, dort gilt die Seitenleiste.
 */
export function PhoneNav() {
  const { pathname } = useLocation();
  const { area, tab } = locate(pathname);
  const { mode } = useMode();
  const slot = phoneSlot(area, mode);
  const visibleTabs = useVisibleTabs();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const firstLink = useRef<HTMLAnchorElement>(null);

  // Nach jedem Seitenwechsel geschlossen
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    firstLink.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const active = open ? 'mehr' : slot;

  return (
    <>
      {open && (
        <>
          <div className="more-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />
          <div id="more-menu" className="more-sheet" role="dialog" aria-label="Mehr">
            <ul className="more-list">
              {phoneMoreAreasFor(mode).map((a, i) => {
                const here = a.id === area;
                const extra = visibleTabs(a.tabs ?? [], here ? tab : null).filter((t) => t.to !== a.to);
                return (
                  <li key={a.id} className={a.id === 'einstellungen' ? 'more-settings' : undefined}>
                    <Link
                      to={a.to}
                      ref={i === 0 ? firstLink : undefined}
                      className={`more-item${here ? ' active' : ''}`}
                      aria-current={here && (!tab || a.tabs?.[0]?.id === tab) ? 'page' : undefined}
                    >
                      <span className="more-icon">
                        <a.icon size={20} aria-hidden="true" />
                      </span>
                      <span className="more-label">{a.label}</span>
                      <ChevronRight size={18} aria-hidden="true" className="more-chevron" />
                    </Link>
                    {extra.length > 0 && (
                      <div className="more-tabs">
                        {extra.map((t) => (
                          <Link key={t.id} to={t.to} className="more-tab" aria-current={here && t.id === tab ? 'page' : undefined}>
                            {t.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
      <nav className="bottom-nav" aria-label="Hauptnavigation">
        {phoneBarAreasFor(mode).map(({ id, to, label, icon: Icon }) => (
          <Link key={id} to={to} aria-current={slot === id ? 'page' : undefined} className={`nav-link${active === id ? ' active' : ''}`}>
            <span className="nav-icon">
              <Icon size={22} aria-hidden="true" />
            </span>
            <span className="nav-label">{label}</span>
          </Link>
        ))}
        <button
          ref={button}
          type="button"
          className={`nav-link${active === 'mehr' ? ' active' : ''}`}
          aria-expanded={open}
          aria-controls="more-menu"
          onClick={() => setOpen((o) => !o)}
        >
          <span className="nav-icon">
            <MORE_ICON size={22} aria-hidden="true" />
          </span>
          <span className="nav-label">Mehr</span>
        </button>
      </nav>
    </>
  );
}
