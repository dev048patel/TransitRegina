import { apiGet, apiPost, apiPatch } from '../lib/apiClient';
import { supabase } from '../lib/supabase';

/** Text alerts need an admin's approval: where the rider stands */
export type SmsAccess = 'approved' | 'pending' | 'declined' | 'none';

/** on: their commute is texted · off: they could turn texts on in their profile · unavailable: not for this account */
export type CommuteTexts = 'on' | 'off' | 'unavailable';

export const SmsService = {
    /** Whether the rider's saved commute is texted to them: approved, phone verified, and texts switched on */
    async commuteTexts(userId: string): Promise<CommuteTexts> {
        const [access, profile] = await Promise.all([
            SmsService.accessStatus(),
            supabase.from('profiles').select('mobile_number, mobile_verified, sms_opted_in').eq('id', userId).single(),
        ]);
        if (access === 'declined') return 'unavailable';
        const p = profile.data as { mobile_number: string | null; mobile_verified: boolean; sms_opted_in: boolean } | null;
        return access === 'approved' && p?.mobile_number && p.mobile_verified && p.sms_opted_in ? 'on' : 'off';
    },

    async optIn(): Promise<void> {
        await apiPost('/api/sms/opt-in');
    },

    async optOut(): Promise<void> {
        await apiPost('/api/sms/opt-out');
    },

    async accessStatus(): Promise<SmsAccess> {
        return ((await (await apiGet('/api/sms/access')).json()) as { status: SmsAccess }).status;
    },

    // Asks the admins for text alerts (this is the rider's consent); texts start once approved
    async requestAccess(): Promise<SmsAccess> {
        return ((await (await apiPost('/api/sms/access/request')).json()) as { status: SmsAccess }).status;
    },

    // Texts a one-time code to the number on the profile
    async sendVerifyCode(): Promise<void> {
        await apiPost('/api/sms/verify/send');
    },

    // Marks the number verified if the code is right; returns the number as saved
    async checkVerifyCode(code: string): Promise<string> {
        const r = await apiPost('/api/sms/verify/check', { code });
        return ((await r.json()) as { phone: string }).phone;
    },

    // One-time trip texts for the trip just started (admins only for now)
    async startTripTexts(trip: {
        legs: { route: string; boardStopId: string; alightStopId: string }[];
        origin: { lat: number; lng: number }; destination: { lat: number; lng: number }; destinationName: string | null;
    }): Promise<{ texts: number; leaveAt: string; textsLeft: number }> {
        const r = await apiPost('/api/sms/trip', trip);
        return await r.json();
    },

    // Stops the texts still to come for that trip
    async cancelTripTexts(): Promise<void> {
        await apiPost('/api/sms/trip/cancel');
    },

    // Validates + updates phone on the backend, and auto-opts-out (forces re-consent).
    async updatePhone(phone: string): Promise<void> {
        await apiPatch('/api/sms/phone', { phone });
    },
};
