import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import StandingsPage from "./pages/StandingsPage";
import AccountPage from "./pages/AccountPage";
import AddPage from "./pages/AddPage";
import BuildPage from "./pages/BuildPage";
import UnclaimedPage from "./pages/UnclaimedPage";
import PlayoffsPage from "./pages/PlayoffsPage";
import RulesPage from "./pages/RulesPage";
import AdminPage from "./pages/AdminPage";
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
                <Route path="unclaimed" element={<UnclaimedPage />} />
                <Route path="playoffs" element={<PlayoffsPage />} />
                <Route path="rules" element={<RulesPage />} />
                <Route path="add" element={<AddPage />} />
                <Route path="build" element={<BuildPage />} />
                <Route path="admin" element={<AdminPage />} />
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
