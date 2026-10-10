import type { ReactNode } from 'react';
import { BookOpen, CalendarDays, Home, NotebookPen, Settings as SettingsIcon, Timer } from 'lucide-react';
import { HashRouter, Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { ExamEditor } from './pages/ExamEditor';
import { ExamCorrect } from './pages/ExamCorrect';
import { ExamReviewPage } from './pages/ExamReviewPage';
import { PracticeNew } from './pages/PracticeNew';
import { PracticeView } from './pages/PracticeView';
import { RubricPage } from './pages/RubricPage';
import { Weaknesses } from './pages/Weaknesses';
import { Abitur } from './pages/Abitur';
import { StylePage } from './pages/StylePage';
import { Focus } from './pages/Focus';
import { LanisImport } from './pages/LanisImport';
import { Login } from './pages/Login';
import { Notes } from './pages/Notes';
import { Onboarding } from './pages/Onboarding';
import { ReleaseNotes } from './components/ReleaseNotes';
import { LanisAutoProvider } from './lib/lanisAuto';
import { PushSync } from './components/PushSync';
import { UpdateManager } from './components/UpdateManager';
import { Plan } from './pages/Plan';
import { Settings } from './pages/Settings';
import { Review } from './pages/Review';
import { Subjects } from './pages/Subjects';
import { Today } from './pages/Today';
import { NewPassword } from './pages/NewPassword';
import { SplashScreen } from './components/SplashScreen';
import { AccountGate } from './components/AccountGate';
import { RequireAi } from './components/RequireAi';
import { ErrorBoundary } from './components/ErrorBoundary';
import { StoreProvider, useStore } from './state/store';
import { TimerProvider } from './timer/TimerProvider';

const LOGO = `${import.meta.env.BASE_URL}favicon.svg`;

const NAV = [
  { to: '/', label: 'Heute', icon: Home },
  { to: '/fokus', label: 'Fokus', icon: Timer },
  { to: '/plan', label: 'Plan', icon: CalendarDays },
  { to: '/notizen', label: 'Notizen', icon: NotebookPen },
  { to: '/faecher', label: 'Fächer', icon: BookOpen },
  { to: '/einstellungen', label: 'Einstellungen', icon: SettingsIcon },
];

function NavItems() {
  return (
    <>
      {NAV.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
          <Icon size={20} aria-hidden="true" />
          <span>{label}</span>
        </NavLink>
      ))}
    </>
  );
}

function Layout() {
  const { state, syncError } = useStore();
  const location = useLocation();
  if (!state.onboarded) return <Navigate to="/start" replace />;
  return (
    <div className="app">
      <nav className="sidebar" aria-label="Hauptnavigation">
        <div className="brand">
          <img src={LOGO} alt="" width={30} height={30} />
          Study App
        </div>
        <NavItems />
      </nav>
      <header className="topbar">
        <img src={LOGO} alt="" width={28} height={28} />
        <span>Study App</span>
      </header>
      <UpdateManager />
      <PushSync />
      <ReleaseNotes />
      <main className="main">
        {syncError && (
          <p className="notice" role="alert">
            Änderungen konnten nicht gespeichert werden: {syncError}
          </p>
        )}
        <ErrorBoundary key={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
      <nav className="bottom-nav" aria-label="Hauptnavigation">
        <NavItems />
      </nav>
    </div>
  );
}

function StartGate() {
  const { state } = useStore();
  if (state.onboarded) return <Navigate to="/" replace />;
  return <Onboarding />;
}

function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading, recovering, finishRecovery } = useAuth();
  if (loading) return <SplashScreen />;
  if (!user) return <Login />;
  if (recovering) return <NewPassword onDone={finishRecovery} />;
  return (
    <StoreProvider key={user.id} userId={user.id}>
      <AccountGate>
        <LanisAutoProvider>{children}</LanisAutoProvider>
      </AccountGate>
    </StoreProvider>
  );
}

export function App() {
  return (
    <AuthProvider>
      <AuthGate>
      <TimerProvider>
        <HashRouter>
          <Routes>
            <Route path="/start" element={<StartGate />} />
            <Route element={<Layout />}>
              <Route index element={<Today />} />
              <Route path="fokus" element={<Focus />} />
              <Route path="plan" element={<Plan />} />
              <Route path="notizen" element={<Notes />} />
              <Route path="rueckblick" element={<Review />} />
              <Route path="faecher" element={<Subjects />} />
              <Route path="abitur" element={<Abitur />} />
              <Route path="einstellungen" element={<Settings />} />
              <Route path="import" element={<LanisImport />} />
              <Route path="klausur/neu" element={<ExamEditor key="new" />} />
              <Route path="klausur/:id" element={<ExamEditor />} />
              <Route path="korrektur/neu" element={<RequireAi feature="correct"><ExamCorrect /></RequireAi>} />
              <Route path="korrektur/schwaechen" element={<Weaknesses />} />
              <Route path="korrektur/stil/:subjectId" element={<RequireAi feature="style"><StylePage /></RequireAi>} />
              <Route path="korrektur/uebung/neu" element={<RequireAi feature="practice"><PracticeNew /></RequireAi>} />
              <Route path="korrektur/uebung/:id" element={<PracticeView />} />
              <Route path="korrektur/muster/:subjectId" element={<RequireAi feature="correct"><RubricPage /></RequireAi>} />
              <Route path="korrektur/:id" element={<ExamReviewPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </HashRouter>
      </TimerProvider>
      </AuthGate>
    </AuthProvider>
  );
}
