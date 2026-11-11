/**
 * useProfileController.ts — Transit Regina
 *
 * Controller for the Profile page.
 * Loads data from Supabase (profiles, user_preferences, favourite_stops,
 * favourite_routes) and provides handlers for all profile mutations.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../models/lib/supabase';
import { useAuth } from '../../models/context/AuthContext';
import { deleteAccount, changePassword } from '../../models/services/AuthService';
import { formatPhone, formatPhoneInput, phoneDigits, toStoredPhone } from '../../models/lib/phone';
import { SmsService, type SmsAccess } from '../../models/services/SmsService';
import { track } from '../../models/services/UsageTracker';

/* ── Types ──────────────────────────────────────────────────────── */
export interface ProfileData {
    full_name: string;
    mobile_number: string | null;
    mobile_verified: boolean;
    account_status: string;
    sms_opted_in: boolean;
    sms_consent_at: string | null;
}

export interface Preferences {
    theme: 'light' | 'dark' | 'system';
    larger_text: boolean;
    high_contrast: boolean;
    notif_alerts: boolean;
    notif_delays: boolean;
    notif_promos: boolean;
}

export interface FavStop {
    id: string;
    stop_id: string;
    stop_name: string;
    label: string | null;
}

export interface FavRoute {
    id: string;
    route_number: string;
    route_name: string;
}

/* ── Controller ─────────────────────────────────────────────────── */
export function useProfileController() {
    const { user, logout, logoutEverywhere } = useAuth();

    const [profile, setProfile] = useState<ProfileData | null>(null);
    const [prefs, setPrefs] = useState<Preferences>({
        theme: 'system',
        larger_text: false,
        high_contrast: false,
        notif_alerts: true,
        notif_delays: true,
        notif_promos: false,
    });
    const [favStops, setFavStops] = useState<FavStop[]>([]);
    const [favRoutes, setFavRoutes] = useState<FavRoute[]>([]);
    const [lastLogin, setLastLogin] = useState<string | null>(null);

    // Per-section loading flags — each resolves independently
    const [profileLoading, setProfileLoading] = useState(true);
    const [stopsLoading, setStopsLoading] = useState(true);
    const [routesLoading, setRoutesLoading] = useState(true);

    // Change password modal
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [passwordSuccess, setPasswordSuccess] = useState(false);
    const [passwordLoading, setPasswordLoading] = useState(false);

    // Edit personal info
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [editName, setEditName] = useState('');
    const [editEmail, setEditEmail] = useState('');
    const [editMobile, setEditMobile] = useState('');
    const [editLoading, setEditLoading] = useState(false);
    const [editError, setEditError] = useState('');
    const [editEmailSent, setEditEmailSent] = useState(false);

    // Delete account confirmation
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [deleteError, setDeleteError] = useState('');
    const [deletePassword, setDeletePassword] = useState('');

    // SMS notifications: they need an admin's approval, asked for once the phone is verified
    const [smsAccess, setSmsAccess] = useState<SmsAccess | null>(null);
    const [smsLoading, setSmsLoading] = useState(false);
    const [smsError, setSmsError] = useState('');
    useEffect(() => {
        if (!user) return;
        SmsService.accessStatus().then(setSmsAccess).catch(() => setSmsError('Could not load your text alert status. Refresh to try again.'));
    }, [user?.id]);

    // Phone verification: 'idle' until a code has been sent
    const [verifyStage, setVerifyStage] = useState<'idle' | 'sent'>('idle');
    const [verifyCode, setVerifyCode] = useState('');
    const [verifyLoading, setVerifyLoading] = useState(false);
    const [verifyError, setVerifyError] = useState('');
    const [resendIn, setResendIn] = useState(0);
    useEffect(() => {
        if (resendIn <= 0) return;
        const t = setTimeout(() => setResendIn(s => s - 1), 1000);
        return () => clearTimeout(t);
    }, [resendIn]);

    /* ── Load all profile data when user is available ───────────── */
    useEffect(() => {
        if (!user) {
            setProfileLoading(false);
            setStopsLoading(false);
            setRoutesLoading(false);
            return;
        }

        const uid = user.id;

        // Fire all queries in parallel — each resolves its own loading flag
        (async () => {
            try {
                const { data } = await supabase.from('profiles')
                    .select('full_name, mobile_number, mobile_verified, account_status, sms_opted_in, sms_consent_at')
                    .eq('id', uid).single();
                if (data) setProfile(data as ProfileData);
            } finally { setProfileLoading(false); }
        })();

        (async () => {
            try {
                const { data } = await supabase.from('user_preferences')
                    .select('theme, larger_text, high_contrast, notif_alerts, notif_delays, notif_promos')
                    .eq('id', uid).single();
                if (data) setPrefs(data as Preferences);
            } finally { setProfileLoading(false); }
        })();

        (async () => {
            try {
                const { data } = await supabase.from('favourite_stops')
                    .select('id, stop_id, stop_name, label')
                    .eq('user_id', uid).order('created_at');
                if (data) setFavStops(data);
            } finally { setStopsLoading(false); }
        })();

        (async () => {
            try {
                const { data } = await supabase.from('favourite_routes')
                    .select('id, route_number, route_name')
                    .eq('user_id', uid).order('created_at');
                if (data) setFavRoutes(data);
            } finally { setRoutesLoading(false); }
        })();
    }, [user?.id]);

    /* ── Logout ─────────────────────────────────────────────────── */
    // Just call logout() — the page then shows the guest view. No navigate() needed.
    const handleLogout = useCallback(async () => {
        await logout();
    }, [logout]);
    /* Ends the session on every device this account is signed in on */
    const handleLogoutEverywhere = useCallback(async () => {
        await logoutEverywhere();
    }, [logoutEverywhere]);

    /* ── Preferences ────────────────────────────────────────────── */
    const updatePref = useCallback(async <K extends keyof Preferences>(
        key: K, value: Preferences[K]
    ) => {
        if (!user) return;
        setPrefs(prev => ({ ...prev, [key]: value }));
        await supabase.from('user_preferences')
            .update({ [key]: value, updated_at: new Date().toISOString() })
            .eq('id', user.id);
    }, [user]);

    /* ── Change Password ────────────────────────────────────────── */
    const handleChangePassword = useCallback(async () => {
        setPasswordError('');
        if (newPassword.length < 8) {
            setPasswordError('Minimum 8 characters required');
            return;
        }
        if (!currentPassword) {
            setPasswordError('Enter your current password');
            return;
        }
        setPasswordLoading(true);
        // Re-checks the current password, sets the new one, and signs out every other device
        const error = await changePassword(currentPassword, newPassword);
        setPasswordLoading(false);
        if (error) {
            setPasswordError(error);
        } else {
            setPasswordSuccess(true);
            setCurrentPassword('');
            setNewPassword('');
            setTimeout(() => {
                setShowPasswordModal(false);
                setPasswordSuccess(false);
            }, 4000);
        }
    }, [currentPassword, newPassword]);

    const closePasswordModal = useCallback(() => {
        setShowPasswordModal(false);
        setCurrentPassword('');
        setNewPassword('');
        setPasswordError('');
        setPasswordSuccess(false);
    }, []);

    /* ── Remove Favourites ──────────────────────────────────────── */
    const removeFavStop = useCallback(async (id: string) => {
        setFavStops(prev => prev.filter(s => s.id !== id));
        await supabase.from('favourite_stops').delete().eq('id', id);
    }, []);

    const removeFavRoute = useCallback(async (id: string) => {
        setFavRoutes(prev => prev.filter(r => r.id !== id));
        await supabase.from('favourite_routes').delete().eq('id', id);
    }, []);

    /* ── Edit Personal Info ─────────────────────────────────────── */
    const startEditProfile = useCallback(() => {
        setEditName(profile?.full_name ?? user?.fullName ?? '');
        setEditEmail(user?.email ?? '');
        setEditMobile(formatPhoneInput(profile?.mobile_number ?? ''));
        setEditError('');
        setEditEmailSent(false);
        setIsEditingProfile(true);
    }, [profile, user]);

    const cancelEditProfile = useCallback(() => {
        setIsEditingProfile(false);
        setEditError('');
        setEditEmailSent(false);
    }, []);

    const saveProfile = useCallback(async () => {
        if (!editName.trim()) {
            setEditError('Full name is required');
            return;
        }
        setEditError('');
        setEditLoading(true);
        try {
            if (!user) return;

            // Stored as +13065550199 (lib/phone), whatever was typed
            const formattedMobile = editMobile.trim() ? toStoredPhone(editMobile) : null;
            if (editMobile.trim() && !formattedMobile) { setEditError('Enter your 10-digit number, like 306-555-0199'); return; }

            // A different number has to be verified again, and texts agreed to again. The number is only sent when its
            // digits change, so the same number in another format never un-verifies anyone.
            const numberChanged = phoneDigits(formattedMobile) !== phoneDigits(profile?.mobile_number);

            // Update name and mobile in profiles table
            const { error: profileError } = await supabase
                .from('profiles')
                .update({
                    full_name: editName.trim(),
                    // mobile_verified is reset by the database itself (protect_profile_columns); sending it is refused
                    ...(numberChanged ? { mobile_number: formattedMobile, sms_opted_in: false } : {}),
                    updated_at: new Date().toISOString(),
                })
                .eq('id', user.id);
            if (profileError) throw profileError;
            const emailChanged = !!editEmail.trim() && editEmail.trim() !== user.email;
            track('profile_updated', { fields: [editName.trim() !== (profile?.full_name ?? '') && 'name', numberChanged && 'phone', emailChanged && 'email'].filter(Boolean).join(',') || 'none' });

            // Reflect changes in local state immediately
            setProfile(prev => prev
                ? { ...prev, full_name: editName.trim(), ...(numberChanged ? { mobile_number: formattedMobile, mobile_verified: false, sms_opted_in: false } : {}) }
                : prev
            );
            if (numberChanged) { setVerifyStage('idle'); setVerifyCode(''); setVerifyError(''); }
            // A new (or still unverified) number is verified straight away: text the code now; the box to enter it shows under Phone
            if (formattedMobile && (numberChanged || !profile?.mobile_verified)) {
                SmsService.sendVerifyCode()
                    .then(() => { setVerifyStage('sent'); setResendIn(30); })
                    .catch((err: any) => setVerifyError(err?.message ?? 'The code could not be sent. Try again.'));
            }

            // If email changed, trigger Supabase email update (sends confirmation)
            if (editEmail.trim() && editEmail.trim() !== user.email) {
                const { error: emailError } = await supabase.auth.updateUser({ email: editEmail.trim() });
                if (emailError) throw emailError;
                setEditEmailSent(true);
                // Don't close edit mode yet — show the "check email" notice
                return;
            }

            setIsEditingProfile(false);
        } catch (err: any) {
            setEditError(err?.message ?? 'Failed to save changes. Please try again.');
        } finally {
            setEditLoading(false);
        }
    }, [user, editName, editEmail, editMobile, profile?.mobile_number, profile?.mobile_verified]);

    /* ── SMS Notifications ──────────────────────────────────────── */
    const handleSmsToggle = useCallback(async (enable: boolean) => {
        setSmsLoading(true);
        setSmsError('');
        try {
            if (enable) {
                await SmsService.optIn();
            } else {
                await SmsService.optOut();
            }
            setProfile(prev => prev ? {
                ...prev,
                sms_opted_in: enable,
                sms_consent_at: enable ? new Date().toISOString() : prev.sms_consent_at,
            } : prev);
        } catch (err: any) {
            setSmsError(err?.message ?? 'Failed to update SMS preference');
        } finally {
            setSmsLoading(false);
        }
    }, []);

    const requestSms = useCallback(async () => {
        setSmsLoading(true);
        setSmsError('');
        try {
            setSmsAccess(await SmsService.requestAccess());
        } catch (err: any) {
            setSmsError(err?.message ?? 'Your request could not be sent. Try again.');
        } finally {
            setSmsLoading(false);
        }
    }, []);

    /* ── Phone verification ─────────────────────────────────────── */
    const sendVerifyCode = useCallback(async () => {
        setVerifyLoading(true);
        setVerifyError('');
        try {
            await SmsService.sendVerifyCode();
            setVerifyStage('sent');
            setVerifyCode('');
            setResendIn(30);
        } catch (err: any) {
            setVerifyError(err?.message ?? 'The code could not be sent. Try again.');
        } finally {
            setVerifyLoading(false);
        }
    }, []);

    const confirmVerifyCode = useCallback(async () => {
        setVerifyLoading(true);
        setVerifyError('');
        try {
            const phone = await SmsService.checkVerifyCode(verifyCode);
            setProfile(prev => prev ? { ...prev, mobile_number: phone ?? prev.mobile_number, mobile_verified: true } : prev);
            setVerifyStage('idle');
            setVerifyCode('');
        } catch (err: any) {
            setVerifyError(err?.message ?? 'The code could not be checked. Try again.');
        } finally {
            setVerifyLoading(false);
        }
    }, [verifyCode]);

    /* ── Delete Account ─────────────────────────────────────────── */
    const handleDeleteAccount = useCallback(async () => {
        setDeleteLoading(true);
        setDeleteError('');
        try {
            if (!user) return;

            if (!deletePassword) {
                setDeleteError('Enter your password to confirm');
                setDeleteLoading(false);
                return;
            }
            // Re-checks the password, deletes the account and all saved data on the server, then signs out
            const error = await deleteAccount(deletePassword);

            if (error) {
                setDeleteError(error);
                setDeleteLoading(false);
                return;
            }

            await logout();
        } catch (err: any) {
            console.error('[Profile] Failed to delete account:', err);
            setDeleteError(err?.message ?? 'Failed to delete account. Please try again.');
            setDeleteLoading(false);
        }
    }, [user, logout, deletePassword]);

    return {
        user,
        profile,
        // Shown as 306-555-0199 everywhere (lib/phone)
        displayPhone: profile?.mobile_number || user?.mobile ? formatPhone(profile?.mobile_number || user?.mobile) : null,
        prefs,
        favStops,
        favRoutes,
        lastLogin,
        profileLoading,
        stopsLoading,
        routesLoading,
        // Password modal
        showPasswordModal, setShowPasswordModal,
        currentPassword, setCurrentPassword,
        newPassword, setNewPassword,
        passwordError,
        passwordSuccess,
        passwordLoading,
        handleChangePassword,
        closePasswordModal,
        // Edit personal info
        isEditingProfile,
        editName, setEditName,
        editEmail, setEditEmail,
        editMobile, setEditMobile: (v: string) => setEditMobile(formatPhoneInput(v)),
        editLoading, editError, editEmailSent,
        startEditProfile, cancelEditProfile, saveProfile,
        // Delete confirm
        showDeleteConfirm, setShowDeleteConfirm,
        deleteLoading, deleteError,
        deletePassword, setDeletePassword,
        handleDeleteAccount,
        // SMS notifications
        smsAccess, requestSms,
        smsLoading, smsError, handleSmsToggle,
        // Phone verification
        verifyStage, verifyCode, setVerifyCode: (v: string) => setVerifyCode(v.replace(/\D/g, '').slice(0, 10)),
        verifyLoading, verifyError, resendIn, sendVerifyCode, confirmVerifyCode,
        // Actions
        handleLogout,
        handleLogoutEverywhere,
        updatePref,
        removeFavStop,
        removeFavRoute,
    };
}
