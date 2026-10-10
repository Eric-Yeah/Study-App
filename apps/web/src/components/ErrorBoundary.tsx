import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Fängt Fehler beim Anzeigen einer Seite ab, damit nicht die ganze App leer wird. Beim Wechsel der Seite (key) beginnt sie neu.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Seite konnte nicht angezeigt werden', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card empty stack" style={{ gap: 10 }} role="alert">
        <p className="muted">Diese Seite konnte gerade nicht angezeigt werden. Deine Daten sind sicher.</p>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button type="button" className="btn" onClick={() => this.setState({ error: null })}>
            Noch einmal versuchen
          </button>
          <a className="btn" href="#/">
            Zur Startseite
          </a>
        </div>
      </div>
    );
  }
}
