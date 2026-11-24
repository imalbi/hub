/** Extend this interface with the shared contracts that modules actually consume. */
export interface CapabilityMap {
  [name: string]: unknown;
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
