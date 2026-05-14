import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center p-4 font-mono">

      {/* ── Top bordered college panel (like image reference) ── */}
      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="z-10 border border-neon-blue/60 px-10 py-6 text-center mb-12 shadow-[0_0_20px_rgba(255,109,0,0.25)] backdrop-blur-sm"
      >
        <h3 className="text-white font-bold tracking-[0.15em] uppercase text-base md:text-lg leading-snug">
          Ayya Nadar Janaki Ammal College
        </h3>
        <p className="text-neon-blue font-bold tracking-[0.2em] uppercase text-sm md:text-base mt-1 drop-shadow-[0_0_6px_rgba(255,109,0,0.7)]">
          Department of Computer Applications
        </p>
      </motion.div>

      {/* ── Main title ── */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.9, delay: 0.3 }}
        className="z-10 text-center mb-4"
      >
        <h1 className="text-[4rem] md:text-[6rem] lg:text-[8rem] font-black uppercase tracking-widest leading-none text-neon-blue drop-shadow-[0_0_30px_rgba(255,109,0,0.8)]">
          SOFTTECH
        </h1>
        <h2 className="text-[2rem] md:text-[3.5rem] lg:text-[4.5rem] font-black uppercase tracking-[0.25em] leading-none text-neon-pink drop-shadow-[0_0_20px_rgba(255,196,0,0.7)] mt-1">
          ASSOCIATION
        </h2>
      </motion.div>

      {/* ── Subtitle ── */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.6 }}
        className="z-10 text-white/80 tracking-[0.35em] uppercase text-sm md:text-base mb-12"
      >
        The Ultimate Quiz Challenge
      </motion.p>

      {/* ── CTA Button ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.9 }}
        className="z-10"
      >
        <button
          onClick={() => navigate('/arena')}
          className="group relative px-10 py-4 font-mono font-bold tracking-[0.3em] uppercase overflow-hidden border border-neon-blue text-neon-blue hover:text-dark-bg transition-colors duration-300 text-sm md:text-base shadow-[0_0_15px_rgba(255,109,0,0.3)] hover:shadow-[0_0_30px_rgba(255,109,0,0.6)]"
        >
          <div className="absolute inset-0 bg-neon-blue scale-x-0 group-hover:scale-x-100 origin-left transition-transform duration-300 ease-out" />
          <span className="relative z-10">
            &gt;&nbsp;START_SYSTEM
          </span>
        </button>
      </motion.div>

      {/* ── Footer ── */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 1.2 }}
        className="z-10 absolute bottom-5 text-white/30 text-xs tracking-widest text-center font-mono"
      >
        © 2026 Ayya Nadar Janaki Ammal College. Dept. of Computer Applications. All rights reserved.
      </motion.p>
    </div>
  );
}
