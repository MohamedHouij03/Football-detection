import { motion } from 'motion/react'

export default function PageHeader({ eyebrow, title, sub }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mb-10"
    >
      {eyebrow && (
        <p className="mb-2 font-mono text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-lime">
          {eyebrow}
        </p>
      )}
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink-1 sm:text-3xl">{title}</h1>
      {sub && <p className="mt-2 max-w-2xl text-sm text-ink-3 sm:text-base">{sub}</p>}
    </motion.div>
  )
}
