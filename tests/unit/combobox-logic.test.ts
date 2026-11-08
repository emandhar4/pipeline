import { describe, expect, it } from 'vitest';
import {
  comboReducer,
  comboRows,
  initialComboState,
  type ComboOption,
  type ComboState,
} from '@/app/(app)/onboarding/combobox';

const MIT: ComboOption = { id: 's1', label: 'Massachusetts Institute of Technology', detail: 'Cambridge, MA' };
const MICH: ComboOption = { id: 's2', label: 'University of Michigan', detail: 'Ann Arbor, MI' };

function withResults(allowFreeText: boolean): ComboState {
  let s = initialComboState({ text: '', id: '', allowFreeText });
  s = comboReducer(s, { type: 'type', text: 'mi', seq: 1 });
  return comboReducer(s, { type: 'results', seq: 1, options: [MIT, MICH] });
}

describe('comboReducer', () => {
  it('starts closed with the saved text and id', () => {
    const s = initialComboState({ text: 'MIT', id: 's1', allowFreeText: true });
    expect(s).toMatchObject({ text: 'MIT', id: 's1', open: false, active: -1, options: [] });
  });

  it('typing sets the text, clears a previously picked id and opens', () => {
    const picked = comboReducer(withResults(true), { type: 'pick', option: MIT });
    expect(picked.id).toBe('s1');
    const s = comboReducer(picked, { type: 'type', text: 'Massachusetts Inst', seq: 2 });
    expect(s).toMatchObject({ text: 'Massachusetts Inst', id: '', open: true, active: -1 });
  });

  it('ignores results from an older request', () => {
    let s = initialComboState({ text: '', id: '', allowFreeText: true });
    s = comboReducer(s, { type: 'type', text: 'mi', seq: 1 });
    s = comboReducer(s, { type: 'type', text: 'mic', seq: 2 });
    s = comboReducer(s, { type: 'results', seq: 2, options: [MICH] });
    const after = comboReducer(s, { type: 'results', seq: 1, options: [MIT, MICH] });
    expect(after).toBe(s);
    expect(after.options).toEqual([MICH]);
  });

  it('keeps at most 8 results', () => {
    let s = initialComboState({ text: '', id: '', allowFreeText: false });
    s = comboReducer(s, { type: 'type', text: 'un', seq: 1 });
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, label: `School ${i}` }));
    s = comboReducer(s, { type: 'results', seq: 1, options: many });
    expect(s.options).toHaveLength(8);
  });

  it('clears results when the text drops under 2 characters', () => {
    const s = comboReducer(withResults(true), { type: 'type', text: 'm', seq: 2 });
    expect(s.options).toEqual([]);
  });

  it('move steps through the rows and wraps from the free-text row to the first', () => {
    let s = withResults(true);
    expect(comboRows(s)).toHaveLength(3);
    s = comboReducer(s, { type: 'move', delta: 1 });
    expect(s.active).toBe(0);
    s = comboReducer(s, { type: 'move', delta: 1 });
    s = comboReducer(s, { type: 'move', delta: 1 });
    expect(s.active).toBe(2);
    expect(comboRows(s)[2]).toEqual({ kind: 'free', text: 'mi' });
    s = comboReducer(s, { type: 'move', delta: 1 });
    expect(s.active).toBe(0);
  });

  it('move up from nothing goes to the last row', () => {
    const s = comboReducer(withResults(true), { type: 'move', delta: -1 });
    expect(s.active).toBe(2);
  });

  it('pick sets text and id and closes', () => {
    const s = comboReducer(withResults(true), { type: 'pick', option: MICH });
    expect(s).toMatchObject({ text: 'University of Michigan', id: 's2', open: false, active: -1 });
  });

  it('picking the free-text row keeps the typed text with an empty id', () => {
    let s = comboReducer(withResults(true), { type: 'type', text: '  My College ', seq: 2 });
    s = comboReducer(s, { type: 'pick', option: null });
    expect(s).toMatchObject({ text: 'My College', id: '', open: false });
  });

  it('has no free-text row when free text is not allowed', () => {
    const s = withResults(false);
    expect(comboRows(s)).toHaveLength(2);
    expect(comboRows(s).every((r) => r.kind === 'option')).toBe(true);
    const wrapped = comboReducer(comboReducer(s, { type: 'move', delta: -1 }), { type: 'move', delta: 1 });
    expect(wrapped.active).toBe(0);
  });

  it('close keeps the typed text and id', () => {
    const s = comboReducer(withResults(true), { type: 'close' });
    expect(s).toMatchObject({ text: 'mi', id: '', open: false, active: -1 });
  });
});
