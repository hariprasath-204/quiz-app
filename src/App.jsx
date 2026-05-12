import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import ClientPortal from './pages/ClientPortal';
import AdminDashboard from './pages/AdminDashboard';
import Leaderboard from './pages/Leaderboard';

function App() {
  return (
    <Router>
      <div className="min-h-screen w-full font-sans text-white">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/arena" element={<ClientPortal />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
