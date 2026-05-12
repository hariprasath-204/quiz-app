import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';

export default function Elimination() {
  const [gameState, setGameState] = useState(null);

  useEffect(() => {
    const docRef = doc(db, "game_state", "current");
    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      setGameState(snapshot.data());
    });
    return () => unsubscribe();
  }, []);

  if (!gameState) {
    return <div className="min-h-screen bg-dark-bg flex items-center justify-center font-mono text-neon-blue">Connecting to Mainframe...</div>;
  }

  const { status, timerValue, targetTeam } = gameState;
  const isEliminationMode = status === "elimination_countdown" || status === "eliminated_revealed";

  return (
    <div className="min-h-screen bg-dark-bg flex flex-col items-center justify-center relative overflow-hidden">
      
      {/* Background that pulses red when revealed */}
      <AnimatePresence>
        {status === "eliminated_revealed" && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-red-900/40 via-dark-bg to-dark-bg z-0"
          />
        )}
      </AnimatePresence>

      <div className="z-10 text-center w-full max-w-5xl px-6">
        
        {!isEliminationMode && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center"
          >
            <div className="w-16 h-16 border-4 border-neon-blue/20 border-t-neon-blue rounded-full animate-spin mb-8"></div>
            <h1 className="text-3xl md:text-5xl font-mono text-white/50 tracking-[0.2em] uppercase font-bold">
              Awaiting Elimination Results
            </h1>
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {status === "elimination_countdown" && (
            <motion.div
              key="countdown"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.5, opacity: 0 }}
              className="flex flex-col items-center justify-center"
            >
              <motion.h1 
                key={timerValue}
                initial={{ scale: 1.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                transition={{ type: "spring", stiffness: 200, damping: 20 }}
                className="text-[15rem] md:text-[25rem] font-bold text-red-500 leading-none drop-shadow-[0_0_50px_rgba(239,68,68,0.6)]"
              >
                {timerValue}
              </motion.h1>
              <h2 className="text-4xl font-mono text-red-400 tracking-[0.5em] uppercase mt-8 font-bold animate-pulse">
                Elimination Pending
              </h2>
            </motion.div>
          )}

          {status === "eliminated_revealed" && (
            <motion.div
              key="reveal"
              initial={{ scale: 0.8, opacity: 0, y: 50 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ type: "spring", bounce: 0.5, duration: 1 }}
              className="flex flex-col items-center w-full"
            >
              <h2 className="text-3xl md:text-5xl font-mono text-red-500 tracking-[0.3em] uppercase font-bold mb-12 drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]">
                Team Eliminated
              </h2>
              
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.8 }}
                className="w-full glass-panel border-4 border-red-500/50 bg-red-950/30 p-16 rounded-[3rem] shadow-[0_0_100px_rgba(239,68,68,0.3)]"
              >
                <h1 className="text-6xl md:text-8xl lg:text-[9rem] font-black uppercase text-white tracking-widest break-words text-center drop-shadow-2xl">
                  {targetTeam}
                </h1>
              </motion.div>
              
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 2 }}
                className="mt-16 text-white/40 font-mono tracking-widest uppercase"
              >
                Thank you for playing.
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>
        
      </div>
    </div>
  );
}
