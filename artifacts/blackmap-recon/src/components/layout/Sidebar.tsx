import React from 'react';
import { useLocation, Link } from 'wouter';
import { LayoutDashboard, Shield, Activity, Settings, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHealthCheck } from '@workspace/api-client-react';

export function Sidebar() {
  const [location] = useLocation();
  const { data: health } = useHealthCheck({ query: { queryKey: ['health'], refetchInterval: 30000 } });

  const navItems = [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'New Recon', href: '/recon', icon: Zap },
    { label: 'Analyses', href: '/analyses', icon: Activity },
    { label: 'Settings', href: '/settings', icon: Settings },
  ];

  return (
    <div className="w-64 bg-sidebar border-r border-sidebar-border h-[100dvh] flex flex-col fixed left-0 top-0">
      <div className="p-6">
        <Link href="/dashboard" className="flex items-center gap-3 select-none" data-testid="link-home">
          <div className="size-8 rounded-md bg-primary flex items-center justify-center">
            <Shield className="size-5 text-primary-foreground" />
          </div>
          <span className="font-mono font-bold text-lg tracking-tight text-sidebar-foreground">
            BLACKMAP
          </span>
        </Link>
      </div>

      <nav className="flex-1 px-4 space-y-1">
        {navItems.map((item) => {
          const active = location === item.href || (location.startsWith('/recon') && item.href === '/recon' && location !== '/recon');
          return (
            <Link key={item.href} href={item.href} className="block" data-testid={`nav-${item.label.toLowerCase()}`}>
              <div
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
              >
                <item.icon className={cn("size-4", active ? "text-primary" : "text-sidebar-foreground/50")} />
                {item.label}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border/50">
        <div className="flex items-center gap-2 px-3 py-2 text-xs font-mono text-sidebar-foreground/60">
          <div className={cn(
            "size-2 rounded-full",
            health?.status === 'ok' ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-destructive shadow-[0_0_8px_rgba(239,68,68,0.5)]"
          )} />
          {health?.status === 'ok' ? 'API ONLINE' : 'API OFFLINE'}
        </div>
      </div>
    </div>
  );
}
