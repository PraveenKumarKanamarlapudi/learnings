import { extractVariables, fillVariables } from './variables';

const sample = 'You are an expert {{ROLE}} specializing in {{ TECHNOLOGY }}. Analyze: {{SOURCE_CODE}} again {{ROLE}}';

describe('variables', () => {
  it('extracts unique names in order, tolerating inner spaces', () => {
    expect(extractVariables(sample)).toEqual(['ROLE', 'TECHNOLOGY', 'SOURCE_CODE']);
  });
  it('ignores single braces and invalid names', () => {
    expect(extractVariables('{x} {{1bad}} {{}} {{ok}}')).toEqual(['ok']);
  });
  it('fills provided values and leaves empty ones untouched', () => {
    expect(fillVariables(sample, { ROLE: 'DSP engineer', TECHNOLOGY: '' })).toBe(
      'You are an expert DSP engineer specializing in {{ TECHNOLOGY }}. Analyze: {{SOURCE_CODE}} again DSP engineer',
    );
  });
});
