import type { ReactNode } from 'react';
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'motion/react';

function Layer({ children }: { children: ReactNode }) {
  const present = useIsPresent();
  const reduced = useReducedMotion();
  return (
    <motion.div
      data-crossfade-layer=""
      aria-hidden={!present || undefined}
      inert={!present || undefined}
      className="flex min-h-0 flex-col [grid-area:1/1]"
      initial={{ opacity: reduced ? 1 : 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduced ? 0 : 0.25 }}
    >
      {children}
    </motion.div>
  );
}

export function Crossfade({
  subject,
  children,
  className = '',
}: {
  subject: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`grid min-w-0 ${className}`}>
      <AnimatePresence initial={false}>
        <Layer key={subject}>{children}</Layer>
      </AnimatePresence>
    </div>
  );
}
