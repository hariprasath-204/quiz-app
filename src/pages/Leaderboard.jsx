import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';

export default function Leaderboard() {
  const [teams, setTeams] = useState([]);
  const [isRevealing, setIsRevealing] = useState(false);

  useEffect(() => {
    const unSubTeams = onSnapshot(collection(db, "teams"), (s) => {
      const t = [];
      s.forEach(d => t.push({ id: d.id, ...d.data() }));
      // Sort descending (Rank 1 at index 0)
      setTeams(t.sort((a, b) => b.score - a.score));
    });
    return () => unSubTeams();
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
                  className={`flex items-center justify-between p-6 rounded-2xl border backdrop-blur-md ${rankStyle} ${shadow}`}
                >
                  <div className="flex items-center gap-8">
                    <div className={`font-mono w-12 text-center ${rankText}`}>
                      #{rank}
                    </div>
                    <div className="text-2xl md:text-3xl font-bold tracking-wider uppercase font-mono">
                      {team.name}
                    </div>
                  </div>
                  <div className="text-3xl md:text-4xl font-black font-mono tracking-widest drop-shadow-md">
                    {team.score} <span className="text-sm font-medium text-opacity-50">PTS</span>
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
