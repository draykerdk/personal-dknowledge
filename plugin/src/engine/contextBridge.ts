import type DFMPlugin from '../main';
import { TFile } from 'obsidian';

export interface ContextSignal {
    path: string;
    title: string;
    ts: string;
}

/**
 * Ponte "Nota Atual" Obsidian -> DSH (contrato PLANO 2026-08-27).
 *
 * Grava em `<raiz-do-vault>/.dfm-dsh-context.json` SOMENTE caminho, título e
 * timestamp da nota em foco. O corpo nunca passa pela ponte: qualquer agente
 * decide ler o conteúdo por conta própria, pelo seu fluxo normal de leitura.
 * Sinal é runtime versionado (gitignored) e best-effort: falhas são silenciosas.
 */
export const CONTEXT_SIGNAL_PATH = '.dfm-dsh-context.json';

export class ContextBridge {
    constructor(private readonly plugin: DFMPlugin) {}

    async notify(file: TFile | null | undefined): Promise<void> {
        if (!(file instanceof TFile) || file.extension !== 'md') return;
        const adapter = this.plugin.app.vault.adapter as any;
        if (typeof adapter?.write !== 'function') return;
        const signal: ContextSignal = {
            path: file.path,
            title: file.basename,
            ts: new Date().toISOString(),
        };
        try {
            await adapter.write(CONTEXT_SIGNAL_PATH, JSON.stringify(signal, null, 2));
        } catch (_) {
            // Falha no sinal nunca pode perturbar o uso do Obsidian.
        }
    }

    async notifyCurrent(): Promise<void> {
        const active = this.plugin.app.workspace.getActiveFile();
        await this.notify(active instanceof TFile ? active : null);
    }
}
