/** One message of a listing, from the inbox or the sent mailbox. `sent` is the owner's side of a conversation. */
export type ThreadEntry = {
  mailbox: 'inbox' | 'sent';
  id: string;
  messageId: string | null;
  inReplyTo: readonly string[];
  subject: string;
  date: string | null;
};

export type ThreadView = {
  /** The seed the thread was asked for. */
  messageId: string;
  /** The last message is the owner's: the other side has not answered yet. */
  waiting: boolean;
  messages: ThreadEntry[];
};

/** Union-find over Message-IDs: a reply joins its parent, so one connected set is one thread. */
function createGroups() {
  const parent = new Map<string, string>();
  const add = (id: string) => {
    if (!parent.has(id)) parent.set(id, id);
  };
  const find = (id: string): string => {
    const up = parent.get(id);
    if (up === undefined || up === id) return id;
    const root = find(up);
    parent.set(id, root);
    return root;
  };
  const join = (a: string, b: string) => {
    add(a);
    add(b);
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootA, rootB);
  };
  return { find, join };
}

const byDate = (a: ThreadEntry, b: ThreadEntry) => {
  const left = a.date ?? '';
  const right = b.date ?? '';
  return left < right ? -1 : left > right ? 1 : 0;
};

/**
 * The thread that holds `messageId`, from the inbox and sent listings of one account. Messages without a Message-ID
 * cannot be linked and are left out. Returns null when no listed message carries that id.
 */
export function threadOf(entries: readonly ThreadEntry[], messageId: string): ThreadView | null {
  if (!entries.some((entry) => entry.messageId === messageId)) return null;
  const groups = createGroups();
  for (const entry of entries) {
    if (entry.messageId === null) continue;
    for (const parentId of entry.inReplyTo) groups.join(entry.messageId, parentId);
  }

  const root = groups.find(messageId);
  const messages = entries
    .filter((entry) => entry.messageId !== null && groups.find(entry.messageId) === root)
    .toSorted(byDate);
  const last = messages.at(-1);
  return { messageId, waiting: last?.mailbox === 'sent', messages };
}
