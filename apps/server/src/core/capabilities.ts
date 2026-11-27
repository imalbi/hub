export type MailAccount = { label: string; account: string };

export type MailAddress = { name: string | null; email: string | null };

export type MailMessage = {
  id: string;
  messageId: string | null;
  subject: string;
  from: MailAddress | null;
  date: string | null;
  seen: boolean;
  flagged: boolean;
  hasAttachment: boolean | null;
};

export type MailThreadEntry = {
  mailbox: 'inbox' | 'sent';
  folder?: string;
  id: string;
  messageId: string | null;
  inReplyTo: readonly string[];
  subject: string;
  date: string | null;
  counterpart: string | null;
};

export type MailThreadView = {
  /** The seed the thread was asked for. */
  messageId: string;
  key: string;
  /** The last message is the owner's: the other side has not answered yet. */
  waiting: boolean;
  messages: MailThreadEntry[];
};

export type MailThreadAnswer = {
  account: string;
  messageId: string;
  thread: MailThreadView | null;
  status: 'ok' | 'account' | 'missing' | 'timeout';
  resolvedMessageId?: string;
};

export type NewMailEvent = { account: string; messageIds: readonly string[] };

export interface MailCapability {
  onNewMail(listener: (event: NewMailEvent) => void): () => void;
  accounts(): readonly MailAccount[];
  listThreadEntries(account: string, after: string): Promise<{ entries: MailThreadEntry[]; truncated: boolean }>;
  readMessageText(account: string, mailbox: string, id: string): Promise<string | null>;
  threadOf(entries: readonly MailThreadEntry[], messageId: string): MailThreadView | null;
}

/** Extend this interface with the shared contracts that modules actually consume. */
export interface CapabilityMap {
  [name: string]: unknown;
  mail: MailCapability;
}

export type CapabilityRegistry<Contracts extends object = CapabilityMap> = {
  register: <K extends keyof Contracts & string>(name: K, value: Contracts[K]) => void;
  get: <K extends keyof Contracts & string>(name: K) => Contracts[K] | undefined;
  has: (name: string) => boolean;
  list: () => string[];
};

/** A child stages registrations until its module has successfully initialized. */
export function createCapabilityRegistry<Contracts extends object = CapabilityMap>(
  parent?: CapabilityRegistry<Contracts>,
): CapabilityRegistry<Contracts> {
  const values = new Map<string, unknown>();
  return {
    register(name, value) {
      if (values.has(name) || parent?.has(name)) throw new Error(`Duplicate capability: ${name}`);
      values.set(name, value);
    },
    get(name) {
      // Only register writes to this map, preserving the contract associated with each key.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Map erases the key/value correlation. // guard-private: allow Lint rule name, not a token
      return values.has(name) ? (values.get(name) as Contracts[typeof name]) : parent?.get(name);
    },
    has: (name) => values.has(name) || (parent?.has(name) ?? false),
    list: () => [...new Set([...(parent?.list() ?? []), ...values.keys()])],
  };
}
