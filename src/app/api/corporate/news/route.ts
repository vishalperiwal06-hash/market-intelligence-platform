import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { newsArticles } from '@/lib/db/schema';
import { desc, eq, sql } from 'drizzle-orm';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const symbol = searchParams.get('symbol');
    const category = searchParams.get('category');

    const news = await db.select()
      .from(newsArticles)
      .where(category ? eq(newsArticles.category, category) : undefined)
      .orderBy(desc(newsArticles.pubDate))
      .limit(limit);

    // Zero fallback policy - return authentic database news articles only
    const finalNews = symbol
      ? news.filter(n => Array.isArray(n.symbols) && n.symbols.includes(symbol))
      : news;

    return NextResponse.json({ news: finalNews });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
