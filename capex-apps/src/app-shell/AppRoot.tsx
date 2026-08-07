
import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, startTransition } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { Page } from '@/types';
import type { BudgetMultiYear, BudgetPeriod, User, UserRole, ChangeSummary, Notification } from '@/types';
import { prefetchScreenChunk } from '@/app-shell/screenRegistry';
import { AppAuthGateViews } from '@/app-shell/AppAuthGateViews';
import { AppAuthenticatedLayout } from '@/app-shell/AppAuthenticatedLayout';
import { useAppPeriodFilters } from '@/app-shell/useAppPeriodFilters';
import { resolvePendingUnsavedChanges } from '@/lib/navigation/unsavedChangesGuard';
import { usePermissions } from '@/hooks/usePermissions';
import { useNavPrefetch } from '@/hooks/useNavPrefetch';
import { useRouteWarm } from '@/hooks/useRouteWarm';
import { usePagePreloads } from '@/hooks/usePagePreloads';
import {
  cloneRolesForApp,
  sameUserSession,
  pushAuthSessionIfChanged,
} from '@/lib/appShell/appShellUtils';
import { useTaskNotifications } from '@/hooks/useTaskNotifications';
import { isRecoveryFromUrl } from '@/lib/authSupabase';
import { isLoginPath, loginUrlWithSuffix } from '@/lib/auth/loginRoute';
import { type ShowToastOptions } from '@/contexts/ToastContext';
import * as taskService from '@/services/taskService';
import * as notificationService from '@/services/notificationService';
import { NAV_ITEMS } from '@/constants';
import { pageToHref, pathnameToPage, profilePublicIdFromPathname } from '@/lib/pageRoutes';
import { decodeUserPublicId, encodeUserPublicId } from '@/lib/publicUserId';
import { resolvePostLoginLandingPage } from '@/lib/postLoginLanding';
import { queryKeys } from '@/lib/query-keys';
import {
  fetchAppBootstrapData,
  type AppBootstrapPayload,
} from '@/hooks/queries/fetchAppBootstrapData';
import { fetchAppInitPackFromBackend } from '@/services/appBootstrapApi';
import { ensureUsersDirectoryLoaded } from '@/lib/ensureUsersDirectory';
import { pickEnrichedUserFromPack } from '@/lib/appUserBootstrap';
import {
  areShellPermissionsReady,
  mergeAuthIdentityUser,
} from '@/lib/auth/mergeAuthIdentityUser';
import { enrichUserAssignments } from '@/lib/userRoleResolution';
import {
  syncAppShellCaches,
  mergeBootstrapPreservingAuthPatch,
  clearShellCachePatchGuard,
  isShellCachePatchGuarded,
} from '@/lib/syncAppShellCaches';
import { useNotificationsState } from '@/hooks/useNotificationsState';
import {
  readCachedAuthUser,
  readInitialAuthUser,
  writeCachedAuthUser,
  clearCachedAuthUser,
} from '@/lib/authSessionCache';
import {
  readCachedRoles,
  writeCachedRoles,
  clearCachedRoles,
} from '@/lib/appRolesCache';
import {
  readCachedBootstrap,
  writeCachedBootstrap,
  clearCachedBootstrap,
} from '@/lib/appBootstrapCache';
import { registerAuthFailureHandler } from '@/lib/auth/authFailureHandler';
import {
  clearServerAuthCookies,
  fetchAuthSession,
  invalidateAuthProbeCache,
  invalidateStaleAuthCookies,
  logoutBackend,
  probeBackendSession,
  refreshBackendSessionCoordinated,
  setSessionCookieHint,
  shouldRunAuthSessionProbe,
} from '@/lib/auth/authApi';
import { isDefinitiveUnauthenticated } from '@/lib/auth/sessionValidity';
import { authDebug } from '@/lib/auth/authDebug';
import { markAuthProbeComplete, resetAuthProbeGate } from '@/lib/auth/authProbeGate';
import { ensureCsrfToken } from '@/lib/auth/csrfToken';
import { clearPersistedQueryCache } from '@/lib/queryDehydrate';
import { clearTabSessionState } from '@/lib/auth/clearTabSessionState';
import { useBackendSession } from '@/lib/auth/authConstants';
import { isCapexBeConfigured } from '@/lib/capexBeClient';
import { useAuthStore } from '@/stores/authStore';
import { writePeriodShellCache } from '@/lib/periodSelectionCache';
import { pickDefaultBudgetPeriodNameForYear } from '@/lib/appShell/periodSelectionUtils';
import {
  refreshActiveConfigurationQueries,
  refreshBudgetHuMasterConfigQueries,
  subscribeConfigurationMasterChanged,
} from '@/lib/configurationCacheSync';
import type { ConfigSliceKey } from '@/services/configurationApi';
import {
  foldNetworkBudgetSaveIntoAppPeriod,
  writeBudgetPeriodCache,
} from '@/lib/budgetHuDiskCache';

const initialBootstrap = readCachedBootstrap();
const MAX_PERSISTED_OPEN_TASK_IDS = 3000;
const MAX_PERSISTED_REMINDER_KEYS = 6000;

export type AppProps = {
  /** Server read of httpOnly session cookies — false on clean login (skip session probe). */
  hasSessionCookies?: boolean;
};

const AppRoot: React.FC<AppProps> = ({ hasSessionCookies = false }) => {
  useEffect(() => {
    setSessionCookieHint(hasSessionCookies);
  }, [hasSessionCookies]);
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const router = useRouter();
  const routePage = useMemo(() => pathnameToPage(pathname), [pathname]);
  const [dataInitialized, setDataInitialized] = useState(
    () => Boolean(initialBootstrap?.users?.length && initialBootstrap?.roles?.length),
  );
  /** false sampai probe /auth/session selesai — hindari LazyLoginPage saat reload masih memvalidasi cookie. */
  const authProbeComplete = useAuthStore((s) => s.authProbeComplete);
  const authStatus = useAuthStore((s) => s.status);
  const sessionReady = useAuthStore((s) => s.sessionReady);

  // Global state for user and permissions
  const [allUsers, setAllUsers] = useState<User[]>(() => initialBootstrap?.users ?? []);
  const [allRoles, setAllRoles] = useState<UserRole[]>(
    () => initialBootstrap?.roles?.length ? initialBootstrap.roles : readCachedRoles(),
  );
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    if (typeof window === 'undefined') return null;
    return hasSessionCookies ? readInitialAuthUser() : null;
  });
  const authenticatedNetworkReady =
    authProbeComplete &&
    sessionReady &&
    authStatus === 'authenticated' &&
    Boolean(currentUser?.id);

  const {
    notifications,
    markAsRead: handleMarkNotificationAsRead,
    markAllAsRead: handleMarkAllNotificationsAsRead,
    invalidate: refreshNotifications,
    prependNotification,
  } = useNotificationsState(
    authenticatedNetworkReady && dataInitialized ? (currentUser?.id ?? null) : null,
  );

  // State for unsaved changes modal
  const [isPageDirty, setIsPageDirty] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<Page | null>(null);
  const [changeSummary, setChangeSummary] = useState<ChangeSummary | null>(null);
  const pageActionRefs = useRef<{ onSave: () => Promise<void>; onCancel: () => void; getSummary: () => ChangeSummary | null; }>({
      onSave: async () => {},
      onCancel: () => {},
      getSummary: () => null,
  });

  const [toast, setToast] = useState<{
    id: number;
    message: string;
    type: 'success' | 'error';
    title?: string;
  } | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [desktopNotificationsEnabled, setDesktopNotificationsEnabled] = useState(true);
  const [browserNotificationPermission, setBrowserNotificationPermission] = useState<NotificationPermission | 'unsupported'>('unsupported');
  const sentNotificationDedupeKeysRef = useRef<Set<string>>(new Set());
  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;
  const desktopNotificationSettingKey = useMemo(
    () => (currentUser ? `desktop-notification-enabled-${currentUser.id}` : ''),
    [currentUser],
  );
  const [sidebarNavRevision, setSidebarNavRevision] = useState(0);
  /** Avoid remounting `<main>` during heavy data migration batches. */
  const activePageRef = useRef<Page>(routePage);
  const prevActivePageForMigrationRef = useRef<Page>(routePage);
  useEffect(() => {
    activePageRef.current = routePage;
  }, [routePage]);

  const showToast = useCallback(
    (message: string, type: 'success' | 'error' = 'success', options?: ShowToastOptions) => {
      setToast({ id: Date.now(), message, type, title: options?.title });
    },
    []
  );

  const pushNotification = useCallback((message: string, dedupeKey?: string) => {
    if (!currentUser) return;

    const stableKey =
      dedupeKey ?? `ephemeral-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    if (sentNotificationDedupeKeysRef.current.has(stableKey)) return;
    sentNotificationDedupeKeysRef.current.add(stableKey);

    const nextNotification: Notification = {
      id: notificationService.buildNotificationId(currentUser.id, stableKey),
      userId: currentUser.id,
      message,
      type: 'task',
      isRead: false,
      createdAt: new Date().toISOString(),
      linkToPage: Page.MyTask,
    };

    prependNotification(nextNotification);

    void notificationService.createNotification(nextNotification).catch((error) => {
      console.error('Failed to save notification:', error);
      sentNotificationDedupeKeysRef.current.delete(stableKey);
    });

    if (
      desktopNotificationsEnabled &&
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      new window.Notification('Capex Reminder', {
        body: message,
        tag: `capex-task-${nextNotification.id}`,
      });
    }
  }, [currentUser, desktopNotificationsEnabled, prependNotification]);

  const permissions = usePermissions(currentUser, allRoles);

  const bootstrapQuery = useQuery({
    queryKey: queryKeys.app.bootstrap,
    queryFn: () => fetchAppBootstrapData(currentUser?.id),
    enabled: typeof window !== 'undefined' && authenticatedNetworkReady,
    placeholderData: initialBootstrap ?? undefined,
    staleTime: 120_000,
    gcTime: 1000 * 60 * 60,
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchOnMount: true,
  });

  const {
    allPeriods,
    setAllPeriods,
    selectedPeriodName,
    currentBudgetPeriod,
    setCurrentBudgetPeriod,
    isLoadingBudgetPeriod,
    selectedArchetypeId,
    selectedHuId,
    visibleArchetypes,
    visibleHUs,
    syncPeriodSelectionFromLists,
    handlePeriodChange,
    handleExecutiveArchetypeChange,
    handleArchetypeChange,
    handleHUChange,
    handleHUHoverPrefetch,
  } = useAppPeriodFilters({
    authProbeComplete: authenticatedNetworkReady,
    currentUser,
    routePage,
    permissions,
    queryClient,
    initialAllPeriods: initialBootstrap?.allPeriods ?? [],
    bootstrapMultiYears: bootstrapQuery.data?.multiYears,
    dataInitialized,
  });

  const shellDataReady = authenticatedNetworkReady && dataInitialized;

  const { resetTaskNotificationState } = useTaskNotifications({
    enabled: shellDataReady,
    currentUser: shellDataReady ? currentUser : null,
    userScopes: permissions.userScopes,
    allRoles,
    selectedPeriodName,
    queryClient,
    desktopNotificationsEnabled,
    setDesktopNotificationsEnabled,
    setBrowserNotificationPermission,
    pushNotification,
    refreshNotifications,
  });

  const screenQueryPredicate = useCallback(
    (q: { queryKey: unknown }) => Array.isArray(q.queryKey) && q.queryKey[0] === 'screen',
    [],
  );

  const refreshBudgetData = useCallback(async () => {
    await queryClient.refetchQueries({ queryKey: [...queryKeys.app.bootstrap] });
    await queryClient.invalidateQueries({ predicate: screenQueryPredicate });
  }, [queryClient, screenQueryPredicate]);

  /** Refresh ringan: hanya struktur list/summaries, tanpa fetch seluruh period detail. */
  const refreshBudgetListOnly = useCallback(async () => {
    const uid =
      currentUser?.id ??
      (typeof window !== 'undefined' ? parseInt(sessionStorage.getItem('currentUserId') || '', 10) : NaN);

    let multiYears: BudgetMultiYear[] = [];
    let summaries: BudgetPeriod[] = [];

    if (Number.isFinite(uid) && isCapexBeConfigured()) {
      const pack = await fetchAppInitPackFromBackend(null, uid);
      if (pack) {
        multiYears = pack.multiYears;
        summaries = pack.periodSummaries;
      }
    }

    if (!summaries.length) {
      const cached = queryClient.getQueryData<AppBootstrapPayload>([...queryKeys.app.bootstrap]);
      if (cached?.allPeriods?.length) {
        summaries = cached.allPeriods;
        multiYears = cached.multiYears ?? [];
      }
    }

    if (!summaries.length) {
      return;
    }

    setAllPeriods(summaries);
    syncPeriodSelectionFromLists(multiYears, summaries);
    queryClient.setQueryData<AppBootstrapPayload>([...queryKeys.app.bootstrap], (old) =>
      old ? { ...old, multiYears, allPeriods: summaries } : old,
    );
  }, [queryClient, syncPeriodSelectionFromLists, currentUser?.id]);

  const handleBudgetPageDataChange = useCallback(() => {
    void refreshBudgetListOnly();
  }, [refreshBudgetListOnly]);

  /** Sinkron pohon budget di shell setelah save di halaman anak — tanpa getBudgetByPeriodName penuh. */
  const handleBudgetPeriodSaved = useCallback(
    (next: BudgetPeriod) => {
      if (next.periodName.trim()) {
        writePeriodShellCache({
          selectedPeriodName: next.periodName.trim(),
          periodNames: allPeriods.length
            ? allPeriods.map((p) => p.periodName)
            : [next.periodName.trim()],
        });
      }
      setCurrentBudgetPeriod((prev) => {
        const merged =
          prev && prev.periodName === next.periodName
            ? foldNetworkBudgetSaveIntoAppPeriod(prev, next)
            : (JSON.parse(JSON.stringify(next)) as BudgetPeriod);
        const uid = currentUser?.id;
        if (uid && merged.periodName) {
          writeBudgetPeriodCache(merged.periodName, uid, merged);
        }
        return JSON.parse(JSON.stringify(merged)) as BudgetPeriod;
      });
      if (next.periodName.trim()) {
        queryClient.setQueryData(
          queryKeys.budgetSiloamPeriod.detail(next.periodName.trim()),
          (old: { budgetPeriod?: BudgetPeriod | null; categories?: unknown[] } | undefined) => ({
            budgetPeriod: next,
            categories: Array.isArray(old?.categories) ? old.categories : [],
          }),
        );
      }
    },
    [currentUser?.id, allPeriods, queryClient],
  );

  /** Bootstrap shell saja — master Configuration tidak di-refresh otomatis dari halaman operasional. */
  const refreshConfigData = useCallback(async () => {
    if (isShellCachePatchGuarded()) return;
    await queryClient.refetchQueries({ queryKey: [...queryKeys.app.bootstrap] });
  }, [queryClient]);

  /** Full sync after migration / dirty page. */
  const flushAllAppQueries = useCallback(async () => {
    await Promise.all([refreshBudgetData(), refreshConfigData(), refreshNotifications()]);
  }, [refreshBudgetData, refreshConfigData, refreshNotifications]);

  /** Hydrate TanStack Query dari cache sekali — jangan reset saat currentUser berubah. */
  const bootstrapQueryHydratedRef = useRef(false);
  useEffect(() => {
    if (bootstrapQueryHydratedRef.current) return;
    const boot = readCachedBootstrap();
    if (!boot) return;
    bootstrapQueryHydratedRef.current = true;
    queryClient.setQueryData(queryKeys.app.bootstrap, boot);
  }, [queryClient]);

  /** Probe sesi valid sebelum bootstrap — hindari UI/login dari cache stale. */
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let cancelled = false;
    resetAuthProbeGate();
    useAuthStore.getState().setAuthProbeComplete(false);
    useAuthStore.getState().setSessionReady(false);

    const finishUnauthenticated = (options?: { clearServer?: boolean }) => {
      if (cancelled) return;
      useAuthStore.getState().setSessionReady(false);
      invalidateAuthProbeCache();
      invalidateStaleAuthCookies();
      if (options?.clearServer !== false) {
        void clearServerAuthCookies();
      }
      clearCachedAuthUser();
      clearCachedRoles();
      clearCachedBootstrap();
      clearShellCachePatchGuard();
      clearPersistedQueryCache();
      sessionStorage.removeItem('currentUserId');
      setCurrentUser(null);
      queryClient.removeQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) &&
          (q.queryKey[0] === 'screen' || q.queryKey[0] === 'app'),
      });
      if (useBackendSession()) {
        clearTabSessionState();
      }
      queueMicrotask(() => {
        if (!cancelled) useAuthStore.getState().clearSession();
      });
      setDataInitialized(true);
    };

    const applyProbeUser = (u: User, roles?: string[], idleTimeoutMs?: number) => {
      if (cancelled) return;
      setCurrentUser((prev) => {
        const identity = {
          id: u.id,
          publicId: u.publicId,
          username: u.username,
          email: u.email,
        };
        const merged =
          prev?.id === u.id
            ? mergeAuthIdentityUser(identity, {
                sessionAssignments: u.assignments,
                roleSlugs: roles,
                previous: prev,
              })
            : u.assignments?.length
              ? u
              : mergeAuthIdentityUser(identity, {
                  sessionAssignments: u.assignments,
                  roleSlugs: roles,
                });
        writeCachedAuthUser(merged);
        return merged;
      });
      sessionStorage.setItem('currentUserId', String(u.id));
      queueMicrotask(() => {
        if (cancelled) return;
        const prev = useAuthStore.getState().user;
        const forStore =
          prev?.id === u.id
            ? mergeAuthIdentityUser(
                {
                  id: u.id,
                  publicId: u.publicId,
                  username: u.username,
                  email: u.email,
                },
                {
                  sessionAssignments: u.assignments,
                  roleSlugs: roles,
                  previous: prev,
                },
              )
            : u;
        const roleNames =
          roles?.length
            ? roles
            : forStore.assignments.map((a) => a.roleName).filter(Boolean);
        useAuthStore.getState().setSession(forStore, roleNames, idleTimeoutMs);
      });
    };

    void (async () => {
      try {
        if (useBackendSession()) {
          const { probeOAuthCallbackIfPresent, isOAuthCallbackFromUrl } =
            await import('@/lib/authAzure');
          await probeOAuthCallbackIfPresent();

          if (
            !shouldRunAuthSessionProbe({
              hasSessionCookies,
              oauthCallback: isOAuthCallbackFromUrl(),
            })
          ) {
            finishUnauthenticated({ clearServer: false });
            return;
          }

          let me = await probeBackendSession();
          if (cancelled) return;
          if (!me?.authenticated && hasSessionCookies && readCachedAuthUser()) {
            await new Promise((r) => setTimeout(r, 250));
            if (!cancelled) me = await probeBackendSession({ force: true });
          }
          if (cancelled) return;
          if (me?.authenticated && me.user) {
            const publicId = me.user.publicId?.trim();
            const probeUser = publicId
              ? mergeAuthIdentityUser(
                  {
                    publicId,
                    username: me.user.username,
                    email: me.user.email,
                  },
                  {
                    sessionAssignments: me.user.assignments,
                    roleSlugs: me.user.roles,
                  },
                )
              : readCachedAuthUser();
            if (probeUser) {
              applyProbeUser(probeUser, me.user.roles, me.user.idleTimeoutMs);
            }
            const csrfOk = await ensureCsrfToken();
            if (!cancelled && csrfOk) {
              useAuthStore.getState().setSessionReady(true);
            }
            if (initialBootstrap?.users?.length) {
              setDataInitialized(true);
            }
            return;
          }
          if (me == null && hasSessionCookies) {
            if (initialBootstrap?.users?.length) {
              setDataInitialized(true);
            }
            return;
          }
          finishUnauthenticated();
          return;
        }

        finishUnauthenticated();
      } catch {
        if (!cancelled) setDataInitialized(true);
      } finally {
        if (!cancelled) {
          markAuthProbeComplete();
          useAuthStore.getState().setAuthProbeComplete(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasSessionCookies, queryClient]);

  const lastBootstrapSyncAtRef = useRef(0);

  useEffect(() => {
    if (!bootstrapQuery.isSuccess || !bootstrapQuery.data) return;
    const updatedAt = bootstrapQuery.dataUpdatedAt;
    if (lastBootstrapSyncAtRef.current === updatedAt) return;
    lastBootstrapSyncAtRef.current = updatedAt;
    let d = mergeBootstrapPreservingAuthPatch(bootstrapQuery.data, queryClient);
    const skipAuthOverwrite = isShellCachePatchGuarded();

    if (!skipAuthOverwrite) {
      setAllUsers(d.users);
      setAllRoles(d.roles);
      writeCachedRoles(d.roles);
    } else {
      writeCachedRoles(d.roles);
    }
    setAllPeriods(d.allPeriods);
    writeCachedBootstrap(d);
    syncPeriodSelectionFromLists(d.multiYears, d.allPeriods);
    if (!skipAuthOverwrite) {
      setCurrentUser((prev) => {
        if (!prev) return prev;
        const full = enrichUserAssignments(
          d.users.find((u) => u.id === prev.id) ?? prev,
          d.roles,
        );
        if (sameUserSession(prev, full)) return prev;
        writeCachedAuthUser(full);
        return full;
      });
    }
    setDataInitialized(true);
  }, [
    bootstrapQuery.isSuccess,
    bootstrapQuery.dataUpdatedAt,
    syncPeriodSelectionFromLists,
    currentUser?.id,
    selectedPeriodName,
    queryClient,
  ]);

  useRouteWarm({
    enabled: authenticatedNetworkReady && dataInitialized,
    queryClient,
    routePage,
    periodName: selectedPeriodName,
    currentUser,
    selectedArchetypeId,
    selectedHuId,
  });

  useEffect(() => {
    if (!bootstrapQuery.isError) return;
    console.error('Error initializing application:', bootstrapQuery.error);
    setDataInitialized(true);
    showToast(
      `Error initializing application: ${
        bootstrapQuery.error instanceof Error ? bootstrapQuery.error.message : 'Unknown error'
      }. Please check console for details.`,
      'error',
    );
  }, [bootstrapQuery.isError, bootstrapQuery.error, showToast]);
  
  /** Sinkronkan sessionStorage dengan user dari cache localStorage (paint pertama). */
  useEffect(() => {
    if (!currentUser) return;
    if (!sessionStorage.getItem('currentUserId')) {
      sessionStorage.setItem('currentUserId', String(currentUser.id));
    }
  }, [currentUser]);

  /** Warm lazy route chunk before Suspense — shell tampil tanpa skeleton konten. */
  useLayoutEffect(() => {
    if (!currentUser) return;
    prefetchScreenChunk(routePage);
  }, [currentUser, routePage]);

  const bumpSidebarNav = useCallback(() => {
    setSidebarNavRevision((n) => n + 1);
  }, []);

  const applyRolesToApp = useCallback(
    (roles: UserRole[]) => {
      const next = cloneRolesForApp(roles);
      const boot =
        queryClient.getQueryData<AppBootstrapPayload>(queryKeys.app.bootstrap) ??
        readCachedBootstrap();
      const usersSource = allUsers.length ? allUsers : (boot?.users ?? []);
      const enrichedUsers = usersSource.map((u) => enrichUserAssignments(u, next));

      const syncedCurrent = syncAppShellCaches(queryClient, {
        roles: next,
        users: enrichedUsers,
        currentUser: currentUser
          ? enrichUserAssignments(currentUser, next)
          : null,
      });

      setAllRoles(next);
      if (enrichedUsers.length) setAllUsers(enrichedUsers);
      if (syncedCurrent) {
        setCurrentUser((prev) =>
          prev && sameUserSession(prev, syncedCurrent) ? prev : syncedCurrent,
        );
        const roleNames = syncedCurrent.assignments.map((a) => a.roleName).filter(Boolean);
        pushAuthSessionIfChanged(syncedCurrent, roleNames);
      }
      bumpSidebarNav();
    },
    [queryClient, bumpSidebarNav, allUsers, currentUser],
  );

  const applyUsersToApp = useCallback(
    (users: User[]) => {
      const enrichedUsers = users.map((u) => enrichUserAssignments(u, allRoles));

      const syncedCurrent = syncAppShellCaches(queryClient, {
        users: enrichedUsers,
        roles: allRoles,
        currentUser: currentUser
          ? enrichedUsers.find((u) => u.id === currentUser.id) ??
            enrichUserAssignments(currentUser, allRoles)
          : null,
      });

      setAllUsers(enrichedUsers);
      if (syncedCurrent) {
        setCurrentUser((prev) =>
          prev && sameUserSession(prev, syncedCurrent) ? prev : syncedCurrent,
        );
        const roleNames = syncedCurrent.assignments.map((a) => a.roleName).filter(Boolean);
        pushAuthSessionIfChanged(syncedCurrent, roleNames);
      }
      bumpSidebarNav();
    },
    [queryClient, bumpSidebarNav, allRoles, currentUser],
  );

  /** Lazy-load full user directory for admin viewers (slim bootstrap = self user only). */
  useEffect(() => {
    if (!authenticatedNetworkReady || !dataInitialized) return;
    const user = currentUser;
    if (!user) return;
    const needsDirectory =
      routePage === Page.Configuration || routePage === Page.BudgetHU;
    if (!needsDirectory) return;

    let cancelled = false;
    void ensureUsersDirectoryLoaded(queryClient, user.id).then((users) => {
      if (cancelled || users.length <= 1) return;
      applyUsersToApp(users);
    });
    return () => {
      cancelled = true;
    };
  }, [
    authenticatedNetworkReady,
    dataInitialized,
    currentUser?.id,
    routePage,
    queryClient,
    applyUsersToApp,
    allUsers.length,
  ]);

  const visibleNavItems = useMemo(
    () => NAV_ITEMS.filter((item) => permissions.canAccessPage(item.label)),
    [permissions, sidebarNavRevision, allRoles, currentUser],
  );

  const showProfileNav = useMemo(
    () => permissions.canAccessPage(Page.Profile),
    [permissions, sidebarNavRevision, allRoles, currentUser],
  );

  const budgetEditingPages: Page[] = [Page.BudgetMultiYear, Page.BudgetPeriod, Page.BudgetArchetype, Page.BudgetHU, Page.POUpdate, Page.GRUpdate, Page.FSUpdate, Page.FSApproval];

  // User change handler removed - users can only login via LazyLoginPage
  // No more dropdown user selector in Sidebar

  // Login feature removed - auto-login is enabled

  // Logout feature removed - auto-login is always active

  const handleNavItemPrefetch = useNavPrefetch({
    enabled: authenticatedNetworkReady,
    queryClient,
    selectedPeriodName,
    selectedArchetypeId,
    selectedHuId,
    currentUser,
    permissions,
  });

  const hrefForPage = useCallback(
    (page: Page) => {
      if (page === Page.Profile && currentUser?.id) {
        return pageToHref(
          page,
          currentUser.publicId?.trim() || encodeUserPublicId(currentUser.id),
        );
      }
      return pageToHref(page);
    },
    [currentUser?.id],
  );

  const handleNavigation = useCallback((targetPage: Page) => {
    setIsSidebarOpen(false);
    if (targetPage === routePage) return;

    prefetchScreenChunk(targetPage);

    if (budgetEditingPages.includes(routePage)) {
      const summary = resolvePendingUnsavedChanges(pageActionRefs.current.getSummary);
      if (summary) {
        setChangeSummary(summary);
        setPendingNavigation(targetPage);
        return;
      }
      setIsPageDirty(false);
    }

    startTransition(() => {
      router.push(hrefForPage(targetPage));
    });
    setIsPageDirty(false);
  }, [routePage, router, hrefForPage]);

  useEffect(() => {
    setIsPageDirty(false);
    setPendingNavigation(null);
    setChangeSummary(null);
  }, [routePage]);

  /** Profile URL pakai public id — `/profile` atau id orang lain di-redirect ke akun sendiri. */
  useEffect(() => {
    if (!currentUser?.id || routePage !== Page.Profile) return;
    const canonical = encodeUserPublicId(currentUser.id);
    const pathToken = profilePublicIdFromPathname(pathname);
    if (!pathToken || decodeUserPublicId(pathToken) !== currentUser.id) {
      router.replace(pageToHref(Page.Profile, canonical));
    }
  }, [currentUser?.id, routePage, pathname, router]);

  const handlePoGrDataRefresh = useCallback(() => {
    refreshBudgetData();
    refreshConfigData();
  }, [refreshBudgetData, refreshConfigData]);

  const handleModalSave = async () => {
    if (pendingNavigation) {
      await pageActionRefs.current.onSave();
      prefetchScreenChunk(pendingNavigation);
      startTransition(() => {
        router.push(hrefForPage(pendingNavigation));
      });
      setPendingNavigation(null);
      setChangeSummary(null);
    }
  };

  const handleModalDiscard = () => {
      if (pendingNavigation) {
          pageActionRefs.current.onCancel();
          prefetchScreenChunk(pendingNavigation);
          startTransition(() => {
            router.push(hrefForPage(pendingNavigation));
          });
          setPendingNavigation(null);
          setChangeSummary(null);
      }
  };

  const handleModalClose = () => {
      setPendingNavigation(null);
      setChangeSummary(null);
  };

  const setPageActions = useCallback((actions: { onSave: () => Promise<void>; onCancel: () => void; getSummary: () => ChangeSummary | null; }) => {
    pageActionRefs.current = actions;
  }, []);

  const goToFirstAccessibleSidebarPage = useCallback(async () => {
    if (!currentUser) return;
    const landing = await resolvePostLoginLandingPage(currentUser, allRoles);
    handleNavigation(landing);
  }, [currentUser, allRoles, handleNavigation]);

  const handleGoToFirstAccessiblePage = useCallback(() => {
    void goToFirstAccessibleSidebarPage();
  }, [goToFirstAccessibleSidebarPage]);

  const shellPermissionsReady = areShellPermissionsReady(currentUser, allRoles, {
    dataInitialized,
    bootstrapFailed: bootstrapQuery.isError,
  });

  const hideUnassignedBdd = useMemo(
    () =>
      !!currentUser &&
      !currentUser.assignments.some(
        (a) => a.roleName === 'Super Admin' || a.roleName === 'BDD',
      ),
    [currentUser],
  );

  const pagePreloads = usePagePreloads({
    routePage,
    currentUser,
    selectedPeriodName,
    currentBudgetPeriod,
    hideUnassignedBdd,
  });

  const handleRequestDesktopPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      showToast('Browser ini tidak mendukung desktop notification.', 'error');
      return;
    }
    const permission = await Notification.requestPermission();
    setBrowserNotificationPermission(permission);
    if (permission === 'granted') {
      showToast('Desktop notification berhasil diaktifkan.', 'success');
    } else {
      showToast('Izin desktop notification belum diberikan.', 'error');
    }
  }, [showToast]);


  /** Restore + validasi sesi di background (SWR) — hanya saat sudah login. */
  useEffect(() => {
    if (!dataInitialized || !currentUser?.id) return;
    let cancelled = false;

    const applyUser = (u: User, roles?: string[], idleTimeoutMs?: number) => {
      if (cancelled) return;
      setCurrentUser((prev) => (prev && sameUserSession(prev, u) ? prev : u));
      writeCachedAuthUser(u);
      sessionStorage.setItem('currentUserId', String(u.id));
      queueMicrotask(() => {
        if (cancelled) return;
        const prev = useAuthStore.getState().user;
        if (!prev || !sameUserSession(prev, u)) {
          useAuthStore.getState().setSession(u, roles ?? [], idleTimeoutMs);
        }
      });
    };

    const usersSnapshot = allUsers;

    const clearLocalAuth = () => {
      if (cancelled) return;
      clearCachedAuthUser();
      clearCachedRoles();
      clearCachedBootstrap();
      clearShellCachePatchGuard();
      sessionStorage.removeItem('currentUserId');
      setCurrentUser(null);
      if (useBackendSession()) {
        clearTabSessionState();
      }
      queueMicrotask(() => {
        if (!cancelled) useAuthStore.getState().clearSession();
      });
    };

    const run = async () => {
      const savedUserId = sessionStorage.getItem('currentUserId');
      if (savedUserId && usersSnapshot.length > 0) {
        const parsed = parseInt(savedUserId, 10);
        if (Number.isFinite(parsed)) {
          const fromList = usersSnapshot.find((u) => u.id === parsed);
          if (fromList) applyUser(fromList);
        } else {
          sessionStorage.removeItem('currentUserId');
        }
      }

      try {
        if (useBackendSession()) {
          const cachedBootstrap = queryClient.getQueryData<AppBootstrapPayload>(
            queryKeys.app.bootstrap,
          );
          const me = await probeBackendSession();
          if (cancelled) return;
          if (me == null) {
            authDebug('background session probe transient — keep local session');
            return;
          }
          if (me.authenticated && me.user) {
            const publicId = me.user.publicId?.trim();
            if (!publicId) {
              const cached = readCachedAuthUser();
              if (cached) {
                applyUser(cached, me.user.roles, me.user.idleTimeoutMs);
                return;
              }
              clearLocalAuth();
              return;
            }
            const sessionIdentity = {
              publicId,
              id: decodeUserPublicId(publicId) ?? undefined,
            };
            let fromList = usersSnapshot.find(
              (u) =>
                u.publicId === sessionIdentity.publicId ||
                (sessionIdentity.id != null && u.id === sessionIdentity.id),
            );
            if (!fromList || (fromList.assignments?.length ?? 0) === 0) {
              if (cachedBootstrap?.users?.length) {
                fromList =
                  pickEnrichedUserFromPack(
                    {
                      users: cachedBootstrap.users,
                      roles: cachedBootstrap.roles,
                      multiYears: cachedBootstrap.multiYears,
                      periodSummaries: cachedBootstrap.allPeriods,
                      usersDirectoryAvailable: cachedBootstrap.usersDirectoryAvailable,
                    },
                    sessionIdentity,
                  ) ?? fromList;
              } else {
                const pack = await fetchAppInitPackFromBackend(null, sessionIdentity.id);
                if (pack?.users?.length) {
                  setAllUsers(pack.users);
                  setAllRoles(pack.roles);
                  writeCachedRoles(pack.roles);
                  setAllPeriods(pack.periodSummaries);
                  const bootstrapPayload = {
                    users: pack.users,
                    roles: pack.roles,
                    multiYears: pack.multiYears,
                    allPeriods: pack.periodSummaries,
                    usersDirectoryAvailable: pack.usersDirectoryAvailable,
                  };
                  writeCachedBootstrap(bootstrapPayload);
                  queryClient.setQueryData(queryKeys.app.bootstrap, bootstrapPayload);
                  syncPeriodSelectionFromLists(pack.multiYears, pack.periodSummaries);
                  setDataInitialized(true);
                  fromList =
                    pickEnrichedUserFromPack(pack, sessionIdentity) ??
                    fromList;
                }
              }
            }
            const user =
              fromList ??
              mergeAuthIdentityUser(
                {
                  publicId: sessionIdentity.publicId,
                  id: sessionIdentity.id,
                  username: me.user.username,
                  email: me.user.email,
                },
                {
                  sessionAssignments: me.user.assignments,
                  roleSlugs: me.user.roles,
                },
              );
            applyUser(user, me.user.roles, me.user.idleTimeoutMs);
            return;
          }
          if (!isDefinitiveUnauthenticated(me)) {
            return;
          }
          if (!me.authenticated) {
            const cachedUserId = readCachedAuthUser()?.id ?? null;
            const hasLocalAuthContext = Boolean(savedUserId || cachedUserId);
            if (!hasLocalAuthContext) {
              clearLocalAuth();
              return;
            }
            const refreshOk = hasSessionCookies
              ? await refreshBackendSessionCoordinated()
              : false;
            if (!cancelled && refreshOk) {
              const meAfterRefresh = await fetchAuthSession();
              if (meAfterRefresh?.authenticated && meAfterRefresh.user) {
                const hydratedUser = mergeAuthIdentityUser(
                  {
                    publicId: meAfterRefresh.user.publicId?.trim() || undefined,
                    username: meAfterRefresh.user.username,
                    email: meAfterRefresh.user.email,
                  },
                  {
                    sessionAssignments: meAfterRefresh.user.assignments,
                    roleSlugs: meAfterRefresh.user.roles,
                  },
                );
                applyUser(hydratedUser, meAfterRefresh.user.roles, meAfterRefresh.user.idleTimeoutMs);
                return;
              }
            }

            const recheck = await fetchAuthSession();
            if (isDefinitiveUnauthenticated(recheck)) {
              clearLocalAuth();
            }
          }
          return;
        }

        clearLocalAuth();
      } catch (err) {
        authDebug('background session validation error — keep session', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [dataInitialized, currentUser?.id, hasSessionCookies]);

  /** Login/buildAppUserFromRow can return empty scopes; merge from allUsers when it has richer assignments. */
  useEffect(() => {
    if (!dataInitialized || allUsers.length === 0) return;
    setCurrentUser(prev => {
      if (!prev) return prev;
      const full = allUsers.find(u => u.id === prev.id);
      if (!full) return prev;
      const scopeCount = (u: User) =>
        u.assignments.reduce((n, a) => n + (a.assignedScopes?.length ?? 0), 0);
      if (scopeCount(full) > scopeCount(prev)) {
        writeCachedAuthUser(full);
        return full;
      }
      return prev;
    });
  }, [dataInitialized, allUsers.length, currentUser?.id]);

  useEffect(() => {
    if (!dataInitialized || !currentUser) return;
    const budgetHuMasterSlices: ConfigSliceKey[] = [
      'assetTypeConfigs',
      'workflows',
      'budgetCategories',
      'projectPriorities',
    ];

    return subscribeConfigurationMasterChanged((slices) => {
      if (isShellCachePatchGuarded()) return;
      void (async () => {
        await refreshActiveConfigurationQueries(queryClient, slices, currentUser.id, {
          includeUserManaged: true,
        });
        if (slices.some((s) => budgetHuMasterSlices.includes(s))) {
          await refreshBudgetHuMasterConfigQueries(queryClient, currentUser.id);
        }
      })().catch((error) => {
        console.error('Configuration master sync failed:', error);
      });
    });
  }, [currentUser, dataInitialized, queryClient]);

  // After leaving Data Migration, sync data once (events were ignored on that page).
  useEffect(() => {
    const prev = prevActivePageForMigrationRef.current;
    prevActivePageForMigrationRef.current = routePage;
    if (!dataInitialized || !currentUser) return;
    if (prev !== Page.DataMigration || routePage === Page.DataMigration) return;

    void flushAllAppQueries().catch((error) => {
      console.error('Post-Data Migration refresh failed:', error);
    });
  }, [routePage, currentUser, dataInitialized, flushAllAppQueries]);

  // Handle logout
  const handleLogout = useCallback(async (options?: { skipBackend?: boolean }) => {
    sentNotificationDedupeKeysRef.current.clear();
    resetTaskNotificationState();
    invalidateAuthProbeCache();
    setCurrentUser(null);
    clearCachedAuthUser();
    clearCachedRoles();
    clearCachedBootstrap();
    clearShellCachePatchGuard();
    clearPersistedQueryCache();
    sessionStorage.removeItem('currentUserId');
    if (useBackendSession()) {
      if (!options?.skipBackend) {
        await logoutBackend({ allDevices: true });
      }
    }
    queueMicrotask(() => useAuthStore.getState().clearSession());
    useAuthStore.getState().setSessionReady(false);
    void queryClient.removeQueries({
      predicate: (q) =>
        Array.isArray(q.queryKey) &&
        (q.queryKey[0] === 'screen' || q.queryKey[0] === 'app'),
    });

    const { signOutSupabaseAuth } = await import('@/lib/authAzure');
    await signOutSupabaseAuth();

  showToast(
      options?.skipBackend
        ? 'Session ended after inactivity'
        : 'You have been logged out',
      'success',
    );
  }, [queryClient, showToast]);

  useEffect(() => {
    if (!useBackendSession()) return;
    return registerAuthFailureHandler(() => {
      void handleLogout({ skipBackend: true });
    });
  }, [handleLogout]);

  /** Legacy reset links may land on app routes — forward hash/query to `/`. */
  useEffect(() => {
    if (typeof window === 'undefined' || !isRecoveryFromUrl()) return;

    const suffix = window.location.hash || window.location.search;
    const path = window.location.pathname;
    if (!isLoginPath(path)) {
      window.location.replace(loginUrlWithSuffix(suffix));
      return;
    }

    if (currentUser) {
      void handleLogout({ skipBackend: false });
      useAuthStore.getState().setAuthProbeComplete(true);
    }
  }, [currentUser, handleLogout]);

  if (!currentUser) {
    return (
      <AppAuthGateViews
        toast={toast}
        dismissToast={dismissToast}
        showToast={showToast}
      />
    );
  }

  return (
    <AppAuthenticatedLayout
      showToast={showToast}
      onForceLogout={handleLogout}
      routePage={routePage}
      isSidebarOpen={isSidebarOpen}
      setIsSidebarOpen={setIsSidebarOpen}
      sidebarNavRevision={sidebarNavRevision}
      currentUser={currentUser}
      visibleNavItems={visibleNavItems}
      showProfileNav={showProfileNav}
      allRoles={allRoles}
      shellPermissionsReady={shellPermissionsReady}
      onNavigate={handleNavigation}
      onNavItemPrefetch={handleNavItemPrefetch}
      onLogout={handleLogout}
      notifications={notifications}
      onMarkNotificationAsRead={handleMarkNotificationAsRead}
      onMarkAllNotificationsAsRead={handleMarkAllNotificationsAsRead}
      allPeriods={allPeriods}
      selectedPeriodName={selectedPeriodName}
      onPeriodChange={handlePeriodChange}
      visibleArchetypes={visibleArchetypes}
      selectedArchetypeId={selectedArchetypeId}
      onArchetypeChange={handleArchetypeChange}
      visibleHUs={visibleHUs}
      selectedHuId={selectedHuId}
      onHUChange={handleHUChange}
      onHUHover={handleHUHoverPrefetch}
      isLoadingBudgetPeriod={isLoadingBudgetPeriod}
      routeRendererProps={{
        allRoles,
        allUsers,
        allPeriods,
        dataInitialized,
        shellPermissionsReady,
        selectedPeriodName,
        selectedArchetypeId,
        selectedHuId,
        currentBudgetPeriod,
        visibleArchetypes,
        pagePreloads,
        permissions,
        desktopNotificationsEnabled,
        browserNotificationPermission,
        onDesktopNotificationsToggle: setDesktopNotificationsEnabled,
        onRequestDesktopPermission: handleRequestDesktopPermission,
        onExecutiveArchetypeChange: handleExecutiveArchetypeChange,
        onBudgetPageDataChange: handleBudgetPageDataChange,
        onBudgetPeriodSaved: handleBudgetPeriodSaved,
        onConfigurationChange: refreshConfigData,
        onUsersListPatch: applyUsersToApp,
        onRolesListPatch: applyRolesToApp,
        onBudgetDataRefresh: refreshBudgetData,
        onConfigDataRefresh: refreshConfigData,
        onGoToFirstAccessiblePage: handleGoToFirstAccessiblePage,
        setIsPageDirty,
        setPageActions,
        showToast,
      }}
      pendingNavigation={pendingNavigation}
      changeSummary={changeSummary}
      onModalClose={handleModalClose}
      onModalSave={handleModalSave}
      onModalDiscard={handleModalDiscard}
      toast={toast}
      dismissToast={dismissToast}
    />
  );
};

export default AppRoot;
