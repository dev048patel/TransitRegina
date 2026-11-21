/* A message on the map, only when something needs explaining, so it never covers the map otherwise:
     1. the admin marked standard bus service as suspended (the service notice)
     2. live bus positions stopped arriving
     3. the feed answers but no buses are reporting (night, or a suspension not marked yet)
     4. any other service notice from the admin */
import { SITE } from '../../../models/data/legal';
import { CITY_UPDATES_URL, type PublicServiceNotice } from '../../../models/services/ServiceNoticeClient';

const BOX = 'fixed z-[999] left-1/2 -translate-x-1/2 bottom-7 w-[min(94vw,520px)] rounded-xl border text-sm px-4 py-2.5 shadow-lg text-center';

export default function LiveStatus({ liveDown, noBuses, notice }: { liveDown: boolean; noBuses: boolean; notice: PublicServiceNotice | null }) {
    const active = !!notice?.active && !!notice.message;
    const officialLink = (label: string, href = SITE.officialUrl) => (
        <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold underline">{label}</a>
    );

    if (active && notice!.suspended) {
        return (
            <div role="alert" className={`${BOX} bg-red-50 border-red-300 text-red-900`}>
                <strong className="font-semibold">Bus service is suspended.</strong> {notice!.message}{' '}
                {officialLink('City service updates', notice!.linkUrl || CITY_UPDATES_URL)}
            </div>
        );
    }
    if (liveDown) {
        return (
            <div role="status" className={`${BOX} bg-amber-50 border-amber-300 text-amber-900`}>
                Live bus positions aren't coming through right now, so what you see may be out of date.{' '}
                {officialLink('Check regina.ca')} for official service notices.
            </div>
        );
    }
    if (noBuses) {
        return (
            <div role="status" className={`${BOX} bg-slate-50 border-slate-300 text-slate-800`}>
                No buses are reporting their position right now. Buses may not be running at this hour.{' '}
                {officialLink('Check regina.ca', CITY_UPDATES_URL)} for service updates.
            </div>
        );
    }
    if (active) {
        return (
            <div role="status" className={`${BOX} bg-amber-50 border-amber-300 text-amber-900`}>
                {notice!.message}{' '}
                {officialLink('City service updates', notice!.linkUrl || CITY_UPDATES_URL)}
            </div>
        );
    }
    return null;
}
