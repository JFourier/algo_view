import { describe, expect, it } from 'vitest';
import type { Snapshot, Trace } from '../engine/types';
import { createPlayerState, PLAYBACK_SPEEDS, playerReducer } from './reducer';
import type { PlayerAction, PlayerState } from './reducer';

function makeTrace(algorithmId = 'test-algorithm', values = [3, 1]): Trace {
  const items = values.map((value, index) => ({ id: `item-${index}`, value }));
  const initial: Snapshot = {
    statementId: null,
    kind: 'initial',
    explanation: '准备执行',
    items,
    variables: [],
    markers: {},
  };
  return {
    algorithmId,
    input: { values },
    steps: [
      initial,
      {
        ...initial,
        statementId: 'compare',
        kind: 'compare',
        explanation: '比较两个值',
        condition: { expression: 'left > right', result: true },
        variables: [{ name: 'index', value: 0 }],
        markers: { active: [0, 1] },
      },
      {
        ...initial,
        statementId: 'swap',
        kind: 'swap',
        explanation: '交换两个值',
        items: [...items].reverse(),
        variables: [{ name: 'index', value: 0 }],
        markers: { active: [0, 1] },
      },
      {
        ...initial,
        statementId: 'return',
        kind: 'complete',
        explanation: '执行结束',
        items: [...items].reverse(),
        markers: { sorted: [0, 1] },
      },
    ],
    result: { kind: 'sorted', message: '执行结束' },
  };
}

function tick(state: PlayerState): PlayerState {
  return playerReducer(state, { type: 'tick', generation: state.generation });
}

describe('播放器的公开回放行为', () => {
  it('初始时尚未执行语句，前进与后退都不会越界', () => {
    const trace = makeTrace();
    let state = createPlayerState(trace);
    expect(state.index).toBe(0);
    expect(state.playing).toBe(false);
    expect(state.trace.steps[state.index].statementId).toBeNull();

    state = playerReducer(state, { type: 'previous' });
    expect(state.index).toBe(0);
    for (let index = 0; index < trace.steps.length + 2; index += 1) {
      state = playerReducer(state, { type: 'next' });
    }
    expect(state.index).toBe(trace.steps.length - 1);
    expect(playerReducer(state, { type: 'play' }).playing).toBe(false);

    for (let index = 0; index < trace.steps.length + 2; index += 1) {
      state = playerReducer(state, { type: 'previous' });
    }
    expect(state.index).toBe(0);
  });

  it('顺序前进、回退后前进和跳转会恢复完全相同的快照', () => {
    const trace = makeTrace();
    const originalTrace = JSON.stringify(trace);
    let sequential = createPlayerState(trace);
    sequential = playerReducer(sequential, { type: 'next' });
    sequential = playerReducer(sequential, { type: 'next' });
    const replayed = playerReducer(playerReducer(sequential, { type: 'previous' }), { type: 'next' });
    const jumped = playerReducer(createPlayerState(trace), { type: 'seek', index: 2 });

    for (const state of [sequential, replayed, jumped]) {
      expect(state.trace.steps[state.index]).toBe(trace.steps[2]);
    }
    expect(JSON.stringify(trace)).toBe(originalTrace);
  });

  it.each(PLAYBACK_SPEEDS)('%sx 播放按照原始步骤顺序到达终点并自动暂停', (speed) => {
    const trace = makeTrace();
    let state = playerReducer(createPlayerState(trace), { type: 'speed', speed });
    state = playerReducer(state, { type: 'play' });
    const seen = [state.trace.steps[state.index]];
    while (state.playing) {
      state = tick(state);
      seen.push(state.trace.steps[state.index]);
    }

    expect(seen).toEqual(trace.steps);
    expect(state.index).toBe(trace.steps.length - 1);
    expect(tick(state)).toBe(state);
    expect(playerReducer(state, { type: 'play' })).toBe(state);
  });

  it('暂停后旧回调不能推进，恢复播放后仍然不能使用旧回调', () => {
    let state = playerReducer(createPlayerState(makeTrace()), { type: 'play' });
    const staleTick: PlayerAction = { type: 'tick', generation: state.generation };
    state = playerReducer(state, { type: 'pause' });
    expect(playerReducer(state, staleTick)).toBe(state);
    state = playerReducer(state, { type: 'play' });
    expect(playerReducer(state, staleTick)).toBe(state);
    expect(tick(state).index).toBe(1);
  });

  it.each([
    { action: { type: 'next' } as const, expectedIndex: 2 },
    { action: { type: 'previous' } as const, expectedIndex: 0 },
    { action: { type: 'seek', index: 2 } as const, expectedIndex: 2 },
    { action: { type: 'reset' } as const, expectedIndex: 0 },
  ])('$action.type 会停止播放并让旧回调失效', ({ action, expectedIndex }) => {
    let state = playerReducer(createPlayerState(makeTrace()), { type: 'seek', index: 1 });
    state = playerReducer(state, { type: 'play' });
    const staleTick: PlayerAction = { type: 'tick', generation: state.generation };
    state = playerReducer(state, action);

    expect(state.index).toBe(expectedIndex);
    expect(state.playing).toBe(false);
    expect(playerReducer(state, staleTick)).toBe(state);
    state = playerReducer(state, { type: 'play' });
    expect(playerReducer(state, staleTick)).toBe(state);
  });

  it('播放中调速保持当前步骤和播放状态，但旧速度的回调不能推进', () => {
    let state = playerReducer(createPlayerState(makeTrace()), { type: 'play' });
    const staleTick: PlayerAction = { type: 'tick', generation: state.generation };
    state = playerReducer(state, { type: 'speed', speed: 4 });

    expect(state.index).toBe(0);
    expect(state.playing).toBe(true);
    expect(state.speed).toBe(4);
    expect(playerReducer(state, staleTick)).toBe(state);
    expect(tick(state).index).toBe(1);
  });

  it('同一个回调重复抵达不能推进两次', () => {
    let state = playerReducer(createPlayerState(makeTrace()), { type: 'play' });
    const callback: PlayerAction = { type: 'tick', generation: state.generation };
    state = playerReducer(state, callback);
    expect(state.index).toBe(1);
    expect(playerReducer(state, callback)).toBe(state);
  });

  it('加载另一条轨迹会回到新输入的初始状态，并隔离旧播放任务', () => {
    let state = playerReducer(createPlayerState(makeTrace()), { type: 'speed', speed: 2 });
    state = playerReducer(state, { type: 'play' });
    const staleTick: PlayerAction = { type: 'tick', generation: state.generation };
    const trace = makeTrace('another-algorithm', [8, 2]);
    state = playerReducer(state, { type: 'load', trace });

    expect(state.trace).toBe(trace);
    expect(state.index).toBe(0);
    expect(state.playing).toBe(false);
    expect(state.speed).toBe(2);
    state = playerReducer(state, { type: 'play' });
    expect(playerReducer(state, staleTick)).toBe(state);
    state = tick(state);
    state = playerReducer(state, { type: 'reset' });
    expect(state.trace.steps[state.index]).toBe(trace.steps[0]);
    expect(state.trace.input).toEqual({ values: [8, 2] });
  });

  it('重新加载同一条轨迹也会使旧回调失效', () => {
    const trace = makeTrace();
    let state = playerReducer(createPlayerState(trace), { type: 'play' });
    const staleTick: PlayerAction = { type: 'tick', generation: state.generation };
    state = playerReducer(state, { type: 'load', trace });
    state = playerReducer(state, { type: 'play' });
    expect(playerReducer(state, staleTick)).toBe(state);
    expect(tick(state).index).toBe(1);
  });

  it('跳转会限制范围并保持合法整数索引', () => {
    const state = createPlayerState(makeTrace());
    expect(playerReducer(state, { type: 'seek', index: -10 }).index).toBe(0);
    expect(playerReducer(state, { type: 'seek', index: 100 }).index).toBe(3);
    expect(playerReducer(state, { type: 'seek', index: 1.9 }).index).toBe(1);
    expect(playerReducer(state, { type: 'seek', index: NaN }).index).toBe(0);
  });

  it('只有初始快照时不能向后播放，缺少初始快照则明确拒绝', () => {
    const trace = makeTrace();
    const state = createPlayerState({ ...trace, steps: [trace.steps[0]] });
    expect(playerReducer(state, { type: 'play' }).playing).toBe(false);
    expect(playerReducer(state, { type: 'next' }).index).toBe(0);
    expect(() => createPlayerState({ ...trace, steps: [] })).toThrow('初始状态');
  });
});
