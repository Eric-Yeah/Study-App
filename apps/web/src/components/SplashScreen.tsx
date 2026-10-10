import { useEffect, useState } from 'react';

/** Das Logo als Strich, damit der Buchstabe gezeichnet werden kann. Dieselbe Form steht in index.html (Start vor dem Laden). */
export function SplashMark() {
  return (
    <svg className="splash-mark" viewBox="0 0 120 120" width="96" height="96" aria-hidden="true">
      <rect className="splash-tile" width="120" height="120" rx="28" />
      <path
        className="splash-s"
        pathLength={100}
        d="M83 42 C75 24 36 26 36 46 C36 66 84 56 84 76 C84 96 46 98 34 80"
        fill="none"
        strokeWidth="16"
        strokeLinecap="round"
      />
      <circle className="splash-dot" cx="90" cy="32" r="9" />
    </svg>
  );
}

/**
 * Ladebildschirm für den Start der App: Logo mit Animation, darunter drei Punkte und ein kurzer Hinweis.
 * Dauert es länger als sonst (langsames Netz), kommt ein zweiter Hinweis.
 */
export function SplashScreen({ label }: { label?: string }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setSlow(true), 8000);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <div className="splash" role="status" aria-live="polite">
      <SplashMark />
      <div className="splash-name">Study App</div>
      <div className="splash-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <p className="splash-label">{slow ? 'Das dauert länger als sonst. Bitte noch einen Moment.' : (label ?? '')}</p>
    </div>
  );
}
