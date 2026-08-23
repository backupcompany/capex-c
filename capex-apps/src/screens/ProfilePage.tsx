
import React, { useState, useMemo, memo } from 'react';
import { User, UserRole, HIERARCHY_LEVELS } from '../types';
import { usePermissions } from '../hooks/usePermissions';
import { updatePassword } from '../lib/authSupabase';
import { normalizeAuthPassword } from '@/lib/auth/normalizeAuthInput';
import { formatUserPublicId } from '@/lib/publicUserId';
import { isPasswordLoginEnabled } from '@/lib/auth/authConstants';
import { useToast } from '../contexts/ToastContext';

interface ProfilePageProps {
    currentUser: User;
    allRoles: UserRole[];
    desktopNotificationsEnabled: boolean;
    browserNotificationPermission: NotificationPermission | 'unsupported';
    onDesktopNotificationsToggle: (enabled: boolean) => void;
    onRequestDesktopPermission: () => Promise<void> | void;
}

export const ProfilePage = memo(function ProfilePage({
    currentUser,
    allRoles,
    desktopNotificationsEnabled,
    browserNotificationPermission,
    onDesktopNotificationsToggle,
    onRequestDesktopPermission,
}: ProfilePageProps) {
    const { showToast } = useToast();
    const { getPermissionFor } = usePermissions(currentUser, allRoles);
    const passwordLoginEnabled = isPasswordLoginEnabled();

    const [showChangePassword, setShowChangePassword] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrentPw, setShowCurrentPw] = useState(false);
    const [showNewPw, setShowNewPw] = useState(false);
    const [changePwLoading, setChangePwLoading] = useState(false);
    const [changePwError, setChangePwError] = useState('');

    const primaryRole = currentUser.assignments[0]?.roleName || 'No Role';
    const publicId = currentUser.publicId ?? formatUserPublicId(currentUser.id);

    const initials = React.useMemo(() => {
        const name = (currentUser.username || '').trim();
        if (!name) return 'U';
        const parts = name.split(/\s+/).filter(Boolean);
        const first = parts[0]?.[0] || '';
        const second = (parts.length > 1 ? parts[1]?.[0] : parts[0]?.[1]) || '';
        return (first + second).toUpperCase() || 'U';
    }, [currentUser.username]);

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setChangePwError('');
        const cleanCurrent = normalizeAuthPassword(currentPassword);
        const cleanNew = normalizeAuthPassword(newPassword);
        const cleanConfirm = normalizeAuthPassword(confirmPassword);
        if (cleanNew.length < 6) {
            setChangePwError('Password baru minimal 6 karakter.');
            return;
        }
        if (cleanNew !== cleanConfirm) {
            setChangePwError('Konfirmasi password tidak cocok.');
            return;
        }
        if (!cleanCurrent) {
            setChangePwError('Masukkan password saat ini.');
            return;
        }
        setChangePwLoading(true);
        try {
            const { error } = await updatePassword(cleanNew, cleanCurrent, currentUser.id);
            if (error) {
                setChangePwError(error.message || 'Gagal mengubah password.');
            } else {
                showToast('Password berhasil diubah.', 'success');
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
                setShowChangePassword(false);
            }
        } catch {
            setChangePwError('Terjadi kesalahan. Coba lagi.');
        } finally {
            setChangePwLoading(false);
        }
    };

    const permissionRows = useMemo(
        () =>
            HIERARCHY_LEVELS
                .map((level) => ({ level, perm: getPermissionFor(level) }))
                .filter(({ perm }) => perm !== 'Hide'),
        [getPermissionFor],
    );

    const getPermissionColor = (perm: string) => {
        switch (perm) {
            case 'View, Update, Create & Delete': return 'bg-purple-100 text-purple-800';
            case 'View, Update & Create': return 'bg-green-100 text-green-800';
            case 'View & Update': return 'bg-blue-100 text-blue-800';
            case 'View Only': return 'bg-yellow-100 text-yellow-800';
            default: return 'bg-gray-100 text-gray-500';
        }
    };

    return (
        <div className="space-y-6 animate-fade-in w-full">
            <div className="bg-siloam-surface p-6 rounded-xl shadow-soft border border-siloam-border flex flex-col md:flex-row items-center gap-6">
                <div className="relative shrink-0">
                    <div
                        aria-label="Profile initials"
                        className="w-24 h-24 rounded-full border-4 border-white shadow-md bg-siloam-blue/10 text-siloam-blue flex items-center justify-center font-bold text-3xl select-none"
                    >
                        {initials}
                    </div>
                    <div className="absolute bottom-0 right-0 bg-siloam-green h-6 w-6 rounded-full border-2 border-white" title="Active" />
                </div>
                <div className="text-center md:text-left flex-1 min-w-0">
                    <h1 className="text-2xl font-bold text-siloam-text-primary">{currentUser.username}</h1>
                    <p className="text-siloam-text-secondary mt-1">{currentUser.email}</p>
                    <span className="inline-block mt-2 bg-siloam-blue/10 text-siloam-blue text-sm font-bold px-3 py-1 rounded-full">
                        {primaryRole}
                    </span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-center shrink-0">
                    <div className="bg-siloam-bg p-3 rounded-lg min-w-[108px]">
                        <p className="text-xs text-siloam-text-secondary uppercase font-semibold">Account Ref</p>
                        <p className="text-sm font-mono font-bold text-siloam-text-primary mt-1 break-all">{publicId}</p>
                    </div>
                    <div className="bg-siloam-bg p-3 rounded-lg min-w-[108px]">
                        <p className="text-xs text-siloam-text-secondary uppercase font-semibold">Assignments</p>
                        <p className="text-lg font-bold text-siloam-text-primary">{currentUser.assignments.length}</p>
                    </div>
                </div>
            </div>

            <div className="bg-siloam-surface p-6 rounded-xl shadow-soft border border-siloam-border">
                <h3 className="text-lg font-bold text-siloam-text-primary mb-1 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-siloam-blue shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                    Access Permissions
                </h3>
                <p className="text-sm text-siloam-text-secondary mb-5">
                    Hierarchy level yang aktif untuk akun Anda — kartu mengalir per baris (±5 kolom di layar lebar).
                </p>

                {permissionRows.length === 0 ? (
                    <p className="text-sm text-siloam-text-secondary italic py-4">Tidak ada permission yang terlihat.</p>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        {permissionRows.map(({ level, perm }) => (
                            <div
                                key={level}
                                className="rounded-xl border border-siloam-border bg-siloam-bg/50 p-4 flex flex-col gap-3 min-h-[7.5rem] hover:border-siloam-blue/30 hover:shadow-soft transition-shadow"
                            >
                                <p className="text-sm font-semibold text-siloam-text-primary leading-snug flex-1" title={level}>
                                    {level}
                                </p>
                                <span className={`self-start px-2.5 py-1 rounded-lg text-xs font-bold ${getPermissionColor(perm)}`}>
                                    {perm}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-siloam-surface p-6 rounded-xl shadow-soft border border-siloam-border">
                    <h3 className="text-lg font-bold text-siloam-text-primary mb-4 flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-siloam-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 00-5-5.917V5a1 1 0 00-2 0v.083A6 6 0 006 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                        Notification Preferences
                    </h3>
                    <label className="flex items-center justify-between bg-siloam-bg border border-siloam-border rounded-xl p-4 gap-4">
                        <div>
                            <p className="font-semibold text-siloam-text-primary">Desktop Notification</p>
                            <p className="text-sm text-siloam-text-secondary">Task baru, overdue, dan reminder.</p>
                        </div>
                        <input
                            type="checkbox"
                            checked={desktopNotificationsEnabled}
                            onChange={(e) => onDesktopNotificationsToggle(e.target.checked)}
                            className="h-5 w-5 rounded border-siloam-border text-siloam-blue focus:ring-siloam-blue shrink-0"
                        />
                    </label>
                    {browserNotificationPermission !== 'granted' && browserNotificationPermission !== 'unsupported' && (
                        <button
                            type="button"
                            onClick={() => onRequestDesktopPermission()}
                            className="mt-4 bg-siloam-blue text-white px-4 py-2 rounded-xl hover:bg-siloam-blue/90 text-sm font-semibold"
                        >
                            Request Browser Permission
                        </button>
                    )}
                </div>

                {passwordLoginEnabled ? (
                <div className="bg-siloam-surface p-6 rounded-xl shadow-soft border border-siloam-border">
                    <h3 className="text-lg font-bold text-siloam-text-primary mb-4 flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-siloam-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                        Ubah Password
                    </h3>
                    {!showChangePassword ? (
                        <button
                            type="button"
                            onClick={() => setShowChangePassword(true)}
                            className="text-siloam-blue hover:underline font-medium text-sm"
                        >
                            Klik untuk mengubah password login Anda
                        </button>
                    ) : (
                        <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
                            <PasswordField
                                label="Password saat ini"
                                value={currentPassword}
                                onChange={setCurrentPassword}
                                show={showCurrentPw}
                                onToggleShow={() => setShowCurrentPw(!showCurrentPw)}
                                autoComplete="current-password"
                            />
                            <PasswordField
                                label="Password baru"
                                value={newPassword}
                                onChange={setNewPassword}
                                show={showNewPw}
                                onToggleShow={() => setShowNewPw(!showNewPw)}
                                autoComplete="new-password"
                                placeholder="Minimal 6 karakter"
                            />
                            <div>
                                <label className="block text-sm font-medium text-siloam-text-primary mb-1" htmlFor="fld-konfirmasi-password-baru">Konfirmasi password baru</label>
                                <input id="fld-konfirmasi-password-baru"
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full px-4 py-2 border border-siloam-border rounded-xl focus:ring-2 focus:ring-siloam-blue focus:outline-none"
                                    autoComplete="new-password"
                                />
                            </div>
                            {changePwError && (
                                <div className="text-sm text-danger bg-danger/10 p-3 rounded-lg">{changePwError}</div>
                            )}
                            <div className="flex gap-2">
                                <button
                                    type="submit"
                                    disabled={changePwLoading}
                                    className="bg-siloam-blue text-white px-4 py-2 rounded-xl hover:bg-siloam-blue/90 disabled:opacity-50 text-sm font-semibold"
                                >
                                    {changePwLoading ? 'Menyimpan...' : 'Simpan'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowChangePassword(false);
                                        setChangePwError('');
                                        setCurrentPassword('');
                                        setNewPassword('');
                                        setConfirmPassword('');
                                    }}
                                    className="px-4 py-2 rounded-xl border border-siloam-border hover:bg-siloam-bg text-sm"
                                >
                                    Batal
                                </button>
                            </div>
                        </form>
                    )}
                </div>
                ) : (
                <div className="bg-siloam-surface p-6 rounded-xl shadow-soft border border-siloam-border">
                    <h3 className="text-lg font-bold text-siloam-text-primary mb-2">Login</h3>
                    <p className="text-sm text-siloam-text-secondary">
                        Capex Pro memakai Microsoft SSO. Ubah password lewat akun Microsoft / Entra ID Siloam, bukan di aplikasi ini.
                    </p>
                </div>
                )}
            </div>
        </div>
    );
});

ProfilePage.displayName = 'ProfilePage';

function PasswordField({
    label,
    value,
    onChange,
    show,
    onToggleShow,
    autoComplete,
    placeholder = '••••••••',
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    show: boolean;
    onToggleShow: () => void;
    autoComplete: string;
    placeholder?: string;
}) {
    return (
        <div>
            <p className="block text-sm font-medium text-siloam-text-primary mb-1">{label}</p>
            <div className="relative">
                <input
                    type={show ? 'text' : 'password'}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="w-full px-4 py-2 border border-siloam-border rounded-xl focus:ring-2 focus:ring-siloam-blue focus:outline-none"
                    placeholder={placeholder}
                    autoComplete={autoComplete}
                />
                <button
                    type="button"
                    onClick={onToggleShow}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-siloam-text-secondary hover:text-siloam-text-primary"
                    aria-label={show ? 'Sembunyikan password' : 'Tampilkan password'}
                >
                    {show ? <EyeOffIcon /> : <EyeIcon />}
                </button>
            </div>
        </div>
    );
}

const EyeIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
);
const EyeOffIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
);
