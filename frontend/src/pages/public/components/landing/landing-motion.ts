import type { Transition, Variants } from "framer-motion"

export const landingViewport = {
  once: true,
  margin: "-10% 0px",
}

const smoothTransition: Transition = {
  duration: 0.58,
  ease: [0.22, 1, 0.36, 1],
}

export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.06,
    },
  },
}

export const fadeUpItem: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: {
    opacity: 1,
    y: 0,
    transition: smoothTransition,
  },
}

export const softReveal: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      ...smoothTransition,
      duration: 0.48,
    },
  },
}

export const heroFloat: Variants = {
  rest: { y: 0 },
  hover: {
    y: -6,
    transition: {
      duration: 0.24,
      ease: "easeOut",
    },
  },
}
