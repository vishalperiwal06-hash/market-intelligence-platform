'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './button';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
  name?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  retryCount: number;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    retryCount: 0
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error(`ErrorBoundary caught error in widget [${this.props.name || 'Component'}]:`, error, errorInfo);
  }

  private handleRetry = () => {
    this.setState(prevState => ({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: prevState.retryCount + 1
    }));
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="border border-red-500/20 bg-red-950/10 rounded backdrop-blur-md p-4 flex flex-col items-center justify-center text-center space-y-3 min-h-[140px] text-zinc-100">
          <AlertTriangle className="h-6 w-6 text-rose-400 animate-pulse" />
          <div className="space-y-1">
            <h4 className="text-xs font-bold font-mono text-rose-400 uppercase tracking-wider">
              {this.props.name || 'WIDGET'} ENGINE OFFLINE
            </h4>
            <p className="text-[10px] text-zinc-400 font-medium max-w-[280px] font-sans truncate">
              {this.state.error?.message || 'A rendering exception occurred in this module.'}
            </p>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={this.handleRetry} 
            className="h-7 text-[10px] border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 font-mono text-zinc-300 font-bold"
          >
            <RefreshCw className="mr-1.5 h-3 w-3 text-emerald-400 animate-[spin_3s_linear_infinite]" />
            RECONNECT STREAM
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
