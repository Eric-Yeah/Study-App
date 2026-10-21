import { Download, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ExamCards } from '../components/ExamCards';

/** Klausuren: Termine mit Fortschritt (Bereich Klausuren). Korrektur, Übung und Schwächen sind die weiteren Reiter. */
export function Exams() {
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>Klausuren</h1>
          <p className="sub">Deine Termine mit Lernfortschritt. Tippe eine Klausur an, um Lernzeit, Themen und Rahmen einzustellen.</p>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Link className="btn" to="/import">
            <Download size={18} aria-hidden="true" /> Aus Lanis importieren
          </Link>
          <Link className="btn btn-primary" to="/klausur/neu">
            <Plus size={18} aria-hidden="true" /> Klausur anlegen
          </Link>
        </div>
      </div>
      <ExamCards />
    </div>
  );
}
