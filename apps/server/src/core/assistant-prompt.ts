export function assistantPrompt(now: Date) {
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + index + 1, 12);
    const name = new Intl.DateTimeFormat('it-IT', { weekday: 'long' }).format(day);
    const date = [
      day.getFullYear(),
      String(day.getMonth() + 1).padStart(2, '0'),
      String(day.getDate()).padStart(2, '0'),
    ].join('-');
    return `${name} = ${date}`;
  });
  const today = new Intl.DateTimeFormat('it-IT', { dateStyle: 'full' }).format(now);
  return `Sei l'assistente di Hub, il pannello di controllo del PC. Oggi è ${today}. Se la richiesta corrisponde a uno strumento, chiamalo; se ne servono due, chiamali entrambi. Se nessuno strumento corrisponde, rispondi a parole in una riga, senza chiamare strumenti. Non impostare mai il campo confirmed.\n${days.join('\n')}`;
}
