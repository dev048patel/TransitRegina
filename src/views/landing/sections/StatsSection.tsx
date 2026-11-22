/* Stats section for the landing page — animated counters showing route, stop, and accuracy metrics */
import React, { useEffect, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { Route, MapPin, Target } from 'lucide-react';

interface StatsSectionProps {
    stats: Array<{
        label: string;
        value: string;
        icon: string;
    }>;
}

const iconMap: { [key: string]: React.FC<{ size?: number, className?: string }> } = {
    Route,
    MapPin,
    Target
};

// Counter animation component. The real number is there from the first paint, so search engines,
// screenshots and anyone who never scrolls see it (not "0"). Just before it scrolls into view it counts
// up from zero; not at all with reduced motion, or for automated browsers such as search engine crawlers.
function AnimatedCounter({ targetValue }: { targetValue: string }) {
    // Extract number from string (e.g., "25+" => 25, "10,000+" => 10000)
    const numericValue = parseInt(targetValue.replace(/[^0-9]/g, '')) || 0;
    const suffix = targetValue.match(/[^0-9]+$/)?.[0] || '';

    const [count, setCount] = useState(numericValue);
    const ref = useRef<HTMLDivElement>(null);
    const isInView = useInView(ref, { once: true, margin: '0px 0px 120px 0px' });

    useEffect(() => {
        if (!isInView) return;
        if (navigator.webdriver || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        // Already on screen when the page opened: leave the number alone rather than drop it to zero
        const box = ref.current?.getBoundingClientRect();
        if (box && box.top < window.innerHeight && box.bottom > 0) return;

        let start = 0;
        setCount(0);
        const duration = 2000; // 2 seconds
        const increment = numericValue / (duration / 16); // 60fps

        const timer = setInterval(() => {
            start += increment;
            if (start >= numericValue) {
                setCount(numericValue);
                clearInterval(timer);
            } else {
                setCount(Math.floor(start));
            }
        }, 16);

        return () => clearInterval(timer);
    }, [isInView, numericValue]);

    const formattedCount = count >= 1000 ? count.toLocaleString() : count.toString();

    const isNonNumeric = !/\d/.test(targetValue);
    if (isNonNumeric) {
        return <div ref={ref}>{targetValue}</div>;
    }

    return (
        <div ref={ref}>
            {formattedCount}{suffix}
        </div>
    );
}

export default function StatsSection({ stats }: StatsSectionProps) {
    return (
        <section className="py-16 relative">
            <div className="max-w-5xl mx-auto px-6">
                {/* One open strip, so the map behind stays in view */}
                <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[#003DA5]/15">
                    {stats.map((stat, index) => {
                        const Icon = iconMap[stat.icon] || Route;

                        return (
                            <motion.div
                                key={stat.label}
                                className="flex flex-col items-center text-center px-6 py-6"
                                initial={{ opacity: 0, y: 30 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.5, delay: index * 0.12 }}
                            >
                                <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-[#003DA5]/70 mb-2">
                                    <Icon size={16} />
                                    {stat.label}
                                </div>
                                <div className="text-6xl md:text-7xl font-black text-[#003DA5] tabular-nums">
                                    <AnimatedCounter targetValue={stat.value} />
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
