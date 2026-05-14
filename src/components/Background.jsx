import { motion } from 'framer-motion';

export default function Background() {
  return (
    <div className="fixed inset-0 overflow-hidden z-[-1] pointer-events-none bg-dark-bg">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-neon-green/5 via-dark-bg to-dark-bg"></div>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-neon-purple/5 via-dark-bg/0 to-dark-bg/0"></div>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center_left,_var(--tw-gradient-stops))] from-neon-blue/5 via-dark-bg/0 to-dark-bg/0"></div>
    </div>
  );
}
