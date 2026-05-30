import { create } from 'zustand';
import { getSocket } from '../lib/websocket';

export interface MarketData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  turnover: number;
  high: number;
  low: number;
  open: number;
  close: number;
  timestamp: string;
}

export interface MarketBreadth {
  advances: number;
  declines: number;
  unchanged: number;
  timestamp?: string;
}

export interface IndexData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
}

interface MarketState {
  connected: boolean;
  marketData: Record<string, MarketData>;
  indices: Record<string, IndexData>;
  breadth: MarketBreadth | null;
  
  // Actions
  initialize: () => void;
  disconnect: () => void;
  subscribe: (rooms: string[]) => void;
  unsubscribe: (rooms: string[]) => void;
  hydrateData: () => Promise<void>;
}

export const useMarketStore = create<MarketState>((set, get) => {
  let isInitialized = false;

  const hydrateData = async () => {
    try {
      // 1. Hydrate real-time quotes
      const quotesRes = await fetch('/api/market/quotes');
      if (quotesRes.ok) {
        const json = await quotesRes.json();
        if (json.ok && Array.isArray(json.data)) {
          const mData: Record<string, MarketData> = {};
          json.data.forEach((item: MarketData) => {
            mData[item.symbol] = item;
          });
          set({ marketData: mData });
        }
      }

      // 2. Hydrate indices
      const indicesRes = await fetch('/api/market/indices');
      if (indicesRes.ok) {
        const json = await indicesRes.json();
        if (json.ok && Array.isArray(json.data)) {
          const newIndices: Record<string, IndexData> = {};
          json.data.forEach((item: any) => {
            const sym = item.symbol.toUpperCase().trim();
            let mappedKey = item.symbol;
            if (sym === 'NIFTY 50' || sym === 'NIFTY_50' || sym === '^NSEI') {
              mappedKey = '^NSEI';
            } else if (sym === 'NIFTY BANK' || sym === 'NIFTY_BANK' || sym === 'BANKNIFTY' || sym === '^NSEBANK') {
              mappedKey = '^NSEBANK';
            } else if (sym === 'SENSEX' || sym === '^BSESN') {
              mappedKey = '^BSESN';
            }
            newIndices[mappedKey] = {
              symbol: mappedKey,
              price: item.price,
              change: item.change,
              changePercent: item.changePercent
            };
          });
          set({ indices: newIndices });
        }
      }

      // 3. Hydrate breadth
      const breadthRes = await fetch('/api/breadth?limit=1');
      if (breadthRes.ok) {
        const json = await breadthRes.json();
        if (json.data && json.data.length > 0) {
          const b = json.data[0];
          set({
            breadth: {
              advances: b.advances,
              declines: b.declines,
              unchanged: b.unchanged,
              timestamp: b.calculatedAt || b.timestamp
            }
          });
        }
      }
    } catch (err) {
      console.warn('MarketStore: Hydration failed', err);
    }
  };

  return {
    connected: false,
    marketData: {},
    indices: {},
    breadth: null,
    hydrateData,

    initialize: () => {
      if (isInitialized) return;
      isInitialized = true;
      
      const socket = getSocket();

      socket.on('connect', () => {
        set({ connected: true });
        // Automatically subscribe to global streams upon connection
        socket.emit('subscribe', ['global:market', 'global:indices', 'global:breadth']);
      });

      socket.on('disconnect', () => {
        set({ connected: false });
      });

      socket.on('market:batch', (data: MarketData[]) => {
        set((state) => {
          const newData = { ...state.marketData };
          let hasChanges = false;
          
          for (const item of data) {
            if (!newData[item.symbol] || new Date(item.timestamp) > new Date(newData[item.symbol].timestamp)) {
              newData[item.symbol] = item;
              hasChanges = true;
            }
          }
          
          return hasChanges ? { marketData: newData } : state;
        });
      });

      socket.on('market:indices', (data: IndexData[]) => {
        set((state) => {
          const newIndices = { ...state.indices };
          data.forEach(item => {
            const sym = item.symbol.toUpperCase().trim();
            let mappedKey = item.symbol;
            if (sym === 'NIFTY 50' || sym === 'NIFTY_50' || sym === '^NSEI') {
              mappedKey = '^NSEI';
            } else if (sym === 'NIFTY BANK' || sym === 'NIFTY_BANK' || sym === 'BANKNIFTY' || sym === '^NSEBANK') {
              mappedKey = '^NSEBANK';
            } else if (sym === 'SENSEX' || sym === '^BSESN') {
              mappedKey = '^BSESN';
            }
            newIndices[mappedKey] = {
              symbol: mappedKey,
              price: item.price,
              change: item.change,
              changePercent: item.changePercent
            };
          });
          return { indices: newIndices };
        });
      });

      socket.on('market:breadth', (data: MarketBreadth) => {
        set({ breadth: data });
      });

      // Hydrate immediately with fresh data from database
      hydrateData();

      // Trigger standard connection
      if (!socket.connected) {
        socket.connect();
      }
    },

    disconnect: () => {
      const socket = getSocket();
      socket.disconnect();
      isInitialized = false;
    },

    subscribe: (rooms: string[]) => {
      const socket = getSocket();
      if (socket.connected) {
        socket.emit('subscribe', rooms);
      }
    },

    unsubscribe: (rooms: string[]) => {
      const socket = getSocket();
      if (socket.connected) {
        socket.emit('unsubscribe', rooms);
      }
    }
  };
});
