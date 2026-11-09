/**
 * Insights.tsx — Transit Regina  [VIEW — MVC]
 * Usage over time: what riders do in the app, and text messages.
 */
import Usage from './Usage';
import SmsStats from './SmsStats';

export default function Insights() {
    return (
        <div className="space-y-8">
            <Usage />
            <SmsStats />
        </div>
    );
}
