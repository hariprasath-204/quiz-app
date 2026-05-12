import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, onSnapshot, doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { motion } from 'framer-motion';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('live');
  const [gameState, setGameState] = useState(null);
  const [roundsConfig, setRoundsConfig] = useState([{ id: 1, capacity: 10 }, { id: 2, capacity: 7 }, { id: 3, capacity: 5 }]);
  const [questions, setQuestions] = useState([]);
  const [teams, setTeams] = useState([]);
  
  // Forms
  const [newTeam, setNewTeam] = useState('');
  const [qText, setQText] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correctIdx, setCorrectIdx] = useState(0);
  const [roundSelect, setRoundSelect] = useState('1');
  const [editingId, setEditingId] = useState(null);
  
  // Selection States
  const [elimTargetId, setElimTargetId] = useState('');
  const [winnerId, setWinnerId] = useState('');
  const [runnerId, setRunnerId] = useState('');

  // Loading State
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const docRef = doc(db, "game_state", "current");
    const unSubState = onSnapshot(docRef, (s) => setGameState(s.data()));
    
    const settingsRef = doc(db, "game_state", "settings");
    const unSubSettings = onSnapshot(settingsRef, (s) => {
      if (s.exists() && s.data().roundsConfig) {
        setRoundsConfig(s.data().roundsConfig);
      }
    });
    
    const unSubQ = onSnapshot(collection(db, "questions"), (s) => {
      const q = [];
      s.forEach(d => q.push({ id: d.id, ...d.data() }));
      setQuestions(q);
    });

    const unSubTeams = onSnapshot(collection(db, "teams"), (s) => {
      const t = [];
      s.forEach(d => t.push({ id: d.id, ...d.data() }));
      setTeams(t.sort((a,b) => b.score - a.score));
    });

    return () => {
      unSubState();
      unSubSettings();
      unSubQ();
      unSubTeams();
    };
  }, []);

  // Auto-calculate selections when tabs change or teams update
  useEffect(() => {
    const activeTeams = teams.filter(t => !t.eliminated);
    if (activeTeams.length > 0) {
      if (activeTab === 'eliminations') {
        const lowest = [...activeTeams].sort((a, b) => a.score - b.score)[0];
        if (!elimTargetId || !activeTeams.find(t => t.id === elimTargetId)) {
          setElimTargetId(lowest.id);
        }
      } else if (activeTab === 'winner') {
        const sorted = [...activeTeams].sort((a, b) => b.score - a.score);
        if (!winnerId || !activeTeams.find(t => t.id === winnerId)) setWinnerId(sorted[0]?.id || '');
        if (!runnerId || !activeTeams.find(t => t.id === runnerId)) setRunnerId(sorted[1]?.id || '');
      }
    }
  }, [activeTab, teams]);

  const saveSettings = async (newConfig) => {
    setIsLoading(true);
    await setDoc(doc(db, "game_state", "settings"), { roundsConfig: newConfig }, { merge: true });
    setIsLoading(false);
  };

  const saveQuestion = async () => {
    // Validation
    if (!qText.trim()) {
      alert("Validation Failed: Please enter a question.");
      return;
    }
    if (options.some(opt => !opt.trim())) {
      alert("Validation Failed: Please fill in all 4 options.");
      return;
    }

    setIsLoading(true);
    
    if (editingId) {
      await updateDoc(doc(db, "questions", editingId), {
        text: qText,
        options,
        correct: parseInt(correctIdx),
        round: parseInt(roundSelect)
      });
      alert("Question Updated!");
      setEditingId(null);
    } else {
      await addDoc(collection(db, "questions"), {
        text: qText,
        options,
        correct: parseInt(correctIdx),
        round: parseInt(roundSelect),
        pushed: false
      });
      alert("Question Saved to Bank!");
    }
    
    setQText('');
    setOptions(['', '', '', '']);
    setIsLoading(false);
  };

  const editQuestion = (q) => {
    setQText(q.text);
    setOptions(q.options || ['', '', '', '']);
    setCorrectIdx(q.correct !== undefined ? q.correct.toString() : '0');
    setRoundSelect(q.round ? q.round.toString() : '1');
    setEditingId(q.id);
    // Scroll to top smoothly
    document.querySelector('.h-screen').scrollTo({ top: 0, behavior: 'smooth' });
  };

  const pushQuestion = async (q) => {
    setIsLoading(true);
    const docRef = doc(db, "game_state", "current");
    await setDoc(docRef, { activeQ: q, status: "waiting", queue: [], timerValue: 0 }, { merge: true });
    if (q.id) {
      await updateDoc(doc(db, "questions", q.id), { pushed: true });
    }
    setActiveTab('live');
    setIsLoading(false);
  };

  const unlockQuestion = async (id) => {
    setIsLoading(true);
    await updateDoc(doc(db, "questions", id), { pushed: false });
    setIsLoading(false);
  };

  const startSequence = async () => {
    setIsLoading(true);
    const docRef = doc(db, "game_state", "current");
    
    // 3-2-1
    for (let i = 3; i > 0; i--) {
      await updateDoc(docRef, { status: "countdown", timerValue: i, queue: [] });
      await new Promise(r => setTimeout(r, 1000));
    }

    // Buzzer Open
    await updateDoc(docRef, { status: "buzzer_open", timerValue: 10 });
    let timeLeft = 10;
    const timerInterval = setInterval(async () => {
      timeLeft--;
      if (timeLeft >= 0) {
        await updateDoc(docRef, { timerValue: timeLeft });
      } else {
        clearInterval(timerInterval);
        forceAnswering();
      }
    }, 1000);
    setIsLoading(false);
  };

  const forceAnswering = async () => {
    setIsLoading(true);
    const docRef = doc(db, "game_state", "current");
    const snap = await getDoc(docRef);
    const data = snap.data();
    if (data && data.queue && data.queue.length > 0) {
      await updateDoc(docRef, { status: "answering", timerValue: 0 });
    } else {
      await updateDoc(docRef, { status: "waiting", timerValue: 0 });
    }
    setIsLoading(false);
  };

  const resetSystem = async () => {
    setIsLoading(true);
    const docRef = doc(db, "game_state", "current");
    await setDoc(docRef, { status: "waiting", queue: [], timerValue: 0 }, { merge: true });
    setIsLoading(false);
  };

  const addTeam = async () => {
    if (!newTeam.trim()) {
      alert("Validation Failed: Please enter a team name.");
      return;
    }
    setIsLoading(true);
    await addDoc(collection(db, "teams"), { name: newTeam, score: 0 });
    setNewTeam('');
    setIsLoading(false);
  };

  const resetScores = async () => {
    if (window.confirm("Are you sure you want to reset all team scores to 0?")) {
      setIsLoading(true);
      try {
        await Promise.all(teams.map(t => updateDoc(doc(db, "teams", t.id), { score: 0 })));
        alert("All scores have been reset to 0!");
      } catch (err) {
        console.error(err);
        alert("Failed to reset scores.");
      }
      setIsLoading(false);
    }
  };

  const triggerElimination = async () => {
    const team = teams.find(t => t.id === elimTargetId);
    if (!team) return;
    if (!window.confirm(`Are you sure you want to eliminate ${team.name}?`)) return;
    setIsLoading(true);
    const docRef = doc(db, "game_state", "current");
    for (let i = 10; i > 0; i--) {
      await updateDoc(docRef, { status: "elimination_countdown", timerValue: i, targetTeam: team.name });
      await new Promise(r => setTimeout(r, 1000));
    }
    await updateDoc(docRef, { status: "eliminated_revealed", timerValue: 0 });
    await updateDoc(doc(db, "teams", team.id), { eliminated: true });
    setIsLoading(false);
  };

  const triggerWinner = async () => {
    const wTeam = teams.find(t => t.id === winnerId);
    const rTeam = teams.find(t => t.id === runnerId);
    if (!wTeam) return;
    if (!window.confirm(`Declare ${wTeam.name} as WINNER and ${rTeam?.name || 'none'} as RUNNER-UP?`)) return;
    setIsLoading(true);
    const docRef = doc(db, "game_state", "current");
    for (let i = 10; i > 0; i--) {
      await updateDoc(docRef, { status: "winner_countdown", timerValue: i, targetTeam: wTeam.name, runnerTeam: rTeam?.name || '' });
      await new Promise(r => setTimeout(r, 1000));
    }
    await updateDoc(docRef, { status: "winner_revealed", timerValue: 0 });
    setIsLoading(false);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-dark-bg font-sans relative">
      {/* GLOBAL LOADING OVERLAY */}
      {isLoading && (
        <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-dark-bg/80 backdrop-blur-md">
          <div className="w-16 h-16 border-4 border-neon-blue/20 border-t-neon-blue rounded-full animate-spin mb-6"></div>
          <h2 className="text-2xl font-mono font-bold text-neon-blue tracking-widest uppercase animate-pulse">Processing...</h2>
        </div>
      )}

      {/* Sidebar */}
      <nav className="w-64 glass-panel border-r border-white/10 flex flex-col p-6 space-y-4">
        <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-neon-blue to-neon-purple mb-8 uppercase tracking-widest">
          Master Panel
        </h1>
        
        <button 
          onClick={() => setActiveTab('live')} 
          className={`p-3 text-left font-mono rounded-lg transition-all ${activeTab === 'live' ? 'text-neon-blue bg-neon-blue/10 border-r-4 border-neon-blue' : 'text-white/60 hover:bg-white/5'}`}
        >
          🔴 Live Control
        </button>
        <button 
          onClick={() => setActiveTab('push_live')} 
          className={`p-3 text-left font-mono rounded-lg transition-all ${activeTab === 'push_live' ? 'text-neon-green bg-neon-green/10 border-r-4 border-neon-green' : 'text-white/60 hover:bg-white/5'}`}
        >
          🚀 Push Live
        </button>
        <button 
          onClick={() => setActiveTab('questions')} 
          className={`p-3 text-left font-mono rounded-lg transition-all ${activeTab === 'questions' ? 'text-neon-purple bg-neon-purple/10 border-r-4 border-neon-purple' : 'text-white/60 hover:bg-white/5'}`}
        >
          📁 Question Bank
        </button>
        <button 
          onClick={() => setActiveTab('teams')} 
          className={`p-3 text-left font-mono rounded-lg transition-all ${activeTab === 'teams' ? 'text-neon-pink bg-neon-pink/10 border-r-4 border-neon-pink' : 'text-white/60 hover:bg-white/5'}`}
        >
          👥 Teams
        </button>
        <button 
          onClick={() => setActiveTab('eliminations')} 
          className={`p-3 text-left font-mono rounded-lg transition-all ${activeTab === 'eliminations' ? 'text-red-500 bg-red-500/10 border-r-4 border-red-500' : 'text-white/60 hover:bg-white/5'}`}
        >
          ❌ Eliminations
        </button>
        <button 
          onClick={() => setActiveTab('winner')} 
          className={`p-3 text-left font-mono rounded-lg transition-all ${activeTab === 'winner' ? 'text-yellow-400 bg-yellow-400/10 border-r-4 border-yellow-400' : 'text-white/60 hover:bg-white/5'}`}
        >
          🏆 Grand Winner
        </button>
        <button 
          onClick={() => setActiveTab('settings')} 
          className={`p-3 text-left font-mono rounded-lg transition-all ${activeTab === 'settings' ? 'text-neon-blue bg-neon-blue/10 border-r-4 border-neon-blue' : 'text-white/60 hover:bg-white/5'}`}
        >
          ⚙️ Game Settings
        </button>
      </nav>

      {/* Main Content */}
      <main className="flex-1 p-10 overflow-y-auto">
        {/* LIVE CONTROL */}
        {activeTab === 'live' && (
          <section className="animate-in fade-in zoom-in-95 duration-300">
            <h2 className="text-3xl font-bold mb-6 font-mono text-neon-blue">Live Event Control</h2>
            
            <div className="glass-panel p-8 rounded-2xl mb-6">
              <p className="text-white/50 uppercase text-xs font-bold tracking-widest mb-2 font-mono">Active Question (Organizer View)</p>
              <h3 className="text-2xl font-medium text-white mb-6">
                {gameState?.activeQ?.text || "No Question Pushed"}
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono">
                <motion.button 
                  whileHover={{ scale: 1.02, boxShadow: '0 0 20px rgba(0, 255, 102, 0.4)' }}
                  whileTap={{ scale: 0.95 }}
                  onClick={startSequence} 
                  className="bg-neon-green/10 hover:bg-neon-green/20 text-neon-green border border-neon-green font-bold py-5 rounded-xl transition-colors shadow-lg shadow-neon-green/10"
                >
                  START 3-2-1 & OPEN BUZZER
                </motion.button>
                <motion.button 
                  whileHover={{ scale: 1.02, boxShadow: '0 0 20px rgba(176, 38, 255, 0.4)' }}
                  whileTap={{ scale: 0.95 }}
                  onClick={forceAnswering} 
                  className="bg-neon-purple/10 hover:bg-neon-purple/20 text-neon-purple border border-neon-purple font-bold py-5 rounded-xl transition-colors shadow-lg shadow-neon-purple/10"
                >
                  FORCE ANSWERING
                </motion.button>
                <motion.button 
                  whileHover={{ scale: 1.02, boxShadow: '0 0 20px rgba(255, 0, 127, 0.4)' }}
                  whileTap={{ scale: 0.95 }}
                  onClick={resetSystem} 
                  className="bg-neon-pink/10 hover:bg-neon-pink/20 text-neon-pink border border-neon-pink font-bold py-5 rounded-xl transition-colors shadow-lg shadow-neon-pink/10"
                >
                  RESET ALL
                </motion.button>
              </div>
            </div>

            <div className="glass-panel p-8 rounded-2xl">
              <h3 className="text-xl font-bold mb-4 border-b border-white/10 pb-2 font-mono">Buzzer Queue (First 4 Teams)</h3>
              <div className="space-y-3">
                {gameState?.queue?.slice(0, 4).map((team, i) => (
                  <div key={i} className="flex items-center justify-between bg-white/5 p-4 rounded-xl border-l-4 border-neon-blue">
                    <span className="font-bold text-lg font-mono">#{i+1} {team}</span>
                    <span className="text-xs text-neon-green uppercase font-black font-mono">Ready to answer</span>
                  </div>
                ))}
                {(!gameState?.queue || gameState.queue.length === 0) && (
                  <p className="text-white/30 font-mono italic">Queue is empty</p>
                )}
              </div>
            </div>
          </section>
        )}

        {/* QUESTIONS TAB */}
        {activeTab === 'questions' && (
          <section className="animate-in fade-in zoom-in-95 duration-300">
            <h2 className="text-3xl font-bold mb-6 font-mono text-neon-purple">Manage Questions</h2>
            
            <div className="glass-panel p-6 rounded-2xl mb-8 space-y-4">
              <input 
                type="text" placeholder="Enter Question Text" 
                value={qText} onChange={e => setQText(e.target.value)}
                className="w-full bg-dark-bg/50 border border-white/10 p-4 rounded-xl text-white outline-none focus:border-neon-purple"
              />
              <div className="grid grid-cols-2 gap-4">
                {options.map((opt, i) => (
                  <input 
                    key={i} type="text" placeholder={`Option ${['A','B','C','D'][i]}`}
                    value={opt} onChange={e => {
                      const newOpts = [...options];
                      newOpts[i] = e.target.value;
                      setOptions(newOpts);
                    }}
                    className="w-full bg-dark-bg/50 border border-white/10 p-4 rounded-xl text-white outline-none focus:border-neon-purple"
                  />
                ))}
              </div>
              <select 
                value={correctIdx} onChange={e => setCorrectIdx(e.target.value)}
                className="w-full bg-dark-bg/50 border border-white/10 p-4 rounded-xl text-white outline-none focus:border-neon-purple"
              >
                <option value="0">Correct: Option A</option>
                <option value="1">Correct: Option B</option>
                <option value="2">Correct: Option C</option>
                <option value="3">Correct: Option D</option>
              </select>
              <select 
                value={roundSelect} onChange={e => setRoundSelect(e.target.value)}
                className="w-full bg-dark-bg/50 border border-white/10 p-4 rounded-xl text-white outline-none focus:border-neon-purple font-mono"
              >
                {roundsConfig.map(r => (
                  <option key={r.id} value={r.id}>Round {r.id} ({r.capacity} Questions)</option>
                ))}
              </select>
              <div className="flex gap-4">
                <motion.button 
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={saveQuestion} 
                  className="flex-1 bg-neon-purple/20 text-neon-purple border border-neon-purple p-4 rounded-xl font-bold font-mono hover:bg-neon-purple/30 transition-all shadow-[0_0_15px_rgba(176,38,255,0.3)]"
                >
                  {editingId ? "UPDATE QUESTION" : "SAVE TO BANK"}
                </motion.button>
                {editingId && (
                  <motion.button 
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      setEditingId(null);
                      setQText('');
                      setOptions(['', '', '', '']);
                    }} 
                    className="bg-white/10 text-white/50 border border-white/20 p-4 rounded-xl font-bold font-mono hover:bg-white/20 transition-all"
                  >
                    CANCEL
                  </motion.button>
                )}
              </div>
            </div>

            <div className="space-y-3">
              {questions.map((q) => (
                <div key={q.id} className={`glass-panel p-4 rounded-xl flex justify-between items-center border-l-4 border-neon-purple/50 ${editingId === q.id ? 'bg-neon-purple/10' : ''}`}>
                  <div>
                    <span className="font-medium">{q.text}</span>
                    <span className="ml-3 text-xs text-white/40 font-mono">Round {q.round || 1}</span>
                  </div>
                  <div className="flex gap-4 items-center">
                    <button onClick={() => editQuestion(q)} className="text-white/30 hover:text-neon-blue font-mono text-sm transition-colors uppercase tracking-widest">
                      Edit
                    </button>
                    <button onClick={() => deleteDoc(doc(db, 'questions', q.id))} className="text-white/30 hover:text-red-500 font-mono text-sm transition-colors uppercase tracking-widest">
                      Delete
                    </button>
                  </div>
                </div>
              ))}
              {questions.length === 0 && <p className="text-white/30 font-mono italic">No questions in bank.</p>}
            </div>
          </section>
        )}

        {/* PUSH LIVE TAB */}
        {activeTab === 'push_live' && (
          <section className="animate-in fade-in zoom-in-95 duration-300">
            <h2 className="text-3xl font-bold mb-6 font-mono text-neon-green">Push Questions Live</h2>
            
            {roundsConfig.map((round) => {
              const roundNum = round.id;
              const capacity = round.capacity;
              const roundQuestions = questions.filter(q => q.round === roundNum || (!q.round && roundNum === 1));
              
              return (
                <div key={roundNum} className="mb-10">
                  <h3 className="text-xl font-bold mb-4 border-b border-white/10 pb-2 font-mono flex justify-between items-center">
                    <span>Round {roundNum}</span>
                    <span className="text-sm text-white/40">{roundQuestions.length} / {capacity} Questions</span>
                  </h3>
                  <div className="space-y-3">
                    {roundQuestions.map((q) => (
                      <div key={q.id} className={`glass-panel p-5 rounded-xl flex justify-between items-center transition-all ${q.pushed ? 'opacity-80' : 'border-l-4 border-neon-green'}`}>
                        <span className="font-medium text-lg">{q.text}</span>
                        {q.pushed ? (
                          <div className="flex gap-4 items-center">
                            <span className="bg-white/5 text-white/30 px-6 py-3 rounded-lg font-mono text-sm font-bold border border-white/10 uppercase tracking-widest cursor-not-allowed">LOCKED</span>
                            <button 
                              onClick={() => unlockQuestion(q.id)} 
                              className="text-neon-green text-xs border border-neon-green px-3 py-2 rounded-lg hover:bg-neon-green/20 transition-colors uppercase font-mono font-bold"
                            >
                              Unlock
                            </button>
                          </div>
                        ) : (
                          <motion.button 
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => pushQuestion(q)} 
                            className="bg-neon-green/20 text-neon-green border border-neon-green hover:bg-neon-green/30 shadow-[0_0_15px_rgba(0,255,102,0.3)] cursor-pointer font-mono text-sm font-bold px-6 py-3 rounded-lg transition-all uppercase"
                          >
                            PUSH LIVE
                          </motion.button>
                        )}
                      </div>
                    ))}
                    {roundQuestions.length === 0 && (
                      <p className="text-white/30 font-mono italic p-4">No questions added for Round {roundNum} yet.</p>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* TEAMS TAB */}
        {activeTab === 'teams' && (
          <section className="animate-in fade-in zoom-in-95 duration-300">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-3xl font-bold font-mono text-neon-pink">Teams & Leaderboard</h2>
              <a 
                href="/leaderboard" 
                target="_blank" 
                rel="noopener noreferrer"
                className="bg-neon-blue/20 text-neon-blue border border-neon-blue font-bold font-mono px-6 py-2 rounded-xl hover:bg-neon-blue/30 transition-all flex items-center gap-2 shadow-[0_0_15px_rgba(0,243,255,0.2)]"
              >
                OPEN PUBLIC LEADERBOARD ↗
              </a>
            </div>
            
            <div className="flex flex-col md:flex-row gap-4 mb-8">
              <input 
                type="text" placeholder="Team Name (Lot #)" value={newTeam} onChange={e => setNewTeam(e.target.value)}
                className="flex-1 bg-dark-bg/50 border border-white/10 p-4 rounded-xl text-white outline-none focus:border-neon-pink"
              />
              <button onClick={addTeam} className="bg-neon-pink/20 text-neon-pink border border-neon-pink font-bold font-mono px-8 py-4 rounded-xl hover:bg-neon-pink/30 transition-all">
                ADD TEAM
              </button>
              <button onClick={resetScores} className="bg-red-500/10 text-red-500 border border-red-500/50 font-bold font-mono px-8 py-4 rounded-xl hover:bg-red-500/20 transition-all">
                RESET SCORES
              </button>
            </div>

            <div className="glass-panel rounded-2xl overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-white/5 text-white/50 text-sm font-mono uppercase">
                  <tr>
                    <th className="p-4">Rank</th>
                    <th className="p-4">Team</th>
                    <th className="p-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {teams.map((t, i) => (
                    <tr key={t.id} className={`hover:bg-white/5 transition-colors ${t.eliminated ? 'opacity-30' : ''}`}>
                      <td className="p-4 font-mono text-neon-blue">{i+1}</td>
                      <td className="p-4 font-bold font-mono">
                        {t.name} {t.eliminated && <span className="text-red-500 ml-2 text-xs uppercase tracking-widest">[ELIMINATED]</span>}
                      </td>
                      <td className="p-4 text-right">
                        <button 
                          onClick={() => deleteDoc(doc(db, 'teams', t.id))}
                          className="text-white/30 hover:text-red-500 transition-colors font-mono text-sm"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {teams.length === 0 && (
                    <tr>
                      <td colSpan="3" className="p-8 text-center text-white/30 font-mono">No teams joined yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ELIMINATIONS TAB */}
        {activeTab === 'eliminations' && (
          <section className="animate-in fade-in zoom-in-95 duration-300">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-3xl font-bold font-mono text-red-500">Elimination Control</h2>
              <a 
                href="/elimination" 
                target="_blank" 
                rel="noopener noreferrer"
                className="bg-red-500/10 text-red-500 border border-red-500 font-bold font-mono px-6 py-2 rounded-xl hover:bg-red-500/20 transition-all flex items-center gap-2"
              >
                OPEN ELIMINATION SCREEN ↗
              </a>
            </div>
            
            <p className="text-white/50 font-mono mb-8">The system automatically suggests the lowest-scoring team for elimination. You can manually change this before confirming.</p>

            <div className="glass-panel p-8 rounded-2xl flex flex-col gap-6 max-w-xl">
              <div>
                <label className="text-white/50 font-mono uppercase tracking-widest text-sm mb-2 block">Select Team to Eliminate</label>
                <select 
                  value={elimTargetId} 
                  onChange={(e) => setElimTargetId(e.target.value)}
                  className="w-full bg-dark-bg/50 border border-red-500/50 p-4 rounded-xl text-white outline-none focus:border-red-500 font-mono text-xl"
                >
                  {teams.filter(t => !t.eliminated).map(t => (
                    <option key={t.id} value={t.id}>{t.name} - {t.score} PTS</option>
                  ))}
                </select>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={triggerElimination}
                disabled={!elimTargetId}
                className="w-full bg-red-500/20 text-red-500 py-4 rounded-xl font-bold font-mono text-xl uppercase tracking-widest border-2 border-red-500 hover:bg-red-500 hover:text-white transition-all shadow-[0_0_20px_rgba(239,68,68,0.4)] disabled:opacity-50"
              >
                Confirm & Reveal Elimination
              </motion.button>
            </div>
          </section>
        )}

        {/* WINNER TAB */}
        {activeTab === 'winner' && (
          <section className="animate-in fade-in zoom-in-95 duration-300">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-3xl font-bold font-mono text-yellow-400">Grand Winner Reveal</h2>
              <a 
                href="/winner" 
                target="_blank" 
                rel="noopener noreferrer"
                className="bg-yellow-400/10 text-yellow-400 border border-yellow-400 font-bold font-mono px-6 py-2 rounded-xl hover:bg-yellow-400/20 transition-all flex items-center gap-2"
              >
                OPEN WINNER SCREEN ↗
              </a>
            </div>
            
            <p className="text-white/50 font-mono mb-8">The system automatically selects the highest scoring teams for Champion and Runner-Up. You can modify these selections before the grand reveal.</p>

            <div className="glass-panel p-8 rounded-2xl flex flex-col gap-6 max-w-xl">
              <div>
                <label className="text-yellow-400 font-mono uppercase tracking-widest text-sm mb-2 block font-bold">🥇 Grand Champion</label>
                <select 
                  value={winnerId} 
                  onChange={(e) => setWinnerId(e.target.value)}
                  className="w-full bg-dark-bg/50 border border-yellow-400/50 p-4 rounded-xl text-yellow-400 font-bold outline-none focus:border-yellow-400 font-mono text-xl"
                >
                  <option value="">-- Select Winner --</option>
                  {teams.filter(t => !t.eliminated).map(t => (
                    <option key={t.id} value={t.id}>{t.name} - {t.score} PTS</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-300 font-mono uppercase tracking-widest text-sm mb-2 block font-bold mt-4">🥈 Runner-Up</label>
                <select 
                  value={runnerId} 
                  onChange={(e) => setRunnerId(e.target.value)}
                  className="w-full bg-dark-bg/50 border border-slate-400/50 p-4 rounded-xl text-slate-300 font-bold outline-none focus:border-slate-300 font-mono text-xl"
                >
                  <option value="">-- Select Runner-Up --</option>
                  {teams.filter(t => !t.eliminated).map(t => (
                    <option key={t.id} value={t.id}>{t.name} - {t.score} PTS</option>
                  ))}
                </select>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={triggerWinner}
                disabled={!winnerId}
                className="w-full bg-yellow-400/20 text-yellow-400 py-4 rounded-xl font-bold font-mono text-xl uppercase tracking-widest border-2 border-yellow-400 hover:bg-yellow-400 hover:text-black transition-all shadow-[0_0_25px_rgba(250,204,21,0.5)] disabled:opacity-50 mt-4"
              >
                Reveal Grand Champions
              </motion.button>
            </div>
          </section>
        )}

        {/* SETTINGS TAB */}
        {activeTab === 'settings' && (
          <section className="animate-in fade-in zoom-in-95 duration-300">
            <h2 className="text-3xl font-bold font-mono text-neon-blue mb-6">Game Settings</h2>
            
            <div className="glass-panel p-8 rounded-2xl mb-8">
              <h3 className="text-xl font-bold border-b border-white/10 pb-4 mb-6 font-mono">Round Configuration</h3>
              <p className="text-white/50 mb-6 font-mono text-sm">Configure how many rounds your quiz will have, and exactly how many questions belong to each round.</p>
              
              <div className="space-y-4 mb-6">
                {roundsConfig.map((r, i) => (
                  <div key={i} className="flex gap-4 items-center bg-white/5 p-4 rounded-xl border border-white/10">
                    <span className="font-mono text-lg font-bold w-32">Round {r.id}</span>
                    <div className="flex-1 flex items-center gap-4">
                      <label className="text-white/40 font-mono text-sm">Capacity:</label>
                      <input 
                        type="number" 
                        min="1"
                        value={r.capacity} 
                        onChange={(e) => {
                          const newConfig = [...roundsConfig];
                          newConfig[i].capacity = parseInt(e.target.value) || 1;
                          setRoundsConfig(newConfig);
                        }}
                        className="bg-dark-bg border border-white/20 p-2 rounded-lg text-white outline-none focus:border-neon-blue w-24 font-mono text-center"
                      />
                    </div>
                    <button 
                      onClick={() => {
                        const newConfig = roundsConfig.filter((_, idx) => idx !== i);
                        // Re-index round IDs
                        newConfig.forEach((round, idx) => round.id = idx + 1);
                        setRoundsConfig(newConfig);
                      }}
                      className="text-red-500 hover:text-red-400 font-mono transition-colors p-2"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              
              <div className="flex gap-4">
                <button 
                  onClick={() => {
                    const newConfig = [...roundsConfig, { id: roundsConfig.length + 1, capacity: 5 }];
                    setRoundsConfig(newConfig);
                  }}
                  className="bg-white/10 hover:bg-white/20 text-white border border-white/30 font-bold font-mono px-6 py-3 rounded-xl transition-all"
                >
                  + Add Round
                </button>
                <button 
                  onClick={() => saveSettings(roundsConfig)}
                  className="bg-neon-blue/20 text-neon-blue border border-neon-blue font-bold font-mono px-6 py-3 rounded-xl hover:bg-neon-blue/30 transition-all shadow-[0_0_15px_rgba(0,243,255,0.3)]"
                >
                  Save Configuration
                </button>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
