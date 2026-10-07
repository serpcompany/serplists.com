import { expect } from 'vitest';

export const objectContaining = (expected: object): unknown => expect.objectContaining(expected);

export const arrayContaining = (expected: readonly unknown[]): unknown => expect.arrayContaining([...expected]);

export const stringContaining = (expected: string): unknown => expect.stringContaining(expected);

export const stringMatching = (expected: string | RegExp): unknown => expect.stringMatching(expected);

export const anyInstanceOf = (type: unknown): unknown => expect.any(type);

export const anything = (): unknown => expect.anything();
