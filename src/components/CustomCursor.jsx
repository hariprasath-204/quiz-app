import { useEffect, useState } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';

export default function CustomCursor() {
  const cursorX = useMotionValue(-100);
  const cursorY = useMotionValue(-100);
  
  const springConfig = { damping: 25, stiffness: 400, mass: 0.5 };
  const cursorXSpring = useSpring(cursorX, springConfig);
  const cursorYSpring = useSpring(cursorY, springConfig);

  const [isHovering, setIsHovering] = useState(false);
  const [isPointerDevice, setIsPointerDevice] = useState(true);

  useEffect(() => {
    setIsPointerDevice(window.matchMedia("(pointer: fine)").matches);

    const updateMousePosition = (e) => {
      cursorX.set(e.clientX);
      cursorY.set(e.clientY);
    };

    const handleMouseOver = (e) => {
      if (e.target.closest('button, a, input, select, [role="button"], .glass-panel')) {
        setIsHovering(true);
      } else {
        setIsHovering(false);
      }
    };

    window.addEventListener('mousemove', updateMousePosition, { passive: true });
    window.addEventListener('mouseover', handleMouseOver, { passive: true });

    return () => {
      window.removeEventListener('mousemove', updateMousePosition);
      window.removeEventListener('mouseover', handleMouseOver);
    };
  }, [cursorX, cursorY]);

  if (!isPointerDevice) return null;

  return (
    <>
      {/* Outer Ring */}
      <motion.div
        className="fixed top-0 left-0 w-8 h-8 rounded-full border border-neon-blue pointer-events-none z-[9999] shadow-[0_0_15px_rgba(0,243,255,0.4)]"
        style={{
          translateX: cursorXSpring,
          translateY: cursorYSpring,
          marginLeft: '-16px',
          marginTop: '-16px'
        }}
        animate={{ 
          scale: isHovering ? 1.5 : 1,
          borderColor: isHovering ? '#FF007F' : '#00F3FF',
          boxShadow: isHovering ? '0 0 20px rgba(255, 0, 127, 0.6)' : '0 0 15px rgba(0, 243, 255, 0.4)'
        }}
        transition={{ duration: 0.15 }}
      />
      {/* Inner Dot */}
      <motion.div
        className="fixed top-0 left-0 w-2 h-2 rounded-full bg-white pointer-events-none z-[10000] shadow-[0_0_5px_rgba(255,255,255,1)]"
        style={{
          translateX: cursorX,
          translateY: cursorY,
          marginLeft: '-4px',
          marginTop: '-4px'
        }}
        animate={{ 
          opacity: isHovering ? 0 : 1
        }}
        transition={{ duration: 0.1 }}
      />
    </>
  );
}
