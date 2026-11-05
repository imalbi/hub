// Drizzle for a module's own tables. A private module cannot resolve `drizzle-orm` from its folder (it is not a
// workspace package), the same reason `z` comes from `module.ts`: import the table builders and operators from here.
export * from 'drizzle-orm';
export * from 'drizzle-orm/sqlite-core';
// Both packages export these four types; the SQLite ones are the ones a module's tables use.
export type { SelectedFields, SelectedFieldsFlat, SelectedFieldsOrdered, TableConfig } from 'drizzle-orm/sqlite-core';
