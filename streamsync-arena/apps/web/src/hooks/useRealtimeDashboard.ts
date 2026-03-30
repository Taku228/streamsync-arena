import { useEffect } from 'react';
import { socket } from '../lib/socket';
import { useDashboardStore } from '../store/useDashboardStore';
import type { DashboardState, OverlayEvent } from '@streamsync/shared';

export function useRealtimeDashboard() {
  const setState = useDashboardStore((s) => s.setState);
  const setOverlayEvent = useDashboardStore((s) => s.setOverlayEvent);

  useEffect(() => {
    const onState = (payload: DashboardState) => setState(payload);
    const onOverlay = (event: OverlayEvent) => {
      setOverlayEvent(event);
      setTimeout(() => setOverlayEvent(null), 2500);
    };

    socket.on('dashboard:state', onState);
    socket.on('overlay:event', onOverlay);
    return () => {
      socket.off('dashboard:state', onState);
      socket.off('overlay:event', onOverlay);
    };
  }, [setState, setOverlayEvent]);
}
