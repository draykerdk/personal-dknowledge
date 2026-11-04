/**
 * As gravações do Novo (P8): a tarefa pela API do TaskNotes, com a herança da SMART e o
 * Desfazer, e a tarefa pelo formulário nativo do TaskNotes ("Abrir no TaskNotes").
 *
 * Por quê: a arquitetura da página Missão (§4.3, §4.4, §8.3) e o P8: "a tarefa pelo TaskNotes"
 * (o formulário curto), com o `type: task` que a API não grava sozinha (`tasknotesCreate.ts`), e
 * "na criação dentro de uma SMART, o frontmatter inicial é o patch da mãe", com a SMART lida na
 * hora da gravação (a semana e o impacto que ela tem agora), como as setas.
 *
 * O Desfazer da criação manda a nota recém-criada para a lixeira do sistema, e só se ela está
 * como nasceu (o mesmo texto): a tarefa que alguém já mudou fica, e o aviso diz por quê. Os
 * protocolos (SMART, projeto, cidade, país) não entram na pilha: eles gravam também a Day, o
 * canvas, a primeira ação e os pontos, e desfazer só a nota deixaria o resto pela metade.
 *
 * Os efeitos chegam pela borda (`DepsDoNovo`); aqui não há Obsidian. Prova: tests/missao/novoWrites.test.ts.
 */
import { motherLink, patchFor, type LinkTask, type Patch } from '../canvas/edgeLinks';
import { pedidoDoFrontmatter, TIPO_DA_TAREFA, type PedidoDeCriacao } from '../engine/tasknotesCreate';
import { frontmatterInicial, type PedidoDaNota } from './novo';
import type { Gravado, PilhaDoDesfazer } from './missaoWrites';
import type { Avisar, ResultadoDaGravacao } from './tipos';

export interface DepsDoNovo {
    /** Cria pela API do TaskNotes (`tasknotesBridge.createTaskViaApi`); devolve o caminho. */
    criarTarefa(pedido: PedidoDeCriacao): Promise<string>;
    /** Abre o formulário nativo do TaskNotes preenchido; devolve o caminho da tarefa salva, ou `null`. */
    abrirFormulario(fm: Record<string, unknown>): Promise<string | null>;
    /** A TaskNote como ponta de seta, lida agora (a SMART mãe); `null` se não é TaskNote. */
    tarefa(caminho: string): LinkTask | null;
    /** `MissionBoard.updateTaskWith`: o patch sobre o frontmatter do momento. */
    atualizarTarefa(caminho: string, fn: (fm: Record<string, any>) => Patch | null): Promise<Gravado>;
    /** O texto da nota agora, ou `null` se ela não existe. */
    lerTexto(caminho: string): Promise<string | null>;
    /** Manda a nota para a lixeira do sistema (`vault.trash(file, true)`); `false` se ela não existe. */
    lixeira(caminho: string): Promise<boolean>;
    /**
     * Cria a nota simples (30/10, `via: nota`): o arquivo novo na pasta, com o frontmatter; o nome repetido
     * ganha sufixo (" 2"); devolve o caminho. Com o molde (02/11, a nota de função), o corpo é o do molde, com as
     * fichas resolvidas, e o frontmatter do pedido vale por cima do dele; o molde que não está no cofre é erro.
     * Opcional: o lugar sem ele não cria nota simples.
     */
    criarNota?(pasta: string, nome: string, fm: Record<string, unknown>, molde?: PedidoDaNota['molde']): Promise<string>;
    /** `store.scheduleRefresh()`. */
    refrescar(): void;
}

/** O resultado da criação: o da gravação e o caminho da nota nova. */
export type ResultadoDaCriacao = ResultadoDaGravacao & { caminho?: string };

/**
 * As gravações do Novo.
 * O que faz: cria a tarefa (pela API, com a herança e o Desfazer; ou pelo formulário nativo,
 * acertando o `type` e a herança depois que ele salva).
 * Erro e ataque: a SMART que sumiu não cria (a herança seria de nada); título vazio não cria;
 * a recusa do TaskNotes vira aviso, sem entrada na pilha; desfazer a tarefa já mudada não apaga.
 */
export class GravacoesDoNovo {
    constructor(private readonly deps: DepsDoNovo, readonly pilha: PilhaDoDesfazer) {}

    /** O que faz: a SMART mãe lida agora, se o formulário a ligou; o texto = o problema. */
    private mae(smart: string | null): LinkTask | null | string {
        if (!smart) return null;
        const s = this.deps.tarefa(smart);
        return s ?? 'a SMART não está mais no cofre';
    }

    /**
     * O que faz: cria a tarefa pela API do TaskNotes: o frontmatter inicial (os valores do
     * formulário e o patch da mãe), o pedido com o `type`, e o Desfazer que manda a nota
     * para a lixeira do sistema enquanto ela está como nasceu.
     * Entra → sai: os valores conferidos, o caminho da SMART mãe (ou `null`) e o aviso → o resultado.
     */
    async tarefa(valores: Record<string, unknown>, smart: string | null, avisar?: Avisar): Promise<ResultadoDaCriacao> {
        const mae = this.mae(smart);
        if (typeof mae === 'string') return this.falha(`Não criou: ${mae}`, avisar);
        const pedido = pedidoDoFrontmatter(frontmatterInicial(valores, mae), TIPO_DA_TAREFA);
        if (!pedido.title) return this.falha('Não criou: o título é obrigatório', avisar);
        let caminho: string;
        try {
            caminho = await this.deps.criarTarefa(pedido);
        } catch (e) {
            return this.falha(`Não criou: ${(e as Error)?.message ?? e}`, avisar);
        }
        this.deps.refrescar();
        const rotulo = `Criada: ${pedido.title}${mae ? ` · SMART ${mae.basename}` : ''}`;
        await this.desfazerCriacao(caminho, String(pedido.title), 'a tarefa', rotulo, avisar);
        return { ok: true, texto: rotulo, caminho };
    }

    /**
     * O que faz: cria a nota simples de um tipo `via: nota` (a estadia, 30/10): o arquivo na pasta do modelo,
     * com o frontmatter do pedido, e o mesmo Desfazer da tarefa (a lixeira do sistema enquanto ela está como
     * nasceu).
     * Entra → sai: o pedido (`pedidoDaNota`) e o aviso → o resultado, com o caminho.
     * Erro e ataque: o lugar que não cria nota simples, e a recusa do cofre, viram aviso, sem entrada na pilha.
     */
    async nota(pedido: PedidoDaNota, avisar?: Avisar): Promise<ResultadoDaCriacao> {
        if (!this.deps.criarNota) return this.falha('Não criou: este lugar não cria a nota', avisar);
        let caminho: string;
        try {
            caminho = await this.deps.criarNota(pedido.pasta, pedido.nome, pedido.fm, pedido.molde);
        } catch (e) {
            return this.falha(`Não criou: ${(e as Error)?.message ?? e}`, avisar);
        }
        this.deps.refrescar();
        const rotulo = `Criada: ${pedido.nome}`;
        await this.desfazerCriacao(caminho, pedido.nome, 'a nota', rotulo, avisar);
        return { ok: true, texto: rotulo, caminho };
    }

    /**
     * O que faz: a entrada do Desfazer de uma criação: manda a nota para a lixeira do sistema, só se ela está
     * como nasceu; a que alguém já mudou fica, e o aviso diz por quê. Uma regra só para a tarefa e a nota.
     */
    private async desfazerCriacao(caminho: string, nome: string, oQue: string, rotulo: string, avisar?: Avisar): Promise<void> {
        const nasceu = await this.deps.lerTexto(caminho);
        this.pilha.registrar({
            rotulo,
            desfazer: async () => {
                const agora = await this.deps.lerTexto(caminho);
                if (agora === null) return { feito: false, texto: `Nada a desfazer: ${oQue} não está mais no cofre (${nome})` };
                if (nasceu === null || agora !== nasceu) return { feito: false, texto: `Nada a desfazer: ${oQue} mudou depois de criada, e fica (${nome})` };
                const ok = await this.deps.lixeira(caminho);
                if (ok) this.deps.refrescar();
                return ok ? { feito: true, texto: `Desfeito: ${nome} foi para a lixeira do sistema` } : { feito: false, texto: `Não deu para desfazer: ${nome}` };
            },
        }, avisar);
    }

    /**
     * O que faz: "Abrir no TaskNotes": o formulário nativo, preenchido com o título, o onde, a
     * estimativa e o projeto (com a herança); depois que ele salva, o `type: task` que ele não
     * grava e a herança da mãe, pelo patch de sempre (só o que veio vazio).
     * Entra → sai: os valores conferidos, a SMART mãe e o aviso → o resultado (o formulário
     * fechado sem salvar não cria nada).
     */
    async noTaskNotes(valores: Record<string, unknown>, smart: string | null, avisar?: Avisar): Promise<ResultadoDaCriacao> {
        const mae = this.mae(smart);
        if (typeof mae === 'string') return this.falha(`Não abriu: ${mae}`, avisar);
        const caminho = await this.deps.abrirFormulario(frontmatterInicial(valores, mae));
        if (!caminho) return { ok: false, texto: 'O formulário do TaskNotes fechou sem criar' };
        const agora = this.mae(smart);
        await this.deps.atualizarTarefa(caminho, fm => {
            const patch: Patch = {};
            if (!fm.type) patch.type = TIPO_DA_TAREFA;
            const nome = String(fm.title ?? caminho.slice(caminho.lastIndexOf('/') + 1).replace(/\.md$/, ''));
            // A herança só se a tarefa ficou na SMART (no formulário dele, o operador pode ter trocado).
            const naMae = agora && typeof agora !== 'string' && (Array.isArray(fm.projects) ? fm.projects : [fm.projects])
                .some(l => String(l ?? '').replace(/^\[\[|\]\]$/g, '').split('|')[0].trim().toLowerCase() === agora.basename.toLowerCase());
            if (naMae) Object.assign(patch, patchFor(fm, motherLink({ path: caminho, basename: nome }, agora as LinkTask)) ?? {});
            return Object.keys(patch).length ? patch : null;
        });
        this.deps.refrescar();
        const texto = 'Criada no TaskNotes';
        (avisar ?? (t => this.pilha.avisar(t)))(texto);
        return { ok: true, texto, caminho };
    }

    private falha(texto: string, avisar?: Avisar): ResultadoDaCriacao {
        if (avisar) avisar(texto);
        else this.pilha.avisar(texto);
        return { ok: false, texto };
    }
}
