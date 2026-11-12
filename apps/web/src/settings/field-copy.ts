import { m } from '../paraglide/messages.js';

export const tagCopy = {
  limit: m.settings_tags_limit(),
  create: (text: string) => m.settings_tags_create({ text }),
  alreadyHere: (name: string) => m.settings_tags_already({ name }),
  manyAlreadyHere: (count: number) => m.settings_tags_many_already({ count }),
  isLabelled: (value: string, label: string) => m.settings_tags_labelled({ value, label }),
  added: (name: string) => m.settings_tags_added({ name }),
  addedMany: (count: number) => m.settings_tags_added_many({ count }),
  invalid: (count: number) => m.settings_tags_invalid({ count }),
  duplicates: (count: number) => m.settings_tags_duplicates({ count }),
  removed: (name: string) => m.settings_tags_removed({ name }),
  editing: (value: string) => m.settings_tags_editing({ value }),
  cleared: m.settings_tags_cleared(),
  remove: (name: string) => m.settings_tags_remove({ name }),
  lookingUp: m.settings_tags_lookup(),
  suggestions: (label: string) => m.settings_tags_suggestions({ label }),
  keys: m.settings_tags_keys(),
};
export const multiCopy = {
  filter: m.settings_multi_filter(),
  selectAll: m.settings_multi_all(),
  selectNone: m.settings_multi_none(),
  none: m.settings_multi_nothing(),
};
