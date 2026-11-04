/**
 * Uma leitura do vault para todos os widgets abertos.
 *
 * Dez widgets num canvas não leem o vault dez vezes: todos assinam este store,
 * que pede o snapshot ao `MissionControl` (que já tem cache) e avisa quando há
 * leitura nova. Mudança em nota `.md` agenda uma releitura com espera, para que
 * uma rajada de gravações vire uma só.
 *
 * Só escuta o vault enquanto houver widget na tela, e só o que importa
 * (`notaDoQuadro`): salvar um capítulo de um texto longo ou uma nota de pesquisa não relê o
 * quadro inteiro (proposta do Mission Control, 27/10/2026, item 4).
 */
import type { EventRef } from 'obsidian';
import { TFile } from 'obsidian';
import type DFMPlugin from '../main';
import type { MissionSnapshot } from '../engine/missionControl';

type Listener = (snapshot: MissionSnapshot | null) => void;

/** Quem diz se um caminho importa ao quadro (`mudou`: o conteúdo; `moveu`: renomear ou apagar). */
export type ImportaAoQuadro = (caminho: string, evento: 'mudou' | 'moveu') => boolean;

/**
 * O que faz: diz se um aviso do cofre pede releitura do quadro: só nota `.md`, e só no
 * que importa (as casas da Missão: tarefas, Daymiss, Caixa de entrada, hábitos, cidades,
 * pessoas, visão, ideias e as notas-índice dos projetos).
 * Entra → sai: o arquivo do aviso, o evento, o juiz e o caminho antigo (no renomear) → sim/não.
 * Erro e ataque: sem juiz, vale o de antes (toda nota `.md`), para nada deixar de reler.
 * Prova: tests/board/boardStore.test.ts.
 */
export function notaDoQuadro(file: { path?: string; extension?: string } | null | undefined, evento: 'mudou' | 'moveu', importa?: ImportaAoQuadro, antigo?: string): boolean {
    if (!file || file.extension !== 'md' || !file.path) return false;
    if (!importa) return true;
    return importa(file.path, evento) || (!!antigo && importa(antigo, evento));
}

const REFRESH_DELAY_MS = 1200;

export class BoardStore {
    private listeners = new Set<Listener>();
    private snapshot: MissionSnapshot | null = null;
    private loading: Promise<void> | null = null;
    private timer: number | null = null;
    private refs: Array<{ off(ref: EventRef): void; ref: EventRef }> = [];

    constructor(private readonly plugin: DFMPlugin, private readonly importa?: ImportaAoQuadro) {}

    current(): MissionSnapshot | null {
        return this.snapshot ?? this.plugin.getMissionControl().peek();
    }

    subscribe(listener: Listener): () => void {
        this.listeners.add(listener);
        if (this.listeners.size === 1) this.attach();
        if (!this.current()) void this.load(false);
        return () => {
            this.listeners.delete(listener);
            if (this.listeners.size === 0) this.detach();
        };
    }

    /** Garante uma leitura em andamento, sem esperar (para menus síncronos). */
    warm(): void {
        if (!this.current()) void this.load(false);
    }

    /** Relê já (depois de uma ação do próprio quadro, como concluir tarefa). */
    refreshNow(): Promise<void> {
        this.plugin.getMissionControl().invalidate();
        return this.load(true);
    }

    scheduleRefresh(): void {
        if (this.timer !== null) window.clearTimeout(this.timer);
        this.timer = window.setTimeout(() => {
            this.timer = null;
            void this.refreshNow();
        }, REFRESH_DELAY_MS);
    }

    private load(force: boolean): Promise<void> {
        if (this.loading) return this.loading;
        this.loading = this.plugin.getMissionControl().build(force)
            .then(snapshot => { this.snapshot = snapshot; })
            .catch(error => { console.error('DFM Board: falha ao ler o quadro', error); })
            .finally(() => {
                this.loading = null;
                this.emit();
            });
        return this.loading;
    }

    private emit(): void {
        for (const listener of [...this.listeners]) {
            try { listener(this.snapshot); } catch (error) { console.error('DFM Board: widget falhou ao desenhar', error); }
        }
    }

    private attach(): void {
        const { metadataCache, vault } = this.plugin.app;
        const on = (evento: 'mudou' | 'moveu') => (file: unknown, antigo?: unknown) => {
            if (file instanceof TFile && notaDoQuadro(file, evento, this.importa, typeof antigo === 'string' ? antigo : undefined)) this.scheduleRefresh();
        };
        const offMeta = (ref: EventRef) => metadataCache.offref(ref);
        const offVault = (ref: EventRef) => vault.offref(ref);
        this.refs = [
            { off: offMeta, ref: metadataCache.on('changed', on('mudou')) },
            { off: offVault, ref: vault.on('delete', on('moveu')) },
            { off: offVault, ref: vault.on('rename', on('moveu')) },
        ];
    }

    private detach(): void {
        for (const { off, ref } of this.refs) off(ref);
        this.refs = [];
        if (this.timer !== null) window.clearTimeout(this.timer);
        this.timer = null;
    }

    destroy(): void {
        this.listeners.clear();
        this.detach();
    }
}
