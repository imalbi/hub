type Expected = {
  paths: string[];
  args?: Record<string, string | number | boolean | { contains: string } | { starts: string }>;
  without?: string;
};
export type AssistantCase = { sentence: string; calls: Expected[] };
const call = (path: string, args?: Expected['args']): Expected => ({ paths: [path], ...(args && { args }) });
export const assistantCases: AssistantCase[] = [
  { sentence: 'metti le cuffie', calls: [call('audio.setOutput', { label: { contains: 'uffi' } })] },
  { sentence: "alza un po' il volume", calls: [call('audio.stepVolume', { direction: 'up' })] },
  { sentence: 'volume al 40', calls: [call('audio.setVolume', { value: 40 })] },
  { sentence: 'muta il microfono', calls: [call('audio.toggleMicMute')] },
  { sentence: 'metti in pausa la musica', calls: [call('media.playPause')] },
  { sentence: 'prossima canzone', calls: [{ paths: ['media.next', 'music.skip'] }] },
  { sentence: 'fai partire un pomodoro', calls: [call('pomodoro.start')] },
  {
    sentence: 'avvia una sessione di concentrazione su chimica',
    calls: [call('pomodoro.startTagged', { tag: { contains: 'chimica' } })],
  },
  { sentence: 'ferma il timer', calls: [call('pomodoro.stop')] },
  { sentence: 'blocca lo schermo', calls: [call('system.lock')] },
  { sentence: 'spegni il pc', calls: [{ paths: ['system.powerOff'], without: 'confirmed' }] },
  { sentence: 'apri la chat', calls: [call('system.toggleWorkspace', { name: 'communication' })] },
  { sentence: 'spegni la luce', calls: [call('hue.setPower', { on: false })] },
  { sentence: 'luce al 30%', calls: [call('hue.setBrightness', { percent: 30 })] },
  {
    sentence: "ricordami domani di stampare l'errata",
    calls: [call('notes.add', { forDay: '2026-11-17', text: { contains: 'errata' } })],
  },
  {
    sentence: 'giovedì alle 15 ho il colloquio con Acme',
    calls: [call('calendar.add', { day: '2026-11-19', start: { starts: '15' }, title: { contains: 'colloquio' } })],
  },
  { sentence: 'cerca nuovi annunci di lavoro', calls: [call('lavoro.raccogli')] },
  { sentence: 'torna alla canzone precedente', calls: [call('media.previous')] },
  { sentence: 'avvia airplay', calls: [call('airplay.start')] },
  { sentence: 'che tempo fa a Torino?', calls: [] },
  { sentence: 'grazie, a posto così', calls: [] },
  {
    sentence: 'metti le casse e fai partire la musica',
    calls: [call('audio.setOutput', { label: { contains: 'cass' } }), call('media.playPause')],
  },
];
