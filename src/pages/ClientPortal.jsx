import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db, auth } from '../firebase';
import { doc, onSnapshot, updateDoc, getDocs, collection, query, arrayUnion, increment, addDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';

export default function ClientPortal() {
  const [myTeam, setMyTeam] = useState('');
  const [teamDocId, setTeamDocId] = useState(null); // cached team doc ID
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

  // Presence heartbeat — write to Firestore so Master Monitor knows who's online
  useEffect(() => {
    if (!isJoined || !myTeam) return;
    const writePresence = () => {
      setDoc(doc(db, 'presence', myTeam), {
        teamName: myTeam,
        lastSeenMs: Date.now(),
        online: true,
      }, { merge: true }).catch(() => {});
    };
    writePresence(); // immediate
    const hb = setInterval(writePresence, 20000); // every 20s
    const markOffline = () => {
      setDoc(doc(db, 'presence', myTeam), { online: false, lastSeenMs: Date.now() }, { merge: true }).catch(() => {});
    };
    window.addEventListener('beforeunload', markOffline);
    return () => {
      clearInterval(hb);
      window.removeEventListener('beforeunload', markOffline);
      markOffline();
    };
  }, [isJoined, myTeam]);

  // ── Tab-switch / anti-cheat detection ─────────────────────────────────────
  useEffect(() => {
    if (!isJoined || !myTeam) return;
    const onHide = () => {
      if (document.hidden) {
        setDoc(doc(db, 'presence', myTeam), {
          tabSwitches: (window.__tabSwitches = (window.__tabSwitches || 0) + 1),
          lastTabSwitch: Date.now(),
        }, { merge: true }).catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [isJoined, myTeam]);

  // ── WebRTC screen share ────────────────────────────────────────────────────
  const [isSharing, setIsSharing] = useState(false);
  const pcRef = useRef(null);

  const startScreenShare = async () => {
    // Warn before showing picker
    const ok = window.confirm(
      '📺 Screen Share\n\n' +
      'Select "Entire Screen", "Window", or "Tab" in the picker.\n\n' +
      '⚠️ If the Monitor page is visible on your screen, ask\n' +
      '   admin to enable Stealth Mode first to prevent mirroring.\n\n' +
      'Click OK to open the screen picker.'
    );
    if (!ok) return;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: false,
      });
      setIsSharing(true);

      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      });
      pcRef.current = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      // Stop sharing if user clicks "Stop sharing" in browser UI
      stream.getVideoTracks()[0].onended = () => {
        setIsSharing(false);
        pc.close();
        setDoc(doc(db, 'webrtc_signals', myTeam), { offer: null, answer: null }, { merge: true }).catch(() => {});
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Vanilla ICE — wait for all candidates before sending offer
      await new Promise(resolve => {
        if (pc.iceGatheringState === 'complete') { resolve(); return; }
        const check = () => { if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', check); resolve(); } };
        pc.addEventListener('icegatheringstatechange', check);
        setTimeout(resolve, 6000);
      });

      const finalOffer = pc.localDescription;
      await setDoc(doc(db, 'webrtc_signals', myTeam), {
        offer: { type: finalOffer.type, sdp: finalOffer.sdp },
        answer: null,
        teamName: myTeam,
      }, { merge: true });

      // Watch Firestore for monitor's answer OR admin forceStop
      const unsub = onSnapshot(doc(db, 'webrtc_signals', myTeam), async snap => {
        const data = snap.data();
        if (data?.forceStop) {
          // Admin stopped this team's share
          pc.close();
          stream.getTracks().forEach(t => t.stop());
          setIsSharing(false);
          await setDoc(doc(db, 'webrtc_signals', myTeam), { offer: null, answer: null, forceStop: false }, { merge: true }).catch(() => {});
          unsub();
          return;
        }
        if (data?.answer && !pc.currentRemoteDescription) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
            // Don't unsub — keep watching for forceStop
          } catch (e) { console.error('setRemoteDesc error:', e); }
        }
      });
    } catch (err) {
      if (err.name !== 'NotAllowedError') console.error('Screen share error:', err);
      setIsSharing(false);
    }
  };

  const stopScreenShare = () => {
    pcRef.current?.close();
    setIsSharing(false);
    setDoc(doc(db, 'webrtc_signals', myTeam), { offer: null, answer: null }, { merge: true }).catch(() => {});
  };

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
          setTeamDocId(d.id); // cache the doc ID for later use
          setMyTeam(d.data().name); // normalize the name to match firebase
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

    // Compute response time since buzzer was opened
    const responseMs = gameState?.buzzerOpenedAt 
      ? Date.now() - gameState.buzzerOpenedAt 
      : null;

    // Add to queue and record this team's response time in queueTimes map
    const updatePayload = { queue: arrayUnion(myTeam) };
    if (responseMs != null) {
      updatePayload[`queueTimes.${myTeam}`] = responseMs;
    }
    await updateDoc(docRef, updatePayload);

    // Write a permanent buzzer event log entry
    try {
      await addDoc(collection(db, "buzzer_events"), {
        team: myTeam,
        responseMs,
        questionText: gameState?.activeQ?.text || '',
        questionId: gameState?.activeQ?.id || '',
        round: gameState?.activeQ?.round || 1,
        pressedAt: serverTimestamp()
      });
    } catch (err) {
      console.error("Failed to log buzzer event", err);
    }

    // Atomically increment buzzerPresses using cached teamDocId
    if (teamDocId) {
      try {
        await updateDoc(doc(db, "teams", teamDocId), { buzzerPresses: increment(1) });
      } catch (err) {
        console.error("Failed to update buzzer metrics", err);
      }
    }
  };

  const handleAns = async (idx, correctIdx, currentQueue) => {
    const docRef = doc(db, "game_state", "current");
    await updateDoc(docRef, { status: "evaluating" });

    if (idx === correctIdx) {
      const points = gameState?.currentPoints || [10, 7, 5, 3];
      const turnIndex = gameState?.attempts || 0;
      const pts = points[turnIndex] || 0;

      if (teamDocId) {
        await updateDoc(doc(db, "teams", teamDocId), { 
          score: increment(pts),
          correctAnswers: increment(1)
        });
      }
      
      setPopup({ type: 'correct', msg: 'CORRECT!' });
      setTimeout(async () => {
        setPopup(null);
        // Mark question as done so clients see the "Next Question" screen
        await updateDoc(docRef, { status: "question_done", queue: [], timerValue: 0, attempts: 0 });
      }, 2500);

    } else {
      if (teamDocId) {
        await updateDoc(doc(db, "teams", teamDocId), { 
          wrongAnswers: increment(1)
        });
      }

      setPopup({ type: 'wrong', msg: 'WRONG! Pass to next team.' });
      setTimeout(async () => {
        setPopup(null);
        const newQueue = currentQueue.slice(1);
        if (newQueue.length > 0) {
          await updateDoc(docRef, { queue: newQueue, status: "pass_to_next", attempts: (gameState?.attempts || 0) + 1 });
        } else {
          // All teams exhausted — nobody got it right
          await updateDoc(docRef, { status: "question_done", queue: [], timerValue: 0, attempts: 0 });
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

  // === GAME OVER SCREEN ===
  if (status === 'game_over') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden bg-dark-bg">

        {/* Pulsing neon ring layers */}
        {[0,1,2,3].map(i => (
          <motion.div
            key={i}
            className="absolute rounded-full border-2"
            style={{ borderColor: ['#00f3ff','#b026ff','#ff007f','#00ff66'][i] }}
            animate={{ scale: [0.5, 3], opacity: [0.6, 0] }}
            transition={{ duration: 3, repeat: Infinity, delay: i * 0.75, ease: 'easeOut' }}
          />
        ))}

        {/* Horizontal scanline sweep */}
        <motion.div
          className="absolute left-0 right-0 h-0.5 bg-neon-blue/40 z-0 pointer-events-none"
          animate={{ top: ['0%', '100%'] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
        />

        {/* Vertical scan */}
        <motion.div
          className="absolute top-0 bottom-0 w-0.5 bg-neon-purple/30 z-0 pointer-events-none"
          animate={{ left: ['0%', '100%'] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'linear', delay: 1 }}
        />

        <div className="z-10 flex flex-col items-center text-center px-6">

          {/* Glitch-style GAME OVER text */}
          <div className="relative mb-6 select-none">
            <motion.h1
              initial={{ opacity: 0, scale: 1.4 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, type: 'spring' }}
              className="text-6xl md:text-8xl font-black uppercase tracking-widest font-mono text-transparent bg-clip-text bg-gradient-to-r from-neon-blue via-neon-purple to-neon-pink drop-shadow-[0_0_40px_rgba(176,38,255,0.8)]"
            >
              GAME OVER
            </motion.h1>
            {/* Glitch shadow layers */}
            <motion.h1
              aria-hidden
              animate={{ x: [-2, 2, -2], opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 0.15, repeat: Infinity, repeatDelay: 3 }}
              className="absolute inset-0 text-6xl md:text-8xl font-black uppercase tracking-widest font-mono text-neon-pink pointer-events-none"
              style={{ clipPath: 'inset(40% 0 50% 0)' }}
            >
              GAME OVER
            </motion.h1>
            <motion.h1
              aria-hidden
              animate={{ x: [2, -2, 2], opacity: [0.3, 0.5, 0.3] }}
              transition={{ duration: 0.12, repeat: Infinity, repeatDelay: 3.5 }}
              className="absolute inset-0 text-6xl md:text-8xl font-black uppercase tracking-widest font-mono text-neon-blue pointer-events-none"
              style={{ clipPath: 'inset(60% 0 20% 0)' }}
            >
              GAME OVER
            </motion.h1>
          </div>

          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.5, duration: 0.8 }}
            className="h-0.5 w-64 bg-gradient-to-r from-neon-blue to-neon-pink mb-8 rounded-full shadow-[0_0_15px_rgba(176,38,255,0.6)]"
          />

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.6 }}
            className="text-xl md:text-2xl font-mono text-white/60 uppercase tracking-[0.4em] mb-12"
          >
            Thanks for Playing!
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1, duration: 0.5 }}
            className="glass-panel px-12 py-6 rounded-2xl border border-neon-blue/40 shadow-[0_0_30px_rgba(0,243,255,0.15)]"
          >
            <p className="text-neon-blue font-mono text-sm uppercase tracking-widest mb-2">Your Team</p>
            <p className="text-white font-black text-4xl md:text-5xl uppercase font-mono tracking-widest">{myTeam}</p>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.6, 0] }}
            transition={{ delay: 2.5, duration: 2.5, repeat: Infinity }}
            className="mt-14 text-white/30 font-mono uppercase tracking-[0.2em] text-xs"
          >
            ▸ Check the leaderboard for final standings ◂
          </motion.p>
        </div>
      </div>
    );
  }

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
        
        {/* Screen share bar — no stop button for client, admin controls it */}
      <div className={`flex items-center justify-between px-5 py-2 border-b flex-shrink-0 ${
        isSharing ? 'bg-neon-green/10 border-neon-green/30' : 'bg-red-500/5 border-red-500/20'
      }`}>
        <div className="flex items-center gap-3">
          <span className={`w-2 h-2 rounded-full ${isSharing ? 'bg-neon-green animate-pulse' : 'bg-red-500'}`} />
          <span className={`font-mono text-xs font-bold uppercase tracking-widest ${
            isSharing ? 'text-neon-green' : 'text-red-400'
          }`}>
            {isSharing ? 'Screen Sharing — Admin can view your screen' : 'Screen not shared — click to start'}
          </span>
        </div>
        {!isSharing && (
          <button onClick={startScreenShare}
            className="bg-neon-green/20 text-neon-green border border-neon-green/40 px-4 py-1.5 rounded-lg font-mono text-xs font-bold hover:bg-neon-green/30 transition-all shadow-[0_0_10px_rgba(0,255,102,0.2)] flex items-center gap-2">
            📺 Share Screen
          </button>
        )}
      </div>
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

        {/* QUESTION DONE OVERLAY — waiting for admin to push next question */}
        <AnimatePresence>
          {status === "question_done" && (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-dark-bg/95 backdrop-blur-xl rounded-3xl border border-neon-green/20"
            >
              {/* Round badge */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                className="bg-neon-blue/10 border border-neon-blue/40 px-8 py-2 rounded-full mb-8"
              >
                <span className="text-neon-blue font-mono font-bold uppercase tracking-[0.4em] text-sm">
                  Round {gameState?.activeQ?.round === 'tie_breaker' ? 'Tie Breaker' : (gameState?.activeQ?.round || 1)}
                </span>
              </motion.div>

              {/* Animated checkmark / arrow */}
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                className="text-7xl mb-6"
              >
                ➡️
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
                className="text-3xl md:text-4xl font-black font-mono uppercase tracking-widest text-white mb-3 text-center"
              >
                Next Question
              </motion.h1>

              <motion.p
                animate={{ opacity: [0.4, 0.9, 0.4] }}
                transition={{ duration: 2.5, repeat: Infinity }}
                className="text-white/40 font-mono text-sm uppercase tracking-[0.35em] text-center"
              >
                Waiting for admin to push next question...
              </motion.p>

              {/* Locked buzzer indicator */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="mt-10 flex items-center gap-3 bg-white/5 border border-white/10 px-6 py-3 rounded-full"
              >
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-white/30 font-mono text-xs uppercase tracking-widest">Buzzer Locked</span>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* QUEUE PROCESSING OVERLAY — admin is verifying */}
        <AnimatePresence>
          {status === "queue_processing" && !isLockedByTieBreaker && (
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-dark-bg/95 backdrop-blur-xl rounded-3xl border border-cyan-400/20"
            >
              {/* Spinning radar ring */}
              <div className="relative w-36 h-36 mb-10">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  className="absolute inset-0 rounded-full border-4 border-transparent border-t-cyan-400 border-r-cyan-400/30"
                />
                <motion.div
                  animate={{ rotate: -360 }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                  className="absolute inset-4 rounded-full border-4 border-transparent border-t-neon-purple border-r-neon-purple/20"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <motion.span
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="text-4xl"
                  >🔍</motion.span>
                </div>
              </div>

              <motion.h1
                animate={{ opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="text-2xl md:text-3xl font-black font-mono uppercase tracking-widest text-cyan-400 mb-3 text-center"
              >
                Admin Verifying Queue
              </motion.h1>

              <p className="text-white/40 font-mono text-sm uppercase tracking-[0.3em] mb-8 text-center">
                Please wait — answer panel opening soon
              </p>

              {/* Show this team's position in queue if they buzzed */}
              {queue && queue.includes(myTeam) && (() => {
                const times = gameState?.queueTimes || {};
                const sorted = [...queue].sort((a, b) => (times[a] ?? Infinity) - (times[b] ?? Infinity));
                const pos = sorted.indexOf(myTeam) + 1;
                const ms = times[myTeam];
                return (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="glass-panel px-10 py-5 rounded-2xl border border-cyan-400/30 text-center"
                  >
                    <p className="text-cyan-400 font-mono text-xs uppercase tracking-widest mb-1">Your Position</p>
                    <p className="text-white font-black text-4xl font-mono">#{pos}</p>
                    {ms != null && (
                      <p className="text-white/30 font-mono text-xs mt-1">
                        Response: {ms < 1000 ? `${ms}ms` : `${(ms/1000).toFixed(3)}s`}
                      </p>
                    )}
                  </motion.div>
                );
              })()}

              {/* Team didn't buzz */}
              {(!queue || !queue.includes(myTeam)) && (
                <p className="text-white/20 font-mono text-sm italic">You did not press the buzzer this round.</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* BUZZER AREA */}
        {status !== "answering" && status !== "evaluating" && status !== "countdown" && status !== "round_transition" && status !== "queue_processing" && status !== "question_done" && !isLockedByTieBreaker && (
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
