import React from 'react';
import { useLocation } from 'wouter';
import { Bell, Search } from 'lucide-react';

export function TopBar() {
  const [location] = useLocation();
  
  let title = "Dashboard";
  if (location.startsWith('/recon')) title = "Reconnaissance";
  if (location.startsWith('/settings')) title = "Settings";
  if (location.startsWith('/analyses')) title = "Analysis History";

  return (
    <header className="h-16 border-b bg-background/80 backdrop-blur-sm sticky top-0 z-10 flex items-center justify-between px-8">
      <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
      
      <div className="flex items-center gap-4">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input 
            type="text" 
            placeholder="Search reports..." 
            className="h-9 w-64 bg-muted border-none rounded-md pl-9 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            data-testid="input-global-search"
          />
        </div>
        <button className="relative size-9 flex items-center justify-center rounded-md hover:bg-muted transition-colors" data-testid="button-notifications">
          <Bell className="size-4 text-muted-foreground" />
          <span className="absolute top-2 right-2 size-1.5 rounded-full bg-primary" />
        </button>
      </div>
    </header>
  );
}
