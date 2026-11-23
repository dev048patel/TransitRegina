/* How something works, drawn as the path the data takes: a chain of steps with a light that runs
   along it, one step at a time, then starts again. Respects reduced motion (MotionConfig above). */
import React from 'react';
import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';

const STEP = 0.7;   // seconds the light spends on each step

export default function FlowSteps({ steps, color, soft }: { steps: string[]; color: string; soft: string }) {
    const lap = steps.length * STEP;
    return (
        <ol className="mt-2 flex flex-wrap items-center gap-y-2 text-left" aria-label="How it works, step by step">
            {steps.map((step, i) => (
                <li key={step} className="flex items-center">
                    {i > 0 && <ChevronRight size={16} className="mx-0.5 shrink-0 text-slate-400" aria-hidden />}
                    <motion.span
                        className="rounded-xl border-2 border-slate-900 px-2.5 py-1 text-xs sm:text-sm font-bold text-slate-800"
                        initial={{ opacity: 0, y: 6, backgroundColor: '#ffffff' }}
                        animate={{ opacity: 1, y: 0, backgroundColor: ['#ffffff', soft, '#ffffff'], boxShadow: ['0 0 0 0 transparent', `0 0 0 3px ${color}33`, '0 0 0 0 transparent'] }}
                        transition={{
                            opacity: { delay: i * 0.12, duration: 0.25 }, y: { delay: i * 0.12, duration: 0.25 },
                            backgroundColor: { delay: 0.4 + i * STEP, duration: STEP, repeat: Infinity, repeatDelay: lap - STEP },
                            boxShadow: { delay: 0.4 + i * STEP, duration: STEP, repeat: Infinity, repeatDelay: lap - STEP },
                        }}
                    >
                        <span className="mr-1 text-[10px] font-black" style={{ color }}>{i + 1}</span>{step}
                    </motion.span>
                </li>
            ))}
        </ol>
    );
}
