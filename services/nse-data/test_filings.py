import asyncio
import sys
import os

# Add app to path
sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

# Configure settings env
os.environ['DATABASE_URL'] = 'postgresql://market_db_1kiu_user:sCTErQdBgoAVzo77eyJCMfnxMGYyAbW7@dpg-d8d8a3u8bjmc739t5e50-a.singapore-postgres.render.com/market_db_1kiu?sslmode=require'
os.environ['REDIS_URL'] = 'rediss://red-d8d8a3m8bjmc739t5drg:HVYtTPqu0Sk0Hz3S80T6IrF2ZQeVtOMw@singapore-keyvalue.render.com:6379'

async def test():
    # Import inside event loop
    from app.services import filings_service
    print('Testing filings service...')
    try:
        res = await filings_service.corporate_filings(limit=5)
        print(f'Success! Fetched {len(res)} filings.')
        if res:
            print('Sample:', res[0])
    except Exception as e:
        print('Failed with error:', e)
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    asyncio.run(test())
