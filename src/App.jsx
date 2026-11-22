import { lazy, Suspense } from "react";
import { HashRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import Layout from "./components/Layout";
import StandingsPage from "./pages/StandingsPage";
import { Loading } from "./components/PageBits";

// Home (the standings) is the landing page and ships in the main bundle; every other page loads when first opened.
const AccountPage = lazy(() => import("./pages/AccountPage"));
const AddPage = lazy(() => import("./pages/AddPage"));
const BuildPage = lazy(() => import("./pages/BuildPage"));
const UnclaimedPage = lazy(() => import("./pages/UnclaimedPage"));
const PlayoffsPage = lazy(() => import("./pages/PlayoffsPage"));
const RulesPage = lazy(() => import("./pages/RulesPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const CupsPage = lazy(() => import("./pages/CupsPage"));
const RaceNightPage = lazy(() => import("./pages/RaceNightPage"));
const EventsPage = lazy(() => import("./pages/EventsPage"));
const UnsubscribePage = lazy(() => import("./pages/UnsubscribePage"));
const StatsPage = lazy(() => import("./pages/StatsPage"));

// Old links (and cup night emails already sent) used #/events, #/race and #/cups.
function ScheduleRedirect() {
  const { id } = useParams();
  return <Navigate to={`/schedule/${id}`} replace />;
}

const page = (P) => <Suspense fallback={<Loading />}><P /></Suspense>;
import { AuthProvider } from "./context/AuthContext";
import { LeagueDataProvider } from "./context/LeagueDataContext";
import { FlashProvider } from "./context/FlashContext";

export default function App() {
  return (
    <AuthProvider>
      <LeagueDataProvider>
        <FlashProvider>
          <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<Navigate to="/standings" replace />} />
                <Route path="standings" element={<StandingsPage />} />
                <Route path="standings/:player" element={<StandingsPage />} />
                <Route path="join" element={page(RaceNightPage)} />
                <Route path="history" element={page(CupsPage)} />
                <Route path="stats" element={page(StatsPage)} />
                <Route path="schedule" element={page(EventsPage)} />
                <Route path="schedule/:id" element={page(EventsPage)} />
                <Route path="race" element={<Navigate to="/join" replace />} />
                <Route path="cups" element={<Navigate to="/history" replace />} />
                <Route path="events" element={<Navigate to="/schedule" replace />} />
                <Route path="events/:id" element={<ScheduleRedirect />} />
                <Route path="unsubscribe/:token" element={page(UnsubscribePage)} />
                <Route path="unclaimed" element={page(UnclaimedPage)} />
                <Route path="playoffs" element={page(PlayoffsPage)} />
                <Route path="rules" element={page(RulesPage)} />
                <Route path="add" element={page(AddPage)} />
                <Route path="build" element={page(BuildPage)} />
                <Route path="admin" element={page(AdminPage)} />
                <Route path="account" element={page(AccountPage)} />
                <Route path="*" element={<Navigate to="/standings" replace />} />
              </Route>
            </Routes>
          </HashRouter>
        </FlashProvider>
      </LeagueDataProvider>
    </AuthProvider>
  );
}
