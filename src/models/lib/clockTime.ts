/* Clock times for timetables. Kept apart from TimetableService so the page titles and descriptions
   (pageMeta.ts, loaded on every page) can use it without the timetable data. */

/** Minutes after midnight of the service day → "6:10 AM"; 1450 (after midnight) → "12:10 AM" */
export function formatTime(minutes: number): string {
    const m = ((minutes % 1440) + 1440) % 1440;
    const h = Math.floor(m / 60), mm = String(m % 60).padStart(2, '0');
    return `${h % 12 === 0 ? 12 : h % 12}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
}
