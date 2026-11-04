/**
 * As gravações da triagem que não são de TaskNote: a nota da Caixa de entrada (os destinos
 * da triagem antiga e "Virar tarefa"), a ideia (o 🗂️ pré-respondido) e o rascunho parado
 * (retomar pelo ▶️ Continuar dele, ou arquivar em `900 - ARCHIVE/Rascunhos/`).
 *
 * Por quê: a arquitetura da página Missão (27/10/2026, 8.6): "nota da Caixa de entrada →
 * os destinos da triagem antiga ou Virar tarefa, pelos caminhos dela"; "ideia → o 🗂️
 * ideia_destino pré-respondido". As tarefas e as SMART vão pelas gravações do P6
 * (`missaoWrites.ts`, a tabela das setas); estas entram na mesma pilha do Desfazer, e cada
 * entrada só desfaz o que ainda está lá: a nota que saiu do lugar depois, ou outra que
 * ocupou o caminho antigo, fica como está.
 *
 * A ordem do mover é a da triagem antiga (`panelInbox.moveFile`): a pasta e a colisão antes
 * de qualquer escrita (uma recusa deixa a nota como estava), depois o frontmatter, depois o
 * arquivo, pelo `renameFile` que reescreve os links. Pasta morta nunca renasce.
 *
 * Os efeitos chegam pela borda (`DepsDaTriagem`): sem Obsidian aqui, e os testes usam falsos.
 * Prova: tests/missao/triagemWrites.test.ts.
 */
import type { Patch } from '../canvas/edgeLinks';
import {
    HISTORY_FOLDER, TASKNOTES_FOLDER, captureTaskFrontMatter, isDeadFolder, sideQuestFrontMatter, targetPathFor,
} from '../engine/inboxRules';
import { patchDeDesfazer } from './gestos';
import type { Gravado, PilhaDoDesfazer } from './missaoWrites';
import type { Avisar, ResultadoDaGravacao } from './tipos';
import { OPCAO_DA_IDEIA, PAPEL_DA_IDEIA, variaveisDaIdeia } from './telaDaTriagem';
import type { Papel } from '../engine/papeisDeProtocolo';
import { DEFINICOES_PADRAO } from '../definicoes';
import { PASTA_DOS_RASCUNHOS, type DestinoDaCaixa, type DestinoDaIdeia } from './triagem';

export interface DepsDaTriagem {
    /** Há um arquivo neste caminho? */
    existe(caminho: string): boolean;
    /** Cria a pasta (e as de cima) se falta; recusa a pasta morta. */
    garantirPasta(pasta: string): Promise<void>;
    /** `fileManager.renameFile`: move e reescreve os links. Devolve o caminho novo. */
    moverArquivo(de: string, para: string): Promise<string>;
    /** `MissionBoard.updateNoteWith`: o patch sobre o frontmatter do momento. */
    atualizarNota(caminho: string, fn: (fm: Record<string, any>) => Patch | null): Promise<Gravado>;
    /** O frontmatter de agora (o cache), ou `null`. */
    frontmatter(caminho: string): Record<string, any> | null;
    /**
     * O frontmatter lido do arquivo, sem esperar o cache: depois do protocolo, o cache ainda
     * pode trazer o de antes (a releitura do Obsidian é assíncrona). Sem ele, vale o cache.
     */
    frontmatterDoDisco?(caminho: string): Promise<Record<string, any> | null>;
    /** Roda um protocolo com as respostas já dadas e espera ele acabar (`MissionBoard.runProtocol`). */
    rodarProtocolo(id: string, vars: Record<string, unknown>): Promise<void>;
    /** O protocolo carregado que faz o papel (`MissionBoard.idDoPapel`); `null` = o cofre não tem. Sem a leitura, a dos padrões da v0. */
    idDoPapel?(papel: Papel): string | null;
    /** Abre a nota numa aba e espera ela ser a ativa (o ▶️ Continuar lê o rascunho ativo). */
    abrirNota(caminho: string): Promise<void>;
    /** O texto da nota. */
    lerTexto(caminho: string): Promise<string>;
    /** `store.scheduleRefresh()`. */
    refrescar(): void;
    /** Hoje (`AAAA-MM-DD`). */
    hoje(): string;
}

/** O rótulo de cada destino da Caixa, para o aviso. */
export const ROTULO_DA_CAIXA: Readonly<Record<DestinoDaCaixa, string>> = {
    project: 'projeto', resources: 'Recursos', history: 'Histórico', sidequest: 'Side Quest', tarefa: 'tarefa',
};

/** Os campos da ideia que o 🗂️ grava (`updateSelectedNote.properties`); o Desfazer volta só estes. */
export const CAMPOS_DA_IDEIA: readonly string[] = ['destino', 'para_qual_contexto', 'porque_fora'];

/**
 * O que faz: a pasta de um destino da Caixa: a fixa (Histórico, Side Quest, Virar tarefa) ou
 * a escolhida (o projeto ou a área, o tipo de Recursos).
 * Erro e ataque: o destino que pede escolha sem escolha dá `null`; a pasta morta dá `null`.
 */
export function pastaDoDestino(destino: DestinoDaCaixa, escolhida: string | null): string | null {
    const pasta = destino === 'history' ? HISTORY_FOLDER : destino === 'sidequest' || destino === 'tarefa' ? TASKNOTES_FOLDER : (escolhida ?? '').replace(/\/+$/, '');
    if (!pasta || isDeadFolder(pasta)) return null;
    return pasta;
}

/**
 * O que faz: o `vars` do bloco "▶️ Continuar Protocolo" de um rascunho: o id do protocolo e
 * as respostas já dadas (base64 de JSON, `encodeVariablesForButton`).
 * Erro e ataque: rascunho sem o bloco (já concluído) ou com `vars` que não se lê dá `null`.
 */
export function continuarDoRascunho(texto: string, decodificar: (b64: string) => string): { id: string; vars: Record<string, unknown> } | null {
    const m = /\n## ▶️ Continuar Protocolo\n```dfm\n([\s\S]*?)\n```/.exec(String(texto ?? ''));
    if (!m) return null;
    const linha = (k: string) => m[1].split('\n').find(l => l.trim().startsWith(`${k}:`))?.trim().slice(k.length + 1).trim() ?? '';
    const id = linha('id');
    if (!id) return null;
    const raw = linha('vars');
    if (!raw) return { id, vars: {} };
    try {
        const vars = JSON.parse(decodificar(raw));
        return vars && typeof vars === 'object' ? { id, vars } : null;
    } catch {
        return null;
    }
}

const nomeDe = (caminho: string) => caminho.split('/').pop() ?? caminho;
const semMd = (nome: string) => nome.replace(/\.md$/, '');
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * As gravações da triagem (nota da Caixa, ideia, rascunho).
 * O que faz: grava o destino escolhido, registra o Desfazer na pilha única e pede a releitura.
 * Erro e ataque: a nota que sumiu, a pasta sem escolha, o destino que já tem nota com o
 * mesmo nome e a pasta morta não gravam nem entram na pilha.
 */
export class GravacoesDaTriagem {
    constructor(private readonly deps: DepsDaTriagem, readonly pilha: PilhaDoDesfazer, private readonly decodificar: (b64: string) => string = b64 => decodeURIComponent(escape(atob(b64)))) {}

    /**
     * O que faz: uma nota da Caixa de entrada vai para o destino (a pasta escolhida ou a fixa);
     * o Side Quest e o "Virar tarefa" ganham antes o frontmatter da TaskNote.
     * O Desfazer: a nota volta ao caminho de antes, e o frontmatter volta só no que ainda tem o
     * valor gravado.
     */
    async caixa(caminho: string, destino: DestinoDaCaixa, escolhida: string | null, avisar?: Avisar): Promise<ResultadoDaGravacao> {
        if (!this.deps.existe(caminho)) return this.falha('A nota não está mais na Caixa de entrada', avisar);
        const pasta = pastaDoDestino(destino, escolhida);
        if (!pasta) return this.falha(destino === 'project' || destino === 'resources' ? 'Escolha a pasta do destino: nada foi movido' : 'Essa pasta não existe mais: nada foi movido', avisar);
        const nome = nomeDe(caminho);
        const alvo = targetPathFor(pasta, nome);
        if (alvo === caminho) return this.falha('Nada a mudar: a nota já está aí', avisar);
        if (this.deps.existe(alvo)) return this.falha(`Já existe ${alvo}: nada foi movido`, avisar);
        await this.deps.garantirPasta(pasta);
        let antes: Record<string, unknown> = {};
        let gravado: Patch | null = null;
        if (destino === 'sidequest' || destino === 'tarefa') {
            const hoje = this.deps.hoje();
            const r = await this.deps.atualizarNota(caminho, fm => {
                const p = destino === 'sidequest' ? sideQuestFrontMatter(fm, hoje) : captureTaskFrontMatter(fm, hoje);
                const patch: Patch = {};
                for (const [k, v] of Object.entries(p)) if (v !== undefined && !same(fm[k], v)) patch[k] = v;
                gravado = Object.keys(patch).length ? patch : null;
                return gravado;
            });
            antes = r.before;
            if (!r.changed) gravado = null;
        }
        const novo = await this.deps.moverArquivo(caminho, alvo);
        const rotulo = `${semMd(nome)} → ${ROTULO_DA_CAIXA[destino]} (${pasta})`;
        this.deps.refrescar();
        const patch = gravado as Patch | null;
        this.pilha.registrar({
            rotulo,
            desfazer: async () => {
                if (!this.deps.existe(novo)) return { feito: false, texto: `Nada a desfazer: a nota saiu de ${pasta} depois (${rotulo})` };
                if (this.deps.existe(caminho)) return { feito: false, texto: `Nada a desfazer: outra nota ocupa ${caminho} (${rotulo})` };
                let ficaram: string[] = [];
                if (patch) {
                    await this.deps.atualizarNota(novo, fm => {
                        const d = patchDeDesfazer(fm, antes, patch);
                        ficaram = d.ficaram;
                        return d.patch;
                    });
                }
                await this.deps.moverArquivo(novo, caminho);
                this.deps.refrescar();
                return { feito: true, texto: ficaram.length ? `Desfeito em parte: ${rotulo} (${ficaram.join(', ')} mudou depois e ficou)` : `Desfeito: ${rotulo}` };
            },
        }, avisar);
        return { ok: true, texto: rotulo };
    }

    /**
     * O que faz: a ideia ganha destino pelo 🗂️ protocolo do destino da ideia, com a ideia e o destino já
     * respondidos (e a SMART, quando a ideia foi solta sobre uma). Espera o protocolo acabar
     * e compara os campos da ideia: mudou, entra no Desfazer (que volta só os campos da ideia;
     * a linha na Day e a 🔥 criada ficam, e o aviso diz); não mudou (fechou sem responder),
     * avisa sem gravar nada.
     */
    async ideia(caminho: string, destino: DestinoDaIdeia, smart: string | null = null, avisar?: Avisar): Promise<ResultadoDaGravacao> {
        if (!this.deps.existe(caminho)) return this.falha('A ideia não está mais no cofre', avisar);
        const ler = async () => {
            const fm = (this.deps.frontmatterDoDisco ? await this.deps.frontmatterDoDisco(caminho) : this.deps.frontmatter(caminho)) ?? {};
            const out: Record<string, unknown> = {};
            for (const k of CAMPOS_DA_IDEIA) if (fm[k] !== undefined) out[k] = JSON.parse(JSON.stringify(fm[k]));
            return out;
        };
        // O 🗂️ pelo papel; sem protocolo para ele, a ideia fica como está e nada avisa (a tela nem
        // oferece o destino: `teclasDoTipo`, D1 do mapa da v0).
        const protocolo = this.deps.idDoPapel ? this.deps.idDoPapel(PAPEL_DA_IDEIA) : DEFINICOES_PADRAO.protocolos_por_papel[PAPEL_DA_IDEIA];
        if (!protocolo) return { ok: false, texto: 'O cofre não tem o protocolo do destino da ideia' };
        const antes = await ler();
        await this.deps.rodarProtocolo(protocolo, variaveisDaIdeia(caminho, destino, smart));
        const depois = await ler();
        const gravado: Patch = {};
        for (const k of CAMPOS_DA_IDEIA) if (!same(antes[k], depois[k])) gravado[k] = depois[k] === undefined ? null : depois[k];
        if (!Object.keys(gravado).length) return this.falha('A ideia ficou como estava', avisar);
        const titulo = semMd(nomeDe(caminho));
        const rotulo = `Ideia ${titulo} → ${OPCAO_DA_IDEIA[destino]}`;
        this.deps.refrescar();
        this.pilha.registrar({
            rotulo,
            desfazer: async () => {
                let ficaram: string[] = [];
                const r = await this.deps.atualizarNota(caminho, fm => {
                    const d = patchDeDesfazer(fm, antes, gravado);
                    ficaram = d.ficaram;
                    return d.patch;
                });
                if (!r.changed) return { feito: false, texto: `Nada a desfazer: o destino da ideia mudou depois (${rotulo})` };
                this.deps.refrescar();
                const resto = destino === 'smart' ? '; a linha na Day e a 🔥 criada ficam' : '; a linha na Day fica';
                return { feito: true, texto: `Desfeito: ${rotulo}${ficaram.length ? ` (${ficaram.join(', ')} mudou depois e ficou)` : ''}${resto}` };
            },
        }, avisar);
        return { ok: true, texto: rotulo };
    }

    /**
     * O que faz: arquiva o rascunho parado em `900 - ARCHIVE/Rascunhos/`, pelo `renameFile`.
     * O Desfazer devolve a nota ao caminho de antes.
     */
    async arquivarRascunho(caminho: string, avisar?: Avisar): Promise<ResultadoDaGravacao> {
        if (!this.deps.existe(caminho)) return this.falha('O rascunho não está mais no cofre', avisar);
        const alvo = `${PASTA_DOS_RASCUNHOS}/${nomeDe(caminho)}`;
        if (this.deps.existe(alvo)) return this.falha(`Já existe ${alvo}: nada foi movido`, avisar);
        await this.deps.garantirPasta(PASTA_DOS_RASCUNHOS);
        const novo = await this.deps.moverArquivo(caminho, alvo);
        const rotulo = `Rascunho arquivado: ${semMd(nomeDe(caminho))}`;
        this.deps.refrescar();
        this.pilha.registrar({
            rotulo,
            desfazer: async () => {
                if (!this.deps.existe(novo)) return { feito: false, texto: `Nada a desfazer: o rascunho saiu do arquivo depois (${rotulo})` };
                if (this.deps.existe(caminho)) return { feito: false, texto: `Nada a desfazer: outra nota ocupa ${caminho} (${rotulo})` };
                await this.deps.moverArquivo(novo, caminho);
                this.deps.refrescar();
                return { feito: true, texto: `Desfeito: ${rotulo}` };
            },
        }, avisar);
        return { ok: true, texto: rotulo };
    }

    /**
     * O que faz: retoma o rascunho pelo ▶️ Continuar dele: abre a nota (o protocolo fecha o
     * rascunho ao fim, pela nota ativa) e roda o protocolo com as respostas já dadas. Não grava
     * nada aqui (quem grava é o protocolo, no fim), e por isso não entra no Desfazer.
     * Erro e ataque: o rascunho sem o bloco (já concluído) ou com as respostas ilegíveis.
     */
    async retomarRascunho(caminho: string, avisar?: Avisar): Promise<ResultadoDaGravacao> {
        if (!this.deps.existe(caminho)) return this.falha('O rascunho não está mais no cofre', avisar);
        const c = continuarDoRascunho(await this.deps.lerTexto(caminho), this.decodificar);
        if (!c) return this.falha('Este rascunho não tem mais o ▶️ Continuar: abra a nota', avisar);
        await this.deps.abrirNota(caminho);
        const texto = `Retomado: ${semMd(nomeDe(caminho))}`;
        (avisar ?? (t => this.pilha.avisar(t)))(texto);
        await this.deps.rodarProtocolo(c.id, c.vars);
        return { ok: true, texto };
    }

    private falha(texto: string, avisar?: Avisar): ResultadoDaGravacao {
        if (avisar) avisar(texto);
        else this.pilha.avisar(texto);
        return { ok: false, texto };
    }
}
