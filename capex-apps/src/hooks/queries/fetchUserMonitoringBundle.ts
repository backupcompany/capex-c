import type { UserActivityMetric } from '@/types';
import { fetchUserMonitoringScreenFromBackend } from '@/services/userMonitoringApi';

export type UserMonitoringBundle = {
  userData: UserActivityMetric[];
  roleData: never[];
};

export async function fetchUserMonitoringBundle(userId: number): Promise<UserMonitoringBundle> {
  const screen = await fetchUserMonitoringScreenFromBackend({
    userId,
    page: 1,
    pageSize: 25,
    search: '',
    status: 'all',
    archetypeName: null,
    unitName: null,
  });
  if (screen) {
    return { userData: screen.usersPage.rows, roleData: [] };
  }
  return { userData: [], roleData: [] };
}
