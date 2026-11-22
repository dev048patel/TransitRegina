/*
 The text scripts/prerender.tsx writes into pages whose React screens can't be rendered outside the
 browser (the homepage and the team pages: animation, games, images). Each is plain HTML in a
 <main data-prerender> block, which index.html hides as soon as JavaScript runs, so people only ever
 see the app. It is for search engines, link previews and browsers without JavaScript, so it must say
 what the app says: the same headline (H1) and the same facts, taken from the same data.
*/
import { heroContent } from '../src/models/data/mock/landingMockData';
import { ROUTE_LINKS } from '../src/models/data/siteFacts';
import { PROJECT, PROJECT_FEATURES, TEAM, TIMELINE, type TeamMember } from '../src/models/data/team';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const main = (inner: string) => `<main data-prerender style="max-width:44rem;margin:0 auto;padding:3rem 1.25rem;font-family:Inter,system-ui,sans-serif">\n${inner}\n</main>`;
const section = (heading: string, items: string[]) => (items.length ? `<h2>${esc(heading)}</h2>\n<ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>` : '');
const link = (href: string, text: string) => `<a href="${esc(href)}">${esc(text)}</a>`;

/** The homepage: the hero's headline and words, the ways in, and every route */
export function homeSnapshot(): string {
    return main([
        `<h1>${esc(heroContent.headline)}</h1>`,
        `<p>${esc(heroContent.subheadline)}</p>`,
        `<p>${heroContent.trustIndicators.map(esc).join(' · ')}. Unofficial: not affiliated with the City of Regina or Regina Transit.</p>`,
        `<p>${link('/map', heroContent.primaryCTA)} · ${link('/routes', 'All Regina bus routes')} · ${link('/about', 'About')}</p>`,
        section('Every Regina bus route', ROUTE_LINKS.map(r => link(`/routes/${r.slug}`, `Route ${r.num} ${r.name}`))),
    ].join('\n'));
}

/** /connect: the project, the two of us, what it does and how it got here */
export function connectSnapshot(): string {
    return main([
        `<h1>${esc(PROJECT.tagline)}</h1>`,
        `<p>${esc(PROJECT.story)}</p>`,
        section('The team', TEAM.map(p => `${link(`/connect/${p.slug}`, p.name)}, ${esc(p.title)}: ${esc(p.focus)}. ${esc(p.pitch)}`)),
        section('What Transit Regina does', PROJECT_FEATURES.map(f => `<strong>${esc(f.title)}</strong>: ${esc(f.detail)}`)),
        section('How it got here', TIMELINE.map(t => `<strong>${esc(t.when)}, ${esc(t.title)}</strong>: ${esc(t.detail)}`)),
        `<p>${link('/', 'Transit Regina')} · ${link('/map', 'Open the live map')} · ${link('/about', 'About')}</p>`,
    ].join('\n'));
}

/** /connect/<slug>: one person's portfolio, the parts that are filled in */
export function teamSnapshot(p: TeamMember): string {
    const others = TEAM.filter(o => o.slug !== p.slug);
    return main([
        `<h1>${esc(p.name)}</h1>`,
        `<p><strong>${esc(p.title)} of Transit Regina · ${esc(p.focus)}</strong></p>`,
        `<p>${esc(p.pitch)}</p>`,
        p.education ? `<p>${esc(p.education)}</p>` : '',
        `<p>${link(p.linkedin, 'LinkedIn')} · ${link(p.github, 'GitHub')}${p.email ? ` · ${link(`mailto:${p.email}`, 'Email')}` : ''}</p>`,
        p.about.length ? `<h2>About me</h2>\n${p.about.map(a => `<p>${esc(a)}</p>`).join('\n')}` : '',
        section('What I built on Transit Regina', p.built.map(b => `<strong>${esc(b.title)}</strong>: ${esc(b.detail)}`)),
        section('Experience', p.experience.map(e => `<strong>${esc(e.role)}</strong>, ${esc(e.org)} (${esc(e.kind)}, ${esc(e.from)} to ${esc(e.to)})${e.detail ? `: ${esc(e.detail)}` : ''}`)),
        section('Other projects', p.projects.map(pr => `<strong>${pr.link ? link(pr.link, pr.name) : esc(pr.name)}</strong>: ${esc(pr.blurb)}`)),
        section('Skills', p.skills.map(esc)),
        section('Certifications', p.certifications.map(c => `${esc(c.name)}, ${esc(c.issuer)} (${esc(c.date)})`)),
        section('Honours', p.honours.map(h => `${esc(h.name)}, ${esc(h.issuer)} (${esc(h.date)})`)),
        `<p>${link('/connect', 'The team behind Transit Regina')}${others.map(o => ` · ${link(`/connect/${o.slug}`, o.name)}`).join('')}</p>`,
    ].filter(Boolean).join('\n'));
}
