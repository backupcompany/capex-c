import React, { createContext, useContext, useEffect, useState } from 'react';
import { fetchFreshConfigurationSlices, type ConfigurationDataPack } from '../services/configurationApi';
import { readConfigurationPackCacheAnyAge } from '../lib/configurationDiskCache';
import { isCapexBeConfigured } from '../lib/capexBeClient';
import { useBackendSession } from '../lib/auth/authConstants';
import { getAccessTokenForBackend } from '../lib/authSession';
import { useAuthStore } from '../stores/authStore';
import type { ArchetypeConfig, HospitalUnitConfig } from '../types';

interface ScopeClassification {
    archetypeNames: Set<string>;
    huNames: Set<string>;
    archetypeIdToName: Map<string, string>;
    huIdToName: Map<string, string>;
}

const defaultClassification: ScopeClassification = {
    archetypeNames: new Set(),
    huNames: new Set(),
    archetypeIdToName: new Map(),
    huIdToName: new Map(),
};

const PermissionsContext = createContext<ScopeClassification>(defaultClassification);

function classificationFromPack(
    pack: Partial<ConfigurationDataPack> | null | undefined,
): ScopeClassification | null {
    const archetypes = Array.isArray(pack?.archetypes) ? pack.archetypes : [];
    const hus = Array.isArray(pack?.hospitalUnits) ? pack.hospitalUnits : [];
    if (!archetypes.length && !hus.length) return null;
    return {
        archetypeNames: new Set(archetypes.map((a) => a.name)),
        huNames: new Set(hus.map((h) => h.name)),
        archetypeIdToName: new Map(archetypes.map((a) => [String(a.id), a.name])),
        huIdToName: new Map(hus.map((h) => [String(h.id), h.name])),
    };
}

function readInitialClassification(userId: number): ScopeClassification {
    if (typeof window === 'undefined') return defaultClassification;
    return classificationFromPack(readConfigurationPackCacheAnyAge(userId)) ?? defaultClassification;
}

async function loadScopeMasterConfig(userId: number): Promise<{
    archetypes: ArchetypeConfig[];
    hus: HospitalUnitConfig[];
}> {
    if (!isCapexBeConfigured()) {
        return { archetypes: [], hus: [] };
    }

    const accessToken = useBackendSession()
        ? null
        : await getAccessTokenForBackend();
    const pack = await fetchFreshConfigurationSlices(accessToken, userId, [
        'archetypes',
        'hospitalUnits',
    ]);

    return {
        archetypes: Array.isArray(pack?.archetypes) ? pack.archetypes : [],
        hus: Array.isArray(pack?.hospitalUnits) ? pack.hospitalUnits : [],
    };
}

export const PermissionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const authStatus = useAuthStore((s) => s.status);
    const sessionUserId = useAuthStore((s) =>
        s.status === 'authenticated' && s.user?.id ? s.user.id : null,
    );
    const [classification, setClassification] = useState<ScopeClassification>(() =>
        sessionUserId != null ? readInitialClassification(sessionUserId) : defaultClassification,
    );

    useEffect(() => {
        if (authStatus !== 'authenticated' || sessionUserId == null) {
            setClassification(defaultClassification);
            return;
        }

        const diskSeed = readInitialClassification(sessionUserId);
        setClassification((prev) => {
            if (prev.archetypeIdToName.size || prev.huIdToName.size) return prev;
            return diskSeed;
        });

        let cancelled = false;
        void (async () => {
            try {
                const { archetypes, hus } = await loadScopeMasterConfig(sessionUserId);
                if (cancelled) return;
                setClassification({
                    archetypeNames: new Set(archetypes.map(a => a.name)),
                    huNames: new Set(hus.map(h => h.name)),
                    archetypeIdToName: new Map(archetypes.map(a => [String(a.id), a.name])),
                    huIdToName: new Map(hus.map(h => [String(h.id), h.name])),
                });
            } catch (e) {
                void e;
            }
        })();
        return () => { cancelled = true; };
    }, [authStatus, sessionUserId]);

    return (
        <PermissionsContext.Provider value={classification}>
            {children}
        </PermissionsContext.Provider>
    );
};

export const useScopeClassification = (): ScopeClassification => useContext(PermissionsContext);
