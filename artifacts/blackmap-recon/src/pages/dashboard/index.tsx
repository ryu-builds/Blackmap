import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useGetDashboardSummary, getGetDashboardSummaryQueryKey } from '@workspace/api-client-react';
import { ShieldAlert, CheckCircle2, Activity, FolderSearch, AlertTriangle, ArrowRight } from 'lucide-react';
import { Link } from 'wouter';
import { formatTimeAgo, getSeverityColors, cn } from '@/lib/utils';
import { motion } from 'framer-motion';

export default function DashboardPage() {
  const { data: summary, isLoading, error } = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey(), refetchInterval: 10000 } });

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-6xl mx-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Overview</h2>
            <p className="text-muted-foreground">High-level view of your scanning infrastructure.</p>
          </div>
          <Link href="/recon" className="bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium text-sm flex items-center gap-2 hover:bg-primary/90 transition-colors" data-testid="btn-new-scan">
            <FolderSearch className="size-4" />
            New Scan
          </Link>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard 
            title="Total Analyses" 
            value={summary?.totalAnalyses.toString() || "0"} 
            icon={Activity} 
            loading={isLoading}
          />
          <StatCard 
            title="Completed" 
            value={summary?.completedAnalyses.toString() || "0"} 
            icon={CheckCircle2} 
            iconColor="text-emerald-500"
            loading={isLoading}
          />
          <StatCard 
            title="Failed/Errors" 
            value={summary?.failedAnalyses.toString() || "0"} 
            icon={AlertTriangle} 
            iconColor="text-destructive"
            loading={isLoading}
          />
          <StatCard 
            title="Critical Findings" 
            value={summary?.criticalFindings.toString() || "0"} 
            icon={ShieldAlert} 
            iconColor="text-destructive"
            loading={isLoading}
          />
        </div>

        {/* Recent Jobs */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Recent Analyses</h3>
            <Link href="/analyses" className="text-sm text-primary hover:underline" data-testid="link-view-all">View all</Link>
          </div>
          
          <div className="border border-border rounded-lg bg-card overflow-hidden">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Loading recent analyses...</div>
            ) : summary?.recentJobs && summary.recentJobs.length > 0 ? (
              <div className="divide-y divide-border">
                {summary.recentJobs.map((job, i) => (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    key={job.id} 
                  >
                    <Link href={`/recon/${job.id}`} className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors group" data-testid={`job-row-${job.id}`}>
                      <div className="flex items-center gap-4">
                        <StatusIcon status={job.status} />
                        <div>
                          <div className="font-mono text-sm font-medium">{job.target}</div>
                          <div className="text-xs text-muted-foreground mt-1 flex gap-2">
                            <span>{job.type === 'github_url' ? 'GitHub' : 'Upload'}</span>
                            <span>•</span>
                            <span>{formatTimeAgo(job.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {job.status === 'running' && (
                          <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary" style={{ width: `${job.progress}%` }} />
                          </div>
                        )}
                        <ArrowRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity -translate-x-2 group-hover:translate-x-0" />
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center flex flex-col items-center">
                <FolderSearch className="size-12 text-muted-foreground/30 mb-4" />
                <h4 className="text-lg font-medium mb-1">No analyses yet</h4>
                <p className="text-muted-foreground text-sm mb-4">Start by scanning a GitHub repository or uploading a zip file.</p>
                <Link href="/recon" className="text-primary text-sm font-medium hover:underline">Run first scan</Link>
              </div>
            )}
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}

function StatCard({ title, value, icon: Icon, iconColor, loading }: { title: string, value: string, icon: any, iconColor?: string, loading?: boolean }) {
  return (
    <div className="p-6 rounded-xl border border-border bg-card">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        <Icon className={cn("size-5", iconColor || "text-muted-foreground")} />
      </div>
      {loading ? (
        <div className="h-8 w-16 bg-muted rounded animate-pulse" />
      ) : (
        <div className="text-3xl font-bold tracking-tight font-mono">{value}</div>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return <div className="size-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500"><CheckCircle2 className="size-4" /></div>;
    case 'failed':
      return <div className="size-8 rounded-full bg-red-500/10 flex items-center justify-center text-red-500"><AlertTriangle className="size-4" /></div>;
    case 'running':
    case 'queued':
      return <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-primary"><Activity className="size-4 animate-pulse" /></div>;
    default:
      return <div className="size-8 rounded-full bg-muted flex items-center justify-center"><Activity className="size-4" /></div>;
  }
}
