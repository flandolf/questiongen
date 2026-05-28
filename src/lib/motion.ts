import type { Transition, Variants } from 'framer-motion';

export const SPRING_SNAPPY: Transition = {
  type: 'spring',
  stiffness: 400,
  damping: 30,
};

export const SPRING: Transition = {
  type: 'spring',
  stiffness: 300,
  damping: 30,
};

export const SPRING_OVERSHOOT: Transition = {
  type: 'spring',
  stiffness: 350,
  damping: 22,
  mass: 1.2,
};

export const SPRING_GENTLE: Transition = {
  type: 'spring',
  stiffness: 200,
  damping: 20,
};

export const EASE: Transition = {
  duration: 0.22,
  ease: [0.25, 1, 0.5, 1],
};

export const EASE_OUT: Transition = {
  duration: 0.35,
  ease: [0.16, 1, 0.3, 1],
};

export const EASE_IN: Transition = {
  duration: 0.18,
  ease: [0.7, 0, 0.84, 0],
};

export const EASE_FLUID: Transition = {
  duration: 0.5,
  ease: [0.34, 1.56, 0.64, 1],
};

// Variants types require specific shapes — use `as const` to lock literals
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 400, damping: 30 },
  },
};

export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.04 },
  },
};
