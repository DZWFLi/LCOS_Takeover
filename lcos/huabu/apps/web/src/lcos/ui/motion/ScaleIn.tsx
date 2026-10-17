// amicro registry/ui/entrance/scale-in.tsx (MIT); original entrance curve retained.
import { motion } from 'motion/react';

import { useReducedSpatialMotion } from './useReducedSpatialMotion';

import type { ReactNode } from 'react';

interface ScaleInProps {
  children: ReactNode;
  duration?: number;
  delay?: number;
  initialScale?: number;
  className?: string;
}

export function ScaleIn({
  children,
  duration = 0.5,
  delay = 0,
  initialScale = 0.92,
  className = '',
}: ScaleInProps) {
  const reduced = useReducedSpatialMotion();
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, scale: initialScale }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        duration: reduced ? 0 : duration,
        delay,
        ease: [0.34, 1.56, 0.64, 1], // Custom springy cubic bezier
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
