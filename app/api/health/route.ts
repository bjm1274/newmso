import { NextResponse } from 'next/server';
import { getSqliteDb } from '@/lib/db/sqlite-manager';

export const dynamic = 'force-dynamic';

export async function GET() {
  const startTime = Date.now();
  let dbStatus = 'ok';
  let tableCount = 0;
  let errorDetail: string | null = null;

  try {
    const db = getSqliteDb();
    const result = db.prepare("SELECT count(1) as count FROM sqlite_master WHERE type='table'").get() as { count: number };
    tableCount = result?.count ?? 0;
  } catch (err) {
    dbStatus = 'error';
    errorDetail = err instanceof Error ? err.message : String(err);
  }

  const memory = process.memoryUsage();
  const uptimeSeconds = Math.floor(process.uptime());

  const isHealthy = dbStatus === 'ok';

  return NextResponse.json(
    {
      status: isHealthy ? 'healthy' : 'unhealthy',
      service: 'AllERP',
      timestamp: new Date().toISOString(),
      uptime: `${uptimeSeconds}s`,
      responseTimeMs: Date.now() - startTime,
      database: {
        engine: 'SQLite (better-sqlite3 WAL)',
        status: dbStatus,
        tables: tableCount,
        ...(errorDetail ? { error: errorDetail } : {}),
      },
      system: {
        nodeVersion: process.version,
        memoryUsage: {
          rssMb: Math.round(memory.rss / (1024 * 1024)),
          heapUsedMb: Math.round(memory.heapUsed / (1024 * 1024)),
          heapTotalMb: Math.round(memory.heapTotal / (1024 * 1024)),
        },
      },
    },
    { status: isHealthy ? 200 : 503 },
  );
}
