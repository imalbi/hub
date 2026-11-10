export function summarizeMail(accounts: readonly { unread: number | null; capped: boolean }[]) {
  return {
    count: accounts.some((account) => account.unread === null)
      ? null
      : accounts.reduce((sum, account) => sum + (account.unread ?? 0), 0),
    capped: accounts.some((account) => account.capped),
  };
}
