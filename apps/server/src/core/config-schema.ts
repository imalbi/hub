import { z } from 'zod';
export const DEFAULT_DEVICE_TOKEN_TTL_DAYS = 90;

export const coreConfigSchema = z.object({
  assistant: z
    .object({
      enabled: z
        .boolean()
        .default(false)
        .meta({ title: 'Attivo', description: 'Consente di chiedere azioni al modello locale.' }),
      model: z
        .string()
        .min(1)
        .default('gemma4:12b-it-qat')
        .meta({ title: 'Modello', description: 'Nome del modello locale in Ollama.' }),
      numCtx: z
        .number()
        .int()
        .min(1024)
        .default(16384)
        .meta({ title: 'Contesto', description: 'Numero massimo di token nel contesto del modello.' }),
      decisionModel: z.string().trim().default('').meta({
        title: 'Modello decisionale',
        description: 'Modello /v1/systemone per valutare il rischio delle azioni (vuoto = disattivato).',
      }),
    })
    .default({ enabled: false, model: 'gemma4:12b-it-qat', numCtx: 16384, decisionModel: '' })
    .meta({ title: 'Assistente', description: 'Modello locale per le azioni richieste nella ricerca.' }),
  mcp: z
    .object({
      enabled: z
        .boolean()
        .default(true)
        .meta({ title: 'Attivo', description: 'Consente agli agenti di collegarsi a Hub.' }),
      client: z
        .enum(['claude', 'codex'])
        .default('claude')
        .meta({
          title: 'Client',
          description: 'Quale agente usare per collegarsi a Hub e avviare le skill.',
          optionLabels: { claude: 'Claude Code', codex: 'Codex' },
        }),
    })
    .default({ enabled: true, client: 'claude' })
    .meta({ title: 'MCP', description: 'Collegamento degli agenti a Hub.' }),
  jobs: z
    .object({
      maxConcurrent: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(2)
        .meta({ title: 'Job simultanei', description: 'Numero massimo di job eseguiti contemporaneamente.' }),
    })
    .default({ maxConcurrent: 2 })
    .meta({ title: 'Job', description: 'Limiti dei job in esecuzione.' }),
  backup: z
    .object({
      enabled: z
        .boolean()
        .default(true)
        .meta({ title: 'Attivo', description: 'Copia ogni giorno i dati di Hub nella cartella dei backup.' }),
      dir: z.string().min(1).optional().meta({
        manual: true,
        title: 'Cartella',
        description:
          'Dove salvare le copie; se vuota, accanto al database di Hub. Sullo stesso disco protegge da una migrazione sbagliata o da una cancellazione, non da un guasto: indica un altro disco o una cartella sincronizzata.',
      }),
      keep: z.number().int().min(1).max(365).default(14).meta({
        title: 'Copie da tenere',
        description: 'Quante copie giornaliere restano; le più vecchie vengono tolte.',
      }),
    })
    .default({ enabled: true, keep: 14 })
    .meta({ title: 'Backup', description: 'Copia giornaliera dei database di Hub.' }),
  server: z
    .object({
      // Where to listen. Loopback until the deck is paired; `0.0.0.0` (or a LAN address) opens Hub to the home network.
      host: z.string().min(1).default('127.0.0.1').meta({
        manual: true,
        title: 'Indirizzo di ascolto',
        description: 'Dove Hub accetta connessioni; 127.0.0.1 solo questo computer, 0.0.0.0 anche la rete di casa.',
      }),
      deviceTokenTtlDays: z.number().int().min(1).max(365).default(DEFAULT_DEVICE_TOKEN_TTL_DAYS).meta({
        title: 'Durata abbinamento',
        description:
          'Giorni dalla data di abbinamento prima di richiedere un nuovo codice. Vale anche per i dispositivi già abbinati.',
        unit: 'giorni',
      }),
      // Extra page origins allowed to open the WebSocket (the deck on the LAN); dev origins are built in.
      allowedOrigins: z.array(z.string().min(1)).default([]).meta({
        title: 'Origini consentite',
        description: 'Indirizzi di pagine extra che possono collegarsi, come il deck in rete locale.',
      }),
    })
    .default({ host: '127.0.0.1', allowedOrigins: [], deviceTokenTtlDays: DEFAULT_DEVICE_TOKEN_TTL_DAYS }),
  files: z
    .object({
      maxUploadMb: z
        .number()
        .positive()
        .max(1024)
        .default(25)
        .meta({ title: 'Dimensione massima', description: 'Peso massimo di un file caricato.', unit: 'MB' }),
    })
    .optional(),
  modules: z.record(z.string(), z.unknown()).optional(),
  // Names of modules that are switched off: not created at startup, their data untouched. Kept at the top level because
  // module slices belong to their own (often strict) schemas.
  modulesOff: z
    .array(z.string())
    .default([])
    .meta({ title: 'Moduli spenti', description: 'Nomi dei moduli da non avviare; i loro dati restano intatti.' }),
});
export type CoreConfig = z.infer<typeof coreConfigSchema>;
