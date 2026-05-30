import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, portfolios, portfolioHoldings, copilotSessions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { authEngine } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('session_token')?.value;
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    
    const user = await authEngine.validateSession(token);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userId = user.id;

    // Fetch user profile
    const profile = await db.select().from(users).where(eq(users.id, userId));

    // Temporary: portfolios does not have userId in current schema, returning empty array.
    const userPortfolios: any[] = [];
    const portfolioIds = userPortfolios.map(p => p.id);
    let holdings: any[] = [];
    for (const pid of portfolioIds) {
      const h = await db.select().from(portfolioHoldings).where(eq(portfolioHoldings.portfolioId, pid));
      holdings = holdings.concat(h);
    }

    // Return as downloadable JSON file
    const exportData = {
      exportedAt: new Date().toISOString(),
      user: profile[0],
      portfolios: userPortfolios.map(p => ({
        ...p,
        holdings: holdings.filter(h => h.portfolioId === p.id)
      }))
    };

    // Return as downloadable JSON file
    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="aibazaar_export_${userId}.json"`,
      }
    });

  } catch (error: any) {
    console.error('Data Export Error:', error);
    return NextResponse.json({ error: 'Failed to export user data' }, { status: 500 });
  }
}
