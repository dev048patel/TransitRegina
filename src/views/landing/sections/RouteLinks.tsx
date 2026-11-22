/* Every Regina bus route, one tap from the homepage: a chip for each that opens its page.
   The pre-rendered homepage (scripts/prerender.tsx) lists the same links, so search engines and people
   find the route pages from the same place. Plain links with no animation: they should always be there. */
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

interface RouteLinksProps {
    routes: { num: string; name: string; slug: string; color: string; textColor: string }[];
}

export default function RouteLinks({ routes }: RouteLinksProps) {
    return (
        <section className="py-20 relative" aria-labelledby="route-links-heading">
            <div className="max-w-6xl mx-auto px-6">
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
                    <div>
                        <h2 id="route-links-heading" className="text-3xl md:text-4xl font-black tracking-tight text-slate-900">Every Regina bus route</h2>
                        <p className="mt-2 text-lg text-slate-600">Pick a route for its map, every stop in order and the buses on it now.</p>
                    </div>
                    <Link to="/routes" className="inline-flex items-center gap-2 font-bold text-[#003DA5] no-underline hover:underline">
                        All routes <ArrowRight size={18} />
                    </Link>
                </div>
                <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {routes.map(r => (
                        <li key={r.num}>
                            <Link
                                to={`/routes/${r.slug}`}
                                className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/90 px-3 py-2.5 no-underline transition-colors hover:border-[#003DA5]/40"
                            >
                                <span
                                    className="flex h-9 min-w-9 shrink-0 items-center justify-center rounded-xl px-2 text-sm font-black"
                                    style={{ background: r.color, color: r.textColor }}
                                >
                                    {r.num}
                                </span>
                                <span className="min-w-0 truncate font-semibold text-slate-800">Route {r.num} {r.name}</span>
                            </Link>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}
