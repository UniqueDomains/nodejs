/*----------------------------------
- @uniquedomains/cli
----------------------------------*/

/** The CLI as a library: `run(argv, io)` and the command table, for tests and for tools that embed `ud`. */

export { CLI_VERSION, run } from './run';
export type { Io } from './run';
export { COMMANDS, findCommand, GLOBAL_FLAGS, kebab, SHORTCUTS } from './commands';
export type { Command, FlagSpec, GlobalFlag, Shortcut } from './commands';
export { renderData } from './render';
export type { RenderOptions } from './render';
