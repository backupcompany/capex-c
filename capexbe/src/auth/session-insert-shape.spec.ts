import { isUuid } from './azure-oauth.util';

/**
 * Mirrors SessionService.createSession insert chain:
 * .insert(row).select('id').single() — Prefer return=representation.
 */
export async function insertAuthSessionReturningId(
  client: {
    from: (table: string) => {
      insert: (row: Record<string, unknown>) => {
        select: (cols: string) => {
          single: () => Promise<{
            data: { id?: string } | null;
            error: unknown;
            status?: number;
            statusText?: string;
          }>;
        };
      };
    };
  },
  row: Record<string, unknown>,
): Promise<{ id: string }> {
  const { data, error, status } = await client
    .from('auth_sessions')
    .insert(row)
    .select('id')
    .single();
  const id = data?.id ? String(data.id) : '';
  if (!id) {
    throw new Error(
      `auth_sessions insert failed status=${status ?? '?'} error=${JSON.stringify(error)}`,
    );
  }
  return { id };
}

describe('insertAuthSessionReturningId (createSession shape)', () => {
  const wahyuRow = {
    id: '11111111-1111-4111-8111-111111111111',
    user_id: 179,
    auth_id: '0955c7e9-bfa8-4488-a777-e96036d26658',
    refresh_token_hash: 'a'.repeat(64),
    family_id: '22222222-2222-4222-8222-222222222222',
    expires_at: '2099-01-01T00:00:00.000Z',
    ip_address: null,
    user_agent: 'jest',
    last_active_at: '2026-08-19T00:00:00.000Z',
  };

  it('requires representation select/single and returns inserted id', async () => {
    expect(isUuid(String(wahyuRow.auth_id))).toBe(true);
    let sawSelect = false;
    let sawSingle = false;
    let inserted: Record<string, unknown> | null = null;

    const client = {
      from: (table: string) => {
        expect(table).toBe('auth_sessions');
        return {
          insert: (row: Record<string, unknown>) => {
            inserted = row;
            return {
              select: (cols: string) => {
                expect(cols).toBe('id');
                sawSelect = true;
                return {
                  single: async () => {
                    sawSingle = true;
                    return {
                      data: { id: String(row.id) },
                      error: null,
                      status: 201,
                      statusText: 'Created',
                    };
                  },
                };
              },
            };
          },
        };
      },
    };

    const out = await insertAuthSessionReturningId(client, wahyuRow);
    expect(sawSelect).toBe(true);
    expect(sawSingle).toBe(true);
    expect(out.id).toBe(wahyuRow.id);
    expect(inserted).toMatchObject({
      user_id: 179,
      auth_id: '0955c7e9-bfa8-4488-a777-e96036d26658',
    });
  });

  it('fails when opaque empty error and no row id (old bare-insert symptom)', async () => {
    const client = {
      from: () => ({
        insert: () => ({
          select: () => ({
            single: async () => ({
              data: null,
              error: {},
              status: 201,
              statusText: 'Created',
            }),
          }),
        }),
      }),
    };
    await expect(insertAuthSessionReturningId(client, wahyuRow)).rejects.toThrow(
      /auth_sessions insert failed/,
    );
  });
});
