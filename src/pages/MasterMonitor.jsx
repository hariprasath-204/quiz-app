import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '../firebase';
import { collection, doc, onSnapshot, query } from 'firebase/firestore';

// Mini status badge
function StatusBadge({ status, queue, teamName }) {
  const inQueue = queue?.includes(teamName);
  const isAnswering = status === 'answering' && queue?.[0] === teamName;

  if (isAnswering) return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-black font-mono uppercase tracking-widest bg-neon-blue/20 text-neon-blue border border-neon-blue/40 animate-pulse">
      ▶ Answering
    </span>
  );
  if (status === 'buzzer_open' && inQueue) return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-black font-mono uppercase tracking-widest bg-neon-pink/20 text-neon-pink border border-neon-pink/40">
      ⚡ Buzzed
    </span>
  );
  if (status === 'buzzer_open' && !inQueue) return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-black font-mono uppercase tracking-widest bg-neon-green/20 text-neon-green border border-neon-green/40 animate-pulse">
      🟢 Ready
    </span>
  );
  if (status === 'queue_processing' && inQueue) return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-black font-mono uppercase tracking-widest bg-cyan-400/20 text-cyan-400 border border-cyan-400/40">
      🔍 Verifying
    </span>
  );
  if (status === 'answering' && inQueue) return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-black font-mono uppercase tracking-widest bg-yellow-400/20 text-yellow-400 border border-yellow-400/40">
      ⏱ In Queue
    </span>
  );
  if (status === 'question_done') return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-black font-mono uppercase tracking-widest bg-white/10 text-white/40 border border-white/10">
      ➡ Next Q
    </span>
  );
  if (status === 'countdown') return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-black font-mono uppercase tracking-widest bg-neon-pink/20 text-neon-pink border border-neon-pink/40 animate-pulse">
      3-2-1
    </span>
  );
  if (status === 'game_over') return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-black font-mono uppercase tracking-widest bg-purple-500/20 text-purple-400 border border-purple-400/40">
      🏁 Game Over
    </span>
  );
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-black font-mono uppercase tracking-widest bg-white/5 text-white/30 border border-white/10">
      Locked
    </span>
  );
}

// Mini client card
function ClientCard({ team, gameState, presence }) {
  const { name, score = 0, correctAnswers = 0, wrongAnswers = 0, buzzerPresses = 0 } = team;
  const isOnline = presence && (Date.now() - (presence.lastSeenMs || 0)) < 35000;
  const queue = gameState?.queue || [];
  const queueTimes = gameState?.queueTimes || {};
  const inQueue = queue.includes(name);
  const queuePos = queue.indexOf(name) + 1;
  const responseMs = queueTimes[name];
  const isAnswering = gameState?.status === 'answering' && queue[0] === name;
  const status = gameState?.status;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`glass-panel rounded-2xl overflow-hidden border transition-all duration-300 ${
        isAnswering ? 'border-neon-blue shadow-[0_0_20px_rgba(0,243,255,0.25)]' :
        (status === 'buzzer_open' && inQueue) ? 'border-neon-pink shadow-[0_0_15px_rgba(255,0,127,0.2)]' :
        'border-white/10'
      }`}
    >
      {/* Header */}
      <div className={`px-4 py-3 flex items-center justify-between ${
        isAnswering ? 'bg-neon-blue/10' :
        (status === 'buzzer_open' && inQueue) ? 'bg-neon-pink/10' :
        'bg-white/5'
      }`}>
        <div className="flex items-center gap-2 min-w-0">
          {/* Online dot */}
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isOnline ? 'bg-neon-green animate-pulse' : 'bg-white/20'}`} />
          <span className="font-black font-mono text-sm text-white uppercase tracking-wide truncate">{name}</span>
        </div>
        <StatusBadge status={status} queue={queue} teamName={name} />
      </div>

      {/* Mini screen preview */}
      <div className="p-4 space-y-3">
        {/* Score */}
        <div className="flex justify-between items-center">
          <span className="text-white/30 font-mono text-[10px] uppercase tracking-widest">Score</span>
          <span className="text-yellow-400 font-black font-mono text-lg">{score} PTS</span>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-1 text-center">
          <div className="bg-white/5 rounded-lg py-1.5">
            <p className="text-neon-green font-black font-mono text-sm">{correctAnswers}</p>
            <p className="text-white/20 font-mono text-[8px] uppercase">Correct</p>
          </div>
          <div className="bg-white/5 rounded-lg py-1.5">
            <p className="text-red-400 font-black font-mono text-sm">{wrongAnswers}</p>
            <p className="text-white/20 font-mono text-[8px] uppercase">Wrong</p>
          </div>
          <div className="bg-white/5 rounded-lg py-1.5">
            <p className="text-neon-blue font-black font-mono text-sm">{buzzerPresses}</p>
            <p className="text-white/20 font-mono text-[8px] uppercase">Buzzed</p>
          </div>
        </div>

        {/* Queue position if in queue */}
        {inQueue && (
          <div className="bg-neon-pink/5 border border-neon-pink/20 rounded-xl p-2 flex justify-between items-center">
            <span className="text-neon-pink font-mono text-[10px] uppercase tracking-widest">Queue #{queuePos}</span>
            {responseMs != null && (
              <span className={`font-black font-mono text-sm ${responseMs < 1000 ? 'text-neon-green' : responseMs < 3000 ? 'text-yellow-400' : 'text-orange-400'}`}>
                {responseMs < 1000 ? `${responseMs}ms` : `${(responseMs/1000).toFixed(2)}s`}
              </span>
            )}
          </div>
        )}

        {/* Answering indicator */}
        {isAnswering && (
          <motion.div
            animate={{ opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 1, repeat: Infinity }}
            className="bg-neon-blue/10 border border-neon-blue/30 rounded-xl p-2 text-center"
          >
            <span className="text-neon-blue font-black font-mono text-xs uppercase tracking-widest">▶ Answering Now</span>
          </motion.div>
        )}

        {/* Online status */}
        <div className="text-center">
          <span className={`font-mono text-[10px] ${isOnline ? 'text-neon-green/60' : 'text-white/20'}`}>
            {isOnline ? '● Online' : '○ Offline / Not joined'}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

export default function MasterMonitor() {
  const [teams, setTeams] = useState([]);
  const [gameState, setGameState] = useState(null);
  const [presence, setPresence] = useState({});
  const [now, setNow] = useState(Date.now());

  // Tick every 5s to refresh online status
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const unSubState = onSnapshot(doc(db, 'game_state', 'current'), s => setGameState(s.data()));
    const unSubTeams = onSnapshot(query(collection(db, 'teams')), s => {
      const t = [];
      s.forEach(d => t.push({ id: d.id, ...d.data() }));
      t.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if ((b.correctAnswers||0) !== (a.correctAnswers||0)) return (b.correctAnswers||0) - (a.correctAnswers||0);
        return (b.buzzerPresses||0) - (a.buzzerPresses||0);
      });
      setTeams(t);
    });
    const unSubPresence = onSnapshot(collection(db, 'presence'), s => {
      const p = {};
      s.forEach(d => { p[d.id] = d.data(); });
      setPresence(p);
    });
    return () => { unSubState(); unSubTeams(); unSubPresence(); };
  }, []);

  const onlineCount = teams.filter(t => {
    const p = presence[t.name];
    return p && (now - (p.lastSeenMs || 0)) < 35000;
  }).length;

  const statusLabel = {
    'waiting': 'Waiting',
    'countdown': '3-2-1 Countdown',
    'buzzer_open': '⚡ Buzzer Open',
    'queue_processing': '🔍 Verifying Queue',
    'answering': '▶ Team Answering',
    'evaluating': 'Evaluating',
    'pass_to_next': 'Passing to Next',
    'question_done': '✅ Question Done',
    'game_over': '🏁 Game Over',
  };

  return (
    <div className="min-h-screen p-8">
      {/* Header */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-4xl font-black font-mono uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-neon-blue to-neon-purple mb-1">
            📺 Master Monitor
          </h1>
          <p className="text-white/30 font-mono text-sm">Live view of all connected client screens</p>
        </div>

        <div className="flex gap-4 items-center">
          {/* Online count */}
          <div className="glass-panel px-5 py-3 rounded-xl border border-neon-green/30 flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-neon-green animate-pulse" />
            <span className="font-mono text-neon-green font-bold">{onlineCount} / {teams.length} Online</span>
          </div>

          {/* Game status */}
          <div className="glass-panel px-5 py-3 rounded-xl border border-neon-blue/30">
            <span className="font-mono text-neon-blue font-bold text-sm">
              {statusLabel[gameState?.status] || gameState?.status || 'Connecting...'}
            </span>
          </div>
        </div>
      </div>

      {/* Active question bar */}
      {gameState?.activeQ && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel px-6 py-4 rounded-xl border border-white/10 mb-8 flex items-center gap-4"
        >
          <span className="text-white/30 font-mono text-xs uppercase tracking-widest flex-shrink-0">Active Q</span>
          <span className="text-white font-bold font-mono">{gameState.activeQ.text}</span>
          <span className="ml-auto text-neon-blue font-mono text-xs flex-shrink-0">
            Round {gameState.activeQ.round === 'tie_breaker' ? 'TB' : gameState.activeQ.round}
          </span>
        </motion.div>
      )}

      {/* Client grid */}
      {teams.length === 0 ? (
        <div className="glass-panel p-16 rounded-2xl text-center">
          <p className="text-white/20 font-mono text-lg italic">No teams registered yet.</p>
        </div>
      ) : (
        <motion.div
          layout
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
        >
          <AnimatePresence>
            {teams.map(team => (
              <ClientCard
                key={team.id}
                team={team}
                gameState={gameState}
                presence={presence[team.name]}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
