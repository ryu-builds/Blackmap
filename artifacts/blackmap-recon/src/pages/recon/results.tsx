import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useGetJob, useGetJobResults, useDeleteJob, getGetJobQueryKey, getGetJobResultsQueryKey } from '@workspace/api-client-react';
import { AlertCircle, Clock, CheckCircle2, FileCode2, Search, Loader2, ArrowLeft, Trash2 } from 'lucide-react';
import { cn, formatTimeAgo, getSeverityColors } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useRoute, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export default function ResultsPage() {
  const [, params] = useRoute('/recon/:jobId');
  const jobId = params?.jobId;
  const queryClient = useQueryClient();

  const { data: job, isLoading: jobLoading } = useGetJob(jobId || '', {
    query: {
      queryKey: getGetJobQueryKey(jobId || ''),
      enabled: !!jobId,
      refetchInterval: (data) => {
        // Stop polling if completed or failed
        if (data?.state?.data?.status === 'completed' || data?.state?.data?.status === 'failed') return false;
        return 2000;
      }
    }
  });

  const isCompleted = job?.status === 'completed';
  
  const { data: results, isLoading: resultsLoading } = useGetJobResults(jobId || '', {
    query: {
      queryKey: getGetJobResultsQueryKey(jobId || ''),
      enabled: !!jobId && isCompleted
    }
  });

  const deleteMutation = useDeleteJob();

  const handleDelete = () => {
    if (!jobId || !confirm('Are you sure you want to delete this analysis?')) return;
    deleteMutation.mutate(
      { jobId },
      {
        onSuccess: () => {
          toast.success('Analysis deleted');
          setLocation('/analyses');
        },
        onError: () => {
          toast.error('Failed to delete analysis');
        }
      }
    );
  };

  if (!jobId) return null;

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <Link href="/analyses" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
          <ArrowLeft className="size-4" /> Back to analyses
        </Link>
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-3">
              Analysis Results
              {job && <StatusBadge status={job.status} />}
            </h2>
            <p className="text-muted-foreground font-mono text-sm mt-1">{job?.target || 'Loading...'}</p>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            Job ID: <span className="font-mono">{jobId.substring(0, 8)}...</span>
          </div>
        </div>

        {/* Progress State */}
        {(!job || job.status === 'running' || job.status === 'queued') && (
          <div className="border border-border rounded-xl bg-card p-12 text-center flex flex-col items-center justify-center min-h-[400px]">
            <Loader2 className="size-10 text-primary animate-spin mb-6" />
            <h3 className="text-xl font-medium mb-2">{job?.status === 'queued' ? 'Queued' : 'Scanning Codebase...'}</h3>
            <p className="text-muted-foreground mb-8 max-w-md">Our engines are analyzing the target repository. This usually takes between 10-30 seconds depending on size.</p>
            
            <div className="w-full max-w-md h-2 bg-muted rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-primary"
                initial={{ width: 0 }}
                animate={{ width: `${job?.progress || 0}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
            <div className="mt-2 text-sm font-mono text-muted-foreground">{job?.progress || 0}% Complete</div>
          </div>
        )}

        {/* Failed State */}
        {job?.status === 'failed' && (
          <div className="border border-destructive/20 bg-destructive/5 rounded-xl p-8 flex items-start gap-4">
            <AlertCircle className="size-6 text-destructive shrink-0" />
            <div>
              <h3 className="text-lg font-medium text-destructive mb-2">Analysis Failed</h3>
              <p className="text-sm text-destructive/80 font-mono bg-destructive/10 p-4 rounded-md inline-block">
                {job.errorMessage || 'Unknown error occurred during analysis.'}
              </p>
            </div>
          </div>
        )}

        {/* Results State */}
        {isCompleted && results && (
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <ResultStatCard title="Total Findings" value={results.totalFindings} icon={Search} />
                <ResultStatCard title="Files Scanned" value={results.filesScanned} icon={FileCode2} />
                <ResultStatCard title="Lines of Code" value={results.linesScanned} icon={FileCode2} />
                <ResultStatCard title="Duration" value={`${(results.scanDurationMs / 1000).toFixed(1)}s`} icon={Clock} />
              </div>

              {/* Severity Breakdown */}
              <div className="border border-border rounded-xl bg-card p-6">
                <h3 className="text-sm font-medium mb-4">Severity Breakdown</h3>
                <div className="flex gap-2 h-4 rounded-full overflow-hidden mb-4">
                  {results.criticalCount > 0 && <div className="bg-red-500" style={{ width: `${(results.criticalCount / results.totalFindings) * 100}%` }} />}
                  {results.highCount > 0 && <div className="bg-orange-500" style={{ width: `${(results.highCount / results.totalFindings) * 100}%` }} />}
                  {results.mediumCount > 0 && <div className="bg-yellow-500" style={{ width: `${(results.mediumCount / results.totalFindings) * 100}%` }} />}
                  {results.lowCount > 0 && <div className="bg-blue-500" style={{ width: `${(results.lowCount / results.totalFindings) * 100}%` }} />}
                  {results.infoCount > 0 && <div className="bg-gray-500" style={{ width: `${(results.infoCount / results.totalFindings) * 100}%` }} />}
                </div>
                <div className="flex flex-wrap gap-4 text-sm font-mono">
                  <Badge count={results.criticalCount} label="Critical" color="text-red-500" />
                  <Badge count={results.highCount} label="High" color="text-orange-500" />
                  <Badge count={results.mediumCount} label="Medium" color="text-yellow-500" />
                  <Badge count={results.lowCount} label="Low" color="text-blue-500" />
                  <Badge count={results.infoCount} label="Info" color="text-gray-500" />
                </div>
              </div>

              {/* AI Summary */}
              {results.summary && (
                <div className="border border-border rounded-xl bg-card p-6">
                  <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
                    <span className="size-2 rounded-full bg-primary animate-pulse" />
                    AI Analysis Summary
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
                    {results.summary}
                  </p>
                </div>
              )}

              {/* Findings List */}
              <div>
                <h3 className="text-lg font-semibold mb-4">All Findings</h3>
                <div className="space-y-3">
                  {results.findings.map((finding, i) => (
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      key={finding.id}
                      className="border border-border rounded-lg bg-card p-5 hover:border-border/80 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex items-center gap-3">
                          <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-bold uppercase", getSeverityColors(finding.severity))}>
                            {finding.severity}
                          </span>
                          <h4 className="font-semibold">{finding.title}</h4>
                        </div>
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                          {finding.category}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mb-4">
                        {finding.description}
                      </p>
                      {finding.file && (
                        <div className="bg-muted/50 rounded p-3 font-mono text-xs text-muted-foreground border border-border/50">
                          <span className="text-foreground">{finding.file}</span>
                          {finding.line && <span className="text-primary ml-2">:{finding.line}</span>}
                        </div>
                      )}
                    </motion.div>
                  ))}
                  {results.findings.length === 0 && (
                    <div className="text-center p-12 border border-border rounded-lg bg-card text-muted-foreground">
                      <CheckCircle2 className="size-10 text-emerald-500 mx-auto mb-4" />
                      <p>No vulnerabilities found. Clean codebase!</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </DashboardLayout>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'completed': return <span className="px-2 py-1 text-xs rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-medium">Completed</span>;
    case 'failed': return <span className="px-2 py-1 text-xs rounded-full bg-red-500/10 text-red-500 border border-red-500/20 font-medium">Failed</span>;
    case 'running': return <span className="px-2 py-1 text-xs rounded-full bg-primary/10 text-primary border border-primary/20 font-medium animate-pulse">Running</span>;
    default: return <span className="px-2 py-1 text-xs rounded-full bg-muted text-muted-foreground border border-border font-medium">Queued</span>;
  }
}

function ResultStatCard({ title, value, icon: Icon }: { title: string, value: string | number, icon: any }) {
  return (
    <div className="border border-border rounded-xl bg-card p-5">
      <div className="flex justify-between items-center mb-2">
        <h4 className="text-xs font-medium text-muted-foreground">{title}</h4>
        <Icon className="size-4 text-muted-foreground/50" />
      </div>
      <div className="text-2xl font-bold font-mono">{value}</div>
    </div>
  );
}

function Badge({ count, label, color }: { count: number, label: string, color: string }) {
  if (count === 0) return null;
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("font-bold", color)}>{count}</span>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}
