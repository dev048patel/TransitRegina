/**
 * ServiceNoticeBanner.tsx — Transit Regina  [VIEW — MVC]
 * The admin's service notice, along the bottom of every public page (the map shows it its own way, in
 * LiveStatus). Bottom rather than top: the homepage and 404 page keep a fixed logo in the top corner.
 * A spacer the banner's height sits at the end of the page, so it never covers the footer.
 */
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { CITY_UPDATES_URL, type PublicServiceNotice } from '../../models/services/ServiceNoticeClient';

export default function ServiceNoticeBanner({ notice }: { notice: PublicServiceNotice | null }) {
    const bar = useRef<HTMLDivElement>(null);
    const [height, setHeight] = useState(0);
    const show = !!notice?.active && !!notice.message;

    useEffect(() => {
        const el = bar.current;
        if (!show || !el) { setHeight(0); return; }
        const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
        ro.observe(el);
        return () => ro.disconnect();
    }, [show]);

    if (!show) return null;
    const suspended = !!notice!.suspended;
    const Icon = suspended ? AlertTriangle : Info;
    return (
        <>
            <div aria-hidden="true" style={{ height }} />
            <div ref={bar} role={suspended ? 'alert' : 'status'}
                className={'fixed inset-x-0 bottom-0 z-[60] border-t px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] ' +
                    (suspended ? 'bg-red-50 border-red-200 text-red-900' : 'bg-amber-50 border-amber-200 text-amber-900')}>
                <div className="max-w-4xl mx-auto flex items-start gap-3 text-sm leading-snug">
                    <Icon size={18} className="flex-none mt-0.5" aria-hidden="true" />
                    <p>
                        {suspended && <strong className="font-semibold">Bus service is suspended. </strong>}
                        {notice!.message}{' '}
                        <a href={notice!.linkUrl || CITY_UPDATES_URL} target="_blank" rel="noopener noreferrer" className="font-semibold underline whitespace-nowrap">
                            City service updates
                        </a>
                    </p>
                </div>
            </div>
        </>
    );
}
