import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center p-4">
      {/* Background Animated Nodes/Glows */}
      <div className="absolute inset-0 overflow-hidden z-0">
        <motion.div 
          className="absolute top-1/4 left-1/4 w-96 h-96 bg-neon-purple rounded-full mix-blend-screen filter blur-[128px] opacity-20"
          animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0.3, 0.2] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div 
          className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-neon-blue rounded-full mix-blend-screen filter blur-[128px] opacity-20"
          animate={{ scale: [1.2, 1, 1.2], opacity: [0.3, 0.2, 0.3] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <div className="z-10 text-center w-full max-w-4xl glass-panel p-8 md:p-16 rounded-3xl border border-white/10 relative overflow-hidden">
        {/* Header Strings */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="mb-8 space-y-2 border-b border-white/10 pb-6 inline-block"
        >
          <h3 className="text-neon-green text-sm md:text-base font-mono tracking-[0.2em] uppercase glow">
            Department of Computer Applications
          </h3>
          <h4 className="text-white/60 text-xs md:text-sm font-mono tracking-widest uppercase">
            Ayya Nadar Janaki Ammal College (Autonomous)
          </h4>
        </motion.div>

        {/* Main Title */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 0.3 }}
          className="mb-6"
        >
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-extrabold uppercase mb-4 flex flex-col gap-2 md:gap-4 py-4 drop-shadow-2xl">
            <span className="text-white/90 tracking-tight">SoftTech</span>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-neon-blue via-neon-purple to-neon-pink pb-2 tracking-wide">
              Association
            </span>
          </h1>
          
          <div className="flex items-center justify-center gap-4 my-8">
            <div className="h-px bg-gradient-to-r from-transparent via-white/30 to-transparent flex-1 max-w-[120px]"></div>
            <h2 className="text-2xl md:text-3xl font-mono text-neon-blue tracking-[0.4em] uppercase font-semibold">
              QUIZ
            </h2>
            <div className="h-px bg-gradient-to-r from-transparent via-white/30 to-transparent flex-1 max-w-[120px]"></div>
          </div>
        </motion.div>

        {/* Action Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.8 }}
          className="mt-12"
        >
          <button 
            onClick={() => navigate('/arena')}
            className="group relative px-8 py-4 font-mono font-bold tracking-[0.2em] text-white uppercase overflow-hidden rounded-none border border-neon-blue/50 hover:border-neon-blue transition-colors"
          >
            <div className="absolute inset-0 bg-neon-blue/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out"></div>
            <span className="relative z-10 flex items-center gap-3 drop-shadow-[0_0_8px_rgba(0,243,255,0.8)]">
              [ START_SYSTEM ]
            </span>
          </button>
        </motion.div>
      </div>
    </div>
  );
}
