import { motion } from 'framer-motion';

export default function Background() {
  return (
    <div className="fixed inset-0 overflow-hidden z-[-1] pointer-events-none bg-dark-bg">
      {/* Orange glow — top left */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-neon-blue/8 via-dark-bg to-dark-bg"></div>
      {/* Violet glow — bottom right */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-neon-purple/10 via-dark-bg/0 to-dark-bg/0"></div>
      {/* Amber glow — center left */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center_left,_var(--tw-gradient-stops))] from-neon-pink/6 via-dark-bg/0 to-dark-bg/0"></div>
    </div>
  );
}
