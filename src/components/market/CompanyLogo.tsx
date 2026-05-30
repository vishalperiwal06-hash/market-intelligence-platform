'use client';

import { useState, useEffect, useMemo } from 'react';
import { Building2 } from 'lucide-react';
import { guessDomain } from '@/lib/company-logo';

interface CompanyLogoProps {
  symbol: string;
  companyName?: string | null;
  size?: 'sm' | 'md' | 'lg';
}

export function CompanyLogo({ symbol, companyName, size = 'sm' }: CompanyLogoProps) {
  const [domainIndex, setDomainIndex] = useState(0);
  const [cdnIndex, setCdnIndex] = useState(0);
  const [logoLoaded, setLogoLoaded] = useState(false);
  const [fallbackMode, setFallbackMode] = useState(false);

  const sym = symbol.toUpperCase().trim();
  const cleanedSymbol = sym.replace(/\.(NS|BO)$/, '').replace(/-(EQ|BE|BL|BZ|N\d)$/, '').trim();
  const domain = guessDomain(cleanedSymbol, companyName);

  // Construct a cascade of possible domains for Indian public equities to maximize successful hits
  const domainsToTry = useMemo(() => {
    const list = [domain];
    
    if (domain.endsWith('.com')) {
      const base = domain.replace(/\.com$/, '');
      list.push(`${base}.in`);
      list.push(`${base}.co.in`);
    }
    
    const symLower = cleanedSymbol.toLowerCase();
    if (!list.includes(`${symLower}.com`)) list.push(`${symLower}.com`);
    if (!list.includes(`${symLower}.in`)) list.push(`${symLower}.in`);
    if (!list.includes(`${symLower}.co.in`)) list.push(`${symLower}.co.in`);
    
    return list;
  }, [domain, cleanedSymbol]);

  const cdns = [
    (d: string) => `https://logo.clearbit.com/${d}`,
    (d: string) => `https://images.brandfetch.io/${d}`,
    (d: string) => `https://www.google.com/s2/favicons?sz=128&domain=${d}`,
  ];

  // Sizes classes matching the system
  const sizeClasses = {
    sm: 'h-6 w-6 text-[10px]',
    md: 'h-8 w-8 text-[12px]',
    lg: 'h-10 w-10 text-[14px]',
  };

  const iconSizes = {
    sm: 12,
    md: 16,
    lg: 20,
  };

  const currentDomain = domainsToTry[domainIndex];
  const logoUrl = cdns[cdnIndex](currentDomain);

  const handleLogoError = () => {
    // Try the next domain for the current CDN first
    if (domainIndex < domainsToTry.length - 1) {
      setDomainIndex((prev) => prev + 1);
    } else {
      // If we exhausted all domains for the current CDN, try the next CDN with the first domain
      if (cdnIndex < cdns.length - 1) {
        setCdnIndex((prev) => prev + 1);
        setDomainIndex(0);
      } else {
        // Fall back completely to premium HSL building vector
        setFallbackMode(true);
      }
    }
  };

  // Reset when symbol changes
  useEffect(() => {
    setDomainIndex(0);
    setCdnIndex(0);
    setLogoLoaded(false);
    setFallbackMode(false);
  }, [symbol]);

  // Premium corporate colors based on character code hashing
  let charSum = 0;
  for (let i = 0; i < cleanedSymbol.length; i++) {
    charSum += cleanedSymbol.charCodeAt(i);
  }
  const hue = charSum % 360;
  const gradientStyles = {
    background: `linear-gradient(135deg, hsl(${hue}, 70%, 15%) 0%, hsl(${(hue + 40) % 360}, 65%, 8%) 100%)`,
    borderColor: `hsl(${hue}, 40%, 25%)`,
    color: `hsl(${hue}, 85%, 65%)`,
  };

  return (
    <div
      className={`relative flex-shrink-0 flex items-center justify-center rounded-lg overflow-hidden select-none bg-zinc-950/80 border transition-all duration-300 shadow-md group-hover:scale-105 group-hover:shadow-lg ${sizeClasses[size]}`}
      style={fallbackMode ? gradientStyles : { borderColor: 'rgba(39, 39, 42, 0.4)' }}
    >
      {!fallbackMode ? (
        <>
          {/* High density skeleton loader */}
          {!logoLoaded && (
            <div className="absolute inset-0 bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 animate-pulse" />
          )}
          <img
            src={logoUrl}
            alt={cleanedSymbol}
            loading="lazy"
            onLoad={() => setLogoLoaded(true)}
            onError={handleLogoError}
            className={`w-full h-full object-contain bg-white p-0.5 transition-opacity duration-300 ${
              logoLoaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        </>
      ) : (
        /* Premium vectors only, strictly no letters or initial circles */
        <Building2
          size={iconSizes[size]}
          className="animate-pulse opacity-80"
          style={{ color: gradientStyles.color }}
        />
      )}
    </div>
  );
}
