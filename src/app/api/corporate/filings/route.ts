import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { corporateFilings } from '@/lib/db/schema';
import { desc, eq, and, ilike, or, sql } from 'drizzle-orm';
import { filingsIngestionEngine } from '@/server/corporate-engine/filings/ingester';

const MAX_LIMIT = 200;

export async function GET(request: Request) {
  let symbol: string | null = null;
  let limit = 50;
  let offset = 0;
  try {
    const { searchParams } = new URL(request.url);
    limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10), 1), MAX_LIMIT);
    offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);
    symbol = searchParams.get('symbol')?.toUpperCase() || null;
    const category = searchParams.get('category');
    const search = searchParams.get('search');
    const refresh = searchParams.get('refresh') === 'true';
    // Start background poller loop automatically if not active
    filingsIngestionEngine.startBackgroundPoller();

    if (refresh) {
      await filingsIngestionEngine.pollFilings();
    }

    const conditions = [];
    if (symbol) conditions.push(eq(corporateFilings.symbol, symbol));
    if (category) conditions.push(eq(corporateFilings.category, category));
    if (search) {
      conditions.push(
        or(
          ilike(corporateFilings.subject, `%${search}%`),
          ilike(corporateFilings.details, `%${search}%`),
          ilike(corporateFilings.companyName, `%${search}%`),
        ),
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db.select()
      .from(corporateFilings)
      .where(whereClause)
      .orderBy(desc(corporateFilings.broadcastDate))
      .limit(limit)
      .offset(offset);

    if (rows.length > 0) {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(corporateFilings)
        .where(whereClause);

      return NextResponse.json({
        ok: true,
        filings: rows,
        meta: { count, limit, offset, source: 'postgres' },
      });
    }

    let fallback;
    try {
      fallback = await filingsIngestionEngine.fetchPage({ symbol, category, limit, offset, search });
    } catch (e) {
      fallback = { filings: [] };
    }

    if (fallback.filings && fallback.filings.length > 0) {
      return NextResponse.json({
        ok: true,
        filings: fallback.filings,
        meta: { ...(fallback.meta ?? {}), source: 'nselib-service' },
      });
    }    // Zero-fabrication policy: return empty filings rather than mock records
    return NextResponse.json({
      ok: true,
      filings: [],
      meta: { count: 0, limit, offset, source: 'postgres' },
    });
  } catch (error: any) {
    return NextResponse.json({
      ok: true,
      filings: [],
      meta: { count: 0, limit, offset, source: 'error-safe' },
    });
  }
}
