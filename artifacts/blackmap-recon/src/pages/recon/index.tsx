import React, { useState, useRef } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useStartAnalysis, AnalysisInputType } from '@workspace/api-client-react';
import { Github, UploadCloud, Archive, Play, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocation } from 'wouter';
import { toast } from 'sonner';

export default function ReconPage() {
  const [activeTab, setActiveTab] = useState<'github' | 'upload'>('github');
  const [githubUrl, setGithubUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [, setLocation] = useLocation();

  const startMutation = useStartAnalysis();

  const [isUploading, setIsUploading] = useState(false);

  const handleStart = async () => {
    if (activeTab === 'github' && !githubUrl) {
      toast.error('Please enter a GitHub URL');
      return;
    }
    if (activeTab === 'upload' && !file) {
      toast.error('Please upload a ZIP file');
      return;
    }

    // GitHub URL — use existing JSON mutation
    if (activeTab === 'github') {
      startMutation.mutate(
        {
          data: {
            type: AnalysisInputType.github_url,
            githubUrl,
            description: `GitHub analysis: ${githubUrl}`,
          },
        },
        {
          onSuccess: (job) => {
            toast.success('Analysis started');
            setLocation(`/recon/${job.id}`);
          },
          onError: (err) => {
            toast.error(`Failed to start analysis: ${err.message || 'Unknown error'}`);
          },
        }
      );
      return;
    }

    // ZIP upload — send actual file bytes as multipart/form-data
    if (activeTab === 'upload' && file) {
      setIsUploading(true);
      try {
        const form = new FormData();
        form.append('file', file);
        form.append('description', `ZIP analysis: ${file.name}`);

        const base = import.meta.env.BASE_URL ?? '/';
        const url = `${base}api/recon/upload`.replace(/\/+/g, '/').replace(/^\//, '/');

        const res = await fetch(url, { method: 'POST', body: form });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: res.statusText }));
          throw new Error(err.message ?? `Upload failed (${res.status})`);
        }
        const job = await res.json();
        toast.success('Analysis started');
        setLocation(`/recon/${job.id}`);
      } catch (err: any) {
        toast.error(`Upload failed: ${err.message || 'Unknown error'}`);
      } finally {
        setIsUploading(false);
      }
    }
  };

  const isPending = startMutation.isPending || isUploading;

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h2 className="text-2xl font-bold tracking-tight mb-2">New Reconnaissance</h2>
          <p className="text-muted-foreground">Select a target to initiate static analysis and vulnerability scanning.</p>
        </div>

        <div className="border border-border rounded-xl bg-card overflow-hidden">
          <div className="flex border-b border-border">
            <button
              className={cn(
                "flex-1 py-4 text-sm font-medium flex items-center justify-center gap-2 transition-colors",
                activeTab === 'github' ? "bg-card border-b-2 border-primary text-foreground" : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
              )}
              onClick={() => setActiveTab('github')}
              data-testid="tab-github"
            >
              <Github className="size-4" /> GitHub Repository
            </button>
            <button
              className={cn(
                "flex-1 py-4 text-sm font-medium flex items-center justify-center gap-2 transition-colors",
                activeTab === 'upload' ? "bg-card border-b-2 border-primary text-foreground" : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
              )}
              onClick={() => setActiveTab('upload')}
              data-testid="tab-upload"
            >
              <UploadCloud className="size-4" /> ZIP Upload
            </button>
          </div>

          <div className="p-8">
            {activeTab === 'github' ? (
              <div className="space-y-4">
                <label className="text-sm font-medium text-foreground">Repository URL</label>
                <input 
                  type="text" 
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  placeholder="https://github.com/organization/repo"
                  className="w-full bg-muted/50 border border-border rounded-md px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono"
                  data-testid="input-github-url"
                />
                <p className="text-xs text-muted-foreground">Public repositories only in this demo.</p>
              </div>
            ) : (
              <FileDropzone file={file} setFile={setFile} />
            )}
          </div>
          
          <div className="p-6 bg-muted/20 border-t border-border flex justify-end">
            <button
              onClick={handleStart}
              disabled={isPending}
              className="bg-primary text-primary-foreground px-6 py-2.5 rounded-md font-medium text-sm flex items-center gap-2 hover:bg-primary/90 disabled:opacity-50 transition-colors"
              data-testid="btn-start-analysis"
            >
              {isPending ? (
                <><Loader2 className="size-4 animate-spin" /> Starting...</>
              ) : (
                <><Play className="size-4" /> Analyze Target</>
              )}
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function FileDropzone({ file, setFile }: { file: File | null, setFile: (file: File | null) => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const dropped = e.dataTransfer.files[0];
      if (dropped.name.endsWith('.zip')) {
        setFile(dropped);
      } else {
        toast.error("Only .zip files are supported.");
      }
    }
  };

  return (
    <div 
      className={cn(
        "border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer",
        isDragging ? "border-primary bg-primary/5" : "border-border hover:border-border/80 hover:bg-muted/30",
        file ? "border-emerald-500/50 bg-emerald-500/5" : ""
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      data-testid="dropzone-zip"
    >
      <input 
        type="file" 
        accept=".zip" 
        className="hidden" 
        ref={inputRef} 
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            setFile(e.target.files[0]);
          }
        }} 
      />
      
      {file ? (
        <div className="flex flex-col items-center">
          <Archive className="size-12 text-emerald-500 mb-4" />
          <div className="font-mono text-sm font-medium">{file.name}</div>
          <div className="text-xs text-muted-foreground mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
          <button 
            className="mt-4 text-xs text-destructive hover:underline"
            onClick={(e) => { e.stopPropagation(); setFile(null); }}
          >
            Remove file
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <UploadCloud className="size-12 text-muted-foreground/50 mb-4" />
          <div className="text-sm font-medium mb-1">Click to upload or drag and drop</div>
          <div className="text-xs text-muted-foreground">ZIP archives only (max 100MB)</div>
        </div>
      )}
    </div>
  );
}
