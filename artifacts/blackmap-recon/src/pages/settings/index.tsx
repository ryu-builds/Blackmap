import React, { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useGetSettings, useUpdateSettings, useListProviders } from '@workspace/api-client-react';
import { useThemeStore } from '@/stores/useThemeStore';
import { Monitor, Moon, Sun, Save, Key, Database, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function SettingsPage() {
  const { data: settings, isLoading: settingsLoading } = useGetSettings();
  const { data: providers, isLoading: providersLoading } = useListProviders();
  const updateSettings = useUpdateSettings();
  const { theme, setTheme } = useThemeStore();

  const [localSettings, setLocalSettings] = useState({
    maxFileSizeMb: settings?.maxFileSizeMb || 100,
    autoAnalyze: settings?.autoAnalyze ?? true,
    activeProvider: settings?.activeProvider || 'openai',
  });

  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});

  // Sync state when data loads
  React.useEffect(() => {
    if (settings) {
      setLocalSettings({
        maxFileSizeMb: settings.maxFileSizeMb,
        autoAnalyze: settings.autoAnalyze,
        activeProvider: settings.activeProvider || 'openai'
      });
    }
  }, [settings]);

  const handleSave = () => {
    updateSettings.mutate(
      {
        data: {
          theme,
          maxFileSizeMb: localSettings.maxFileSizeMb,
          autoAnalyze: localSettings.autoAnalyze,
          activeProvider: localSettings.activeProvider,
          // If we edited an API key, we'd send it here. Simple implementation sends the active provider's key if changed.
          ...(apiKeys[localSettings.activeProvider] && { 
            apiKey: apiKeys[localSettings.activeProvider],
            apiKeyProvider: localSettings.activeProvider 
          })
        }
      },
      {
        onSuccess: () => {
          toast.success('Settings saved successfully');
          setApiKeys({}); // clear local api key edits
        },
        onError: () => toast.error('Failed to save settings')
      }
    );
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
            <p className="text-muted-foreground">Manage your preferences and integrations.</p>
          </div>
          <button
            onClick={handleSave}
            disabled={updateSettings.isPending}
            className="bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium text-sm flex items-center gap-2 hover:bg-primary/90 disabled:opacity-50 transition-colors"
            data-testid="btn-save-settings"
          >
            {updateSettings.isPending ? <RefreshCw className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save Changes
          </button>
        </div>

        <div className="space-y-8">
          {/* Appearance */}
          <section className="space-y-4">
            <h3 className="text-lg font-semibold border-b border-border pb-2">Appearance</h3>
            <div className="grid grid-cols-3 gap-4">
              <ThemeButton active={theme === 'light'} onClick={() => setTheme('light')} icon={Sun} label="Light" />
              <ThemeButton active={theme === 'dark'} onClick={() => setTheme('dark')} icon={Moon} label="Dark" />
              <ThemeButton active={theme === 'system'} onClick={() => setTheme('system')} icon={Monitor} label="System" />
            </div>
          </section>

          {/* Engine Settings */}
          <section className="space-y-4">
            <h3 className="text-lg font-semibold border-b border-border pb-2">Engine Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">Max Upload Size (MB)</label>
                <input 
                  type="number" 
                  value={localSettings.maxFileSizeMb}
                  onChange={(e) => setLocalSettings({...localSettings, maxFileSizeMb: parseInt(e.target.value) || 100})}
                  className="w-full bg-card border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                />
              </div>
              <div className="space-y-2 flex flex-col justify-end">
                <label className="flex items-center gap-3 cursor-pointer p-2 border border-border rounded-md bg-card">
                  <input 
                    type="checkbox" 
                    checked={localSettings.autoAnalyze}
                    onChange={(e) => setLocalSettings({...localSettings, autoAnalyze: e.target.checked})}
                    className="accent-primary size-4"
                  />
                  <span className="text-sm font-medium">Auto-start analysis on upload</span>
                </label>
              </div>
            </div>
          </section>

          {/* AI Providers */}
          <section className="space-y-4">
            <h3 className="text-lg font-semibold border-b border-border pb-2 flex items-center gap-2">
              <Database className="size-5" /> AI Providers
            </h3>
            <p className="text-sm text-muted-foreground">Select and configure the LLM provider used for vulnerability summarization.</p>
            
            {providersLoading ? (
              <div className="text-muted-foreground text-sm">Loading providers...</div>
            ) : (
              <div className="space-y-4">
                {providers?.map((provider) => (
                  <div 
                    key={provider.id} 
                    className={cn(
                      "p-5 rounded-lg border transition-colors",
                      localSettings.activeProvider === provider.id 
                        ? "border-primary bg-primary/5" 
                        : "border-border bg-card"
                    )}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <input 
                          type="radio" 
                          name="provider" 
                          value={provider.id}
                          checked={localSettings.activeProvider === provider.id}
                          onChange={() => setLocalSettings({...localSettings, activeProvider: provider.id})}
                          className="accent-primary size-4"
                        />
                        <div>
                          <h4 className="font-semibold">{provider.name}</h4>
                          <p className="text-xs text-muted-foreground">{provider.description}</p>
                        </div>
                      </div>
                      <span className={cn(
                        "text-xs px-2 py-1 rounded-full font-medium",
                        provider.status === 'configured' ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"
                      )}>
                        {provider.status}
                      </span>
                    </div>

                    {provider.requiresApiKey && localSettings.activeProvider === provider.id && (
                      <div className="mt-4 pt-4 border-t border-border/50">
                        <label className="text-sm font-medium flex items-center gap-2 mb-2">
                          <Key className="size-4 text-muted-foreground" /> API Key
                        </label>
                        <input 
                          type="password" 
                          placeholder={provider.status === 'configured' ? "•••••••••••••••••••• (Configured)" : "Enter API Key"}
                          value={apiKeys[provider.id] || ''}
                          onChange={(e) => setApiKeys({...apiKeys, [provider.id]: e.target.value})}
                          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}

function ThemeButton({ active, onClick, icon: Icon, label }: { active: boolean, onClick: () => void, icon: any, label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "p-4 rounded-xl border flex flex-col items-center justify-center gap-3 transition-colors",
        active ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:border-border/80 hover:bg-muted"
      )}
    >
      <Icon className="size-6" />
      <span className="font-medium text-sm">{label}</span>
    </button>
  );
}
