'use client';

import React from 'react';
import type { User, BudgetPeriod } from '@/types';
import type { ConfigurationDataPack } from '@/services/configurationApi';
import { DataManagement } from '@/features/configuration/data-management/components/DataManagement';

type DataManagementTabProps = {
  pack: Partial<ConfigurationDataPack>;
  currentUser: User;
  refreshAllPeriods: () => void;
};

export function DataManagementTab({ pack, currentUser, refreshAllPeriods }: DataManagementTabProps) {
  return (
    <DataManagement
      allPeriods={(pack.allPeriods ?? []) as BudgetPeriod[]}
      onDataChange={refreshAllPeriods}
      currentUser={currentUser}
    />
  );
}
