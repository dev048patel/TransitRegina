/**
 * Insights.tsx — Transit Regina  [VIEW — MVC]
 * Usage over time: what riders do in the app, and text messages. Its tabs lead to every action (Activity) and
 * everyone who used the app (Riders); each ranked list opens an item's own page.
 */
import Usage from './Usage';
import SmsStats from './SmsStats';
import { InsightsTabs } from './UsageSections';
import { useRange } from '../../controllers/admin/useExploreController';

export default function Insights() {
    const { query } = useRange();
    return (
        <div>
            <InsightsTabs query={query} />
            <div className="space-y-8">
                <Usage />
                <SmsStats />
            </div>
        </div>
    );
}
