import { Panel } from '../components/panel.tsx';
import { JsonInspector, type JsonInspectorCopy } from '../components/ui/json-inspector.tsx';
import { m } from '../paraglide/messages.js';

const copy: JsonInspectorCopy = {
  searchPlaceholder: m.json_search_placeholder(),
  search: (label) => m.json_search({ label }),
  previousMatch: m.json_prev(),
  nextMatch: m.json_next(),
  matches: (count) => m.json_matches({ count }),
  noMatches: m.json_no_matches(),
  collapseAll: m.json_collapse_all(),
  expandAll: m.json_expand_all(),
  showAll: m.json_show_all(),
  onlyChanges: m.json_only_changes(),
  changed: (count) => m.json_changed({ count }),
  added: (count) => m.json_added({ count }),
  removed: (count) => m.json_removed({ count }),
  noChanges: m.json_no_changes(),
  showMore: (shown, left) => m.json_show_more({ shown, left }),
  unchanged: (count) => m.json_unchanged({ count }),
  items: (count) => m.json_items({ count }),
  keys: (count) => m.json_keys({ count }),
  rowRemoved: m.json_row_removed(),
  rowAdded: m.json_row_added(),
  rowWas: (before) => m.json_row_was({ before }),
  copyPath: m.json_copy_path(),
  copyValue: m.json_copy_value(),
  copied: m.json_copied(),
  copyFailed: m.json_copy_failed(),
  copiedPath: (path) => m.json_copied_path({ path }),
  copiedValue: m.json_copied_value(),
  notValid: (message, line, column) => m.json_not_valid({ message, line, column }),
};

/** The inspector scrolls inside this height, in root rems so it scales with the desk like every other size. */
const HEIGHT_REM = 22;
const rootPx = () => Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

/** What Salva would write, as a diff against the saved value; the switch is a plain line, it is not part of the config. */
export function ChangesPanel({
  draft,
  saved,
  enabledChange,
}: {
  draft: unknown;
  saved: unknown;
  /** `true` or `false` when the switch was flipped, `null` when it was not. */
  enabledChange: boolean | null;
}) {
  const valueChanged = JSON.stringify(draft) !== JSON.stringify(saved);
  return (
    <Panel title={m.settings_changes()}>
      <p className="text-label text-muted-foreground">{m.settings_changes_summary()}</p>
      {enabledChange !== null && (
        <p className="text-label">{enabledChange ? m.settings_changes_enable_on() : m.settings_changes_enable_off()}</p>
      )}
      {valueChanged && (
        <JsonInspector
          label={m.settings_changes_label()}
          data={draft ?? {}}
          compare={saved ?? {}}
          maxHeight={HEIGHT_REM * rootPx()}
          copy={copy}
        />
      )}
    </Panel>
  );
}
