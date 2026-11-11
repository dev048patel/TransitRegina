/**
 * RiderEmail — the look of every email riders get (text alert request and approval, SMS outage notice), and who it is
 * from. Admin alerts keep ALERT_FROM (alerts@…); riders get RIDER_EMAIL_FROM, replies going to the contact address.
 *
 * Built for email clients, not browsers, in the same design as the Supabase sign-up email: tables and inline styles
 * only (Gmail drops <style> blocks), 560px wide, readable without images, a button that works in Outlook too. The animated logo (public/email-logo.gif, 389 KB) is loaded from the live site; Outlook
 * on Windows shows its first frame, which is the whole logo. Every email also has a plain-text copy.
 */
import { SITE } from '../data/legal';

export const riderFrom = () => process.env.RIDER_EMAIL_FROM ?? `${SITE.brand} <noreply@transitregina.ca>`;
export const riderReplyTo = () => SITE.CONTACT_EMAIL;

export interface RiderEmailContent {
    /** The line inboxes show after the subject */
    preview: string;
    heading: string;
    greeting?: string;
    paragraphs: string[];
    button?: { label: string; url: string };
    /** "Once you're in, you can:" — an emoji, a bold title and a line each */
    list?: { title: string; items: { icon: string; title: string; text: string }[] };
    /** The soft grey box near the end, e.g. "Didn't ask for this?" */
    notice?: { title: string; text: string };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* The same look as the Supabase sign-up email (Supabase → Authentication → Emails), so every email from us matches */
const C = { page: '#F3F5F2', card: '#E3E8E2', green: '#2E7D32', ink: '#0F172A', body: '#334155', soft: '#475569', muted: '#64748B', faint: '#94A3B8', noticeBg: '#F6F8F5' };
const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;

export function riderEmail(c: RiderEmailContent): { html: string; text: string } {
    const p = (t: string) => `<p style="margin:0 0 14px 0; font-size:16px; line-height:26px; color:${C.body};">${esc(t)}</p>`;
    const button = c.button ? `
                <tr>
                  <td align="center" style="padding:12px 40px 8px 40px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" bgcolor="${C.green}" style="border-radius:999px; background-color:${C.green};">
                          <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${esc(c.button.url)}" style="height:48px; v-text-anchor:middle; width:260px;" arcsize="50%" stroke="f" fillcolor="${C.green}"><center style="color:#ffffff; font-family:Arial, sans-serif; font-size:16px; font-weight:bold;">${esc(c.button.label)}</center></v:roundrect><![endif]-->
                          <!--[if !mso]><!-->
                          <a href="${esc(c.button.url)}" target="_blank" style="display:inline-block; padding:14px 32px; font-family:${FONT}; font-size:16px; font-weight:700; line-height:20px; color:#ffffff; text-decoration:none; border-radius:999px;">${esc(c.button.label)}</a>
                          <!--<![endif]-->
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>` : '';
    const list = c.list ? `
                <tr>
                  <td style="padding:16px 40px 0 40px; font-family:${FONT};">
                    <p style="margin:8px 0 12px 0; font-size:14px; line-height:22px; font-weight:700; color:${C.ink};">${esc(c.list.title)}</p>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${c.list.items.map(i => `
                      <tr>
                        <td width="36" valign="top" style="padding:0 0 12px 0; font-size:20px; line-height:24px;">${esc(i.icon)}</td>
                        <td valign="top" style="padding:0 0 12px 0; font-size:14px; line-height:22px; color:${C.body};"><strong style="color:${C.ink};">${esc(i.title)}</strong><br>${esc(i.text)}</td>
                      </tr>`).join('')}
                    </table>
                  </td>
                </tr>` : '';
    const notice = c.notice ? `
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="background-color:${C.noticeBg}; border-radius:12px; padding:14px 16px; font-size:13px; line-height:20px; color:${C.soft};">
                          <strong style="color:${C.ink};">${esc(c.notice.title)}</strong> ${esc(c.notice.text)}
                        </td>
                      </tr>
                    </table>` : '';

    const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${esc(c.heading)}</title>
  <!--[if mso]><style>table,td,p,a { font-family: Arial, sans-serif !important; }</style><![endif]-->
</head>
<body style="margin:0; padding:0; background-color:${C.page}; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;">
  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:${C.page}; opacity:0;">${esc(c.preview)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${C.page};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
          <tr>
            <td style="background-color:#ffffff; border-radius:16px; border:1px solid ${C.card}; overflow:hidden;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="height:6px; background-color:${C.green}; font-size:0; line-height:0;">&nbsp;</td></tr>
                <tr>
                  <td align="center" style="padding:28px 32px 8px 32px;">
                    <a href="${SITE.url}" style="text-decoration:none;">
                      <img src="${SITE.url}/email-logo.gif" width="96" height="96" alt="${esc(SITE.brand)}" style="display:block; border:0; width:96px; height:96px; border-radius:16px;">
                    </a>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 40px 0 40px; font-family:${FONT};">
                    <h1 style="margin:0 0 16px 0; font-size:24px; line-height:32px; font-weight:800; color:${C.ink}; text-align:center;">${esc(c.heading)}</h1>
                    ${c.greeting ? p(c.greeting) : ''}${c.paragraphs.map(p).join('')}
                  </td>
                </tr>${button}${list}
                <tr>
                  <td style="padding:${c.notice ? 24 : 8}px 40px 32px 40px; font-family:${FONT};">${notice}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 24px 0 24px; font-family:${FONT}; font-size:12px; line-height:18px; color:${C.faint};">
              <p style="margin:0 0 6px 0;"><a href="${SITE.url}" style="color:${C.muted}; font-weight:700; text-decoration:none;">${esc(SITE.brand)}</a> &middot; Live bus tracking for Regina, Saskatchewan</p>
              <p style="margin:0 0 6px 0;">Questions? Email <a href="mailto:${SITE.CONTACT_EMAIL}" style="color:${C.muted}; text-decoration:underline;">${SITE.CONTACT_EMAIL}</a></p>
              <p style="margin:0;">An independent project, not affiliated with the City of Regina or Regina Transit.<br>
              <a href="${SITE.url}/privacy" style="color:${C.faint}; text-decoration:underline;">Privacy</a> &middot; <a href="${SITE.url}/terms" style="color:${C.faint}; text-decoration:underline;">Terms</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const text = [
        c.heading, '',
        ...(c.greeting ? [c.greeting, ''] : []),
        ...c.paragraphs.flatMap(t => [t, '']),
        ...(c.button ? [`${c.button.label}: ${c.button.url}`, ''] : []),
        ...(c.list ? [c.list.title, ...c.list.items.map(i => `- ${i.title}: ${i.text}`), ''] : []),
        ...(c.notice ? [`${c.notice.title} ${c.notice.text}`, ''] : []),
        '—', `${SITE.brand} · Live bus tracking for Regina, Saskatchewan · ${SITE.url}`,
        `Questions? Email ${SITE.CONTACT_EMAIL}`, 'An independent project, not affiliated with the City of Regina or Regina Transit.',
    ].join('\n');
    return { html, text };
}

/** Sends one rider email through Resend */
export async function sendRiderEmail(to: string, subject: string, body: { html: string; text: string }): Promise<void> {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error('RESEND_API_KEY is not set');
    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: riderFrom(), reply_to: riderReplyTo(), to: [to], subject, html: body.html, text: body.text }),
        signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Resend answered ${res.status}`);
}
