import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db, auth } from '../firebase';
import { doc, onSnapshot, updateDoc, getDocs, collection, query, arrayUnion, arrayRemove } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';

export default function ClientPortal() {
  const [myTeam, setMyTeam] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [gameState, setGameState] = useState(null);
  const [popup, setPopup] = useState(null);
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  
  useEffect(() => {
    signInAnonymously(auth).catch(err => console.error("Auth:", err));
    
    const docRef = doc(db, "game_state", "current");
    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      setGameState(snapshot.data());
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    const teamName = myTeam.trim();
    if (!teamName) return;
    
    setIsLoggingIn(true);
    setLoginError('');
    
    try {
      const q = query(collection(db, "teams"));
      const snap = await getDocs(q);
      let found = false;
      snap.forEach(d => {
        if (d.data().name.toLowerCase() === teamName.toLowerCase()) {
          found = true;
        }
      });
      
      if (found) {
        setIsJoined(true);
      } else {
        setLoginError('Participant not allowed. Please enter a valid team name.');
      }
    } catch (err) {
      console.error("Login error", err);
      setLoginError('Connection error. Please try again.');
    }
    
    setIsLoggingIn(false);
  };

  const playBuzzSound = () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      osc.type = 'square';
      osc.frequency.setValueAtTime(400, ctx.currentTime); // low buzz
      osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.1);
      
      gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch(e) {
      console.error("Audio failed", e);
    }
  };

  const sendBuzz = async () => {
    playBuzzSound();
    const docRef = doc(db, "game_state", "current");
    await updateDoc(docRef, { queue: arrayUnion(myTeam) });

    try {
      const q = query(collection(db, "teams"));
      const snap = await getDocs(q);
      snap.forEach(async (d) => {
        if (d.data().name === myTeam) {
          await updateDoc(doc(db, "teams", d.id), { buzzerPresses: (d.data().buzzerPresses || 0) + 1 });
        }
      });
    } catch (err) {
      console.error("Failed to update buzzer metrics", err);
    }
  };

  const handleAns = async (idx, correctIdx, currentQueue) => {
    const docRef = doc(db, "game_state", "current");
    // Pause timer
    await updateDoc(docRef, { status: "evaluating" });

    if (idx === correctIdx) {
      const points = gameState?.currentPoints || [10, 7, 5, 3];
      const turnIndex = gameState?.attempts || 0;
      const pts = points[turnIndex] || 0;

      const q = query(collection(db, "teams"));
      const snap = await getDocs(q);
      snap.forEach(async (d) => {
        if (d.data().name === myTeam) {
          await updateDoc(doc(db, "teams", d.id), { score: d.data().score + pts });
        }
      });
      
      setPopup({ type: 'correct', msg: `CORRECT! +${pts} Points` });
      setTimeout(async () => {
        setPopup(null);
        await updateDoc(docRef, { status: "waiting", queue: [], timerValue: 0 });
      }, 2500);

    } else {
      setPopup({ type: 'wrong', msg: 'WRONG! Pass to next team.' });
      setTimeout(async () => {
        setPopup(null);
        const newQueue = currentQueue.slice(1);
        if (newQueue.length > 0) {
          await updateDoc(docRef, { queue: newQueue, status: "pass_to_next", attempts: (gameState?.attempts || 0) + 1 });
        } else {
          await updateDoc(docRef, { status: "waiting", queue: [], timerValue: 0 });
        }
      }, 2500);
    }
  };

  if (!isJoined) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 relative">
        {/* Hacker-style Login */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md glass-panel p-10 rounded-[2rem] border border-neon-blue/30 relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-neon-blue via-neon-purple to-neon-pink"></div>
          
          <h1 className="text-3xl font-mono font-bold text-center text-neon-blue mb-10 uppercase tracking-widest drop-shadow-[0_0_8px_rgba(0,243,255,0.5)]">
            System Access
          </h1>
          
          <form onSubmit={handleLogin} className="space-y-8">
            <div className="space-y-2">
              <label className="text-neon-green font-mono text-xs uppercase tracking-widest">Team Identifier (Lot #)</label>
              <input 
                type="text" 
                value={myTeam}
                onChange={(e) => { setMyTeam(e.target.value); setLoginError(''); }}
                placeholder="# 00" 
                className="w-full p-4 rounded-xl bg-dark-bg/80 border border-white/10 text-white font-mono outline-none focus:border-neon-blue focus:ring-1 focus:ring-neon-blue transition-all text-xl"
                required
              />
            </div>
            
            <AnimatePresence>
              {loginError && (
                <motion.p 
                  initial={{ opacity: 0, height: 0 }} 
                  animate={{ opacity: 1, height: 'auto' }} 
                  exit={{ opacity: 0, height: 0 }}
                  className="text-red-500 font-mono text-sm text-center bg-red-500/10 p-2 rounded border border-red-500/30"
                >
                  {loginError}
                </motion.p>
              )}
            </AnimatePresence>
            
            <button 
              type="submit" 
              disabled={isLoggingIn}
              className={`w-full font-mono font-bold py-4 rounded-xl active:scale-95 transition-all text-lg tracking-widest uppercase ${isLoggingIn ? 'bg-white/5 text-white/30 border border-white/10' : 'bg-neon-blue/10 hover:bg-neon-blue/20 text-neon-blue border border-neon-blue hover:shadow-[0_0_20px_rgba(0,243,255,0.3)]'}`}
            >
              {isLoggingIn ? 'AUTHENTICATING...' : 'INITIATE_SESSION'}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  if (!gameState) return <div className="min-h-screen flex items-center justify-center font-mono text-neon-blue">Connecting...</div>;

  const isLockedByTieBreaker = gameState.tieBreakerActive && 
    !(gameState.tieBreakerTeams?.map(t => t.toLowerCase()).includes(myTeam.toLowerCase()));

  const { status, timerValue, queue, activeQ } = gameState;

  return (
    <div className="min-h-screen p-6 flex flex-col items-center">
      {/* Header Info */}
      <div className="w-full max-w-3xl flex justify-between items-center mb-12 glass-panel p-6 rounded-2xl">
        <h2 className="text-white text-2xl font-mono font-bold tracking-widest uppercase">Team: <span className="text-neon-blue">{myTeam}</span></h2>
        <p className="text-neon-green font-mono uppercase tracking-widest text-sm flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-neon-green animate-pulse"></span>
          Sys_Sync
        </p>
      </div>

      <div className="w-full max-w-3xl text-center flex-1 flex flex-col justify-center relative">
        
        {/* ROUND TRANSITION OVERLAY */}
        <AnimatePresence>
          {status === "round_transition" && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.2 }}
              className="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-dark-bg/95 backdrop-blur-xl rounded-3xl"
            >
              <motion.h1 
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className={`text-[6rem] md:text-[8rem] font-black uppercase text-center leading-tight drop-shadow-2xl ${gameState.transitionType === 'start' ? 'text-neon-blue shadow-neon-blue' : 'text-neon-green shadow-neon-green'}`}
              >
                ROUND {gameState.roundNumber}
                <br/>
                <span className="text-[4rem] md:text-[5rem] text-white">
                  {gameState.transitionType === 'start' ? 'STARTING' : 'FINISHED'}
                </span>
              </motion.h1>
              {gameState.transitionType === 'finish' && (
                <motion.p
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}
                  className="mt-8 text-xl md:text-2xl font-mono text-white/50 tracking-widest uppercase text-center"
                >
                  Check Leaderboard for Standings
                </motion.p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* COUNTDOWN OVERLAY */}
        <AnimatePresence>
          {status === "countdown" && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.5 }}
              className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-dark-bg/90 backdrop-blur-sm rounded-3xl"
            >
              <h1 className="text-[15rem] font-black text-neon-pink leading-none drop-shadow-[0_0_50px_rgba(255,0,127,0.6)] font-mono">
                {timerValue}
              </h1>
              <p className="text-neon-pink font-mono tracking-[1em] uppercase mt-10 text-xl">Get Ready</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* LOCKED OUT OVERLAY (TIE BREAKER) */}
        {isLockedByTieBreaker && status !== "round_transition" && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-dark-bg/95 backdrop-blur-xl rounded-3xl border-4 border-red-500/30"
          >
            <span className="text-7xl mb-8 animate-pulse">⚖️</span>
            <h1 className="text-4xl md:text-5xl font-black uppercase text-center leading-tight text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.5)] font-mono">
              TIE BREAKER IN PROGRESS
            </h1>
            <p className="mt-8 text-xl md:text-2xl font-mono text-white/50 tracking-widest uppercase text-center max-w-lg">
              You are safe. Please wait while the tied teams battle it out to avoid elimination.
            </p>
          </motion.div>
        )}

        {/* BUZZER AREA */}
        {status !== "answering" && status !== "evaluating" && status !== "countdown" && status !== "round_transition" && !isLockedByTieBreaker && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center"
          >
            <button 
              onClick={sendBuzz}
              disabled={status !== "buzzer_open" || (queue && queue.includes(myTeam)) || isLockedByTieBreaker}
              className={`w-72 h-72 rounded-full flex items-center justify-center text-5xl font-black font-mono transition-all active:scale-90 border-4 
                ${status === "buzzer_open" && (!queue || !queue.includes(myTeam)) && !isLockedByTieBreaker
                  ? 'buzzer-active border-transparent text-white' 
                  : 'bg-dark-surface border-dark-border text-white/30 cursor-not-allowed'}`}
            >
              {isLockedByTieBreaker ? "TIE BREAKER" : (status === "buzzer_open" ? "BUZZ" : "LOCKED")}
            </button>
            
            <div className="mt-16 flex flex-col items-center">
              <span className={`text-6xl font-mono font-black ${status === "buzzer_open" ? 'text-neon-pink drop-shadow-[0_0_15px_rgba(255,0,127,0.5)]' : 'text-white/20'}`}>
                00:{status === "buzzer_open" ? (timerValue < 10 ? `0${timerValue}` : timerValue) : "00"}
              </span>
              <p className="mt-6 text-xl font-mono uppercase tracking-widest text-white/50">
                {isLockedByTieBreaker ? "LOCKED: TIE BREAKER IN PROGRESS" : (
                  status === "buzzer_open" 
                    ? (!queue || !queue.includes(myTeam) ? "Ready... Buzz Now!" : "Buzzed! Wait for timer...") 
                    : "Locked by Admin"
                )}
              </p>
            </div>
          </motion.div>
        )}

        {/* ANSWERING AREA */}
        {(status === "answering" || status === "evaluating") && queue && queue.length > 0 && !isLockedByTieBreaker && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full"
          >
            {queue[0] === myTeam ? (
              <div className="glass-panel p-8 rounded-3xl">
                <div className="text-center mb-8">
                  <span className={`text-6xl md:text-7xl font-mono font-black ${timerValue <= 10 ? 'text-red-500 animate-pulse' : 'text-neon-pink'} drop-shadow-[0_0_15px_rgba(255,0,127,0.5)]`}>
                    00:{timerValue < 10 ? `0${timerValue}` : timerValue}
                  </span>
                </div>
                <div className="mb-12">
                  <h4 className="text-neon-blue font-black text-4xl uppercase tracking-widest drop-shadow-[0_0_15px_rgba(0,243,255,0.5)] text-center">Your Turn!</h4>
                  <p className="text-white/60 mt-4 font-mono uppercase tracking-widest text-center">Select the correct answer</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {activeQ?.options.map((opt, i) => (
                    <button 
                      key={i}
                      onClick={() => handleAns(i, activeQ.correct, queue)}
                      className="bg-dark-surface border border-white/10 hover:border-neon-blue hover:bg-neon-blue/10 text-white p-8 rounded-2xl font-bold text-xl transition-all active:scale-95 text-left font-mono"
                    >
                      {['A', 'B', 'C', 'D'][i]}. {opt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="glass-panel p-16 rounded-[3rem] border border-neon-purple/30">
                <div className="animate-pulse flex flex-col items-center">
                  <div className="w-20 h-20 border-4 border-dark-border border-t-neon-purple rounded-full animate-spin mb-8 shadow-[0_0_20px_rgba(176,38,255,0.5)]"></div>
                  <h4 className="text-neon-purple text-2xl font-mono font-bold tracking-widest uppercase text-center">
                    {queue[0]} is answering...
                  </h4>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </div>

      {/* RESULT POPUP OVERLAY */}
      <AnimatePresence>
        {popup && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-dark-bg/80 backdrop-blur-md"
          >
            <div className={`p-10 rounded-[3rem] border-4 flex flex-col items-center justify-center max-w-lg text-center shadow-[0_0_50px_rgba(0,0,0,0.5)] ${
              popup.type === 'correct' ? 'bg-neon-green/10 border-neon-green text-neon-green shadow-neon-green/40' : 'bg-neon-pink/10 border-neon-pink text-neon-pink shadow-neon-pink/40'
            }`}>
              {popup.type === 'correct' ? (
                <svg className="w-24 h-24 mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              ) : (
                <svg className="w-24 h-24 mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              )}
              <h2 className="text-4xl font-black font-mono uppercase tracking-widest">{popup.msg}</h2>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
