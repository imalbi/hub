import type { ReactNode } from 'react';
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'motion/react';

function Line({ children }: { children: ReactNode }) {
  const present = useIsPresent();
  const reduced = useReducedMotion();
  return (
    <motion.span
      aria-hidden={!present || undefined}
      inert={!present || undefined}
      className="min-w-0 truncate [grid-area:1/1]"
      initial={{ opacity: reduced ? 1 : 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduced ? 0 : 0.25 }}
    >
      {children}
    </motion.span>
  );
}

export function FadingLine({
  subject,
  children,
  className = '',
}: {
  subject: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`grid min-w-0 ${className}`}>
      <AnimatePresence initial={false}>
        <Line key={subject}>{children}</Line>
      </AnimatePresence>
    </span>
  );
}
