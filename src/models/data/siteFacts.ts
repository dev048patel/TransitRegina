/* Small facts about the site that pages outside the route and stop directory show: the homepage's
   route links and stop count, and the founders' names and profiles in the structured data.

   They are kept here, apart from TransitDirectory and team.ts, so the homepage and the head tags on
   every page don't pull in the full transit data or the portfolios. test/siteFacts.test.ts checks
   them against TransitDirectory and team.ts; after `npm run build:transit-data` it prints the new
   values if they no longer match. */

/** One name form for each founder, used everywhere (team pages, structured data, footer, policies) */
export const FOUNDERS = {
    dev: { slug: 'dev', name: 'Dev Patel', linkedin: 'https://www.linkedin.com/in/dev-patel-itsme/', github: 'https://github.com/dev048patel' },
    nirjar: { slug: 'nirjar', name: 'Nirjar Patel', linkedin: 'https://www.linkedin.com/in/nirjarpatel/', github: 'https://github.com/nirjar1012' },
} as const;

/** Bus stops with a page of their own (TransitDirectory's SERVED_STOPS) */
export const STOP_COUNT = 1372;

/** Every route, in order (TransitDirectory's ROUTES) */
export const ROUTE_LINKS: { num: string; name: string; slug: string; color: string; textColor: string }[] = [
    { num: '1', name: 'Dieppe/Westerra – Broad North', slug: '1-dieppe-westerra-broad-north', color: '#46B9A2', textColor: '#000000' },
    { num: '2', name: 'Argyle Park – Wood Meadows', slug: '2-argyle-park-wood-meadows', color: '#D26900', textColor: '#000000' },
    { num: '3', name: 'University – Sherwood Estates', slug: '3-university-sherwood-estates', color: '#B5934A', textColor: '#000000' },
    { num: '4', name: 'Hillsdale – Walsh Acres', slug: '4-hillsdale-walsh-acres', color: '#CCCC00', textColor: '#000000' },
    { num: '5', name: 'Uplands – Downtown', slug: '5-uplands-downtown', color: '#000080', textColor: '#FFFFFF' },
    { num: '6', name: 'Westhill – Ross Industrial', slug: '6-westhill-ross-industrial', color: '#004000', textColor: '#FFFFFF' },
    { num: '7', name: 'Glencairn – Whitmore', slug: '7-glencairn-whitmore', color: '#3478CB', textColor: '#000000' },
    { num: '8', name: 'Normandy Heights – Eastview', slug: '8-normandy-heights-eastview', color: '#800000', textColor: '#000000' },
    { num: '9', name: 'Parkridge – Albert Park', slug: '9-parkridge-albert-park', color: '#9161AD', textColor: '#000000' },
    { num: '10', name: 'RCMP – Normanview', slug: '10-rcmp-normanview', color: '#FF00FF', textColor: '#000000' },
    { num: '12', name: 'Varsity Park – Mount Royal', slug: '12-varsity-park-mount-royal', color: '#009500', textColor: '#000000' },
    { num: '15', name: 'Heritage West – Heritage East', slug: '15-heritage-west-heritage-east', color: '#B700B7', textColor: '#000000' },
    { num: '16', name: 'Hawkstone – Lakeridge', slug: '16-hawkstone-lakeridge', color: '#808080', textColor: '#000000' },
    { num: '17', name: 'Maple Ridge West – Maple Ridge East', slug: '17-maple-ridge-west-maple-ridge-east', color: '#AB4793', textColor: '#000000' },
    { num: '18', name: 'Harbour Landing – University', slug: '18-harbour-landing-university', color: '#A6C639', textColor: '#000000' },
    { num: '21', name: 'University – Glencairn', slug: '21-university-glencairn', color: '#CA0000', textColor: '#000000' },
    { num: '22', name: 'University – Arcola East', slug: '22-university-arcola-east', color: '#006C00', textColor: '#000000' },
    { num: '24', name: 'Airport – Downtown', slug: '24-airport-downtown', color: '#000000', textColor: '#FFFFFF' },
    { num: '30', name: 'University – Rochdale Express', slug: '30-university-rochdale-express', color: '#595959', textColor: '#000000' },
    { num: '40', name: 'Albert S Express – Albert N Express', slug: '40-albert-s-express-albert-n-express', color: '#09C0CA', textColor: '#000000' },
    { num: '50', name: 'Victoria E Express – Victoria Downtown Express', slug: '50-victoria-e-express-victoria-downtown-express', color: '#5B0000', textColor: '#FFFFFF' },
    { num: '60', name: 'Arcola E Express – Arcola Downtown Express', slug: '60-arcola-e-express-arcola-downtown-express', color: '#CA0000', textColor: '#000000' },
];
