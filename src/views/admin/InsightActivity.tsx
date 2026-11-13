/**
 * InsightActivity.tsx — Transit Regina  [VIEW — MVC]
 * Every action riders took, newest first, filtered by kind, signed in or not, and words (a place, stop, route,
 * bus number, page or error). Each line opens the person and the item. Each look is recorded.
 */
import { useState } from 'react';
import { useActivityController } from '../../controllers/admin/useExploreController';
import { USAGE_LABEL } from '../../models/data/usageLabels';
import { Card, PageHeader, btn } from '../components/admin/ui';
import { EventFeed, InsightsTabs, RangePicker } from './UsageSections';

/** The kinds worth filtering by, grouped the way admins think of them */
const GROUPS: [string, string[]][] = [
    ['Finding a bus', ['place_searched', 'place_tapped', 'planner_searched', 'arrive_by_planned', 'suggestions_shown', 'option_expanded', 'search_no_results']],
    ['Buses, routes and stops', ['route_selected', 'bus_opened', 'stop_opened', 'stop_more', 'stop_refresh']],
    ['Trips', ['trip_started', 'trip_stopped', 'plan_later', 'trip_texts', 'trip_texts_on']],
    ['Saved and planned', ['menu_opened', 'place_saved', 'place_unsaved', 'weekly_saved']],
    ['Accounts', ['signed_up', 'signed_in', 'signed_out', 'profile_updated', 'character_changed', 'sms_access_requested', 'sms_opt_in', 'sms_opt_out', 'phone_code_sent', 'phone_verified']],
    ['Visits and pages', ['session_start', 'page_view', 'location']],
    ['Problems', ['app_error', 'api_error', 'location_problem', 'report_sent']],
    ['Speed', ['vitals', 'timing']],
];

export default function InsightActivity() {
    const { range, kind, setKind, who, setWho, setWords, words, events, next, loading, error, loadMore, refresh } = useActivityController();
    const [draft, setDraft] = useState(words);

    return (
        <div>
            <InsightsTabs query={range.query} />
            <PageHeader title="Activity" subtitle="Every action, newest first. Click a name to see that person, or an action to see everyone who did the same."
                actions={<RangePicker days={range.days} custom={range.custom} setDays={range.setDays} setCustom={range.setCustom} />} />

            <Card>
                <form onSubmit={e => { e.preventDefault(); setWords(draft.trim()); }} className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-slate-100">
                    <select value={kind} onChange={e => setKind(e.target.value)} aria-label="What" className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm bg-white">
                        <option value="">Everything (except speed checks)</option>
                        {GROUPS.map(([label, kinds]) => (
                            <optgroup key={label} label={label}>{kinds.map(k => <option key={k} value={k}>{USAGE_LABEL[k] ?? k}</option>)}</optgroup>
                        ))}
                    </select>
                    <div role="group" aria-label="Who" className="inline-flex rounded-lg border border-slate-200 p-0.5 text-xs">
                        {(['all', 'signed', 'anonymous'] as const).map(s => (
                            <button type="button" key={s} onClick={() => setWho(s)} aria-pressed={who === s} className={'px-2 py-1 rounded-md font-semibold ' + (who === s ? 'bg-[#003DA5] text-white' : 'text-slate-600')}>{s === 'all' ? 'Everyone' : s === 'signed' ? 'Signed in' : 'Anonymous'}</button>
                        ))}
                    </div>
                    <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="A place, stop, route, bus number, page or error" aria-label="Search" className="flex-1 min-w-[14rem] px-3 py-1.5 rounded-lg border border-slate-200 text-sm" />
                    <button type="submit" className={btn.plain}>Search</button>
                    {(words || kind || who !== 'all') && <button type="button" onClick={() => { setDraft(''); setWords(''); setKind(''); setWho('all'); }} className="text-xs font-semibold text-slate-500 hover:text-slate-800">Clear</button>}
                    <button type="button" onClick={refresh} className="ml-auto text-xs font-semibold text-[#003DA5] hover:underline">Refresh</button>
                </form>

                {error && <p role="alert" className="mx-5 my-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">Could not load activity: {error}</p>}
                {loading && events.length === 0 ? <p className="px-5 py-8 text-sm text-slate-500 text-center">Loading…</p> : (
                    <EventFeed events={events} query={range.query} empty="Nothing matches in this period." />
                )}
                <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 text-xs text-slate-500">
                    <span>Showing {events.length.toLocaleString('en-CA')}{next ? ' so far' : ''} · signed-out visitors get a new anonymous id each day</span>
                    {next && <button onClick={loadMore} disabled={loading} className={btn.plain}>{loading ? 'Loading…' : 'Load more'}</button>}
                </div>
            </Card>
        </div>
    );
}
