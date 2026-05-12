import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import ClientPortal from './pages/ClientPortal';
import AdminDashboard from './pages/AdminDashboard';
import Leaderboard from './pages/Leaderboard';
import Elimination from './pages/Elimination';
import Winner from './pages/Winner';
import Background from './components/Background';
import CustomCursor from './components/CustomCursor';

function App() {
  return (
    <Router>
      <Background />
      <CustomCursor />
      <div className="min-h-screen w-full font-sans text-white relative z-10 cursor-none">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/arena" element={<ClientPortal />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/elimination" element={<Elimination />} />
          <Route path="/winner" element={<Winner />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
