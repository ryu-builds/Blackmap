import { create } from 'zustand';
import { AnalysisResult } from '@workspace/api-client-react';

interface ReconState {
  recentResults: Record<string, AnalysisResult>;
  addResult: (id: string, result: AnalysisResult) => void;
}

export const useReconStore = create<ReconState>()((set) => ({
  recentResults: {},
  addResult: (id, result) => set((state) => ({
    recentResults: { ...state.recentResults, [id]: result }
  })),
}));
