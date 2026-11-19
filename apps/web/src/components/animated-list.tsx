import type { ReactNode } from 'react';
import { AnimatePresence, motion, useIsPresent, useReducedMotion, type HTMLMotionProps } from 'motion/react';

export function AnimatedRows({ children, onExitComplete }: { children: ReactNode; onExitComplete?: () => void }) {
  return (
    <AnimatePresence initial={false} onExitComplete={onExitComplete}>
      {children}
    </AnimatePresence>
  );
}

export function AnimatedRow({ children, className = '' }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  const present = useIsPresent();
  return (
    <motion.li
      {...rowMotion(reduced)}
      aria-hidden={!present || undefined}
      inert={!present || undefined}
      className={className}
    >
      {children}
    </motion.li>
  );
}

export function AnimatedItem({
  children,
  className = '',
  ...props
}: Omit<HTMLMotionProps<'div'>, 'children'> & { children: ReactNode }) {
  const reduced = useReducedMotion();
  const present = useIsPresent();
  return (
    <motion.div
      {...rowMotion(reduced)}
      {...props}
      aria-hidden={!present || undefined}
      inert={!present || undefined}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function rowMotion(
  reduced: boolean | null,
): Pick<HTMLMotionProps<'li'>, 'layout' | 'initial' | 'animate' | 'exit' | 'transition'> {
  return {
    layout: !reduced,
    initial: reduced ? false : { opacity: 0, y: 4 },
    animate: { opacity: 1, y: 0 },
    exit: reduced ? undefined : { opacity: 0, y: -4 },
    transition: { duration: reduced ? 0 : 0.16, ease: 'easeOut' },
  };
}
