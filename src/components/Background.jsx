import { useEffect, useRef } from 'react';

export default function Background() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let animId;

    const CHARS =
      'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ<>{}[]|/\\';
    const FONT_SIZE = 14;
    // Orange as primary rain color, occasional violet/amber drops
    const COLORS = ['#ff6d00', '#ff6d00', '#ff6d00', '#ffc400', '#7c3aed'];

    let cols, drops, dropColors;

    const init = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      cols = Math.floor(canvas.width / FONT_SIZE);
      drops = Array(cols).fill(1);
      dropColors = Array(cols).fill(0).map(() => COLORS[Math.floor(Math.random() * COLORS.length)]);
    };
    init();
    window.addEventListener('resize', init);

    const draw = () => {
      // Dark trailing fade — deep indigo-black
      ctx.fillStyle = 'rgba(7, 5, 15, 0.18)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.font = `${FONT_SIZE}px "Fira Code", monospace`;

      for (let i = 0; i < drops.length; i++) {
        const char = CHARS[Math.floor(Math.random() * CHARS.length)];
        const x = i * FONT_SIZE;
        const y = drops[i] * FONT_SIZE;

        // Bright head character
        if (drops[i] * FONT_SIZE < canvas.height * 0.15) {
          ctx.fillStyle = '#ffffff';
        } else {
          ctx.fillStyle = dropColors[i];
        }

        ctx.shadowBlur = 6;
        ctx.shadowColor = dropColors[i];
        ctx.fillText(char, x, y);
        ctx.shadowBlur = 0;

        // Reset drop randomly
        if (y > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
          dropColors[i] = COLORS[Math.floor(Math.random() * COLORS.length)];
        }
        drops[i]++;
      }

      animId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', init);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[-1] pointer-events-none bg-dark-bg">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
}
