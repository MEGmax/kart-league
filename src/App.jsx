import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import StandingsPage from "./pages/StandingsPage";
import AccountPage from "./pages/AccountPage";
import ComingSoonPage from "./pages/ComingSoonPage";
import CupsPage from "./pages/CupsPage";
import RaceNightPage from "./pages/RaceNightPage";
import EventsPage from "./pages/EventsPage";
import UnsubscribePage from "./pages/UnsubscribePage";
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
                <Route path="race" element={<RaceNightPage />} />
                <Route path="cups" element={<CupsPage />} />
                <Route path="events" element={<EventsPage />} />
                <Route path="events/:id" element={<EventsPage />} />
                <Route path="unsubscribe/:token" element={<UnsubscribePage />} />
                <Route path="unclaimed" element={<ComingSoonPage title="Unclaimed points" />} />
                <Route path="playoffs" element={<ComingSoonPage title="Playoffs" />} />
                <Route path="rules" element={<ComingSoonPage title="Rules" />} />
                <Route path="add" element={<ComingSoonPage title="Add a cup" />} />
                <Route path="build" element={<ComingSoonPage title="Build a cup" />} />
                <Route path="admin" element={<ComingSoonPage title="Admin" />} />
                <Route path="account" element={<AccountPage />} />
                <Route path="*" element={<Navigate to="/standings" replace />} />
              </Route>
            </Routes>
          </HashRouter>
        </FlashProvider>
      </LeagueDataProvider>
    </AuthProvider>
  );
}
