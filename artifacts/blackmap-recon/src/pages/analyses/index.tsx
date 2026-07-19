import React, { useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useListJobs, getListJobsQueryKey } from '@workspace/api-client-react';
import { Link } from 'wouter';
import { formatTimeAgo, getSeverityColors, cn } from '@/lib/utils';
import { Search, Loader2, FileCode2, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

export default function AnalysesPage() {
  const { data: jobs, isLoading } = useListJobs({ query: { queryKey: getListJobsQueryKey(), refetchInterval: 10000 } });

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Analysis History</h2>
            <p className="text-muted-foreground">All completed and running scans.</p>
          </div>
          <Link href="/recon" className="bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium text-sm hover:bg-primary/90 transition-colors">
            New Scan
          </Link>
        </div>

        <div className="border border-border rounded-xl bg-card overflow-hidden">
          <div className="p-4 border-b border-border bg-muted/20 flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input 
                type="text" 
                placeholder="Filter by target name..." 
                className="w-full bg-background border border-border rounded-md pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <select className="bg-background border border-border rounded-md px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
              <option value="all">All Statuses</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="running">Running</option>
            </select>
          </div>

          {isLoading ? (
            <div className="p-12 text-center flex flex-col items-center justify-center min-h-[300px]">
              <Loader2 className="size-8 text-primary animate-spin mb-4" />
              <p className="text-muted-foreground">Loading history...</p>
            </div>
          ) : jobs && jobs.length > 0 ? (
            <div className="divide-y divide-border">
              {jobs.map((job, i) => (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  key={job.id}
                >
                  <Link href={`/recon/${job.id}`} className="flex flex-col sm:flex-row sm:items-center justify-between p-5 hover:bg-muted/50 transition-colors group">
                    <div className="mb-4 sm:mb-0">
                      <div className="flex items-center gap-3 mb-1">
                        <StatusPill status={job.status} />
                        <span className="font-mono font-medium text-foreground">{job.target}</span>
                      </div>
                      <div className="text-sm text-muted-foreground flex gap-3">
                        <span>ID: <span className="font-mono text-xs">{job.id.substring(0, 8)}</span></span>
                        <span>•</span>
                        <span>{formatTimeAgo(job.createdAt)}</span>
                        <span>•</span>
                        <span className="uppercase text-xs font-bold mt-0.5">{job.type.replace('_', ' ')}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-6">
                      {job.status === 'running' && (
                         <div className="w-32">
                           <div className="flex justify-between text-xs mb-1 text-muted-foreground">
                             <span>Progress</span>
                             <span>{job.progress}%</span>
                           </div>
                           <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                             <div className="h-full bg-primary" style={{ width: `${job.progress}%` }} />
                           </div>
                         </div>
                      )}
                      <ArrowRight className="size-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="p-16 text-center">
              <FileCode2 className="size-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-1">No analysis history</h3>
              <p className="text-muted-foreground mb-4">Your scan history will appear here.</p>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

function StatusPill({ status }: { status: string }) {
  switch (status) {
    case 'completed': return <span className="size-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />;
    case 'failed': return <span className="size-2 rounded-full bg-destructive shadow-[0_0_8px_rgba(239,68,68,0.5)]" />;
    case 'running': return <span className="size-2 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.5)] animate-pulse" />;
    default: return <span className="size-2 rounded-full bg-muted-foreground" />;
  }
}
