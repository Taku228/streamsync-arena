import { create } from 'zustand';
import type { DashboardState, OverlayEvent } from '@streamsync/shared';
import { defaultEffectRules, defaultSettings } from '@streamsync/shared';

const initialState: DashboardState = {
  participants: [],
  activeParticipants: [],
  recentMessages: [],
  voteSession: null,
  settings: defaultSettings,
  effectRules: defaultEffectRules,
  matchCounter: 0,
  platformErrors: []
};

export const useDashboardStore = create<{
  state: DashboardState;
  lastOverlayEvent: OverlayEvent | null;
  connectionState: 'connected' | 'disconnected';
  setState: (state: DashboardState) => void;
  setOverlayEvent: (event: OverlayEvent | null) => void;
  setConnectionState: (state: 'connected' | 'disconnected') => void;
}>((set) => ({
  state: initialState,
  lastOverlayEvent: null,
  connectionState: 'disconnected',
  setState: (state) => set({ state }),
  setOverlayEvent: (event) => set({ lastOverlayEvent: event }),
  setConnectionState: (state) => set({ connectionState: state })
}));
