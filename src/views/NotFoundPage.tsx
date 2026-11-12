/* Any address the app doesn't know: a real "not found" page, kept out of search results.
   Dressed like the landing page: its animated background, logo, buttons and footer. */
import { Link } from 'react-router-dom';
import { ArrowRight, Home } from 'lucide-react';
import { HOME_META } from '../models/seo/pageMeta';
import { usePageMeta } from '../controllers/usePageMeta';
import TransitBackground from './landing/TransitBackground';
import LandingFooter from './landing/sections/LandingFooter';

export default function NotFoundPage() {
    usePageMeta({ ...HOME_META, path: '/404', title: 'Page not found | Transit Regina', noindex: true, jsonLd: [] });
    return (
        <div className="relative min-h-screen" style={{ background: '#F7F8FA' }}>
            <TransitBackground />

            <div className="fixed top-0 left-0 z-50 p-4">
                <Link to="/" className="flex items-center no-underline px-4 py-2 rounded-full transition-all duration-300 hover:scale-105">
                    <img src="/og-logo-gif.gif" alt="Transit Regina" className="w-20 h-20 rounded-xl object-cover" />
                </Link>
            </div>

            <div className="relative" style={{ zIndex: 1 }}>
                <main className="min-h-[80vh] flex flex-col items-center justify-center px-4 pt-32 pb-16 text-center">
                    <p className="text-8xl sm:text-9xl font-black tracking-tight bg-gradient-to-r from-[#003DA5] to-[#0066FF] bg-clip-text text-transparent">404</p>
                    <h1 className="mt-4 text-3xl sm:text-5xl font-black tracking-tight text-slate-900">This stop isn't on our route</h1>
                    <p className="mt-4 max-w-xl text-lg sm:text-xl leading-relaxed text-slate-600">
                        The page you're looking for doesn't exist or has moved. Your bus is still on the map.
                    </p>
                    <div className="mt-10 flex flex-col sm:flex-row gap-4">
                        <Link to="/map" className="group px-9 py-4 rounded-2xl bg-[#003DA5] text-white font-bold text-lg flex items-center justify-center gap-2 no-underline shadow-[0_10px_32px_rgba(0,61,165,0.35)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(0,61,165,0.45)]">
                            Open the live map
                            <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                        </Link>
                        <Link to="/" className="px-9 py-4 rounded-2xl bg-white text-[#003DA5] font-bold text-lg flex items-center justify-center gap-2 no-underline border-2 border-[#003DA5]/20 transition-all duration-300 hover:-translate-y-1 hover:border-[#003DA5]/50">
                            <Home size={20} />
                            Back to homepage
                        </Link>
                    </div>
                </main>
                <LandingFooter />
            </div>
        </div>
    );
}
