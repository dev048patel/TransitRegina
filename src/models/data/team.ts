/* The people behind Transit Regina and the facts shown on the team pages (/connect).

   Each person's page is their portfolio link: /connect/<slug>.
   Fields left as '' or [] are still to be filled in. In development the page shows a dashed
   reminder box in their place; on the live site those parts are simply left out. */
import type { MarkerCharacterId } from './markerCharacters';
import { FOUNDERS, STOP_COUNT } from './siteFacts';

/** The skill areas the game's skills map groups everything into */
export const SKILL_AREAS = ['Frontend', 'Backend & APIs', 'Security', 'Algorithms & data', 'Cloud & DevOps', 'Product & design', 'People & leadership'] as const;
export type SkillArea = typeof SKILL_AREAS[number];

export interface TeamMember {
    /** The end of their link: /connect/<slug> */
    slug: string;
    name: string;
    title: string;
    focus: string;
    /** The map character shown beside them (and instead of a photo until one is added) */
    character: MarkerCharacterId;
    /** Picked up from src/assets/team/<slug>.jpg (or png/webp); '' shows the character instead */
    photo: string;
    /** One line under the name */
    pitch: string;
    /** A few short paragraphs in their own words */
    about: string[];
    /** Where they study, shown under the name */
    education: string;
    /** Jobs and roles, newest first */
    experience: { role: string; org: string; kind: string; from: string; to: string; hook?: string; detail?: string; tags?: string[]; stat?: { value: string; label: string }; areas?: SkillArea[] }[];
    /** What they built on Transit Regina: each one is a passenger on their bus */
    built: {
        title: string; detail: string; sub?: string; tags?: string[]; stat?: { value: string; label: string };
        /** One line that sells it, shown the moment you say hi */
        hook?: string;
        /** For hiring managers: the problem, what this person did, and how it works (a sentence or two each) */
        problem?: string; did?: string; how?: string;
        /** The hardest part, and how it was solved */
        challenge?: string;
        /** Skill areas this shows (for the skills map in the game) */
        areas?: SkillArea[];
        /** The path the data takes, a few words per step: drawn as a little animated chain */
        flow?: string[];
    }[];
    skills: string[];
    /** The skills grouped by layer, for the driver's "Tech stack" answer; without it the flat list is shown */
    stack?: { group: string; items: string[] }[];
    /** Courses with a credential, newest first */
    certifications: { name: string; issuer: string; date: string }[];
    /** Awards and honour lists, newest first */
    honours: { name: string; issuer: string; date: string }[];
    /** Work outside Transit Regina */
    projects: {
        name: string;
        blurb: string;
        tags: string[];
        /** One number worth showing large */
        stat?: { value: string; label: string };
        /** The problem it set out to solve */
        problem?: string;
        /** One line that sells it */
        hook?: string;
        /** How it works, the hardest part, and the skill areas it shows */
        how?: string;
        challenge?: string;
        areas?: SkillArea[];
        status?: string;
        link?: string;
        linkLabel?: string;
    }[];
    linkedin: string;
    github: string;
    /** Shown as an "Email me" button when filled in */
    email: string;
    /** Import a PDF and put it here to show a "Résumé" button */
    resume: string;
    openToWork: boolean;
}

/* Photos are found by file name, so adding one needs no code change: src/assets/team/<slug>.jpg.
   import.meta.env exists only under Vite; at build time (scripts/prerender.tsx runs this file in plain
   Node) there are no photos, which is fine because the pre-rendered pages only need the text. */
const photos = (import.meta.env
    ? import.meta.glob('../../assets/team/*.{jpg,jpeg,png,webp}', { eager: true, import: 'default' })
    : {}) as Record<string, string>;
const photoFor = (slug: string) =>
    Object.entries(photos).find(([path]) => path.split('/').pop()!.split('.')[0] === slug)?.[1] ?? '';

/* Education, certifications, honours, contact email and the full job history come from each
   person's LinkedIn profile (read 17 Oct 2026). */

/* Who built what follows the repository itself (12 Oct 2026): `git blame` on the committed code
   gives Dev about 78% of the surviving lines — all of the admin panel, accounts, backend, tests and
   landing pages, and most of the map screen and stop board — and Nirjar about 22%, concentrated in
   the trip planner (68% of it) and in tracking and live-bus motion (79%). Edit the wording freely. */
export const TEAM: TeamMember[] = [
    {
        slug: FOUNDERS.dev.slug,
        name: FOUNDERS.dev.name,
        title: 'Founder',
        focus: 'Full-stack: Live Map, APIs & Security',
        character: 'astronaut',
        photo: photoFor('dev'),
        pitch: 'Founder of Transit Regina and full-stack developer, working across the whole system: the live map riders use, and the API, security and admin tools behind it.',
        about: [
            'I founded Transit Regina to make Regina\'s buses easier to use: every bus live on one map, real arrival times at every stop, and trips planned door to door. Since January 2026 it has grown into a full live service with accounts, text alerts, an admin panel and its own monitoring.',
            'My work spans the whole system: the live map and stop board riders use every day, the API behind them, sign-in and two-step security, the admin tools that run the service, and the insights that show how it is used. Riders should only ever see something fast and simple; the engineering underneath is what makes that possible.',
            'I am most interested in where interface and engineering meet: live data that has to feel instant, security that stays out of the way, and systems a small team can run with confidence.',
        ],
        education: 'Bachelor\'s in Computer Science, University of Regina · 2023 to 2027',
        experience: [
            { role: 'Student, Junior Employee Digital Experience Consultant', org: 'FCC / FAC', kind: 'Co-op', from: 'Sep 2026', to: 'Now', detail: 'A co-op term on the digital experience team at Farm Credit Canada.', tags: ['Digital experience', 'Consulting'], hook: 'Now: a co-op on Farm Credit Canada\'s digital experience team.', areas: ['Product & design'] },
            { role: 'Meat, Deli & Bakery Clerk', org: 'FreshCo', kind: 'Part-time', from: 'Jul 2023', to: 'Now', detail: 'Three years on the floor alongside my degree, taking on more than the role: helping train staff and coordinate shifts for an 8-person team, keeping food-safety standards, and joining the quarterly stock counts that keep waste down.', tags: ['Team leadership', 'Training', 'Food safety', 'Inventory'], stat: { value: '3+ yrs', label: 'while studying full time' }, hook: 'Three years on the shop floor, alongside a full-time degree.', areas: ['People & leadership'] },
            { role: 'Peer Tutor', org: 'University of Regina', kind: 'Tutoring', from: 'Jan 2024', to: 'Aug 2026', detail: 'Helped students get unstuck in programming and mathematics. I diagnose the logic error, then teach the thinking behind the fix so they do not hit the same wall twice, adapting to how each person learns and keeping notes on the patterns that come up again and again.', tags: ['Programming', 'Mathematics', 'Teaching'], stat: { value: '2 yrs 8 mos', label: 'of one-to-one tutoring' }, hook: 'Taught the thinking, not just the fix.', areas: ['People & leadership'] },
            { role: 'Crew Member', org: "McDonald's", kind: 'Part-time', from: 'Apr 2024', to: 'Dec 2025', detail: 'Fast, accurate service under pressure: orders, payments, cleanliness and safety, all at once, as part of a team that has to move as one.', tags: ['Teamwork', 'Working under pressure', 'Customer service'], hook: 'Fast, accurate and calm under pressure, every shift.', areas: ['People & leadership'] },
            { role: 'Community Resources Coordinator', org: 'United Way Regina', kind: 'Co-op', from: 'Sep 2024', to: 'Dec 2024', detail: 'My first professional role, and the one that taught me data tells stories that move people to act. My presentations to corporate and government partners lifted donor participation by 18% and pledge conversions by 15%, and my Excel dashboards checked every donation record and gave leadership a live picture of the campaign.', tags: ['Data storytelling', 'Excel dashboards', 'Stakeholder presentations'], stat: { value: '+18%', label: 'donor participation' }, hook: 'Turned donation data into an 18% jump in donor participation.', areas: ['Algorithms & data', 'People & leadership'] },
            { role: 'Club Member', org: 'Google Developer Student Club, University of Regina', kind: 'Community', from: 'Sep 2024', to: 'Oct 2025', hook: 'Building and learning alongside Regina\'s student developers.', areas: ['People & leadership'] },
        ],
        /* Checked against the code on 23 Nov 2026. `flow` is the path the data takes, drawn step by step
           when someone asks how it works. */
        built: [
            { title: 'The live map', sub: 'What riders see first', detail: 'Every Regina bus on one map, updated every 1.5 seconds and coloured by route, with your location, saved places and a layout made for phones.', tags: ['React 19', 'TypeScript', 'Google Maps', 'Express 5'], stat: { value: '1.5 s', label: 'between live updates' }, hook: 'Every bus in Regina, live, in your pocket.', problem: 'Riders juggled a schedule site, a live map and Google Maps, and still missed the bus.', how: 'Each map asks our API for positions every 1.5 seconds. The API fetches the city\'s feed once and shares that copy with everyone.', challenge: 'Hundreds of maps asking at once would hammer a feed we do not control. Sharing one copy, never more than half a second old, keeps it to two requests a second at most.', areas: ['Frontend', 'Backend & APIs'], flow: ['Map asks every 1.5 s', 'Our API', 'One shared copy, under 500 ms old', 'TransitLive feed'] },
            { title: 'Stop board', sub: 'When is my bus actually coming?', detail: 'Tap any stop and see every bus still coming today, with live predictions instead of timetable guesses.', tags: ['Express 5', 'REST API', 'React'], stat: { value: STOP_COUNT.toLocaleString('en-CA'), label: 'stops covered' }, hook: 'Tap a stop. See every bus still coming today.', problem: 'A timetable says when a bus should come, not when it will.', how: 'Our API asks TransitLive for the rest of the day\'s predicted departures at that stop and hands them to the board.', challenge: 'The feed is sometimes slow or down. Requests give up after 8 seconds, and the map tells riders whether there are no buses or just no data.', areas: ['Backend & APIs', 'Frontend'], flow: ['Tap a stop', 'Our API', 'TransitLive predictions', "Today's departures"] },
            { title: 'Map characters', sub: 'Make the app yours', detail: 'Pick a character and the whole map screen takes on its colours and voice.', tags: ['Theming', 'Design system'], stat: { value: '6', label: 'characters to choose from' }, hook: 'Six characters. One app that feels like yours.', problem: 'Every transit app looks the same: grey, grey, grey.', how: 'Each character is a set of colours and words kept in one place, so no screen needs to know which one you picked.', challenge: 'Six looks without six copies of every screen. Each colour comes with a soft tint and a dark shade, so text stays readable on every theme.', areas: ['Product & design', 'Frontend'], flow: ['Pick a character', 'Its colours and words', 'Every screen updates'] },
            { title: 'This bus ride', sub: 'The page you are on', detail: 'A 3D scene built entirely in code: the people, the city, the bus and the game you are playing.', tags: ['three.js', 'WebGL', 'TypeScript'], stat: { value: '0', label: '3D model files: every shape is code' }, hook: 'You are standing in it.', problem: 'Portfolios get about a minute. This one should earn more.', how: 'three.js with cel shading and ink outlines. Your scroll moves the camera, and game mode lets you walk the aisle and talk to anyone.', challenge: 'Two dozen animated people were too much for phones. Merging each body into fewer pieces cut a person from about 60 draw calls to 12, and the scene lowers its resolution if it drops below 30 frames a second.', areas: ['Frontend', 'Product & design'], flow: ['You scroll or walk', 'Camera moves', 'three.js draws', 'Too slow? Fewer pixels'] },
            { title: 'Architecture', sub: 'The shape every feature follows', detail: 'Views draw, controllers decide, models own the data, on the website and the server alike.', tags: ['MVC', 'TypeScript'], stat: { value: '3', label: 'layers, and no feature skips one' }, hook: 'How two students shipped fast without breaking things.', problem: 'Two people adding features to one app gets messy fast.', how: 'Every feature is a model, a controller and a view, and nothing skips a layer, so each change has one obvious home.', challenge: 'Reorganising a working app in March 2026 while features kept shipping. Every feature since, from the trip planner to the admin panel, had one clear place to go.', areas: ['Backend & APIs', 'Frontend'], flow: ['View draws', 'Controller decides', 'Model does the work', 'Database or API'] },
            { title: 'Accounts and sign-in', sub: 'Who you are, and what you may do', detail: 'Sign-up and sign-in, three roles, an authenticator-app step for admins, and a 30-minute idle sign-out on the admin panel.', tags: ['Supabase Auth', 'Two-step sign-in', 'Roles'], stat: { value: '2 steps', label: 'to sign in as an admin' }, hook: 'Locked doors that riders never notice.', problem: 'Admins can change anything, so a stolen password alone should not be enough.', how: 'The server checks every request: who you are, your role, and for admins a recent code from an authenticator app.', challenge: 'A phone left signed in would count as "two-step" forever. Admin access now lapses after 12 hours, and anything that cannot be undone asks for a code from the last 10 minutes.', areas: ['Security', 'Backend & APIs'], flow: ['Sign in', 'Token on every request', 'Role checked', 'Admins: fresh code'] },
            { title: 'Admin panel', sub: 'Running the service', detail: 'People and roles, a switch for every feature, text-alert approvals, usage insights and a security centre.', tags: ['React', 'Express', 'PostgreSQL'], stat: { value: '15', label: 'kinds of admin action in the audit log' }, hook: 'Run the whole service without touching code.', problem: 'A live service needs changes at any hour, without a redeploy.', how: 'Switches live in the database, changes need two-step sign-in, and every admin action is written to an audit log.', challenge: 'Hiding a button is not the same as switching something off. Anything that costs money, like text alerts, is checked by the server before it happens.', areas: ['Frontend', 'Product & design'], flow: ['Admin flips a switch', 'Two-step check', 'Saved in the database', 'Audit log'] },
            { title: 'Usage insights', sub: 'Seeing what riders see', detail: 'Which features get used, who is online right now, problem reports from riders, and crashes from their phones, all in the admin panel.', tags: ['PostgreSQL', 'Analytics', 'Error reporting'], stat: { value: '90 days', label: 'then the data is deleted' }, hook: 'When something breaks on a rider\'s phone, we find out.', problem: 'Without data, a crash on someone\'s phone is invisible, and so is whether a feature gets used at all.', how: 'The app sends small events to our API, and the Insights pages show what happened for any stop, route, bus, page or error.', challenge: 'After each release, tabs left open asked for files that no longer existed, and crashed. The app now reloads itself once to pick up the new version, and never loops.', areas: ['Algorithms & data', 'Backend & APIs'], flow: ['Something happens in the app', 'Small event to our API', 'Insights pages', 'Deleted after 90 days'] },
            { title: 'Reminders that reach you', sub: 'Text and push', detail: 'Opt-in texts 15 minutes before a saved trip, browser push notifications, and replies like STOP handled instantly.', tags: ['Twilio', 'Web Push', 'Scheduled jobs'], stat: { value: '15 min', label: 'heads-up before your bus' }, hook: 'A text 15 minutes before your bus. Reply STOP and it stops.', problem: 'Most missed buses are a five-minute problem.', how: 'A job runs every minute, finds trips leaving in 15, and messages only riders who opted in with a verified number.', challenge: 'Anyone can post to a public webhook pretending to be Twilio. Incoming texts are accepted only with a valid Twilio signature.', areas: ['Backend & APIs', 'Cloud & DevOps'], flow: ['Every minute', 'Trips leaving in 15 min', 'Riders who opted in', 'Text or push'] },
            { title: 'Security audit and tests', sub: 'Security treated as a feature', detail: 'An October 2026 audit with all ten findings fixed, rate limits, a log of anything suspicious, and tests that keep the fixes in place.', tags: ['API security', 'Rate limiting', 'Automated testing'], stat: { value: '10 / 10', label: 'audit findings fixed' }, hook: 'Ten findings. Ten fixed. Tests keep them fixed.', problem: 'Accounts, admin powers and text messages add up to a target.', how: 'Rate limits and checks on every request, a log of anything suspicious, and a test for every fix.', challenge: 'Fixes can quietly come undone later. Each one has a test that tries the attack again, so a change that reopens a hole fails the test suite.', areas: ['Security'], flow: ['Request arrives', 'Rate limit', 'Checked', 'Anything odd is logged'] },
            { title: 'Launch and hosting', sub: 'From laptop to transitregina.ca', detail: 'The site on Vercel, the API on Railway, the data on Supabase, and plain-language privacy and terms pages.', tags: ['Vercel', 'Railway', 'Supabase'], hook: 'From a laptop to transitregina.ca.', problem: 'A student project only matters once real people can use it.', how: 'Each part deploys on its own, and a nightly job deletes old visitor and usage data after 90 days.', challenge: 'A copy of the server on a laptop shares the live database, so it would text riders twice. Scheduled jobs run only where they are switched on.', areas: ['Cloud & DevOps'], flow: ['Site on Vercel', 'API on Railway', 'Data on Supabase'] },
        ],
        certifications: [
            { name: 'Play It Safe: Manage Security Risks', issuer: 'Google', date: 'Aug 2026' },
            { name: 'Foundations of Cybersecurity', issuer: 'Google', date: 'Jul 2026' },
        ],
        honours: [
            { name: "Dean's Honour List", issuer: 'University of Regina', date: 'May 2026' },
        ],
        skills: ['TypeScript', 'React 19', 'Node.js', 'Express 5', 'PostgreSQL', 'Supabase', 'REST APIs', 'JWT & TOTP auth', 'API security', 'Rate limiting', 'Automated testing', 'three.js / WebGL', 'Tailwind CSS', 'Vite', 'Next.js', 'Python', 'Kotlin', 'Docker', 'Microsoft Azure', 'Twilio', 'Railway', 'Vercel'],
        stack: [
            { group: 'Frontend', items: ['React 19', 'TypeScript', 'Vite', 'Tailwind CSS', 'Google Maps JS API', 'three.js / WebGL', 'Framer Motion'] },
            { group: 'Backend', items: ['Node.js', 'Express 5', 'REST', 'node-cron', 'Twilio', 'Web Push'] },
            { group: 'Data', items: ['PostgreSQL', 'Supabase', 'Row-level security', 'SQL migrations'] },
            { group: 'Security', items: ['JWT verification', 'TOTP two-step', 'Role-based access', 'Rate limiting', 'Content-Security-Policy', 'Audit logging'] },
            { group: 'Infra & testing', items: ['Railway', 'Vercel', 'node:test', 'Git & pull requests'] },
            { group: 'Also', items: ['Python', 'Kotlin', 'Next.js', 'Docker', 'Microsoft Azure'] },
        ],
        /* From Dev's GitHub READMEs and LinkedIn projects */
        projects: [
            { name: 'AI Code Review Verifier', problem: 'AI-written pull requests can look right and still be wrong.', blurb: 'A GitHub App that reviews pull requests, especially AI-written ones: it writes edge-case tests, checks them with mutation testing, and posts a trust score with the evidence.', tags: ['TypeScript', 'GitHub App', 'Mutation testing', 'Docker'], stat: { value: '13 / 13', label: 'seeded bugs caught in its own evaluation' }, link: 'https://github.com/dev048patel/AI-generate-code-review-verifier', hook: 'Checks whether AI-written code is actually right.', areas: ['Security', 'Backend & APIs', 'Algorithms & data'] },
            { name: 'dmarc-translate', problem: 'DMARC reports are dense XML that most domain owners cannot read.', blurb: 'Reads DMARC reports and says in plain English who is sending email as your domain, and when it is safe to start blocking them.', tags: ['Python', 'parsedmarc', 'SQLite', 'Email security'], status: 'In progress', link: 'https://github.com/dev048patel/dmarc-translate', hook: 'Tells you, in plain English, who is sending email as you.', areas: ['Security', 'Backend & APIs'] },
            { name: 'CourseFlow', problem: 'Choosing courses usually runs on rumours; students need honest reviews and a clear path to graduation.', blurb: 'A peer-to-peer academic guidance platform for university students: verified anonymous course reviews, GPA and credit tracking, and suggested next courses.', tags: ['Next.js', 'TypeScript', 'Supabase'], link: 'https://github.com/dev048patel/courseflow', hook: 'Honest course reviews and a clear path to graduation.', areas: ['Frontend', 'Backend & APIs'] },
            { name: 'FinScan', problem: 'Checking receipts against records by hand is slow, and mistakes slip through.', blurb: 'A financial audit platform that used OCR to check receipts in under five seconds and flag anomalies, with role-based access and an audit trail. Retired when running costs outgrew a self-funded student project.', tags: ['Python', 'OCR', 'React', 'Supabase'], stat: { value: '25+', label: 'people used it' }, status: 'Retired', hook: 'Receipts checked in under five seconds.', areas: ['Security', 'Algorithms & data'] },
            { name: 'AlgoLens', problem: 'A student stuck on a maths problem needs the steps, not just the answer.', blurb: 'An Android app that solved photographed math problems step by step, built on a custom OCR pipeline with a backend on Microsoft Azure. Retired over API costs.', tags: ['Kotlin', 'Android', 'OCR', 'Azure'], stat: { value: '30+', label: 'University of Regina students used it' }, status: 'Retired', hook: 'Photograph a maths problem, get the steps.', areas: ['Algorithms & data', 'Cloud & DevOps'] },
            { name: 'AI Finance Platform', blurb: 'A personal finance app with AI-written spending summaries and live dashboards.', tags: ['Next.js', 'Prisma', 'Supabase', 'Gemini API'], link: 'https://github.com/dev048patel/AI-Finance', hook: 'Your spending, summarised by AI.', areas: ['Frontend', 'Algorithms & data'] },
        ],
        linkedin: FOUNDERS.dev.linkedin,
        github: FOUNDERS.dev.github,
        email: '',
        resume: '',
        openToWork: false,
    },
    {
        slug: FOUNDERS.nirjar.slug,
        name: FOUNDERS.nirjar.name,
        title: 'Co-Founder',
        focus: 'Trip Planning, Live Tracking & Maps',
        character: 'fox',
        photo: photoFor('nirjar'),
        pitch: 'Fourth-year computer science student and co-founder of Transit Regina. I built the trip planner and the live tracking that follows your ride.',
        /* Drafted from Nirjar's GitHub profile and LinkedIn — for him to rewrite in his own words */
        about: [
            '"Ship something real, then make it rigorous." That is how I like to work, and it is how my part of Transit Regina got built: a trip planner that works first, then one that is right about which side of the street you stand on.',
            'I am in my fourth year of computer science, on the Dean\'s List for Fall 2025 and Winter 2026. Before this I spent almost two years as a Junior Technical Business Analyst with the Government of Saskatchewan on the GEM Program, a province-wide Oracle HCM rollout delivered with Deloitte.',
            'I am drawn to AI and machine-learning tooling, transit systems and data-driven automation, and I am looking for co-op or term positions in software development, data or business analysis.',
        ],
        education: 'BSc in Computer Science, University of Regina · since 2023',
        experience: [
            { role: 'Meat Clerk', org: 'FreshCo', kind: 'Part-time', from: 'Sep 2026', to: 'Now', tags: ['Customer service', 'Food safety'], hook: 'Working while finishing his degree.', areas: ['People & leadership'] },
            { role: 'Junior Technical Business Analyst', org: 'Government of Saskatchewan', kind: 'Co-op, then contract', from: 'Sep 2024', to: 'May 2026', detail: 'Almost two years on the GEM Program, a province-wide Oracle HCM rollout delivered with Deloitte: supported software testing in ALM Octane, kept files in order across the development and testing teams in SharePoint, and learned how human capital management works across a whole government.', tags: ['Oracle HCM', 'ALM Octane', 'Software testing', 'SharePoint'], stat: { value: '1 yr 9 mos', label: 'on a province-wide rollout' }, hook: 'Almost two years on a province-wide Oracle HCM rollout.', areas: ['Product & design', 'People & leadership'] },
            { role: 'Club Member', org: 'Google Developer Student Club, University of Regina', kind: 'Community', from: 'Aug 2024', to: 'Oct 2025', hook: 'Building and learning alongside Regina\'s student developers.', areas: ['People & leadership'] },
            { role: 'OMNI Customer Fulfillment Associate', org: 'Walmart Canada', kind: 'Part-time', from: 'Jun 2023', to: 'Apr 2025', detail: 'Picked and fulfilled online orders with handheld technology, solved customer problems on the spot, and worked across teams to get orders out accurately and on time.', tags: ['Order fulfillment', 'Problem solving', 'Customer service'], hook: 'Online orders out the door, accurate and on time.', areas: ['People & leadership'] },
            { role: 'Club Coordinator', org: 'UofR Computer Science Students Society', kind: 'Leadership', from: 'Jan 2023', to: 'Dec 2023', detail: 'Ran weekly meetings for 30 members from agenda to activities, grew the society by 40% with targeted social posts and flyers, handled rooms and approvals with staff, and kept the records other members relied on.', tags: ['Leadership', 'Event planning', 'Communication'], stat: { value: '+40%', label: 'membership growth' }, hook: 'Grew the computer science society by 40% in a year.', areas: ['People & leadership'] },
        ],
        built: [
            { title: 'Trip planner', sub: 'How do I get there?', detail: 'The engine behind every suggested trip: door to door with transfers, a 500 m walking search that widens to 800 m when nothing is close, three levels of direction checks against GTFS data, and live arrival times folded in before the best five trips are ranked.', tags: ['TypeScript', 'GTFS', 'Routing algorithms'], stat: { value: 'Top 5', label: 'trips ranked for every search' }, hook: 'Answers the real question: which stop, which bus, where to switch.', problem: 'Knowing a bus is coming is easy. Knowing which stop to walk to is not.', did: 'Nirjar wrote about two thirds of the trip planner.', how: 'It searches stops within 500 m (800 m if needed), checks direction three ways against GTFS, mixes direct, transfer and walking options, ranks them by live wait and keeps the top five.', challenge: 'The nearest stop is often on the wrong side of the road. The planner keeps every nearby stop for each route, closest first, and tries each until the direction check passes; when GTFS has no direction data, it treats the answer as unknown rather than wrong, so gaps in the data never hide a real trip.', areas: ['Algorithms & data'] },
            { title: 'Live trip tracking', sub: 'Your ride, step by step', detail: 'Follows your ride with real-time GPS along road-following route lines, highlights the leg you are on, and keeps one line at the top that says what to do right now.', tags: ['Google Maps', 'Geolocation', 'React'], hook: 'One line that tells you what to do right now.', problem: 'Mid-trip, nobody wants a map lecture. Just the next step.', did: 'Nirjar built trip tracking and the moving buses: about four fifths of that code.', how: 'Your GPS follows road-shaped route lines, the leg you are on lights up, and the top line says what is next.', challenge: 'Route shapes are closed loops: out on one side of the road, back on the other. To draw only your ride, the loop is cut between your two stops on the side the bus uses, matched to the stops\' directions within 60 degrees, and rejected if it covers more than 60% of the loop.', areas: ['Algorithms & data', 'Frontend'] },
            { title: 'Smooth live buses', sub: 'No more jumping icons', detail: 'Buses glide between position reports instead of jumping every few seconds, and stay on screen through turnarounds.', tags: ['Animation', 'Map overlays'], stat: { value: '1.5 s', label: 'reports, smoothed in between' }, hook: 'Buses glide instead of teleporting.', problem: 'Positions arrive every few seconds, so bus icons jumped across the map.', did: 'Nirjar made them move like real buses.', how: 'Each bus animates between its last two reports, and turnarounds are handled so none vanish at the end of a route.', challenge: 'Following the road round a corner looks right; following a wrong match sends a bus on a tour. A bus follows the road only when that path is at most twice the straight-line gap (plus 60 m); otherwise it glides straight.', areas: ['Frontend', 'Algorithms & data'] },
            { title: 'Place search', sub: 'Type where you are going', detail: 'Address search with Google Places autocomplete, tuned to put Regina first, later moved onto the new Places API.', tags: ['Google Places API', 'Autocomplete'], hook: 'Type an address. Get Regina first.', problem: 'Riders type in a hurry, and the app has to find the place instantly.', did: 'Nirjar built address search, then moved it onto Google\'s new Places API.', how: 'Autocomplete is biased to Regina, and one tap gives the planner exact coordinates.', challenge: 'Google retired the old autocomplete. The move to the new Places API kept each search and its follow-up lookup in a single billing session, so cost did not double.', areas: ['Frontend', 'Backend & APIs'] },
            { title: 'Detours on the map', sub: 'See the change before the stop', detail: 'When a route is diverted, the detour road and route are drawn beside the regular line, so riders see it before they walk to a stop that is not served.', tags: ['Google Maps', 'GTFS'], hook: 'See the detour before you walk to a dead stop.', problem: 'During a detour, riders wait at stops the bus skips.', did: 'Nirjar drew detours onto the map.', how: 'Detour shapes are bundled per route and filtered by date, so only the detours in effect today are drawn over the regular lines.', challenge: 'Detours are temporary. Showing an old one is worse than showing none, so every detour carries its dates and is checked against today before it reaches the map.', areas: ['Frontend'] },
            { title: 'Stop direction', sub: 'The right side of the street', detail: 'Uses each stop\'s direction of travel (northbound, southbound, eastbound, westbound) to send you to the correct side of the road, with an arrow on every stop.', tags: ['GTFS', 'Map UX'], hook: 'Right stop, right side of the street.', problem: 'Opposite stops share a name. Pick the wrong one and you ride the wrong way.', did: 'Nirjar made the planner aware of which side of the street each stop is on.', how: 'Each stop\'s direction from GTFS (NB, SB, EB, WB) picks the side, and every stop gets an arrow.', challenge: 'Opposite stops share a name and sit metres apart. Instead of trusting names, the planner compares the bus\'s heading with each stop\'s direction of travel to decide which side of the street you need.', areas: ['Algorithms & data'] },
        ],
        certifications: [
            { name: 'Play It Safe: Manage Security Risks', issuer: 'Google', date: 'Aug 2026' },
            { name: 'Foundations of Cybersecurity', issuer: 'Google', date: 'Aug 2026' },
            { name: 'Supervised Machine Learning: Regression and Classification', issuer: 'DeepLearning.AI', date: 'Jul 2026' },
            { name: 'Introduction to Artificial Intelligence (AI)', issuer: 'IBM', date: 'Aug 2024' },
            { name: 'The Bits and Bytes of Computer Networking', issuer: 'Google', date: 'Jul 2024' },
        ],
        honours: [
            { name: "Dean's Honour List, Winter 2026", issuer: 'University of Regina', date: 'May 2026' },
            { name: "Dean's Honour List, Fall 2025", issuer: 'University of Regina', date: 'Feb 2026' },
        ],
        skills: ['TypeScript', 'React', 'Google Maps Platform', 'GTFS', 'Route-planning algorithms', 'Python', 'TensorFlow', 'FastAPI', 'C#', '.NET', 'SQL', 'Node.js', 'Socket.io'],
        /* From Nirjar's GitHub READMEs */
        projects: [
            { name: 'YardTracker', blurb: 'Tracks pipe and steel inventory as it moves through a yard. Operators scan tagged bundles on handhelds, trucks report GPS positions and plant machines report over Modbus. A working end-to-end model of an industrial floor system, with a scan audit trail, ETL and reporting on top.', tags: ['C#', '.NET', 'WPF', 'WCF', 'T-SQL', 'Modbus'], link: 'https://github.com/nirjar1012/inventory-asset-tracking-system', hook: 'Tracks every steel bundle across an industrial yard.', areas: ['Backend & APIs', 'Algorithms & data'] },
            { name: 'Stock Price Prediction Dashboard', blurb: 'Forecasts daily share prices in the agri-food sector with an LSTM and Prophet, scores both against a no-change baseline in a rolling backtest, and presents the results in a live dashboard and a quarterly Excel report.', tags: ['Python', 'TensorFlow', 'Prophet', 'FastAPI', 'SQLite'], stat: { value: '9', label: 'agri-food companies forecast' }, link: 'https://github.com/nirjar1012/stock-prediction-dashboard', hook: 'Forecasts agri-food share prices, honestly back-tested.', areas: ['Algorithms & data'] },
            { name: 'Chatty', blurb: 'A real-time chat app on the MERN stack with Socket.io: secure sign-in, online presence, profile pictures and a choice of themes.', tags: ['React', 'Node.js', 'MongoDB', 'Socket.io'], stat: { value: '30+', label: 'themes to pick from' }, status: 'Live', link: 'https://chat-temp-two.vercel.app', linkLabel: 'Open the live demo', hook: 'Real-time chat with 30+ themes to pick from.', areas: ['Frontend', 'Backend & APIs'] },
        ],
        linkedin: FOUNDERS.nirjar.linkedin,
        github: FOUNDERS.nirjar.github,
        email: '',
        resume: '',
        openToWork: false,
    },
];

/* ── The project, for the team page ── */

export const PROJECT = {
    site: 'https://transitregina.ca',
    siteLabel: 'transitregina.ca',
    tagline: 'Two students. One city. Every bus.',
    story: 'A timetable says when the bus should come. Riders need to know when it will. We are two computer science students in Regina who built Transit Regina, an unofficial bus tracker, to show the live picture, so you can leave at the right time instead of waiting in the cold.',
};

/* The route so far — taken from the commit history */
export const TIMELINE = [
    { when: 'Jan 2026', title: 'First commit', detail: 'The project starts life as GoTransit Regina.' },
    { when: 'Feb 2026', title: 'Accounts, search and tracking', detail: 'User accounts on Postgres, Google Places search, and route tracking with real-time GPS along road-following lines. The database moves to Supabase.' },
    { when: 'Mar 2026', title: 'The stop board, and a phone-ready app', detail: 'Tap a stop for live arrivals, a "you are here" marker, a full mobile layout, and the code reorganised into models, views and controllers.' },
    { when: 'Apr 2026', title: 'Planner, push and detours', detail: 'A weekly planner, push notifications, per-feature access switches for admins, and detour routes drawn on the map.' },
    { when: 'May 2026', title: 'Text reminders', detail: 'SMS notifications through Twilio, with an opt-in flow.' },
    { when: 'Oct 2026', title: 'Transit Regina', detail: 'A new name, map characters, gliding buses, a direction-aware trip planner, two-step sign-in for admins and a full security audit.' },
];

/* Snapshot taken on 12 October 2026 from the repository — update when it matters */
export const PROJECT_NUMBERS = [
    { value: 'Jan 2026', label: 'Building since' },
    { value: '22', label: 'Regina routes' },
    { value: STOP_COUNT.toLocaleString('en-CA'), label: 'Bus stops' },
    { value: '1.5 s', label: 'Live refresh' },
];

/* Snapshot taken on 23 November 2026: git log, git blame, and the two test suites (main app and SMS service) */
export const BUILD_NUMBERS = [
    { value: '295', label: 'commits' },
    { value: '65', label: 'merged pull requests' },
    { value: '39,500', label: 'lines of TypeScript' },
    { value: '256', label: 'automated tests' },
];

export const PROJECT_FEATURES = [
    { icon: 'Navigation', title: 'Live map', detail: 'Every bus as it moves, refreshed every 1.5 seconds and coloured by route.' },
    { icon: 'Map', title: 'Trip planner', detail: 'Door-to-door routes with transfers and live arrival predictions.' },
    { icon: 'Clock', title: 'Stop board', detail: 'The next departures at any stop, one tap from the map.' },
    { icon: 'Route', title: 'Trip tracking', detail: 'One line tells you what to do right now, with every step of the trip below.' },
    { icon: 'Smile', title: 'Characters', detail: 'Pick a character and the whole map screen takes on its colours and voice.' },
    { icon: 'Heart', title: 'Saved places', detail: 'Keep home, school and work one tap away.' },
];

/* How a tap becomes a bus on the map */
export const ARCHITECTURE = [
    { name: 'Browser', tech: 'React 19 · Vite · Google Maps', detail: 'Draws the map and asks for fresh bus positions every 1.5 seconds.' },
    { name: 'API', tech: 'Express 5 · TypeScript', detail: 'Guards, validates and rate-limits every request, and shares one copy of the live feed between all riders.' },
    { name: 'Data', tech: 'Supabase (Postgres) · TransitLive feed', detail: 'Accounts, saved places and admin settings in Postgres; live bus positions from the Regina Transit feed.' },
];

export const HARD_PARTS = [
    { title: 'A live loop that stays smooth', detail: 'Poll the feed, merge what changed and redraw, every 1.5 seconds. Buses glide between reports instead of jumping.' },
    { title: 'A trip planner that respects direction', detail: 'Three levels of direction checks against GTFS data, a 500 m then 800 m walking search, live arrival times folded in, and the best five trips ranked.' },
    { title: 'Security treated as a feature', detail: 'Two-step sign-in for admins, a security event log, and a full audit whose ten findings were all fixed and locked in with tests.' },
    { title: 'Three clean layers', detail: 'Views draw the screen, controllers hold the logic, models own the data. Every feature follows the same split.' },
];

export const STACK = ['TypeScript', 'React 19', 'Vite', 'Tailwind CSS', 'Framer Motion', 'Google Maps', 'Node.js', 'Express 5', 'Supabase', 'PostgreSQL', 'Twilio', 'Web Push', 'Railway', 'Vercel'];
