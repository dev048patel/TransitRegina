/* usageLabels — plain words for each kind of usage event (see UsageEvents.CLIENT_EVENTS / SERVER_EVENTS),
   used by the admin Usage page and a person's activity timeline. */

export const USAGE_LABEL: Record<string, string> = {
    page_view: 'Opened a page',
    still_here: 'Has the app open',
    location: 'Answered the location question',
    place_searched: 'Searched for a place',
    place_tapped: 'Picked a place on the map',
    route_selected: 'Picked a route',
    stop_opened: 'Opened a stop board',
    bus_opened: 'Tapped a bus',
    suggestions_shown: 'Saw bus options',
    plan_later: 'Used "Plan for later"',
    trip_started: 'Started a trip',
    trip_stopped: 'Ended a trip',
    trip_texts: 'Asked about trip texts',
    trip_texts_on: 'Turned on trip texts',
    menu_opened: 'Opened a planner panel',
    place_saved: 'Saved a place',
    weekly_saved: 'Saved a weekly commute',
    signed_up: 'Signed up',
    signed_in: 'Signed in',
    signed_out: 'Signed out',
    profile_updated: 'Updated their profile',
    character_changed: 'Changed map character',
    sms_opt_in: 'Turned on text alerts',
    sms_opt_out: 'Turned off text alerts',
    phone_verified: 'Verified their phone',
    phone_code_sent: 'Asked for a phone code',
    session_start: 'Started a visit',
    vitals: 'Page speed measured',
    timing: 'Load time measured',
    app_error: 'Hit an app error',
    api_error: 'A request failed',
    option_expanded: 'Opened a bus option',
    stop_more: 'Showed more times at a stop',
    stop_refresh: 'Refreshed a stop board',
    search_no_results: 'Search found nothing',
    location_problem: 'Location did not work',
    report_sent: 'Reported a problem',
};

const TIMING: Record<string, string> = { map_load: 'Map ready', plan_routes: 'Bus options worked out', stop_board: 'Stop board filled in', live_feed: 'Live buses appeared' };
const PROBLEM: Record<string, string> = { blocked: 'blocked in the browser', off: 'location is off on the device', timeout: 'no fix yet (weak signal)', unsupported: 'not supported by the browser' };
const REPORT: Record<string, string> = { bus_no_show: "the bus didn't come", wrong_time: 'the time was wrong', stop_problem: 'a stop problem', app_problem: 'an app problem', other: 'something else' };

const PANEL: Record<string, string> = { trip_planner: 'Trip Planner', saved: 'Saved Locations', weekly: 'Weekly Commute' };

/** One line saying what happened, e.g. "Searched for Cornwall Centre" or "Started a trip: route 4 › 15, 32 min" */
export function describeUsage(kind: string, detail: Record<string, unknown> = {}, page?: string | null): string {
    const d = (k: string) => (detail[k] === undefined || detail[k] === null ? '' : String(detail[k]));
    switch (kind) {
        case 'page_view': return `Opened ${d('path') || page || 'a page'}`;
        case 'location': return d('choice') === 'allowed' ? 'Allowed their location' : 'Declined to share their location';
        case 'place_searched': return `Searched for ${d('place') || 'a place'}`;
        case 'place_tapped': return `Picked ${d('place') || 'a place'} on the map`;
        case 'route_selected': return `Picked route ${d('route')}`;
        case 'stop_opened': return `Opened the board for ${d('name') || 'stop'} (#${d('stop')})`;
        case 'bus_opened': return `Tapped bus #${d('bus')} on route ${d('route')}`;
        case 'suggestions_shown': return `Saw ${d('options') || 'some'} bus options to ${d('place') || 'a place'}${d('best_route') ? ` (best: route ${d('best_route').replace(/>/g, ' › ')}, ${d('best_minutes')} min)` : ''}`;
        case 'trip_started': return `Started a trip${d('place') ? ` to ${d('place')}` : ''}: route ${d('routes').replace(/>/g, ' › ')}${d('minutes') ? `, ${d('minutes')} min` : ''}`;
        case 'trip_stopped': return d('how') === 'back' ? 'Went back to the bus options' : 'Ended their trip';
        case 'trip_texts': return d('action') === 'declined' ? 'Said no to trip texts' : d('action') === 'signin_needed' ? 'Asked for trip texts (not signed in)' : 'Asked for trip texts';
        case 'trip_texts_on': return `Turned on trip texts${d('routes') ? ` for route ${d('routes').replace(/>/g, ' › ')}` : ''}`;
        case 'menu_opened': return `Opened ${PANEL[d('panel')] ?? 'a planner panel'}`;
        case 'weekly_saved': return `Saved a weekly commute (${d('days') || 0} days)`;
        case 'signed_in': return `Signed in with ${d('method') === 'phone' ? 'their phone number' : 'email'}`;
        case 'profile_updated': return `Updated their profile (${d('fields') || 'details'})`;
        case 'character_changed': return `Changed map character to ${d('character')}`;
        case 'session_start': return `Started a visit: ${[d('browser'), d('os'), d('screen')].filter(Boolean).join(', ') || 'unknown device'}${d('source') && d('source') !== 'direct' ? `, from ${d('source')}` : ''}${d('installed') === 'yes' ? ', installed app' : ''}`;
        case 'vitals': return `Page speed: ${d('name')} ${d('name') === 'CLS' ? d('value') : `${d('value')} ms`}${d('rating') ? ` (${d('rating').replace('-', ' ')})` : ''}`;
        case 'timing': return `${TIMING[d('what')] ?? d('what')} in ${d('ms')} ms`;
        case 'app_error': return `App error: ${d('message') || 'unknown'}${d('where') ? ` (${d('where')})` : ''}`;
        case 'api_error': return `Request failed: ${d('endpoint')}${d('status') ? ` (${d('status') === '0' ? 'no connection' : d('status')})` : ''}`;
        case 'option_expanded': return `Opened bus option ${Number(d('rank') || 0) + 1}`;
        case 'search_no_results': return `Search found nothing (${d('chars') || '?'} letters typed)`;
        case 'location_problem': return `Location did not work: ${PROBLEM[d('problem')] ?? d('problem')}`;
        case 'report_sent': return `Reported ${REPORT[d('kind')] ?? 'a problem'}`;
        default: return USAGE_LABEL[kind] ?? kind;
    }
}

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
