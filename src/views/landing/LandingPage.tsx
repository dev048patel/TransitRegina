/**
 * LandingPage.tsx — Transit Regina  [VIEW — MVC]
 *
 * The transit route network background (TransitBackground.tsx) sits behind all sections.
 * Each section is transparent so the shared background shows through.
 *
 * Background layers (bottom to top):
 *  1. Off-white base (#F7F8FA) — paper-map feel
 *  2. Square grid — very subtle, like graph paper
 *  3. Animated SVG transit route network — dark charcoal/navy route lines
 *     with moving bus beacons and pulsing stop markers
 *  4. Sections — fully transparent backgrounds, content floats above the map
 */

import { Link } from 'react-router-dom';
import { useLandingController } from '../../controllers/landing/useLandingController';
import TransitBackground from './TransitBackground';
import HeroSection from './sections/HeroSection';
import StatsSection from './sections/StatsSection';
import FeaturesCarousel from './sections/FeaturesCarousel';
import HowItWorks from './sections/HowItWorks';
import ProblemSolution from './sections/ProblemSolution';
import ComparisonTable from './sections/ComparisonTable';
import TechnologyTrust from './sections/TechnologyTrust';
import FAQ from './sections/FAQ';
import FinalCTA from './sections/FinalCTA';
import LandingFooter from './sections/LandingFooter';
import RouteLinks from './sections/RouteLinks';

export default function LandingPage() {
    const { hero, stats, features, steps, problemSolutions, faqItems, technologies, routes } = useLandingController();

    return (
        <div className="relative min-h-screen" style={{ background: '#F7F8FA' }}>

            {/* ════════════════════════════════════════════════════════
                GLOBAL BACKGROUND — fixed behind ALL sections
                ════════════════════════════════════════════════════════ */}
            <TransitBackground />

            {/* =========================================================
                PAGE SECTIONS — transparent backgrounds, float above bg
                ========================================================= */}
            {/* =========================================================
                FIXED LOGO — top-left, seamless glassmorphic pill
                ========================================================= */}
            <div className="fixed top-0 left-0 z-50 p-4">
                <Link
                    to="/"
                    className="flex items-center gap-2.5 no-underline px-4 py-2 rounded-full transition-all duration-300 hover:scale-105"
                >
                    <img
                        src="/logo-animated.webp"
                        width={80}
                        height={80}
                        alt="Transit Regina"
                        className="w-20 h-20 rounded-xl object-cover"
                    />
                </Link>
            </div>

            {/* The main places to go, top-right */}
            <nav aria-label="Main" className="fixed top-0 right-0 z-50 p-4 sm:p-6">
                <ul className="flex items-center gap-1 rounded-full border border-[#003DA5]/10 bg-white/85 p-1 shadow-sm backdrop-blur">
                    {[['/map', 'Map'], ['/routes', 'Routes'], ['/about', 'About']].map(([to, label]) => (
                        <li key={to}>
                            <Link to={to} className="block rounded-full px-3 py-1.5 text-sm font-bold text-[#003DA5] no-underline transition-colors hover:bg-[#003DA5]/10 sm:px-4 sm:text-base">
                                {label}
                            </Link>
                        </li>
                    ))}
                </ul>
            </nav>

            <div className="relative" style={{ zIndex: 1 }}>
                <HeroSection
                    headline={hero.headline}
                    subheadline={hero.subheadline}
                    primaryCTA={hero.primaryCTA}
                    trustIndicators={hero.trustIndicators}
                />
                <StatsSection stats={stats} />
                <FeaturesCarousel features={features} />
                <HowItWorks steps={steps} />
                <ProblemSolution problemSolutions={problemSolutions} />
                <ComparisonTable />
                <TechnologyTrust technologies={technologies} />
                <RouteLinks routes={routes} />
                <FAQ faqItems={faqItems} />
                <FinalCTA />
                <LandingFooter />
            </div>
        </div>
    );
}
