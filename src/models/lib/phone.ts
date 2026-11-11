/**
 * phone.ts — the one rule for phone numbers, used by the app and the backend alike.
 *
 * Every number is a North American (+1) mobile, so the +1 is fixed: people type only the 10 digits, in any format.
 *   stored  +13062015465   (what Twilio uses for codes and texts, and what replies like STOP come from)
 *   shown   306-201-5465   (everywhere: profile, admin pages, emails)
 *   typed   306-201-5465   (the box adds the dashes; "+1" sits in front of it and can't be edited)
 */

/** The 10 digits, from whatever was typed or stored: "306 201 5465", "(306) 201-5465", "+1 306-201-5465", "13062015465" */
export function phoneDigits(raw: string | null | undefined): string {
    const d = (raw ?? '').replace(/\D/g, '');
    return d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
}

/** How a number is stored: +13062015465. Null unless it is exactly 10 digits (after any leading 1). */
export function toStoredPhone(raw: string | null | undefined): string | null {
    const d = phoneDigits(raw);
    return /^\d{10}$/.test(d) ? `+1${d}` : null;
}

/** How a number is shown everywhere: 306-201-5465. Anything that isn't a full number is shown as it is. */
export function formatPhone(raw: string | null | undefined): string {
    const d = phoneDigits(raw);
    return /^\d{10}$/.test(d) ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : (raw ?? '');
}

/** What the box shows while someone types (after the fixed +1): 306, 306-201, 306-201-5465 */
export function formatPhoneInput(raw: string): string {
    const d = phoneDigits(raw).slice(0, 10);
    return [d.slice(0, 3), d.slice(3, 6), d.slice(6)].filter(Boolean).join('-');
}
