import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '../firebase';
import { collection, onSnapshot, doc } from 'firebase/firestore';

export default function Leaderboard() {
  const [teams, setTeams] = useState([]);
  const [presence, setPresence] = useState({});
  const [isRevealing, setIsRevealing] = useState(false);
  const presenceRef = useRef({});
  const rawTeamsRef = useRef([]);

  const sortAndSet = (rawTeams, pres) => {
    const sorted = [...rawTeams].sort((a, b) => {
      const aCheated = (pres[a.name]?.tabSwitches || 0) > 0;
      const bCheated = (pres[b.name]?.tabSwitches || 0) > 0;
      if (aCheated !== bCheated) return aCheated ? 1 : -1;
      if (b.score !== a.score) return b.score - a.score;
      if ((b.correctAnswers||0) !== (a.correctAnswers||0)) return (b.correctAnswers||0) - (a.correctAnswers||0);
      if ((b.buzzerPresses||0) !== (a.buzzerPresses||0)) return (b.buzzerPresses||0) - (a.buzzerPresses||0);
      return (b.wrongAnswers||0) - (a.wrongAnswers||0);
    });
    setTeams(sorted);
  };

  useEffect(() => {
    const unSubTeams = onSnapshot(collection(db, "teams"), (s) => {
      const t = [];
      s.forEach(d => { if (!d.data().eliminated) t.push({ id: d.id, ...d.data() }); });
      rawTeamsRef.current = t;
      sortAndSet(t, presenceRef.current);
    });
    return () => unSubTeams();
  }, []);

  useEffect(() => {
    const unSub = onSnapshot(collection(db, 'presence'), s => {
      const p = {};
      s.forEach(d => { p[d.id] = d.data(); });
      presenceRef.current = p;
      setPresence(p);
      sortAndSet(rawTeamsRef.current, p); // re-sort when cheat count changes
    });
    return () => unSub();
  }, []);

  const totalTeams = teams.length;

  const itemVariants = {
    hidden: { y: 100, opacity: 0, scale: 0.9 },
    visible: (customIndex) => ({
      y: 0,
      opacity: 1,
      scale: 1,
      transition: {
        // Last place team appears first, so reverse the delay
        delay: (totalTeams - 1 - customIndex) * 1.5, 
        duration: 0.8,
        type: "spring",
        bounce: 0.4
      }
    })
  };

  return (
    <div className="min-h-screen bg-dark-bg p-8 flex flex-col items-center relative overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden z-0 pointer-events-none">
        <motion.div 
          className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-neon-purple/20 rounded-full mix-blend-screen filter blur-[128px]"
          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div 
          className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-neon-blue/20 rounded-full mix-blend-screen filter blur-[128px]"
          animate={{ scale: [1.2, 1, 1.2], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* Header */}
      <div className="z-10 text-center mb-12 mt-8">
        <h1 className="text-5xl md:text-7xl font-black uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-neon-blue via-neon-purple to-neon-pink drop-shadow-[0_0_15px_rgba(176,38,255,0.5)]">
          Live Leaderboard
        </h1>
        <div className="h-1 w-32 bg-neon-blue mx-auto mt-6 rounded-full shadow-[0_0_10px_rgba(0,243,255,0.8)]"></div>
      </div>

      {/* Content */}
      <div className="w-full max-w-4xl z-10 flex flex-col gap-4">
        {!isRevealing ? (
          <div className="flex flex-col items-center justify-center mt-20">
            <motion.button
              whileHover={{ scale: 1.05, boxShadow: "0 0 30px rgba(0, 243, 255, 0.6)" }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsRevealing(true)}
              className="px-12 py-6 bg-neon-blue/10 border-2 border-neon-blue text-neon-blue font-black font-mono text-2xl uppercase tracking-[0.2em] rounded-2xl shadow-[0_0_15px_rgba(0,243,255,0.3)] transition-colors hover:bg-neon-blue/20"
            >
              Start Reveal Sequence
            </motion.button>
            <p className="mt-8 font-mono text-white/40 tracking-widest uppercase">
              {totalTeams} Teams Connected
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {teams.map((team, index) => {
              const rank = index + 1;
              const tabSwitches = presence[team.name]?.tabSwitches || 0;
              let rankStyle = "bg-dark-surface border-white/10 text-white";
              let rankText = "text-white/50";
              let shadow = "shadow-lg";

              // Special styling for Top 3
              if (rank === 1) {
                rankStyle = "bg-yellow-500/10 border-yellow-400 text-yellow-400";
                rankText = "text-yellow-400 font-black text-3xl";
                shadow = "shadow-[0_0_30px_rgba(250,204,21,0.3)]";
              } else if (rank === 2) {
                rankStyle = "bg-slate-300/10 border-slate-300 text-slate-300";
                rankText = "text-slate-300 font-black text-2xl";
                shadow = "shadow-[0_0_20px_rgba(203,213,225,0.2)]";
              } else if (rank === 3) {
                rankStyle = "bg-amber-700/10 border-amber-600 text-amber-500";
                rankText = "text-amber-500 font-black text-xl";
                shadow = "shadow-[0_0_15px_rgba(217,119,6,0.2)]";
              }

              return (
                <motion.div
                  key={team.id}
                  custom={index}
                  initial="hidden"
                  animate="visible"
                  variants={itemVariants}
                  className={`flex flex-col md:flex-row items-center justify-between p-6 rounded-2xl border backdrop-blur-md ${rankStyle} ${shadow}`}
                >
                  <div className="flex items-center gap-8 w-full md:w-auto">
                    <div className={`font-mono w-12 text-center ${rankText}`}>
                      #{rank}
                    </div>
                    <div className="text-2xl md:text-3xl font-bold tracking-wider uppercase font-mono flex-1">
                      {team.name}
                    </div>
                    {/* Cheat badge */}
                    {tabSwitches > 0 && (
                      <div className="flex items-center gap-1.5 bg-red-500/15 border border-red-500/40 px-3 py-1 rounded-full">
                        <span className="text-red-400 text-sm">⚠️</span>
                        <span className="text-red-400 font-mono text-xs font-bold uppercase tracking-widest">
                          {tabSwitches} Tab Switch{tabSwitches > 1 ? 'es' : ''}
                        </span>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-6 text-sm md:text-base font-mono flex-wrap justify-center md:justify-end mt-6 md:mt-0 w-full md:w-auto">
                    <div className="flex flex-col items-center">
                      <span className="text-white/40 text-[10px] md:text-xs uppercase tracking-widest mb-1">Buzzers</span>
                      <span className="font-bold">{team.buzzerPresses || 0}</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-white/40 text-[10px] md:text-xs uppercase tracking-widest mb-1">Correct</span>
                      <span className="font-bold text-neon-green">{team.correctAnswers || 0}</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-white/40 text-[10px] md:text-xs uppercase tracking-widest mb-1">Wrong</span>
                      <span className="font-bold text-red-500">{team.wrongAnswers || 0}</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-white/40 text-[10px] md:text-xs uppercase tracking-widest mb-1">Missed</span>
                      <span className="font-bold text-orange-400">{team.missedAnswers || 0}</span>
                    </div>
                    <div className="flex flex-col items-center ml-2 md:ml-4 pl-4 md:pl-6 border-l border-white/20">
                      <span className="text-white/40 text-[10px] md:text-xs uppercase tracking-widest mb-1">Score</span>
                      <span className={`font-black text-xl md:text-2xl ${rank === 1 ? 'text-yellow-400' : 'text-white'}`}>{team.score} PTS</span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
            
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: totalTeams * 1.5 + 1, duration: 1 }}
              className="mt-12 text-center"
            >
              <button 
                onClick={() => setIsRevealing(false)}
                className="text-white/30 font-mono text-sm hover:text-white transition-colors underline underline-offset-4"
              >
                Reset Display
              </button>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}
