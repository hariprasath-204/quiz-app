import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '../firebase';
import { collection, doc, onSnapshot, setDoc, updateDoc, query } from 'firebase/firestore';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export default function MasterMonitor() {
  const [teams, setTeams] = useState([]);
  const [gameState, setGameState] = useState(null);
  const [presence, setPresence] = useState({});
  const [signals, setSignals] = useState({});
  const [streams, setStreams] = useState({});
  const [fullscreenTeam, setFullscreenTeam] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [stealthMode, setStealthMode] = useState(false);

  const pcsRef = useRef({});
  const videoRefs = useRef({});
  const processedOffers = useRef(new Set());

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const u1 = onSnapshot(doc(db, 'game_state', 'current'), s => setGameState(s.data()));
    const u2 = onSnapshot(query(collection(db, 'teams')), s => {
      const t = [];
      s.forEach(d => t.push({ id: d.id, ...d.data() }));
      t.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if ((b.correctAnswers || 0) !== (a.correctAnswers || 0)) return (b.correctAnswers || 0) - (a.correctAnswers || 0);
        return (b.buzzerPresses || 0) - (a.buzzerPresses || 0);
      });
      setTeams(t);
    });
    const u3 = onSnapshot(collection(db, 'presence'), s => {
      const p = {}; s.forEach(d => { p[d.id] = d.data(); }); setPresence(p);
    });
    const u4 = onSnapshot(collection(db, 'webrtc_signals'), s => {
      const sig = {}; s.forEach(d => { sig[d.id] = d.data(); }); setSignals(sig);
    });
    return () => { u1(); u2(); u3(); u4(); };
  }, []);

  // Create WebRTC answer whenever a new offer arrives
  useEffect(() => {
    Object.entries(signals).forEach(async ([teamName, signal]) => {
      if (!signal?.offer) return;
      const offerKey = `${teamName}:${signal.offer.sdp?.slice(0, 40)}`;
      if (processedOffers.current.has(offerKey)) return;
      processedOffers.current.add(offerKey);

      // Close any old connection
      if (pcsRef.current[teamName]) {
        pcsRef.current[teamName].close();
      }

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcsRef.current[teamName] = pc;

      pc.ontrack = (e) => {
        setStreams(prev => ({ ...prev, [teamName]: e.streams[0] }));
      };

      pc.onconnectionstatechange = () => {
        if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
          setStreams(prev => { const n = { ...prev }; delete n[teamName]; return n; });
          processedOffers.current.delete(offerKey);
        }
      };

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        // Vanilla ICE — wait for all candidates
        await new Promise(resolve => {
          if (pc.iceGatheringState === 'complete') { resolve(); return; }
          const check = () => { if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', check); resolve(); } };
          pc.addEventListener('icegatheringstatechange', check);
          setTimeout(resolve, 6000);
        });

        const final = pc.localDescription;
        await setDoc(doc(db, 'webrtc_signals', teamName), {
          answer: { type: final.type, sdp: final.sdp }
        }, { merge: true });
      } catch (err) {
        console.error(`WebRTC error [${teamName}]:`, err);
        processedOffers.current.delete(offerKey);
      }
    });
  }, [signals]);

  // Attach streams to video elements
  useEffect(() => {
    Object.entries(streams).forEach(([teamName, stream]) => {
      const el = videoRefs.current[teamName];
      if (el && el.srcObject !== stream) { el.srcObject = stream; el.play().catch(() => {}); }
    });
  }, [streams]);

  const isOnline = (name) => { const p = presence[name]; return p && (now - (p.lastSeenMs || 0)) < 35000; };
  const cols = teams.length <= 1 ? 1 : teams.length <= 4 ? 2 : teams.length <= 9 ? 3 : 4;
  const queue = gameState?.queue || [];

  const stopTeamShare = async (teamName) => {
    await setDoc(doc(db, 'webrtc_signals', teamName), { forceStop: true }, { merge: true });
  };

  const statusColor = {
    buzzer_open: 'text-neon-green', answering: 'text-neon-blue',
    queue_processing: 'text-cyan-400', countdown: 'text-neon-pink',
    question_done: 'text-white/40', game_over: 'text-purple-400',
  };

  return (
    <div className="h-screen bg-dark-bg p-4 flex flex-col gap-3 overflow-y-auto">
      {/* Header */}
      <div className="flex justify-between items-center flex-shrink-0">
        <h1 className="text-2xl font-black font-mono uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-neon-blue to-neon-purple">
          📺 Master Monitor
        </h1>
          <button
              onClick={() => setStealthMode(v => !v)}
              title="Stealth Mode: hides video feeds so entire-screen sharing doesn't mirror"
              className={`px-4 py-2 rounded-lg font-mono text-sm font-bold border transition-all ${
                stealthMode
                  ? 'bg-yellow-500/20 border-yellow-500/60 text-yellow-400'
                  : 'bg-white/5 border-white/20 text-white/40 hover:text-white'
              }`}
            >
              {stealthMode ? '🫥 Stealth ON' : '👁 Stealth OFF'}
            </button>
          <div className="glass-panel px-4 py-2 rounded-lg border border-neon-green/30 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-neon-green animate-pulse" />
            <span className="font-mono text-neon-green text-sm font-bold">
              {teams.filter(t => isOnline(t.name)).length}/{teams.length} Online
            </span>
          </div>
          <div className="glass-panel px-4 py-2 rounded-lg border border-neon-blue/30">
            <span className={`font-mono text-sm font-bold ${statusColor[gameState?.status] || 'text-white/40'}`}>
              {gameState?.status?.replace(/_/g, ' ').toUpperCase() || 'CONNECTING...'}
            </span>
          </div>
        </div>
      </div>

      {/* Active question bar */}
      {gameState?.activeQ && (
        <div className="glass-panel px-4 py-2 rounded-lg border border-white/10 flex-shrink-0">
          <span className="text-white/30 font-mono text-xs uppercase tracking-widest mr-3">Q:</span>
          <span className="text-white font-mono text-sm">{gameState.activeQ.text}</span>
          <span className="ml-auto text-neon-blue font-mono text-xs">Round {gameState.activeQ.round}</span>
        </div>
      )}

      {/* Fullscreen overlay */}
      <AnimatePresence>
        {fullscreenTeam && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black flex flex-col">
            <div className="flex justify-between items-center px-4 py-3 bg-dark-bg border-b border-white/10">
              <div className="flex items-center gap-4">
                <span className="font-mono font-bold text-white text-lg uppercase">{fullscreenTeam}</span>
                {(presence[fullscreenTeam]?.tabSwitches || 0) > 0 && (
                  <span className="bg-red-500/20 text-red-400 border border-red-500/40 px-3 py-1 rounded-full font-mono text-sm font-bold">
                    ⚠️ {presence[fullscreenTeam].tabSwitches} Tab Switch{presence[fullscreenTeam].tabSwitches > 1 ? 'es' : ''}
                  </span>
                )}
                {teams.find(t => t.name === fullscreenTeam) && (
                  <span className="text-yellow-400 font-mono font-bold">
                    {teams.find(t => t.name === fullscreenTeam)?.score || 0} PTS
                  </span>
                )}
              </div>
              <button onClick={() => setFullscreenTeam(null)}
                className="text-white/60 hover:text-white font-mono text-sm border border-white/20 px-4 py-2 rounded-lg transition-colors">
                ✕ Close Fullscreen
              </button>
            </div>
            <div className="flex-1 bg-black flex items-center justify-center">
              {streams[fullscreenTeam] ? (
                <video ref={el => { if (el) { videoRefs.current[`fs_${fullscreenTeam}`] = el; el.srcObject = streams[fullscreenTeam]; el.play().catch(() => {}); } }}
                  autoPlay muted playsInline className="w-full h-full object-contain" />
              ) : (
                <div className="text-center">
                  <p className="text-5xl mb-4">📡</p>
                  <p className="text-white/20 font-mono text-lg">No screen shared by {fullscreenTeam}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Grid */}
      <div className="flex-1" style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '12px' }}>
        {teams.map(team => {
          const online = isOnline(team.name);
          const hasStream = !!streams[team.name];
          const tabSwitches = presence[team.name]?.tabSwitches || 0;
          const inQueue = queue.includes(team.name);
          const isAnswering = gameState?.status === 'answering' && queue[0] === team.name;
          const ms = gameState?.queueTimes?.[team.name];

          return (
            <div key={team.id} className={`glass-panel rounded-xl overflow-hidden flex flex-col border transition-all ${
              isAnswering ? 'border-neon-blue shadow-[0_0_20px_rgba(0,243,255,0.2)]' :
              (gameState?.status === 'buzzer_open' && inQueue) ? 'border-neon-pink' : 'border-white/10'
            }`}>
              {/* Card header */}
              <div className={`px-3 py-2 flex items-center justify-between flex-shrink-0 ${
                isAnswering ? 'bg-neon-blue/10' :
                (gameState?.status === 'buzzer_open' && inQueue) ? 'bg-neon-pink/10' : 'bg-white/5'
              }`}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${online ? 'bg-neon-green animate-pulse' : 'bg-white/20'}`} />
                  <span className="font-mono font-bold text-white text-sm uppercase truncate">{team.name}</span>
                  {tabSwitches > 0 && (
                    <span className="bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold flex-shrink-0">
                      ⚠️{tabSwitches}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-yellow-400 font-mono text-xs font-bold">{team.score || 0}p</span>
                  {streams[team.name] && (
                    <button onClick={() => stopTeamShare(team.name)}
                      className="text-red-400/60 hover:text-red-400 text-xs transition-colors font-mono" title="Stop screen share">
                      ⊗
                    </button>
                  )}
                  <button onClick={() => setFullscreenTeam(team.name)}
                    className="text-white/30 hover:text-white text-sm transition-colors" title="Fullscreen">⛶</button>
                </div>
              </div>

              {/* Video / placeholder */}
              <div className="relative bg-black" style={{ aspectRatio: '16/9', minHeight: 120 }}>
                {/* In stealth mode hide video to prevent mirror loop */}
                <video ref={el => { if (el) videoRefs.current[team.name] = el; }}
                  autoPlay muted playsInline
                  className={`w-full h-full object-contain bg-black ${
                    hasStream && !stealthMode ? 'block' : 'hidden'
                  }`} />

                {/* Stealth mode overlay */}
                {stealthMode && (
                  <div className="absolute inset-0 bg-black flex flex-col items-center justify-center gap-1">
                    <span className="text-yellow-400/40 font-mono text-[9px] uppercase tracking-widest">Stealth</span>
                    <span className={`text-white/20 font-mono text-[10px] ${hasStream ? 'text-neon-green/30' : ''}`}>
                      {hasStream ? '● Live' : '○ No stream'}
                    </span>
                  </div>
                )}

                {!hasStream && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-b from-dark-bg/60 to-black/80">
                    {/* SVG monitor icon */}
                    <svg width="48" height="38" viewBox="0 0 48 38" fill="none" xmlns="http://www.w3.org/2000/svg" opacity="0.25">
                      <rect x="1" y="1" width="46" height="30" rx="3" stroke="white" strokeWidth="2" fill="none"/>
                      <line x1="17" y1="31" x2="13" y2="37" stroke="white" strokeWidth="2"/>
                      <line x1="31" y1="31" x2="35" y2="37" stroke="white" strokeWidth="2"/>
                      <line x1="12" y1="37" x2="36" y2="37" stroke="white" strokeWidth="2"/>
                      <circle cx="24" cy="16" r="6" stroke="white" strokeWidth="1.5" fill="none"/>
                      <line x1="24" y1="10" x2="24" y2="22" stroke="white" strokeWidth="1" strokeDasharray="2 2"/>
                      <line x1="18" y1="16" x2="30" y2="16" stroke="white" strokeWidth="1" strokeDasharray="2 2"/>
                    </svg>
                    <p className={`font-mono text-[10px] font-bold uppercase tracking-widest ${
                      online ? 'text-white/25' : 'text-white/15'
                    }`}>
                      {online ? 'Not Sharing' : 'Offline'}
                    </p>
                  </div>
                )}

                {/* Status overlays */}
                {isAnswering && (
                  <div className="absolute bottom-1 left-1 right-1 bg-neon-blue/90 rounded py-0.5 text-center">
                    <span className="text-white font-black font-mono text-[9px] uppercase tracking-widest">▶ Answering</span>
                  </div>
                )}
                {!isAnswering && inQueue && gameState?.status === 'buzzer_open' && (
                  <div className="absolute bottom-1 left-1 right-1 bg-neon-pink/90 rounded py-0.5 text-center">
                    <span className="text-white font-black font-mono text-[9px] uppercase tracking-widest">
                      ⚡ {ms != null ? (ms < 1000 ? `${ms}ms` : `${(ms/1000).toFixed(2)}s`) : 'Buzzed'}
                    </span>
                  </div>
                )}
              </div>

              {/* Mini stats footer */}
              <div className="px-3 py-1.5 bg-white/3 flex justify-between text-[9px] font-mono flex-shrink-0">
                <span className="text-neon-green">{team.correctAnswers || 0}✓</span>
                <span className="text-red-400">{team.wrongAnswers || 0}✗</span>
                <span className="text-neon-blue">{team.buzzerPresses || 0}⚡</span>
                <span className="text-white/30">{team.missedAnswers || 0}⏱</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
