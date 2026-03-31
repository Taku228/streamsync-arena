import { useEffect } from 'react';
import { socket } from '../lib/socket';
import { useDashboardStore } from '../store/useDashboardStore';
import type { DashboardState, OverlayEvent } from '@streamsync/shared';

export function useRealtimeDashboard() {
  const setState = useDashboardStore((s) => s.setState);
  const setOverlayEvent = useDashboardStore((s) => s.setOverlayEvent);
  const setConnectionState = useDashboardStore((s) => s.setConnectionState);

  useEffect(() => {
    const onState = (payload: DashboardState) => setState(payload);
    const onOverlay = (event: OverlayEvent) => {
      setOverlayEvent(event);
      setTimeout(() => setOverlayEvent(null), 2500);
    };
    const onConnect = () => setConnectionState('connected');
    const onDisconnect = () => setConnectionState('disconnected');

    socket.on('dashboard:state', onState);
    socket.on('overlay:event', onOverlay);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    setConnectionState(socket.connected ? 'connected' : 'disconnected');
    return () => {
      socket.off('dashboard:state', onState);
      socket.off('overlay:event', onOverlay);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [setState, setOverlayEvent, setConnectionState]);
}
