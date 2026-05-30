/**
 * AI Service for the Market Intelligence Platform
 * Using DeepSeek API
 */

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

export async function generateMarketNarrative(marketData: any, filings: any[]) {
  if (!process.env.DEEPSEEK_API_KEY) {
    console.warn('DEEPSEEK_API_KEY is missing');
    return null;
  }

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: 'You are an elite financial analyst. Analyze the provided real-time market data and recent filings to generate a brief, professional market narrative.'
          },
          {
            role: 'user',
            content: JSON.stringify({ marketData, filings })
          }
        ],
        temperature: 0.2
      })
    });

    if (!response.ok) {
      throw new Error('AI request failed');
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('AI Service Error:', error);
    return null;
  }
}
