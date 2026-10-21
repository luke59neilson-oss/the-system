/**
 * The System rules engine. Pure and deterministic: no I/O, no ambient clock or
 * randomness. Consumed as TypeScript source by the server, web app and tests.
 */
export const ENGINE_NAME = 'the-system-engine';

/** Engine API version; bumped when the public surface changes incompatibly. */
export const ENGINE_API_VERSION = 0;

export * from './rules';
export * from './character';
export * from './progression';
export * from './events';
export * from './projection';
export * from './content';
export * from './bonuses';
export * from './economy';
export * from './practice';
export * from './skills';
export * from './evolution';
