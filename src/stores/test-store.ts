import { create } from 'zustand'
import type {
  TestConfig,
  TestResult,
  ProgressData,
  AppView,
  TestStatus,
  SecondMetrics,
} from '@/types'

interface TestStore {
  view: AppView
  setView: (view: AppView) => void

  config: TestConfig
  updateConfig: (partial: Partial<TestConfig>) => void

  status: TestStatus
  setStatus: (status: TestStatus) => void

  progress: ProgressData | null
  timeline: SecondMetrics[]
  setProgress: (data: ProgressData) => void
  clearProgress: () => void

  currentResult: TestResult | null
  setCurrentResult: (result: TestResult | null) => void

  history: TestResult[]
  setHistory: (history: TestResult[]) => void
  addToHistory: (result: TestResult) => void
  removeFromHistory: (id: string) => void

  error: string | null
  setError: (error: string | null) => void
}

export const useTestStore = create<TestStore>((set) => ({
  view: 'test',
  setView: (view) => set({ view }),

  config: {
    url: '',
    virtualUsers: 100,
    duration: 30,
    method: 'GET',
  },
  updateConfig: (partial) =>
    set((state) => ({ config: { ...state.config, ...partial } })),

  status: 'idle',
  setStatus: (status) => set({ status }),

  progress: null,
  timeline: [],
  setProgress: (data) =>
    set((state) => ({
      progress: data,
      timeline: [...state.timeline, data.metrics],
    })),
  clearProgress: () => set({ progress: null, timeline: [] }),

  currentResult: null,
  setCurrentResult: (result) => set({ currentResult: result }),

  history: [],
  setHistory: (history) => set({ history }),
  addToHistory: (result) =>
    set((state) => ({ history: [result, ...state.history] })),
  removeFromHistory: (id) =>
    set((state) => ({
      history: state.history.filter((h) => h.id !== id),
    })),

  error: null,
  setError: (error) => set({ error }),
}))
