import { useEffect, useReducer } from 'react';
import type { Trace } from '../engine/types';
import { createPlayerState, DEFAULT_STEP_DURATION_MS, playerReducer } from './reducer';

/** Load a subsequent trace with dispatch({ type: 'load', trace }). */
export function usePlayer(initialTrace: Trace) {
  const [state, dispatch] = useReducer(playerReducer, initialTrace, createPlayerState);

  useEffect(() => {
    if (!state.playing) return;

    const generation = state.generation;
    const timeout = window.setTimeout(() => {
      dispatch({ type: 'tick', generation });
    }, DEFAULT_STEP_DURATION_MS / state.speed);

    return () => window.clearTimeout(timeout);
  }, [state.generation, state.playing, state.speed]);

  return { state, snapshot: state.trace.steps[state.index], dispatch };
}
