import type { Trace } from '../engine/types';

export const PLAYBACK_SPEEDS = [0.5, 1, 2, 4] as const;
export const DEFAULT_STEP_DURATION_MS = 900;

export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

export interface PlayerState {
  readonly trace: Trace;
  readonly index: number;
  readonly playing: boolean;
  readonly speed: PlaybackSpeed;
  /** Identifies the only scheduled playback callback allowed to advance. */
  readonly generation: number;
}

export type PlayerAction =
  | { readonly type: 'load'; readonly trace: Trace }
  | { readonly type: 'next' }
  | { readonly type: 'previous' }
  | { readonly type: 'play' }
  | { readonly type: 'pause' }
  | { readonly type: 'reset' }
  | { readonly type: 'seek'; readonly index: number }
  | { readonly type: 'speed'; readonly speed: PlaybackSpeed }
  | { readonly type: 'tick'; readonly generation: number };

export function createPlayerState(trace: Trace): PlayerState {
  if (trace.steps.length === 0) {
    throw new Error('执行记录必须包含初始状态。');
  }

  return { trace, index: 0, playing: false, speed: 1, generation: 0 };
}

export function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  const lastIndex = state.trace.steps.length - 1;
  const nextGeneration = state.generation + 1;

  switch (action.type) {
    case 'load':
      return {
        ...createPlayerState(action.trace),
        speed: state.speed,
        generation: nextGeneration,
      };
    case 'next':
      return {
        ...state,
        index: Math.min(state.index + 1, lastIndex),
        playing: false,
        generation: nextGeneration,
      };
    case 'previous':
      return {
        ...state,
        index: Math.max(state.index - 1, 0),
        playing: false,
        generation: nextGeneration,
      };
    case 'play':
      if (state.playing || state.index === lastIndex) return state;
      return { ...state, playing: true, generation: nextGeneration };
    case 'pause':
      return { ...state, playing: false, generation: nextGeneration };
    case 'reset':
      return { ...state, index: 0, playing: false, generation: nextGeneration };
    case 'seek':
      return {
        ...state,
        index: Number.isFinite(action.index)
          ? Math.min(Math.max(Math.trunc(action.index), 0), lastIndex)
          : state.index,
        playing: false,
        generation: nextGeneration,
      };
    case 'speed':
      if (!PLAYBACK_SPEEDS.includes(action.speed)) return state;
      return { ...state, speed: action.speed, generation: nextGeneration };
    case 'tick': {
      if (!state.playing || action.generation !== state.generation) return state;
      const index = Math.min(state.index + 1, lastIndex);
      return { ...state, index, playing: index < lastIndex, generation: nextGeneration };
    }
  }
}
