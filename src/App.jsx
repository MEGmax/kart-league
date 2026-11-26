import { lazy, Suspense } from "react";
import { HashRouter, Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import Layout from "./components/Layout";
import StandingsPage from "./pages/StandingsPage";
import { Loading } from "./components/PageBits";

// Home (the standings) is the landing page and ships in the main bundle; every other page loads when first opened.
const AccountPage = lazy(() => import("./pages/AccountPage"));
const AddPage = lazy(() => import("./pages/AddPage"));
const BuildPage = lazy(() => import("./pages/BuildPage"));
const PlayoffsPage = lazy(() => import("./pages/PlayoffsPage"));
const RulesPage = lazy(() => import("./pages/RulesPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const RaceNightPage = lazy(() => import("./pages/RaceNightPage"));
const SchedulePage = lazy(() => import("./pages/SchedulePage"));
const UnsubscribePage = lazy(() => import("./pages/UnsubscribePage"));
const StatsPage = lazy(() => import("./pages/StatsPage"));
const UploadPage = lazy(() => import("./pages/UploadPage"));

// Old links (and cup night emails already sent) used #/events, #/race and #/cups. History is now part of
// Schedule, Rivals and Records are part of Stats, and Unclaimed is the "Is this you?" notification on your profile.
function ScheduleRedirect() {
  const { id } = useParams();
  return <Navigate to={`/schedule/${id}`} replace />;
}

// Keeps ?season=N.
function Moved({ to }) {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
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
                <Route path="schedule" element={page(SchedulePage)} />
                <Route path="schedule/:id" element={page(SchedulePage)} />
                <Route path="stats" element={page(StatsPage)} />
                <Route path="history" element={<Moved to="/schedule" />} />
                <Route path="rivals" element={<Moved to="/stats" />} />
                <Route path="records" element={<Moved to="/stats" />} />
                <Route path="race" element={<Navigate to="/join" replace />} />
                <Route path="cups" element={<Navigate to="/schedule" replace />} />
                <Route path="events" element={<Navigate to="/schedule" replace />} />
                <Route path="events/:id" element={<ScheduleRedirect />} />
                <Route path="unsubscribe/:token" element={page(UnsubscribePage)} />
                <Route path="unclaimed" element={<Navigate to="/account" replace />} />
                <Route path="playoffs" element={page(PlayoffsPage)} />
                <Route path="rules" element={page(RulesPage)} />
                <Route path="add" element={page(AddPage)} />
                <Route path="upload" element={page(UploadPage)} />
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
