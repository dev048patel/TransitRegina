/* Landing page controller — aggregates mock data for all landing page sections */
import { heroContent, stats, features, steps, problemSolutions, faqItems, technologies } from '../../models/data/mock/landingMockData';
import { ROUTE_LINKS } from '../../models/data/siteFacts';

export function useLandingController() {
    return {
        hero: heroContent,
        stats,
        features,
        steps,
        problemSolutions,
        faqItems,
        technologies,
        routes: ROUTE_LINKS
    };
}
