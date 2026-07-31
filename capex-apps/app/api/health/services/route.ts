import { NextResponse } from 'next/server';
import { collectServicesHealth } from '@/lib/microservices/serviceHealth';

/** Aggregated health for gateway + auth + leaf services (ops / compose-verify helper). */
export async function GET() {
  const snapshot = await collectServicesHealth();
  const status = snapshot.allOk ? 200 : 503;
  return NextResponse.json(snapshot, { status });
}
