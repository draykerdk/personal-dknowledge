/**
 * A aba própria da Missão (`dfm-missao-view`, comando "DFM: Abrir a Missão").
 *
 * Por quê: a arquitetura da página Missão (27/10/2026, §3.3): o mesmo componente, num
 * `ItemView`; o estado (a escala, a linha em foco, o nó aberto, o "Onde estou") fica no
 * estado da vista, que o Obsidian guarda no workspace (`getState`/`setState`), e o
 * "⤢ Abrir em outra aba" da página chega por aqui com o estado dela.
 *
 * Nenhum método aqui se chama open, close, load ou unload (ciclo de vida protegido, R9).
 */
import { ItemView, type ViewStateResult, type WorkspaceLeaf } from 'obsidian';
import type DFMPlugin from '../../main';
import type { MissionBoard } from '../../board/boardPlugin';
import type { EstadoDaMissao } from '../view/componente';
import { montarNoLugar, type MissaoNoLugar } from './lugar';
import { migrarChaveDoRamo } from '../estadoTela';

export const VIEW_TYPE_DFM_MISSAO = 'dfm-missao-view';

export class MissaoView extends ItemView {
    private montada: MissaoNoLugar | null = null;
    private guardado: Partial<EstadoDaMissao> | null = null;

    constructor(leaf: WorkspaceLeaf, private readonly plugin: DFMPlugin, private readonly board: MissionBoard) {
        super(leaf);
    }

    getViewType(): string { return VIEW_TYPE_DFM_MISSAO; }
    getDisplayText(): string { return 'Missão'; }
    getIcon(): string { return 'compass'; }

    /** O estado da Missão vai junto com a aba (o workspace o guarda). */
    getState(): Record<string, unknown> {
        return { ...super.getState(), missao: this.montada?.api.estado() ?? this.guardado ?? null };
    }

    async setState(state: unknown, result: ViewStateResult): Promise<void> {
        // A chave antiga do ramo escolhido vale uma vez: o workspace a grava de volta com a nova (30/10).
        const migrado = migrarChaveDoRamo((state as { missao?: Partial<EstadoDaMissao> } | null)?.missao ?? null);
        const missao = migrado.estado;
        if (missao) {
            this.guardado = missao;
            if (migrado.migrou) this.app.workspace.requestSaveLayout();
            // Já montada: monta de novo no estado pedido (o "⤢" de uma aba que já existia).
            if (this.montada) this.montar();
        }
        await super.setState(state, result);
    }

    async onOpen(): Promise<void> {
        this.montar();
        // A aba ficou ativa: o foco vem para a Missão (as teclas valem), nunca de um campo.
        this.registerEvent(this.app.workspace.on('active-leaf-change', leaf => {
            if (leaf === this.leaf) window.setTimeout(() => this.montada?.api.tomarFoco(), 0);
        }));
    }

    async onClose(): Promise<void> {
        this.montada?.destruir();
        this.montada = null;
    }

    private montar(): void {
        this.montada?.destruir();
        const host = this.contentEl;
        host.empty();
        host.addClass('dfm-missao-host');
        this.montada = montarNoLugar(this.board, this.app, host, {
            lugar: 'aba',
            estado: this.guardado ?? undefined,
            aoMudar: estado => { this.guardado = estado; this.app.workspace.requestSaveLayout(); },
        });
        void this.plugin;
    }
}
