import { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, addDoc, onSnapshot, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, increment, query, serverTimestamp, orderBy } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('live');
  const [gameState, setGameState] = useState(null);
  const [roundsConfig, setRoundsConfig] = useState([{ id: 1, capacity: 10, points: "10, 7, 5, 3" }, { id: 2, capacity: 7, points: "10, 7, 5, 3" }, { id: 3, capacity: 5, points: "10, 7, 5, 3" }]);
  const [tieBreakerPoints, setTieBreakerPoints] = useState("8, 6");
  const [queueLimit, setQueueLimit] = useState(4);
  const [autoOpenAnswer, setAutoOpenAnswer] = useState(true);
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

  // Loading & Modal State
  const [isLoading, setIsLoading] = useState(false);
  const [modal, setModal] = useState(null); // { message, onConfirm, type: 'alert' | 'confirm' }
  const [buzzerEvents, setBuzzerEvents] = useState([]);
  const ansIntervalRef = useRef(null);

  const showAlert = (msg) => setModal({ type: 'alert', message: msg });
  const showConfirm = (msg, action) => setModal({ type: 'confirm', message: msg, onConfirm: action });

  useEffect(() => {
    const docRef = doc(db, "game_state", "current");
    const unSubState = onSnapshot(docRef, (s) => setGameState(s.data()));

    const settingsRef = doc(db, "game_state", "settings");
    const unSubSettings = onSnapshot(settingsRef, (s) => {
      if (s.exists()) {
        if (s.data().roundsConfig) setRoundsConfig(s.data().roundsConfig);
        if (s.data().tieBreakerPoints) setTieBreakerPoints(s.data().tieBreakerPoints);
        if (s.data().queueLimit != null) setQueueLimit(s.data().queueLimit);
        if (s.data().autoOpenAnswer != null) setAutoOpenAnswer(s.data().autoOpenAnswer);
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
      setTeams(t.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;               // 1. Higher score first
        if ((b.correctAnswers||0) !== (a.correctAnswers||0)) return (b.correctAnswers||0) - (a.correctAnswers||0); // 2. More correct first
        if ((b.buzzerPresses||0) !== (a.buzzerPresses||0)) return (b.buzzerPresses||0) - (a.buzzerPresses||0); // 3. More active first
        return (b.wrongAnswers||0) - (a.wrongAnswers||0);               // 4. More attempts first
      }));
    });

    const unSubEvents = onSnapshot(
      query(collection(db, "buzzer_events"), orderBy("pressedAt", "desc")),
      (s) => {
        const evts = [];
        s.forEach(d => evts.push({ id: d.id, ...d.data() }));
        setBuzzerEvents(evts);
      }
    );

    return () => {
      unSubState();
      unSubSettings();
      unSubQ();
      unSubTeams();
      unSubEvents();
    };
  }, []);

  // Auto-select lowest scoring team for elimination when tab is opened
  useEffect(() => {
    if (activeTab === 'eliminations' && !elimTargetId && teams.length > 0) {
      const activeTeams = teams.filter(t => !t.eliminated);
      if (activeTeams.length > 0) {
        const sortedForElim = [...activeTeams].sort((a, b) => {
          if (a.score !== b.score) return a.score - b.score;
          return (a.buzzerPresses || 0) - (b.buzzerPresses || 0);
        });
        setElimTargetId(sortedForElim[0].id);
      }
    }
  }, [activeTab, teams, elimTargetId]);

  // Reset target IDs when leaving tabs to re-trigger auto-selection
  useEffect(() => {
    if (activeTab !== 'eliminations') setElimTargetId('');
  }, [activeTab]);

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

  // KEY FIX: Auto-progress to next team's answering when status is pass_to_next
  useEffect(() => {
    if (gameState?.status === 'pass_to_next' && gameState?.queue?.length > 0) {
      startAnswerTimer(gameState.queue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.status]);

  const saveSettings = async () => {
    setIsLoading(true);
    await setDoc(doc(db, "game_state", "settings"), { roundsConfig, tieBreakerPoints, queueLimit, autoOpenAnswer }, { merge: true });
    showAlert("Settings Saved!");
    setIsLoading(false);
  };

  const saveQuestion = async () => {
    // Validation
    if (!qText.trim()) {
      showAlert("Validation Failed: Please enter a question.");
      return;
    }
    if (options.some(opt => !opt.trim())) {
      showAlert("Validation Failed: Please fill in all 4 options.");
      return;
    }

    setIsLoading(true);

    if (editingId) {
      await updateDoc(doc(db, "questions", editingId), {
        text: qText,
        options,
        correct: parseInt(correctIdx),
        round: roundSelect
      });
      showAlert("Question Updated!");
      setEditingId(null);
    } else {
      await addDoc(collection(db, "questions"), {
        text: qText,
        options,
        correct: parseInt(correctIdx),
        round: roundSelect,
        pushed: false
      });
      showAlert("Question Saved to Bank!");
    }

    setQText('');
    setOptions(['', '', '', '']);
    setCorrectIdx(0);
    setRoundSelect('1');
    setIsLoading(false);
  };

  const editQuestion = (q) => {
    setQText(q.text);
    setOptions(q.options || ['', '', '', '']);
    setCorrectIdx(q.correct !== undefined ? q.correct.toString() : '0');
    setRoundSelect(q.round ? q.round.toString() : '1');
    setEditingId(q.id);
    // Scroll the main content pane to the top so the edit form is visible
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const pushQuestion = async (q) => {
    setIsLoading(true);
    let roundPoints;
    if (q.round === 'tie_breaker') {
      roundPoints = tieBreakerPoints ? tieBreakerPoints.split(',').map(p => parseInt(p.trim())) : [8, 6];
    } else {
      const roundConfig = roundsConfig.find(r => r.id.toString() === (q.round || "1").toString());
      roundPoints = roundConfig?.points ? roundConfig.points.split(',').map(p => parseInt(p.trim())) : [10, 7, 5, 3];
    }

    const docRef = doc(db, "game_state", "current");
    await setDoc(docRef, { activeQ: q, status: "waiting", queue: [], timerValue: 0, currentPoints: roundPoints, attempts: 0 }, { merge: true });
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

    // Buzzer Open — record exact timestamp so clients can compute response time
    const openedAt = Date.now();
    await updateDoc(docRef, { status: "buzzer_open", timerValue: 10, buzzerOpenedAt: openedAt, queueTimes: {} });
    let timeLeft = 10;
    const timerInterval = setInterval(async () => {
      timeLeft--;
      if (timeLeft >= 0) {
        await updateDoc(docRef, { timerValue: timeLeft });
      } else {
        clearInterval(timerInterval);
        const snap = await getDoc(docRef);
        const data = snap.data();
        if (data?.queue && data.queue.length > 0) {
          if (autoOpenAnswer) {
            // Auto mode: sort & open answer panel immediately
            forceAnswering();
          } else {
            // Manual mode: wait for admin to verify via Queue Verify tab
            await updateDoc(docRef, { status: "queue_processing", timerValue: 0 });
          }
        } else {
          // Nobody pressed — reset to waiting
          await updateDoc(docRef, { status: "waiting", timerValue: 0 });
        }
      }
    }, 1000);
    setIsLoading(false);
  };

  const startAnswerTimer = async (currentQueue) => {
    if (ansIntervalRef.current) clearInterval(ansIntervalRef.current);

    const docRef = doc(db, "game_state", "current");
    await updateDoc(docRef, { status: "answering", timerValue: 30 });

    let ansTimeLeft = 30;
    ansIntervalRef.current = setInterval(async () => {
      const snap = await getDoc(docRef);
      const data = snap.data();

      // If status changed to evaluating (team clicked an answer), stop this timer.
      if (data.status !== "answering" || !data.queue || data.queue[0] !== currentQueue[0]) {
        clearInterval(ansIntervalRef.current);
        return;
      }

      ansTimeLeft--;
      await updateDoc(docRef, { timerValue: ansTimeLeft });

      if (ansTimeLeft <= 0) {
        clearInterval(ansIntervalRef.current);

        // Track missed answer for the team that failed to answer
        const missedTeam = data.queue[0];
        if (missedTeam) {
          const q = query(collection(db, "teams"));
          const tSnap = await getDocs(q);
          tSnap.forEach(async (d) => {
            if (d.data().name === missedTeam) {
              await updateDoc(doc(db, "teams", d.id), {
                missedAnswers: increment(1)
              });
            }
          });
        }

        // Time is up — this team missed their chance
        const newQueue = data.queue.slice(1);
        if (newQueue.length > 0) {
          // Increment attempts so next team gets lower points
          const currentAttempts = data.attempts || 0;
          await updateDoc(docRef, { queue: newQueue, attempts: currentAttempts + 1, status: "pass_to_next" });
          startAnswerTimer(newQueue); // Start timer for next team
        } else {
          // All teams exhausted — mark question done
          await updateDoc(docRef, { status: "question_done", queue: [], timerValue: 0, attempts: 0 });
        }
      }
    }, 1000);
  };

  const forceAnswering = async () => {
    setIsLoading(true);
    const docRef = doc(db, "game_state", "current");
    const snap = await getDoc(docRef);
    const data = snap.data();
    if (data && data.queue && data.queue.length > 0) {
      const times = data.queueTimes || {};
      // Sort queue fastest → slowest so queue[0] is the fastest team
      // ClientPortal uses queue[0] to open the answer panel
      const sortedQueue = [...data.queue].sort((a, b) => {
        const ta = times[a] != null ? times[a] : Infinity;
        const tb = times[b] != null ? times[b] : Infinity;
        return ta - tb;
      });
      // Write sorted order back to Firestore so all clients see correct turn order
      await updateDoc(docRef, { queue: sortedQueue });
      startAnswerTimer(sortedQueue);
    } else {
      await updateDoc(docRef, { status: "waiting", timerValue: 0 });
    }
    setIsLoading(false);
  };

  const resetSystem = async () => {
    setIsLoading(true);
    if (ansIntervalRef.current) clearInterval(ansIntervalRef.current);
    const docRef = doc(db, "game_state", "current");
    await setDoc(docRef, { status: "waiting", queue: [], timerValue: 0 }, { merge: true });
    setIsLoading(false);
  };

  const triggerRoundTransition = async (type, num) => {
    showConfirm(`Trigger the Round ${num} ${type.toUpperCase()} cinematic screen?`, async () => {
      setIsLoading(true);
      const docRef = doc(db, "game_state", "current");
      await updateDoc(docRef, { status: "round_transition", transitionType: type, roundNumber: num });
      setIsLoading(false);
    });
  };

  const finishGame = async () => {
    showConfirm("Are you sure you want to finish the game? This will unlock all questions to be used again.", async () => {
      setIsLoading(true);
      try {
        const q = query(collection(db, "questions"));
        const snap = await getDocs(q);
        const updates = [];
        snap.forEach(d => {
          if (d.data().pushed) {
            updates.push(updateDoc(doc(db, "questions", d.id), { pushed: false }));
          }
        });
        await Promise.all(updates);

        await updateDoc(doc(db, "game_state", "current"), {
          status: "game_over",
          tieBreakerActive: false,
          tieBreakerTeams: [],
          activeQ: null,
          queue: [],
          timerValue: 0
        });

        showAlert("Game Finished! Clients are now seeing the Game Over screen.");
      } catch (err) {
        console.error(err);
        showAlert("Failed to unlock questions.");
      }
      setIsLoading(false);
    });
  };

  const toggleTieBreakerMode = async (isActive, tiedTeamNames = []) => {
    setIsLoading(true);
    const docRef = doc(db, "game_state", "current");
    await updateDoc(docRef, {
      tieBreakerActive: isActive,
      tieBreakerTeams: tiedTeamNames
    });
    showAlert(isActive ? "Tie Breaker Mode ENABLED. All other teams are locked out." : "Tie Breaker Mode DISABLED. Normal gameplay resumed.");
    setIsLoading(false);
  };

  const addTeam = async () => {
    if (!newTeam.trim()) {
      showAlert("Validation Failed: Please enter a team name.");
      return;
    }
    setIsLoading(true);
    await addDoc(collection(db, "teams"), {
      name: newTeam.trim(),
      score: 0,
      buzzerPresses: 0,
      correctAnswers: 0,
      wrongAnswers: 0,
      missedAnswers: 0,
      eliminated: false
    });
    setNewTeam('');
    setIsLoading(false);
  };

  const resetScores = async () => {
    showConfirm("Are you sure you want to reset all team scores and stats to 0?", async () => {
      setIsLoading(true);
      try {
        await Promise.all(teams.map(t => updateDoc(doc(db, "teams", t.id), {
          score: 0,
          buzzerPresses: 0,
          correctAnswers: 0,
          wrongAnswers: 0,
          missedAnswers: 0,
          eliminated: false
        })));
        showAlert("All scores and stats have been reset to 0!");
      } catch (err) {
        console.error(err);
        showAlert("Failed to reset scores.");
      }
      setIsLoading(false);
    });
  };

  const triggerElimination = async () => {
    const team = teams.find(t => t.id === elimTargetId);
    if (!team) return;
    showConfirm(`Are you sure you want to eliminate ${team.name}?`, async () => {
      setIsLoading(true);
      const docRef = doc(db, "game_state", "current");
      for (let i = 10; i > 0; i--) {
        await updateDoc(docRef, { status: "elimination_countdown", timerValue: i, targetTeam: team.name });
        await new Promise(r => setTimeout(r, 1000));
      }
      await updateDoc(docRef, { status: "eliminated_revealed", timerValue: 0 });
      await updateDoc(doc(db, "teams", team.id), { eliminated: true });
      setIsLoading(false);
    });
  };

  const triggerWinner = async () => {
    const wTeam = teams.find(t => t.id === winnerId);
    const rTeam = teams.find(t => t.id === runnerId);
    if (!wTeam) return;
    showConfirm(`Declare ${wTeam.name} as WINNER and ${rTeam?.name || 'none'} as RUNNER-UP?`, async () => {
      setIsLoading(true);
      const docRef = doc(db, "game_state", "current");
      for (let i = 10; i > 0; i--) {
        await updateDoc(docRef, { status: "winner_countdown", timerValue: i, targetTeam: wTeam.name, runnerTeam: rTeam?.name || '' });
        await new Promise(r => setTimeout(r, 1000));
      }
      await updateDoc(docRef, { status: "winner_revealed", timerValue: 0 });
      setIsLoading(false);
    });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-dark-bg font-sans relative">
      {/* CUSTOM MODAL */}
      <AnimatePresence>
        {modal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[200] flex items-center justify-center bg-dark-bg/80 backdrop-blur-md p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="glass-panel p-8 rounded-3xl max-w-md w-full border border-neon-blue/30 shadow-[0_0_30px_rgba(0,243,255,0.2)] text-center"
            >
              <h3 className="text-2xl font-black font-mono text-white mb-8 tracking-widest leading-relaxed">
                {modal.message}
              </h3>
              <div className="flex gap-4 justify-center">
                <button
                  onClick={() => setModal(null)}
                  className="px-6 py-3 rounded-xl font-mono font-bold uppercase tracking-widest text-white/50 border border-white/20 hover:bg-white/10 hover:text-white transition-all"
                >
                  {modal.type === 'confirm' ? 'CANCEL' : 'OKAY'}
                </button>
                {modal.type === 'confirm' && (
                  <button
                    onClick={() => { modal.onConfirm(); setModal(null); }}
                    className="px-6 py-3 rounded-xl font-mono font-bold uppercase tracking-widest bg-neon-blue/20 text-neon-blue border border-neon-blue hover:bg-neon-blue hover:text-dark-bg transition-all shadow-[0_0_15px_rgba(0,243,255,0.3)]"
                  >
                    CONFIRM
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* GLOBAL LOADING OVERLAY */}
      {isLoading && (
        <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-dark-bg/80 backdrop-blur-md">
          <div className="w-16 h-16 border-4 border-neon-blue/20 border-t-neon-blue rounded-full animate-spin mb-6"></div>
          <h2 className="text-2xl font-mono font-bold text-neon-blue tracking-widest uppercase animate-pulse">Processing...</h2>
        </div>
      )}

      {/* Sidebar */}
      <nav className="w-64 glass-panel border-r border-white/10 flex flex-col p-6 space-y-4 overflow-y-auto">
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
          onClick={() => setActiveTab('queue_verify')}
          className={`p-3 text-left font-mono rounded-lg transition-all relative ${activeTab === 'queue_verify' ? 'text-cyan-400 bg-cyan-400/10 border-r-4 border-cyan-400' : 'text-white/60 hover:bg-white/5'}`}
        >
          🔍 Queue Verify
          {(gameState?.status === 'buzzer_open' || gameState?.status === 'queue_processing') && gameState?.queue?.length > 0 && (
            <span className="absolute right-3 top-3 w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          )}
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
          onClick={() => setActiveTab('tie_breaker')}
          className={`p-3 text-left font-mono rounded-lg transition-all ${activeTab === 'tie_breaker' ? 'text-orange-500 bg-orange-500/10 border-r-4 border-orange-500' : 'text-white/60 hover:bg-white/5'}`}
        >
          ⚖️ Tie Breaker
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
        <button
          onClick={() => setActiveTab('analytics')}
          className={`p-3 text-left font-mono rounded-lg transition-all ${activeTab === 'analytics' ? 'text-yellow-400 bg-yellow-400/10 border-r-4 border-yellow-400' : 'text-white/60 hover:bg-white/5'}`}
        >
          📊 Buzzer Analytics
        </button>
        <div className="mt-8 pt-8 border-t border-white/10">
          <button
            onClick={() => setActiveTab('reset')}
            className={`w-full p-3 text-left font-mono rounded-lg transition-all ${activeTab === 'reset' ? 'text-red-500 bg-red-500/10 border-r-4 border-red-500' : 'text-red-500/50 hover:bg-red-500/5'}`}
          >
            ⚠️ Factory Reset
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 p-10 overflow-y-auto">
        {/* LIVE CONTROL */}
        {activeTab === 'live' && (
          <section className="animate-in fade-in zoom-in-95 duration-300">
            <h2 className="text-3xl font-bold mb-6 font-mono text-neon-blue">Live Event Control</h2>

            <div className="glass-panel p-8 rounded-2xl mb-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-white/50 uppercase text-xs font-bold tracking-widest mb-2 font-mono">Active Question (Organizer View)</p>
                  <h3 className="text-2xl font-medium text-white">
                    {gameState?.activeQ?.text || "No Question Pushed"}
                  </h3>
                  {gameState?.activeQ && (
                    <div className="grid grid-cols-2 gap-2 mt-4">
                      {gameState.activeQ.options?.map((opt, i) => (
                        <div key={i} className={`text-sm p-2 rounded-lg font-mono ${gameState.activeQ.correct === i
                            ? 'bg-neon-green/20 border border-neon-green text-neon-green'
                            : 'bg-white/5 border border-white/10 text-white/50'
                          }`}>
                          {['A', 'B', 'C', 'D'][i]}. {opt}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {gameState?.activeQ && (
                  <button
                    onClick={() => showConfirm("Remove the active question? It will be unlocked and can be pushed again.", async () => {
                      setIsLoading(true);
                      const activeQId = gameState.activeQ?.id;
                      await updateDoc(doc(db, "game_state", "current"), {
                        activeQ: null, status: "waiting", queue: [], timerValue: 0
                      });
                      if (activeQId) {
                        await updateDoc(doc(db, "questions", activeQId), { pushed: false });
                      }
                      setIsLoading(false);
                    })}
                    className="ml-6 mt-1 text-xs bg-red-500/10 text-red-500 border border-red-500/40 px-4 py-2 rounded-lg hover:bg-red-500/20 transition-all font-mono font-bold uppercase tracking-widest flex-shrink-0"
                  >
                    ✕ Remove
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono">
                {gameState?.activeQ ? (
                  <>
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
                  </>
                ) : (
                  <motion.button
                    whileHover={{ scale: 1.02, boxShadow: '0 0 20px rgba(255, 255, 255, 0.4)' }}
                    whileTap={{ scale: 0.95 }}
                    onClick={finishGame}
                    className="md:col-span-2 bg-white/10 hover:bg-white/20 text-white border border-white/50 font-bold py-5 rounded-xl transition-colors shadow-lg shadow-white/10"
                  >
                    FINISH GAME & UNLOCK ALL QUESTIONS
                  </motion.button>
                )}

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
              <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-3">
                <h3 className="text-xl font-bold font-mono">⚡ Buzzer Queue (Top {queueLimit} to Answer)</h3>
                <span className="text-white/30 font-mono text-xs uppercase tracking-widest">
                  {gameState?.queue?.length || 0} Pressed · Showing Top {queueLimit} · Fastest → Slowest
                </span>
              </div>
              <div className="space-y-2">
                {(() => {
                  const queue = gameState?.queue || [];
                  const times = gameState?.queueTimes || {};
                  // Sort by fastest response time, then take top 4 for answering
                  const sorted = [...queue].sort((a, b) => {
                    const ta = times[a] != null ? times[a] : Infinity;
                    const tb = times[b] != null ? times[b] : Infinity;
                    return ta - tb;
                  }).slice(0, queueLimit);
                  const medals = ['🥇', '🥈', '🥉', '4️⃣'];
                  const fastest = times[sorted[0]];

                  return sorted.length === 0 ? (
                    <p className="text-white/30 font-mono italic">Queue is empty</p>
                  ) : sorted.map((team, i) => {
                    const ms = times[team];
                    const gap = ms != null && fastest != null ? ms - fastest : null;
                    const borderColors = ['border-yellow-400', 'border-slate-300', 'border-amber-600'];
                    const border = i < 3 ? borderColors[i] : 'border-white/10';
                    return (
                      <motion.div
                        key={team}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className={`flex items-center justify-between p-4 rounded-xl border-l-4 ${border} ${i === 0 ? 'bg-yellow-400/5' : 'bg-white/5'}`}
                      >
                        <div className="flex items-center gap-4">
                          <span className="text-xl w-8 text-center">{medals[i] || `#${i + 1}`}</span>
                          <span className="font-bold text-lg font-mono">{team}</span>
                        </div>
                        <div className="flex items-center gap-6 text-right">
                          {ms != null ? (
                            <>
                              <div className="flex flex-col items-end">
                                <span className="text-[10px] text-white/30 font-mono uppercase tracking-widest mb-0.5">Response</span>
                                <span className={`font-black font-mono text-lg ${ms < 1000 ? 'text-neon-green' : ms < 3000 ? 'text-yellow-400' : 'text-orange-400'}`}>
                                  {ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(3)}s`}
                                </span>
                              </div>
                              {i > 0 && gap != null && (
                                <div className="flex flex-col items-end">
                                  <span className="text-[10px] text-white/30 font-mono uppercase tracking-widest mb-0.5">Gap</span>
                                  <span className="font-mono text-white/40 text-sm">
                                    +{gap < 1000 ? `${gap}ms` : `${(gap / 1000).toFixed(3)}s`}
                                  </span>
                                </div>
                              )}
                              {i === 0 && <span className="text-neon-green font-black font-mono text-xs uppercase tracking-widest">🏁 Fastest</span>}
                            </>
                          ) : (
                            <span className="text-white/20 font-mono text-sm italic">No time</span>
                          )}
                        </div>
                      </motion.div>
                    );
                  });
                })()}
              </div>
            </div>
          </section>
        )}


        {/* QUEUE VERIFY TAB */}
        {activeTab === 'queue_verify' && (() => {
          const queue = gameState?.queue || [];
          const times = gameState?.queueTimes || {};
          const sortedQueue = [...queue].sort((a, b) => {
            const ta = times[a] != null ? times[a] : Infinity;
            const tb = times[b] != null ? times[b] : Infinity;
            return ta - tb;
          });
          const topQueue = sortedQueue.slice(0, queueLimit);
          const fastest = topQueue[0];
          const medals = ['🥇', '🥈', '🥉', '4️⃣'];

          return (
            <section className="animate-in fade-in zoom-in-95 duration-300 max-w-3xl">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h2 className="text-3xl font-bold font-mono text-cyan-400 mb-1">🔍 Queue Verification</h2>
                  <p className="text-white/40 font-mono text-sm">Review the buzzer queue — verify the order, then open the answer panel.</p>
                </div>
                <div className="text-right">
                  <p className="text-white/30 font-mono text-xs uppercase tracking-widest">Active Question</p>
                  <p className="text-white font-bold font-mono text-lg">{gameState?.activeQ?.text || '— No active question'}</p>
                </div>
              </div>

              {/* Status Banner */}
              <div className={`p-4 rounded-xl mb-6 font-mono text-sm font-bold uppercase tracking-widest text-center ${gameState?.status === 'buzzer_open' ? 'bg-neon-green/10 border border-neon-green text-neon-green' :
                  gameState?.status === 'queue_processing' ? 'bg-cyan-400/10 border-2 border-cyan-400 text-cyan-400 animate-pulse' :
                    gameState?.status === 'answering' ? 'bg-neon-blue/10 border border-neon-blue text-neon-blue' :
                      'bg-white/5 border border-white/10 text-white/40'
                }`}>
                {gameState?.status === 'buzzer_open' && '⚡ Buzzer Open — Teams are pressing now'}
                {gameState?.status === 'queue_processing' && '🔐 Buzzer Closed — Verify queue below, then confirm to open answer panel'}
                {gameState?.status === 'answering' && `⏱ Answering: ${gameState?.queue?.[0] || '...'}`}
                {gameState?.status === 'waiting' && '⏸ Waiting — No buzzer active'}
                {!['buzzer_open', 'queue_processing', 'answering', 'waiting'].includes(gameState?.status) && `Status: ${gameState?.status}`}
              </div>

              {/* Sorted Queue */}
              <div className="glass-panel rounded-2xl overflow-hidden mb-6">
                <div className="bg-white/5 px-6 py-4 border-b border-white/10 flex justify-between items-center">
                  <span className="font-mono font-bold text-white">📊 Buzzer Order (Sorted by Response Time)</span>
                  <span className="text-white/30 font-mono text-xs">{queue.length} pressed · top {queueLimit} shown</span>
                </div>
                {topQueue.length === 0 ? (
                  <div className="p-10 text-center text-white/30 font-mono italic">No teams in queue yet</div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {topQueue.map((team, i) => {
                      const ms = times[team];
                      const gap = ms != null && times[fastest] != null ? ms - times[fastest] : null;
                      return (
                        <div key={team} className={`flex items-center justify-between px-6 py-5 ${i === 0 ? 'bg-cyan-400/5' : ''}`}>
                          <div className="flex items-center gap-5">
                            <span className="text-2xl">{medals[i] || `#${i + 1}`}</span>
                            <div>
                              <p className="font-black font-mono text-xl text-white">{team}</p>
                              {i === 0 && <p className="text-cyan-400 font-mono text-xs uppercase tracking-widest">Will answer first</p>}
                            </div>
                          </div>
                          <div className="flex items-center gap-8 text-right">
                            <div>
                              <p className="text-white/30 font-mono text-[10px] uppercase tracking-widest mb-0.5">Response Time</p>
                              <p className={`font-black font-mono text-xl ${ms < 1000 ? 'text-neon-green' : ms < 3000 ? 'text-yellow-400' : 'text-orange-400'}`}>
                                {ms != null ? (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(3)}s`) : 'N/A'}
                              </p>
                            </div>
                            {i > 0 && gap != null && (
                              <div>
                                <p className="text-white/30 font-mono text-[10px] uppercase tracking-widest mb-0.5">Gap</p>
                                <p className="font-mono text-white/40">+{gap < 1000 ? `${gap}ms` : `${(gap / 1000).toFixed(3)}s`}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex gap-4">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    forceAnswering();
                    setActiveTab('live');
                  }}
                  disabled={topQueue.length === 0}
                  className="flex-1 bg-cyan-400/20 text-cyan-400 border-2 border-cyan-400 font-black font-mono py-6 rounded-2xl uppercase tracking-[0.15em] text-lg hover:bg-cyan-400/30 transition-all shadow-[0_0_30px_rgba(34,211,238,0.3)] disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ✅ Confirm Queue & Open Answer Panel
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={resetSystem}
                  className="bg-neon-pink/10 text-neon-pink border border-neon-pink font-bold font-mono px-8 py-6 rounded-2xl uppercase tracking-widest hover:bg-neon-pink/20 transition-all"
                >
                  Reset
                </motion.button>
              </div>
            </section>
          );
        })()}


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
                    key={i} type="text" placeholder={`Option ${['A', 'B', 'C', 'D'][i]}`}
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
                value={roundSelect}
                onChange={(e) => setRoundSelect(e.target.value)}
                className="bg-dark-bg/50 border border-white/20 p-4 rounded-xl text-white outline-none focus:border-neon-purple w-full font-mono text-lg"
              >
                {roundsConfig.map(r => (
                  <option key={r.id} value={r.id.toString()}>Round {r.id}</option>
                ))}
                <option value="tie_breaker">Tie Breaker</option>
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
                <div key={q.id} className={`glass-panel p-6 rounded-xl flex flex-col md:flex-row md:justify-between md:items-center gap-4 border-l-4 border-neon-purple/50 ${editingId === q.id ? 'bg-neon-purple/10' : ''}`}>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="font-bold text-xl">{q.text}</span>
                      <span className={`text-xs px-2 py-1 rounded font-mono ${q.round === 'tie_breaker' ? 'bg-red-500/20 text-red-500' : 'bg-white/10 text-white/50'}`}>
                        {q.round === 'tie_breaker' ? 'TIE BREAKER' : `Round ${q.round || 1}`}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {q.options?.map((opt, i) => (
                        <div key={i} className={`text-sm p-2 rounded-lg font-mono ${q.correct === i ? 'bg-neon-green/20 border border-neon-green text-neon-green shadow-[0_0_10px_rgba(0,255,102,0.2)]' : 'bg-dark-bg/50 border border-white/10 text-white/50'}`}>
                          {['A', 'B', 'C', 'D'][i]}. {opt}
                        </div>
                      ))}
                    </div>
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
              const roundQuestions = questions.filter(q => q.round?.toString() === roundNum.toString() || (!q.round && roundNum === 1));

              return (
                <div key={roundNum} className="mb-10">
                  <h3 className="text-xl font-bold mb-4 border-b border-white/10 pb-2 font-mono flex justify-between items-center">
                    <span>Round {roundNum}</span>
                    <div className="flex gap-4 items-center">
                      <button onClick={() => triggerRoundTransition('start', roundNum)} className="text-xs bg-neon-blue/20 text-neon-blue px-3 py-1 rounded hover:bg-neon-blue/40 border border-neon-blue transition-all uppercase tracking-widest font-bold">Start Round</button>
                      <button onClick={() => triggerRoundTransition('finish', roundNum)} className="text-xs bg-neon-pink/20 text-neon-pink px-3 py-1 rounded hover:bg-neon-pink/40 border border-neon-pink transition-all uppercase tracking-widest font-bold">Finish Round</button>
                      <span className="text-sm text-white/40 ml-4">{roundQuestions.length} / {capacity} Questions</span>
                    </div>
                  </h3>
                  <div className="space-y-3">
                    {roundQuestions.map((q) => (
                      <div key={q.id} className={`glass-panel p-6 rounded-xl flex flex-col md:flex-row md:justify-between md:items-center gap-6 transition-all ${q.pushed ? 'opacity-80' : 'border-l-4 border-neon-green'}`}>
                        <div className="flex-1">
                          <span className="font-bold text-xl block mb-3">{q.text}</span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {q.options?.map((opt, i) => (
                              <div key={i} className={`text-sm p-2 rounded-lg font-mono ${q.correct === i ? 'bg-neon-green/20 border border-neon-green text-neon-green shadow-[0_0_10px_rgba(0,255,102,0.2)]' : 'bg-dark-bg/50 border border-white/10 text-white/50'}`}>
                                {['A', 'B', 'C', 'D'][i]}. {opt}
                              </div>
                            ))}
                          </div>
                        </div>
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

            {/* TIE BREAKER QUESTIONS SECTION */}
            <div className="mb-10 mt-16 border-t-2 border-red-500/30 pt-10">
              <h3 className="text-2xl font-black mb-4 border-b border-red-500/50 pb-2 font-mono flex justify-between items-center text-red-500">
                <span>⚖️ Tie Breaker Round</span>
                <div className="flex gap-4 items-center">
                  <span className="text-sm text-red-500/50 ml-4 font-normal">{questions.filter(q => q.round === 'tie_breaker').length} Questions Available</span>
                </div>
              </h3>
              <p className="text-red-400/60 font-mono mb-6 text-sm">These questions are reserved for Tie Breaker mode. Only use them when Tie Breaker Mode is active.</p>
              <div className="space-y-3">
                {questions.filter(q => q.round === 'tie_breaker').map((q) => (
                  <div key={q.id} className={`glass-panel p-6 rounded-xl flex flex-col md:flex-row md:justify-between md:items-center gap-6 transition-all ${q.pushed ? 'opacity-80' : 'border-l-4 border-red-500'}`}>
                    <div className="flex-1">
                      <span className="font-bold text-xl block mb-3 text-red-100">{q.text}</span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {q.options?.map((opt, i) => (
                          <div key={i} className={`text-sm p-2 rounded-lg font-mono ${q.correct === i ? 'bg-red-500/20 border border-red-500 text-red-500 shadow-[0_0_10px_rgba(239,68,68,0.2)]' : 'bg-dark-bg/50 border border-white/10 text-white/50'}`}>
                            {['A', 'B', 'C', 'D'][i]}. {opt}
                          </div>
                        ))}
                      </div>
                    </div>
                    {q.pushed ? (
                      <div className="flex gap-4 items-center">
                        <span className="bg-white/5 text-white/30 px-6 py-3 rounded-lg font-mono text-sm font-bold border border-white/10 uppercase tracking-widest cursor-not-allowed">LOCKED</span>
                        <button
                          onClick={() => unlockQuestion(q.id)}
                          className="text-red-500 text-xs border border-red-500 px-3 py-2 rounded-lg hover:bg-red-500/20 transition-colors uppercase font-mono font-bold"
                        >
                          Unlock
                        </button>
                      </div>
                    ) : (
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => pushQuestion(q)}
                        className="bg-red-500/20 text-red-500 border border-red-500 hover:bg-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.3)] cursor-pointer font-mono text-sm font-bold px-6 py-3 rounded-lg transition-all uppercase"
                      >
                        PUSH LIVE
                      </motion.button>
                    )}
                  </div>
                ))}
                {questions.filter(q => q.round === 'tie_breaker').length === 0 && (
                  <p className="text-white/30 font-mono italic p-4">No tie breaker questions added yet.</p>
                )}
              </div>
            </div>
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
                      <td className="p-4 font-mono text-neon-blue">{i + 1}</td>
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

        {/* TIE BREAKER TAB */}
        {activeTab === 'tie_breaker' && (() => {
          const activeTeams = teams.filter(t => !t.eliminated);

          // Sort teams: lowest score first, then lowest buzzer presses first
          const sortedForElim = [...activeTeams].sort((a, b) => {
            if (a.score !== b.score) return a.score - b.score;
            return (a.buzzerPresses || 0) - (b.buzzerPresses || 0);
          });

          const lowestTeam = sortedForElim[0];

          // Find all teams tied with the lowest team
          const tiedTeams = lowestTeam ? sortedForElim.filter(t =>
            t.score === lowestTeam.score && (t.buzzerPresses || 0) === (lowestTeam.buzzerPresses || 0)
          ) : [];

          const isTied = tiedTeams.length > 1;

          return (
            <section className="animate-in fade-in zoom-in-95 duration-300">
              <h2 className="text-3xl font-bold font-mono text-orange-500 mb-6">Sudden Death Tie Breaker</h2>

              <div className="glass-panel p-8 rounded-2xl mb-8 border border-white/10 relative overflow-hidden">
                <div className={`absolute top-0 left-0 w-2 h-full ${gameState?.tieBreakerActive ? 'bg-red-500 animate-pulse' : 'bg-white/10'}`}></div>
                <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                  <div>
                    <h3 className="text-2xl font-black font-mono mb-2 uppercase tracking-widest text-white">System Status</h3>
                    {gameState?.tieBreakerActive ? (
                      <p className="text-red-500 font-mono font-bold animate-pulse">TIE BREAKER MODE IS CURRENTLY ACTIVE.</p>
                    ) : (
                      <p className="text-white/50 font-mono">Normal gameplay rules are currently active.</p>
                    )}
                  </div>
                  <div>
                    {gameState?.tieBreakerActive ? (
                      <button
                        onClick={() => toggleTieBreakerMode(false)}
                        className="bg-white/10 hover:bg-white/20 text-white font-mono font-bold px-8 py-4 rounded-xl uppercase tracking-widest transition-all border border-white/20"
                      >
                        END TIE BREAKER MODE
                      </button>
                    ) : (
                      <button
                        onClick={() => toggleTieBreakerMode(true, tiedTeams.map(t => t.name))}
                        disabled={!isTied}
                        className={`font-mono font-bold px-8 py-4 rounded-xl uppercase tracking-widest transition-all border ${isTied ? 'bg-red-500/20 text-red-500 border-red-500 hover:bg-red-500/30 hover:shadow-[0_0_20px_rgba(239,68,68,0.4)]' : 'bg-dark-bg border-white/10 text-white/30 cursor-not-allowed'}`}
                      >
                        START TIE BREAKER MODE
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {isTied ? (
                <div className="bg-red-500/10 border border-red-500/30 p-8 rounded-2xl">
                  <h3 className="text-xl font-bold font-mono text-red-500 mb-6 uppercase tracking-widest">
                    ⚠️ Tie Detected at the Bottom!
                  </h3>
                  <p className="text-white/60 font-mono mb-6">
                    {tiedTeams.length} teams are tied for last place with exactly <strong>{lowestTeam.score} Points</strong> and <strong>{lowestTeam.buzzerPresses || 0} Buzzer Presses</strong>.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                    {tiedTeams.map(t => (
                      <div key={t.id} className="bg-dark-bg p-4 rounded-xl border border-red-500/50 text-center shadow-[0_0_15px_rgba(239,68,68,0.2)]">
                        <span className="font-bold text-xl block text-white">{t.name}</span>
                        <span className="text-red-500 font-mono text-sm uppercase">At Risk</span>
                      </div>
                    ))}
                  </div>

                  <div className="bg-dark-bg p-6 rounded-xl border-l-4 border-orange-500">
                    <p className="font-mono text-orange-400">
                      <strong>Recommended Action:</strong> Start Tie Breaker Mode. Then, push {tiedTeams.length - 1} Tie Breaker question(s) from below. All other teams will be locked out of their buzzers.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-white/5 border border-white/10 p-12 rounded-2xl text-center">
                  <h3 className="text-xl font-bold font-mono text-white/50 uppercase tracking-widest mb-4">No Ties Detected</h3>
                  <p className="text-white/30 font-mono">The lowest scoring team is clearly identifiable. No Tie Breaker is needed.</p>
                </div>
              )}

              {/* TIE BREAKER CONTROLS & QUESTIONS */}
              {gameState?.tieBreakerActive && (
                <div className="mt-12 border-t-2 border-red-500/30 pt-8">
                  <h3 className="text-2xl font-black mb-4 font-mono text-red-500">Tie Breaker Controls</h3>

                  <div className="flex gap-4 mb-8">
                    <button
                      onClick={() => triggerRoundTransition('start', 'TIE BREAKER')}
                      className="bg-red-500/20 text-red-500 border border-red-500 hover:bg-red-500 hover:text-white px-6 py-3 rounded-lg font-mono font-bold transition-all uppercase tracking-widest shadow-[0_0_15px_rgba(239,68,68,0.3)]"
                    >
                      Trigger Start Cinematic
                    </button>
                    <button
                      onClick={startSequence}
                      disabled={!gameState?.activeQ || gameState?.status !== "waiting"}
                      className="bg-neon-pink/20 text-neon-pink border border-neon-pink hover:bg-neon-pink/40 px-6 py-3 rounded-lg font-mono font-bold transition-all uppercase tracking-widest disabled:opacity-50"
                    >
                      Open Buzzers (Timer)
                    </button>
                    <button
                      onClick={() => triggerRoundTransition('finish', 'TIE BREAKER')}
                      className="bg-red-500/20 text-red-500 border border-red-500 hover:bg-red-500 hover:text-white px-6 py-3 rounded-lg font-mono font-bold transition-all uppercase tracking-widest shadow-[0_0_15px_rgba(239,68,68,0.3)]"
                    >
                      Trigger Finish Cinematic
                    </button>
                  </div>

                  <div className="space-y-3">
                    {questions.filter(q => q.round === 'tie_breaker').map((q) => (
                      <div key={q.id} className={`glass-panel p-6 rounded-xl flex flex-col md:flex-row md:justify-between md:items-center gap-6 transition-all ${q.pushed ? 'opacity-80' : 'border-l-4 border-red-500'}`}>
                        <div className="flex-1">
                          <span className="font-bold text-xl block mb-3 text-red-100">{q.text}</span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {q.options?.map((opt, i) => (
                              <div key={i} className={`text-sm p-2 rounded-lg font-mono ${q.correct === i ? 'bg-red-500/20 border border-red-500 text-red-500 shadow-[0_0_10px_rgba(239,68,68,0.2)]' : 'bg-dark-bg/50 border border-white/10 text-white/50'}`}>
                                {['A', 'B', 'C', 'D'][i]}. {opt}
                              </div>
                            ))}
                          </div>
                        </div>
                        {q.pushed ? (
                          <div className="flex gap-4 items-center">
                            <span className="bg-white/5 text-white/30 px-6 py-3 rounded-lg font-mono text-sm font-bold border border-white/10 uppercase tracking-widest cursor-not-allowed">LOCKED</span>
                            <button
                              onClick={() => unlockQuestion(q.id)}
                              className="text-red-500 text-xs border border-red-500 px-3 py-2 rounded-lg hover:bg-red-500/20 transition-colors uppercase font-mono font-bold"
                            >
                              Unlock
                            </button>
                          </div>
                        ) : (
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => pushQuestion(q)}
                            className="bg-red-500/20 text-red-500 border border-red-500 hover:bg-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.3)] cursor-pointer font-mono text-sm font-bold px-6 py-3 rounded-lg transition-all uppercase"
                          >
                            PUSH LIVE
                          </motion.button>
                        )}
                      </div>
                    ))}
                    {questions.filter(q => q.round === 'tie_breaker').length === 0 && (
                      <p className="text-white/30 font-mono italic p-4">No tie breaker questions added yet.</p>
                    )}
                  </div>
                </div>
              )}
            </section>
          );
        })()}

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
                    <div className="flex-1 flex flex-col gap-4">
                      <div className="flex items-center gap-4">
                        <label className="text-white/40 font-mono text-sm w-36">Capacity (Qs):</label>
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
                      <div className="flex items-center gap-4">
                        <label className="text-white/40 font-mono text-sm w-36">Points Distribution:</label>
                        <input
                          type="text"
                          value={r.points || "10, 7, 5, 3"}
                          onChange={(e) => {
                            const newConfig = [...roundsConfig];
                            newConfig[i].points = e.target.value;
                            setRoundsConfig(newConfig);
                          }}
                          placeholder="10, 7, 5, 3"
                          className="bg-dark-bg border border-white/20 p-2 rounded-lg text-white outline-none focus:border-neon-blue w-48 font-mono"
                        />
                      </div>
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

              <div className="bg-white/5 p-4 rounded-xl border border-red-500/30 mb-8">
                <h3 className="font-mono text-lg font-bold text-red-500 mb-4">Tie Breaker Configuration</h3>
                <div className="flex items-center gap-4">
                  <label className="text-white/40 font-mono text-sm w-36">Points Distribution:</label>
                  <input
                    type="text"
                    value={tieBreakerPoints}
                    onChange={(e) => setTieBreakerPoints(e.target.value)}
                    placeholder="8, 6"
                    className="bg-dark-bg border border-red-500/50 p-2 rounded-lg text-white outline-none focus:border-red-500 w-48 font-mono"
                  />
                  <span className="text-xs text-white/30 font-mono">Only top tied teams get a chance to score and break the tie.</span>
                </div>
              </div>

              {/* Auto-Open Answer Panel Toggle */}
              <div className="bg-white/5 p-4 rounded-xl border border-neon-green/30 mb-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-mono text-lg font-bold text-neon-green mb-1">Auto-Open Answer Panel</h3>
                    <p className="text-white/30 font-mono text-xs">
                      {autoOpenAnswer
                        ? 'ON — Answer panel opens automatically after 10s buzzer timer ends.'
                        : 'OFF — Admin must verify queue and confirm manually via Queue Verify tab.'}
                    </p>
                  </div>
                  <button
                    onClick={() => setAutoOpenAnswer(v => !v)}
                    className={`relative w-16 h-8 rounded-full transition-all duration-300 focus:outline-none border-2 ${
                      autoOpenAnswer ? 'bg-neon-green/30 border-neon-green' : 'bg-white/10 border-white/20'
                    }`}
                  >
                    <span className={`absolute top-0.5 w-6 h-6 rounded-full shadow-lg transition-all duration-300 ${
                      autoOpenAnswer ? 'left-8 bg-neon-green shadow-[0_0_10px_rgba(0,255,102,0.7)]' : 'left-0.5 bg-white/40'
                    }`} />
                  </button>
                </div>
              </div>

              <div className="bg-white/5 p-4 rounded-xl border border-neon-blue/30 mb-8">
                <h3 className="font-mono text-lg font-bold text-neon-blue mb-4">Buzzer Queue Limit</h3>
                <div className="flex items-center gap-4">
                  <label className="text-white/40 font-mono text-sm w-48">Max Teams in Queue:</label>
                  <input
                    type="number"
                    min="1" max="20"
                    value={queueLimit}
                    onChange={(e) => setQueueLimit(Math.max(1, parseInt(e.target.value) || 1))}
                    className="bg-dark-bg border border-neon-blue/50 p-2 rounded-lg text-white outline-none focus:border-neon-blue w-24 font-mono text-center text-lg"
                  />
                  <span className="text-xs text-white/30 font-mono">Only the top <strong className="text-neon-blue">{queueLimit}</strong> fastest teams will be eligible to answer each question.</span>
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => {
                    const newConfig = [...roundsConfig, { id: roundsConfig.length + 1, capacity: 5, points: "10, 7, 5, 3" }];
                    setRoundsConfig(newConfig);
                  }}
                  className="bg-white/10 hover:bg-white/20 text-white border border-white/30 font-bold font-mono px-6 py-3 rounded-xl transition-all"
                >
                  + Add Round
                </button>
                <button
                  onClick={saveSettings}
                  className="bg-neon-blue/20 text-neon-blue border border-neon-blue font-bold font-mono px-6 py-3 rounded-xl hover:bg-neon-blue/30 transition-all shadow-[0_0_15px_rgba(0,243,255,0.3)]"
                >
                  Save Configuration
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ANALYTICS TAB */}
        {activeTab === 'analytics' && (() => {
          // Group events by round then by question
          const grouped = {};
          buzzerEvents.forEach(evt => {
            const roundKey = evt.round === 'tie_breaker' ? 'Tie Breaker' : `Round ${evt.round || 1}`;
            if (!grouped[roundKey]) grouped[roundKey] = {};
            const qKey = evt.questionText || 'Unknown Question';
            if (!grouped[roundKey][qKey]) grouped[roundKey][qKey] = [];
            grouped[roundKey][qKey].push(evt);
          });

          return (
            <section className="animate-in fade-in zoom-in-95 duration-300">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold font-mono text-yellow-400">📊 Buzzer Analytics</h2>
                <button
                  onClick={() => showConfirm("Clear all buzzer event logs? This cannot be undone.", async () => {
                    setIsLoading(true);
                    const snap = await getDocs(query(collection(db, "buzzer_events")));
                    await Promise.all(snap.docs.map(d => deleteDoc(doc(db, "buzzer_events", d.id))));
                    setIsLoading(false);
                    showAlert("All buzzer logs cleared.");
                  })}
                  className="text-red-500/60 hover:text-red-500 font-mono text-sm border border-red-500/30 hover:border-red-500 px-4 py-2 rounded-lg transition-all"
                >
                  Clear All Logs
                </button>
              </div>

              <p className="text-white/40 font-mono text-sm mb-8">
                Every buzzer press is timestamped. Use this to resolve disputes — the data doesn't lie.
              </p>

              {Object.keys(grouped).length === 0 ? (
                <div className="glass-panel p-12 rounded-2xl text-center">
                  <p className="text-white/30 font-mono italic">No buzzer events recorded yet. Start a round to begin tracking.</p>
                </div>
              ) : (
                <div className="space-y-10">
                  {Object.entries(grouped).map(([round, questions]) => (
                    <div key={round}>
                      <h3 className="text-lg font-black font-mono text-yellow-400 uppercase tracking-widest mb-4 flex items-center gap-3">
                        <span className="h-px flex-1 bg-yellow-400/20" />
                        {round}
                        <span className="h-px flex-1 bg-yellow-400/20" />
                      </h3>
                      <div className="space-y-6">
                        {Object.entries(questions).map(([qText, events]) => (
                          <div key={qText} className="glass-panel rounded-2xl overflow-hidden">
                            <div className="bg-white/5 px-6 py-4 border-b border-white/10">
                              <p className="font-mono text-white/80 font-bold">{qText}</p>
                            </div>
                            <table className="w-full">
                              <thead>
                                <tr className="text-white/30 text-xs font-mono uppercase tracking-widest border-b border-white/5">
                                  <th className="text-left p-4">Position</th>
                                  <th className="text-left p-4">Team</th>
                                  <th className="text-left p-4">Response Time</th>
                                  <th className="text-left p-4">Advantage</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-white/5">
                                {[...events].sort((a, b) => (a.responseMs || Infinity) - (b.responseMs || Infinity)).map((evt, i) => {
                                  const fastest = events.reduce((min, e) => (e.responseMs || Infinity) < (min.responseMs || Infinity) ? e : min, events[0]);
                                  const diff = evt.responseMs != null && fastest.responseMs != null ? evt.responseMs - fastest.responseMs : null;
                                  return (
                                    <tr key={evt.id} className={`hover:bg-white/5 transition-colors ${i === 0 ? 'bg-neon-green/5' : ''}`}>
                                      <td className="p-4 font-mono">
                                        <span className={`font-black text-lg ${i === 0 ? 'text-neon-green' : i === 1 ? 'text-yellow-400' : i === 2 ? 'text-orange-400' : 'text-white/40'}`}>
                                          #{i + 1}
                                        </span>
                                      </td>
                                      <td className="p-4 font-bold font-mono">{evt.team}</td>
                                      <td className="p-4 font-mono">
                                        {evt.responseMs != null ? (
                                          <span className={`font-black ${i === 0 ? 'text-neon-green' : 'text-white/60'}`}>
                                            {evt.responseMs < 1000 ? `${evt.responseMs}ms` : `${(evt.responseMs / 1000).toFixed(3)}s`}
                                          </span>
                                        ) : (
                                          <span className="text-white/20">Pre-open</span>
                                        )}
                                      </td>
                                      <td className="p-4 font-mono text-sm">
                                        {i === 0 ? (
                                          <span className="text-neon-green font-bold">🏁 Fastest</span>
                                        ) : diff != null ? (
                                          <span className="text-white/40">+{diff < 1000 ? `${diff}ms` : `${(diff / 1000).toFixed(3)}s`} slower</span>
                                        ) : '—'}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })()}

        {/* RESET SYSTEM TAB */}
        {activeTab === 'reset' && (
          <section className="animate-in fade-in zoom-in-95 duration-300 max-w-2xl">
            <h2 className="text-3xl font-bold font-mono text-red-500 mb-6 flex items-center gap-3">
              <span className="animate-pulse">⚠️</span> Factory Reset
            </h2>

            <div className="glass-panel p-8 rounded-2xl border-2 border-red-500/30">
              <h3 className="text-xl font-bold text-white mb-4 uppercase tracking-widest font-mono">DANGER ZONE</h3>
              <p className="text-white/60 mb-8 font-mono">
                This action will completely wipe all participating teams, their scores, their buzzer stats, and reset the live game state back to zero.
                <br /><br />
                <strong className="text-neon-green">Your Question Bank will NOT be deleted.</strong> You can safely run this to prepare for a brand new event while keeping your questions.
              </p>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  showConfirm("CRITICAL WARNING: Are you absolutely sure you want to WIPE ALL TEAMS and RESET THE GAME STATE? This cannot be undone.", async () => {
                    setIsLoading(true);
                    try {
                      // 1. Delete all teams
                      const q = query(collection(db, "teams"));
                      const snap = await getDocs(q);
                      const deletePromises = [];
                      snap.forEach(d => {
                        deletePromises.push(deleteDoc(doc(db, "teams", d.id)));
                      });
                      await Promise.all(deletePromises);

                      // 2. Reset game_state
                      await setDoc(doc(db, "game_state", "current"), {
                        activeQ: null,
                        attempts: 0,
                        currentPoints: [],
                        queue: [],
                        status: "waiting",
                        timerValue: 0,
                        roundNumber: 1,
                        tieBreakerActive: false,
                        tieBreakerTeams: []
                      });

                      // 3. Unlock all questions
                      const qSnap = await getDocs(query(collection(db, "questions")));
                      const updatePromises = [];
                      qSnap.forEach(d => {
                        if (d.data().pushed) {
                          updatePromises.push(updateDoc(doc(db, "questions", d.id), { pushed: false }));
                        }
                      });
                      await Promise.all(updatePromises);

                      showAlert("FACTORY RESET COMPLETE. All teams deleted. Game state reset. Questions preserved.");
                      setActiveTab('live');
                    } catch (err) {
                      console.error(err);
                      showAlert("Failed to perform factory reset.");
                    }
                    setIsLoading(false);
                  });
                }}
                className="w-full bg-red-500/20 text-red-500 py-6 rounded-xl font-black font-mono text-xl uppercase tracking-[0.2em] border-2 border-red-500 hover:bg-red-500 hover:text-white transition-all shadow-[0_0_30px_rgba(239,68,68,0.4)]"
              >
                NUKE DATABASE (KEEP QUESTIONS)
              </motion.button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
