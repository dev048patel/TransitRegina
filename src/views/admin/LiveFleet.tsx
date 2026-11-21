/**
 * LiveFleet.tsx — Transit Regina  [VIEW — MVC]
 * On the admin Service page: today's buses from the live feed. The card sums it up and lists the
 * inactive buses (missing from the feed, or stopped mid-route, for 5+ minutes); LiveRouteBadge is the
 * "Live today" column of the routes table.
 */
import { Bus } from 'lucide-react';
import type { FleetBus, FleetRoute, FleetSnapshot } from '../../controllers/admin/useLiveFleetController';
import { Badge, Card } from '../components/admin/ui';

const time = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' }) : '';
const mins = (iso: string | null) => iso ? Math.max(5, Math.round((Date.now() - Date.parse(iso)) / 60_000)) : 0;

export function LiveRouteBadge({ route }: { route?: FleetRoute }) {
    if (!route || route.status === 'checking') return <span className="text-xs text-gray-400">Checking…</span>;
    if (route.status === 'inactive') {
        return (
            <div className="flex flex-col">
                <span><Badge tone="bad">Inactive</Badge></span>
                <span className="text-xs text-gray-500 mt-0.5">{route.lastSeenAt ? `No bus since ${time(route.inactiveSince)}` : 'No bus seen today'}</span>
            </div>
        );
    }
    return (
        <div className="flex flex-col">
            <span><Badge tone="good">Live · {route.buses} bus{route.buses === 1 ? '' : 'es'}</Badge></span>
            {route.stopped > 0 && <span className="text-xs text-amber-700 mt-0.5">{route.stopped} stopped mid-route</span>}
        </div>
    );
}

function why(b: FleetBus): string {
    return b.status === 'missing'
        ? `Not in the live feed since ${time(b.since)} (${mins(b.since)} min)`
        : `Not moving since ${time(b.since)} (${mins(b.since)} min), away from the route's ends`;
}

export default function LiveFleetCard({ fleet, error, counts, inactiveBuses }: {
    fleet: FleetSnapshot | null; error: string | null;
    counts: { routesLive: number; routesInactive: number; routesTotal: number; moving: number; layover: number; inactive: number; offRoute: number };
    inactiveBuses: FleetBus[];
}) {
    if (!fleet && !error) return null;
    return (
        <Card title="Buses today" about="From the live feed, checked every 15 seconds. A route is inactive after 5 minutes with no bus on it; a bus is inactive after 5 minutes missing from the feed or standing still away from its route's ends."
            action={fleet && <Badge tone={fleet.feedOk ? 'good' : 'bad'}>{fleet.feedOk ? 'Feed answering' : 'Feed not answering'}</Badge>}>
            <div className="px-5 py-4 space-y-3 text-sm">
                {error && <p role="alert" className="text-red-700">Could not load the live buses: {error}</p>}
                {fleet && !fleet.feedOk && (
                    <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                        The live feed hasn't answered since {fleet.lastFeedAt ? time(fleet.lastFeedAt) : 'the server started'}. Nothing below counts as missing until it is back.
                    </p>
                )}
                {fleet && (
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-slate-700">
                        <span><strong className="tabular-nums">{counts.routesLive}</strong>/{counts.routesTotal} routes live</span>
                        <span className={counts.routesInactive ? 'text-red-700' : ''}><strong className="tabular-nums">{counts.routesInactive}</strong> inactive</span>
                        <span><strong className="tabular-nums">{counts.moving}</strong> buses moving</span>
                        <span><strong className="tabular-nums">{counts.layover}</strong> on a layover</span>
                        <span className={counts.inactive ? 'text-red-700' : ''}><strong className="tabular-nums">{counts.inactive}</strong> buses inactive</span>
                        {counts.offRoute > 0 && <span className="text-slate-500">{counts.offRoute} off route</span>}
                        {fleet.trackingSince && <span className="text-xs text-slate-500">tracking since {time(fleet.trackingSince)}</span>}
                    </div>
                )}
                {inactiveBuses.length > 0 && (
                    <ul className="border-t border-slate-100 pt-3 divide-y divide-slate-50">
                        {inactiveBuses.map(b => (
                            <li key={b.busId} className="flex items-start gap-3 py-2">
                                <Bus size={16} className={'flex-none mt-0.5 ' + (b.status === 'missing' ? 'text-red-600' : 'text-amber-600')} aria-hidden="true" />
                                <div className="min-w-0">
                                    <div className="font-medium text-slate-900">
                                        Bus {b.busId} · {b.route === '0' ? 'Off route' : `Route ${b.route}`}{b.line && b.route !== '0' ? ` ${b.line}` : ''}
                                        <span className="ml-2"><Badge tone={b.status === 'missing' ? 'bad' : 'warn'}>{b.status === 'missing' ? 'Missing' : 'Stopped'}</Badge></span>
                                    </div>
                                    <div className="text-xs text-slate-500">
                                        {why(b)} ·{' '}
                                        <a href={`https://www.google.com/maps?q=${b.lat},${b.lng}`} target="_blank" rel="noopener noreferrer" className="underline">last position</a>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
                {fleet && !inactiveBuses.length && fleet.buses.length > 0 && <p className="text-xs text-slate-500">No inactive buses.</p>}
            </div>
        </Card>
    );
}
