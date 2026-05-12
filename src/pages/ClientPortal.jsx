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
  
  useEffect(() => {
    signInAnonymously(auth).catch(err => console.error("Auth:", err));
    
    const docRef = doc(db, "game_state", "current");
    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      setGameState(snapshot.data());
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    if (myTeam.trim()) {
      setIsJoined(true);
    }
  };

  const sendBuzz = async () => {
    const docRef = doc(db, "game_state", "current");
    await updateDoc(docRef, { queue: arrayUnion(myTeam) });
  };

  const handleAns = async (idx, correctIdx, currentQueue) => {
    const docRef = doc(db, "game_state", "current");
    if (idx === correctIdx) {
      const points = [10, 7, 5, 3];
      const turnIndex = 4 - currentQueue.length;
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
        await updateDoc(docRef, { queue: arrayRemove(myTeam) });
        if (currentQueue.length <= 1) {
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
                onChange={(e) => setMyTeam(e.target.value)}
                placeholder="# 00" 
                className="w-full p-4 rounded-xl bg-dark-bg/80 border border-white/10 text-white font-mono outline-none focus:border-neon-blue focus:ring-1 focus:ring-neon-blue transition-all text-xl"
                required
              />
            </div>
            
            <button 
              type="submit" 
              className="w-full bg-neon-blue/10 hover:bg-neon-blue/20 text-neon-blue border border-neon-blue font-mono font-bold py-4 rounded-xl active:scale-95 transition-all text-lg tracking-widest uppercase hover:shadow-[0_0_20px_rgba(0,243,255,0.3)]"
            >
              Initiate_Session
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  if (!gameState) return <div className="min-h-screen flex items-center justify-center font-mono text-neon-blue">Connecting...</div>;

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

        {/* BUZZER AREA */}
        {(status === "buzzer_open" || status === "waiting") && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center"
          >
            <button 
              onClick={sendBuzz}
              disabled={status !== "buzzer_open" || (queue && queue.includes(myTeam))}
              className={`w-72 h-72 rounded-full flex items-center justify-center text-5xl font-black font-mono transition-all active:scale-90 border-4 
                ${status === "buzzer_open" && (!queue || !queue.includes(myTeam)) 
                  ? 'buzzer-active border-transparent text-white' 
                  : 'bg-dark-surface border-dark-border text-white/30 cursor-not-allowed'}`}
            >
              BUZZ
            </button>
            
            <div className="mt-16 flex flex-col items-center">
              <span className={`text-6xl font-mono font-black ${status === "buzzer_open" ? 'text-neon-pink drop-shadow-[0_0_15px_rgba(255,0,127,0.5)]' : 'text-white/20'}`}>
                00:{status === "buzzer_open" ? (timerValue < 10 ? `0${timerValue}` : timerValue) : "00"}
              </span>
              <p className="mt-6 text-xl font-mono uppercase tracking-widest text-white/50">
                {status === "buzzer_open" 
                  ? (!queue || !queue.includes(myTeam) ? "Ready... Buzz Now!" : "Buzzed! Wait for timer...") 
                  : "Wait for moderator..."}
              </p>
            </div>
          </motion.div>
        )}

        {/* ANSWERING AREA */}
        {status === "answering" && queue && queue.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full"
          >
            {queue[0] === myTeam ? (
              <div className="glass-panel p-8 rounded-3xl">
                <div className="mb-12">
                  <h4 className="text-neon-blue font-black text-4xl uppercase tracking-widest drop-shadow-[0_0_15px_rgba(0,243,255,0.5)]">Your Turn!</h4>
                  <p className="text-white/60 mt-4 font-mono uppercase tracking-widest">Select the correct answer</p>
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
