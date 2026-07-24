import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { CACHE_TTL_MS } from '../shared/cache-keys';
import { CacheAsideService } from '../shared/cache-aside.service';
import { fetchAllRecords } from '../project-list/supabase-helpers';
import { getAllRoles, getAllUsers, getUserById } from '../project-list/master-data.loader';
import { AuthContextService } from '../auth/auth-context.service';
import { AuthZService } from '../auth/auth-z.service';
import {
  buildMultiYearsShellFromRows,
  buildPeriodSummariesFromRows,
} from '../budget-multi-year/budget-multi-year.util';
import { viewerCanLoadUserDirectory, viewerCanSeeUserPii } from '../shared/pii-access.util';
import { sanitizeRolesForViewer } from '../shared/bootstrap-sanitize.util';
import { sanitizeUsersForDirectory } from '../shared/response-sanitize.util';

const PERIOD_SUMMARY_COLUMNS = 'period_name,multi_year_name,start_date,end_date';
const MULTI_YEAR_COLUMNS = 'name,start_year,end_year,budget_plan';
const USERS_DIRECTORY_CACHE_KEY = 'bootstrap:users-directory:v1';

@Injectable()
export class BootstrapService {
  constructor(
    private readonly authContext: AuthContextService,
    private readonly authZ: AuthZService,
    private readonly cacheAside: CacheAsideService,
  ) {}

  /**
   * Slim init pack — self user only. Full directory deferred to /bootstrap/users-directory.
   */
  async loadAppInitPack(accessToken: string, userId: number) {
    if (!accessToken?.trim()) {
      throw new UnauthorizedException('Missing access token');
    }
    const { client } = await this.authContext.getRlsClient(accessToken, userId);

    const [canLoadDirectory, includePii, selfUser, roles, multiYearRows, periodRows] =
      await Promise.all([
        viewerCanLoadUserDirectory(this.authZ, accessToken, userId),
        viewerCanSeeUserPii(this.authZ, accessToken, userId),
        getUserById(client, userId),
        getAllRoles(client),
        fetchAllRecords(client, 'budget_multi_years', MULTI_YEAR_COLUMNS),
        fetchAllRecords(client, 'budget_periods', PERIOD_SUMMARY_COLUMNS),
      ]);

    if (!selfUser) {
      throw new UnauthorizedException('User not found');
    }

    const sanitizedSelf = sanitizeUsersForDirectory(
      [selfUser as Record<string, unknown>],
      userId,
      includePii,
    );
    const self = sanitizedSelf[0];
    const multiYears = buildMultiYearsShellFromRows(multiYearRows);
    const periodSummaries = buildPeriodSummariesFromRows(periodRows);

    return {
      users: self ? [self] : [],
      roles: sanitizeRolesForViewer(roles, self?.assignments),
      multiYears,
      periodSummaries,
      usersDirectoryAvailable: canLoadDirectory,
    };
  }

  /** Lazy user directory — admin/config screens only (cached globally on server). */
  async loadUsersDirectory(accessToken: string, userId: number) {
    if (!accessToken?.trim()) {
      throw new UnauthorizedException('Missing access token');
    }
    const canLoad = await viewerCanLoadUserDirectory(this.authZ, accessToken, userId);
    if (!canLoad) {
      throw new ForbiddenException('Insufficient permission to load user directory');
    }

    const includePii = await viewerCanSeeUserPii(this.authZ, accessToken, userId);
    const users = await this.cacheAside.getOrLoad(
      USERS_DIRECTORY_CACHE_KEY,
      CACHE_TTL_MS.MASTER,
      async () => {
        const { client } = await this.authContext.getRlsClient(accessToken, userId);
        return getAllUsers(client);
      },
    );

    return {
      users: sanitizeUsersForDirectory(
        users as Record<string, unknown>[],
        userId,
        includePii,
      ),
    };
  }
}
