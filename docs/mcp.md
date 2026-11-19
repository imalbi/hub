# Hub come server MCP

Hub espone gli strumenti del registro e le risorse di stato su `http://127.0.0.1:4180/mcp` con Streamable HTTP. Il server deve essere avviato; `mcp.enabled` è attivo per impostazione predefinita.

Scegli Claude Code o Codex in **Impostazioni > Sistema e agenti > MCP** (Claude Code è il valore predefinito), poi salva e riavvia Hub. In **Dispositivi**, copia il comando mostrato per registrare Hub nel client scelto. La selezione non registra il server da sola.

Per collegare Claude Code sul computer che esegue Hub:

```sh
claude mcp add --scope user --transport http hub http://127.0.0.1:4180/mcp
```

Per collegare Codex sullo stesso computer:

```sh
codex mcp add hub --url http://127.0.0.1:4180/mcp
```

Questi comandi modificano la configurazione del rispettivo client: eseguili solo quando vuoi aggiungere Hub. Per un client sulla rete locale, abilita l'ascolto LAN nella configurazione di Hub, crea un token nella sezione Agent di Dispositivi e invialo come intestazione `Authorization: Bearer <token>`. Il token viene mostrato una sola volta; la revoca interrompe gli accessi successivi. Codex supporta `--bearer-token-env-var` per leggere il token da una variabile d'ambiente.

Le azioni pericolose richiedono una conferma con pressione prolungata sul desk o sul deck. Se nessuno dei due è connesso la richiesta viene rifiutata; le richieste in attesa scadono dopo due minuti. L'agente può controllare l'esito con `confirmations.status`. Segreti, `server.host` e disattivazione dei moduli pairing, devices e health restano modifiche manuali. Le chiamate degli agenti sono registrate con i valori sensibili mascherati.
