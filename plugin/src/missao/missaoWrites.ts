/**
 * As gravações da Missão e o Desfazer único.
 *
 * Por quê: a arquitetura da página Missão (27/10/2026, §3.1, §4.4, §12) e a proposta do
 * Mission Control e do canvas (27/10, aprovada): "Um Desfazer só para o painel, as ligações
 * do canvas e a Missão". Toda gravação passa pelo `MissionBoard`: o patch dos gestos por
 * `updateTaskWith` (calculado sobre o frontmatter do momento), o status por `setStatus`, a
 * conclusão por `completeTask` (com "Quando terminou?") e a volta por `reopenTask`; as
 * outras notas por `updateNoteWith`. Depois de cada gravação, `store.scheduleRefresh()`.
 *
 * O Desfazer é uma pilha só (`PilhaDoDesfazer`): a Missão, o painel e o aviso das setas do
 * canvas registram nela; o aviso mostra "Desfazer", e ⌘Z na Missão desfaz a última. Cada
 * entrada só desfaz o que ainda está lá (`patchDeDesfazer`): o campo que outro gesto mudou
 * depois fica, e o aviso diz qual.
 *
 * Os efeitos chegam todos pela borda (`DepsDaGravacao`): aqui não há Obsidian, e os testes
 * usam falsos. Prova: tests/missao/missaoWrites.test.ts.
 */
import { linkFor } from '../canvas/edgeLinks';
import type { LinkTask, Patch } from '../canvas/edgeLinks';
import type { WeightReason } from '../engine/decisionWeights';
import { patchDeDesfazer, patchDoGesto, rotuloDoGesto, type ContextoDoGesto, type Intencao } from './gestos';
import { acrescentarItem, marcarItem, tirarItem, type EdicaoDaChecklist } from './checklist';
import { CHECKLIST, STATUS } from './frases';
import { ehDia } from './formatos';
import type { Avisar, Destino, GestoDaChecklist, ResultadoDaGravacao, ResultadoDoDesfazer } from './tipos';

/* ---------------------------------------------------------------- o Desfazer */

export interface EntradaDoDesfazer {
    /** O que foi feito, como o aviso disse ("Ação X → W45"). */
    rotulo: string;
    /** Desfaz só o que ainda está lá; diz em palavras o que aconteceu. */
    desfazer(): Promise<ResultadoDoDesfazer>;
}

export interface DepsDaPilha {
    /** O aviso padrão (o `Notice` do Obsidian, com o link "Desfazer"). */
    avisar: Avisar;
    /** Quantas entradas a pilha guarda (as mais velhas saem). */
    limite?: number;
}

export const LIMITE_DO_DESFAZER = 30;

/**
 * A pilha única do Desfazer.
 * O que faz: guarda o que se pode desfazer, mostra o aviso com "Desfazer" e desfaz a última
 * entrada (⌘Z) ou a do aviso clicado.
 * Erro e ataque: desfazer duas vezes a mesma entrada (o segundo clique não faz nada); a
 * entrada que falha (lança) sai da pilha e o aviso diz que não deu; pilha vazia avisa
 * "Nada para desfazer".
 */
export class PilhaDoDesfazer {
    private readonly entradas: EntradaDoDesfazer[] = [];

    constructor(private readonly deps: DepsDaPilha) {}

    /** Quantas entradas há. */
    tamanho(): number { return this.entradas.length; }

    /** O que faz: um aviso sem "Desfazer" (o problema de um gesto, o resultado do Desfazer). */
    avisar(texto: string): void { this.deps.avisar(texto); }

    /** O rótulo da última entrada, ou `null`. */
    ultima(): string | null { return this.entradas[this.entradas.length - 1]?.rotulo ?? null; }

    /**
     * O que faz: registra uma entrada e mostra o aviso com "Desfazer" (o aviso do lugar, se o
     * lugar tem o dele, como o da Missão; senão o padrão). O `texto` é o do aviso quando diz mais
     * que o rótulo (o dia que passa do bloco, 02/11); o Desfazer guarda o rótulo.
     */
    registrar(entrada: EntradaDoDesfazer, avisar: Avisar = this.deps.avisar, texto: string = entrada.rotulo): void {
        this.entradas.push(entrada);
        const limite = this.deps.limite ?? LIMITE_DO_DESFAZER;
        while (this.entradas.length > limite) this.entradas.shift();
        avisar(texto, () => { void this.desfazerEntrada(entrada, avisar); });
    }

    /** O que faz: desfaz a última entrada (⌘Z). */
    async desfazerUltimo(avisar: Avisar = this.deps.avisar): Promise<ResultadoDoDesfazer> {
        const entrada = this.entradas[this.entradas.length - 1];
        if (!entrada) {
            const r = { feito: false, texto: 'Nada para desfazer' };
            avisar(r.texto);
            return r;
        }
        return this.desfazerEntrada(entrada, avisar);
    }

    /** O que faz: desfaz uma entrada (a do aviso clicado), onde quer que ela esteja na pilha. */
    async desfazerEntrada(entrada: EntradaDoDesfazer, avisar: Avisar = this.deps.avisar): Promise<ResultadoDoDesfazer> {
        const i = this.entradas.indexOf(entrada);
        if (i < 0) return { feito: false, texto: 'Já desfeito' };
        this.entradas.splice(i, 1);
        let r: ResultadoDoDesfazer;
        try {
            r = await entrada.desfazer();
        } catch (error) {
            console.error('DFM Desfazer: não deu para desfazer', entrada.rotulo, error);
            r = { feito: false, texto: `Não deu para desfazer: ${entrada.rotulo}` };
        }
        avisar(r.texto);
        return r;
    }
}

/* ---------------------------------------------------------------- as gravações */

/** O que `updateTaskWith` e `updateNoteWith` devolvem. */
export interface Gravado { changed: boolean; before: Record<string, unknown> }

/** Os efeitos que a gravação usa, todos do `MissionBoard` e do cofre (a borda dá). */
export interface DepsDaGravacao {
    /** `MissionBoard.updateTaskWith`: o patch calculado sobre o frontmatter do momento. */
    atualizarTarefa(caminho: string, fn: (fm: Record<string, any>) => Patch | null): Promise<Gravado>;
    /** `MissionBoard.updateNoteWith`: o mesmo, para a nota que não é TaskNote (sem `dateModified`). */
    atualizarNota(caminho: string, fn: (fm: Record<string, any>) => Patch | null): Promise<Gravado>;
    /** `MissionBoard.setStatus` (o `done` vai para a conclusão). */
    status(caminho: string, status: string): Promise<boolean>;
    /** `MissionBoard.completeTask`: pergunta "Quando terminou?"; fechar sem escolher não conclui. */
    concluir(caminho: string): Promise<boolean>;
    /** `MissionBoard.reopenTask`: volta a concluída ou cancelada (e tira do arquivo). */
    reabrir(caminho: string, status: string): Promise<boolean>;
    /** O frontmatter de agora (o cache), ou `null`. */
    frontmatter(caminho: string): Record<string, any> | null;
    /** Onde a tarefa está agora (a concluída vai para o arquivo do TaskNotes). */
    localizar(caminho: string): string | null;
    /** A tarefa como ponta de seta (`LinkTask`), lida agora; `null` se não é TaskNote. */
    tarefa(caminho: string): LinkTask | null;
    /** O contexto dos gestos (quem é SMART). */
    contexto(): ContextoDoGesto;
    /** 🤝 Fazer agora: o protocolo do gesto com a tarefa, com os motivos dos pesos. */
    fazerAgora(caminho: string, motivos?: readonly WeightReason[]): void;
    /** `store.scheduleRefresh()`: os outros widgets e canvas acompanham. */
    refrescar(): void;
    /** As tabelas de estado: quais status são de feita e de cancelada (a volta passa pelo `reopenTask`). */
    statusFechado(status: string): boolean;
    /**
     * `vault.process`: o texto da nota de agora entra, o novo sai (`null` = não grava); devolve se
     * gravou. Sem ela, a checklist não se grava (o lugar que não grava texto).
     */
    processarTexto?(caminho: string, fn: (texto: string) => string | null): Promise<boolean>;
    /**
     * O arquivo do TaskNotes (o mesmo gesto da tela dele, `api.tasks.archive`): `sim` arquiva (a tag e a
     * pasta do arquivo), `false` tira; devolve o caminho de depois, ou `null` se não mudou. Sem ela, não se arquiva.
     */
    arquivar?(caminho: string, sim: boolean): Promise<string | null>;
    /**
     * A lixeira do Obsidian (`fileManager.trashFile`, pela escolha dele: a do sistema ou a `.trash` do
     * cofre; a "apagar de vez" vira a `.trash`, nunca apaga): devolve onde a nota ficou na `.trash`
     * (`null` = na lixeira do sistema), ou `null` no lugar do objeto se não foi.
     */
    lixeira?(caminho: string): Promise<{ naLixeira: string | null } | null>;
    /** Traz a nota da `.trash` de volta ao caminho de antes; `ocupado` = outra nota está lá; `sumiu` = não está mais na lixeira. */
    restaurar?(naLixeira: string, para: string): Promise<'ok' | 'ocupado' | 'sumiu'>;
    /**
     * O complemento do aviso quando um gesto põe a tarefa num dia que passa do Bloco Sagrado da semana dele
     * (" · o dia passa de 2 h (2,5 h agendadas)", `dayOverText`, a mesma conta da carga que a Missão pinta), com
     * a tarefa já no dia; dentro do bloco, ou sem bloco legível, `''`. Sem ela, o aviso é só o rótulo.
     */
    cargaDoDia?(caminho: string, data: string): string;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v ?? null));

/**
 * O que faz: o dia em que o patch de um gesto põe a ação (o `scheduled` gravado, sem a hora); a SMART, o gesto que
 * tira o dia e o que não mexe no `scheduled` → `null`.
 * Por quê: o aviso de carga ao pôr uma tarefa num dia (02/11, o inventário da aposentadoria, fase 2, item 3): o
 * arrasto, o Ligar e o "Mover para…" passam por aqui; a hora no mesmo dia (`hora`) não muda o dia e não avisa de novo.
 */
export function diaDoGesto(patch: Patch | null, tarefa: Pick<LinkTask, 'type'>, intencao: Pick<Intencao, 'gesto'>): string | null {
    if (!patch || tarefa.type === 'tarefa_smart' || (intencao.gesto !== 'dia' && intencao.gesto !== 'semana')) return null;
    const dia = String(patch.scheduled ?? '').slice(0, 10);
    return ehDia(dia) ? dia : null;
}

/** O nome da nota pelo caminho, sem a pasta e sem o `.md` (o aviso diz o nome, não o caminho). */
const nomeDaNota = (caminho: string) => caminho.slice(caminho.lastIndexOf('/') + 1).replace(/\.md$/, '');

/**
 * As gravações da Missão (e do "Mover para outro projeto…" do canvas).
 * O que faz: transforma o gesto em gravação pelo `MissionBoard`, registra o Desfazer na pilha
 * única e pede a releitura.
 * Erro e ataque: a tarefa que sumiu, o gesto sem nada a mudar e o problema do gesto (em
 * palavras) não gravam nem entram na pilha; a SMART de destino lida na hora da gravação
 * (a semana e o impacto que ela tem agora).
 */
export class GravacoesDaMissao {
    constructor(private readonly deps: DepsDaGravacao, readonly pilha: PilhaDoDesfazer) {}

    /** O que faz: a intenção do gesto, com as SMART lidas agora; texto = o problema. */
    private intencao(destino: Destino, tarefa: LinkTask): Intencao | string {
        const ponta = { kind: tarefa.type === 'tarefa_smart' ? 'smart' as const : 'action' as const, task: tarefa };
        switch (destino.tipo) {
            case 'dia': return { gesto: 'dia', data: destino.data };
            case 'semana': return { gesto: 'semana', semana: destino.semana };
            case 'sem-data': return { gesto: 'sem-data' };
            case 'hora': return { gesto: 'hora', hora: destino.hora };
            case 'projeto': return { gesto: 'projeto', projeto: destino.projeto, de: destino.de };
            case 'ligar-smart': {
                const smart = this.deps.tarefa(destino.smart);
                return smart ? { gesto: 'ligar-smart', smart } : 'a SMART não está mais no cofre';
            }
            case 'mae-tarefa': {
                const mae = this.deps.tarefa(destino.mae);
                return mae ? { gesto: 'mae-tarefa', mae } : 'a tarefa mãe não está mais no cofre';
            }
            case 'desligar-smart': {
                const smart = this.deps.tarefa(destino.smart);
                const link = smart ? linkFor({ kind: 'smart', task: smart }, ponta) : null;
                return link ? { gesto: 'desligar', ligacao: link } : 'a SMART não está mais no cofre';
            }
            case 'desligar-projeto': {
                const link = linkFor({ kind: 'project', project: destino.projeto }, ponta);
                return link ? { gesto: 'desligar', ligacao: link } : 'esta ligação não é um campo da tarefa';
            }
            case 'desligar-bloqueio': {
                const bloqueio = this.deps.tarefa(destino.bloqueio);
                const link = bloqueio ? linkFor({ kind: bloqueio.type === 'tarefa_smart' ? 'smart' : 'action', task: bloqueio }, ponta) : null;
                return link && link.kind === 'blockedBy' ? { gesto: 'desligar', ligacao: link } : 'a tarefa que bloqueava não está mais no cofre';
            }
        }
    }

    /**
     * O que faz: um gesto da tabela das setas (mover no tempo, de projeto, de SMART, a alça, a hora).
     * Entra → sai: o caminho da tarefa, o destino e o aviso do lugar → o resultado.
     */
    async mover(caminho: string, destino: Destino, avisar?: Avisar): Promise<ResultadoDaGravacao> {
        const tarefa = this.deps.tarefa(caminho);
        if (!tarefa) return this.falha('A tarefa não está mais no cofre', avisar);
        const intencao = this.intencao(destino, tarefa);
        if (typeof intencao === 'string') return this.falha(intencao, avisar);
        return this.gesto(caminho, tarefa, intencao, avisar);
    }

    /** O que faz: grava o patch do gesto e registra o Desfazer. */
    async gesto(caminho: string, tarefa: LinkTask, intencao: Intencao, avisar?: Avisar): Promise<ResultadoDaGravacao> {
        const ctx = this.deps.contexto();
        const previa = patchDoGesto(this.deps.frontmatter(caminho) ?? {}, tarefa, intencao, ctx);
        if (previa.problema) return this.falha(`Não mudou: ${previa.problema}`, avisar);
        let gravado: Patch | null = null;
        const r = await this.deps.atualizarTarefa(caminho, fm => {
            const p = patchDoGesto(fm, tarefa, intencao, ctx);
            gravado = p.patch;
            return p.patch;
        });
        if (!r.changed || !gravado) return this.falha('Nada a mudar: já estava assim', avisar);
        const rotulo = rotuloDoGesto(tarefa, intencao);
        const texto = rotulo + this.cargaDoDia(caminho, diaDoGesto(gravado, tarefa, intencao));
        this.deps.refrescar();
        this.pilha.registrar(this.entradaDoPatch(caminho, rotulo, r.before, gravado, 'tarefa'), avisar, texto);
        return { ok: true, texto };
    }

    /** O que faz: o complemento do aviso do dia que passa do bloco (`cargaDoDia` da borda); sem dia ou sem ela, `''`. */
    private cargaDoDia(caminho: string, dia: string | null): string {
        if (!dia || !this.deps.cargaDoDia) return '';
        try { return this.deps.cargaDoDia(caminho, dia); } catch (e) { console.error('DFM Missão: a carga do dia não se leu', e); return ''; }
    }

    /**
     * O que faz: grava um campo direto do painel (o valor já conferido por `valorDoCampo`).
     * O status vai por `status` (a conclusão e o cancelamento têm caminho próprio).
     */
    async campo(caminho: string, nome: string, valor: unknown, rotuloDoCampo: string, avisar?: Avisar, mostrado?: string): Promise<ResultadoDaGravacao> {
        if (nome === 'status') return this.status(caminho, String(valor ?? ''), avisar);
        const ehTarefa = !!this.deps.tarefa(caminho);
        const atualizar = (c: string, fn: (fm: Record<string, any>) => Patch | null) => (ehTarefa ? this.deps.atualizarTarefa(c, fn) : this.deps.atualizarNota(c, fn));
        const novo = valor === undefined ? null : clone(valor);
        let gravado: Patch | null = null;
        const r = await atualizar(caminho, fm => {
            const igual = JSON.stringify(fm[nome] ?? null) === JSON.stringify(novo ?? null);
            gravado = igual ? null : { [nome]: novo };
            return gravado;
        });
        if (!r.changed || !gravado) return this.falha(`${rotuloDoCampo}: já estava assim`, avisar);
        // O aviso mostra o valor como a tela o mostra (a prioridade pelo rótulo do catálogo).
        const rotulo = `${rotuloDoCampo}: ${mostrado || (novo === null ? 'vazio' : Array.isArray(novo) ? novo.join(', ') : String(novo))}`;
        this.deps.refrescar();
        this.pilha.registrar(this.entradaDoPatch(caminho, rotulo, r.before, gravado, ehTarefa ? 'tarefa' : 'nota'), avisar);
        return { ok: true, texto: rotulo };
    }

    /**
     * O que faz: grava vários campos de uma nota numa gravação só, com um Desfazer só (P9: o
     * "Informar saldo" grava o saldo e a data de hoje na nota da reserva). Os valores já vêm
     * conferidos; `null` apaga o campo. O Desfazer volta só o que ainda tem o valor gravado.
     * Erro e ataque: patch vazio ou igual ao que já está não grava nem entra na pilha.
     */
    async campos(caminho: string, patch: Record<string, unknown>, rotulo: string, avisar?: Avisar): Promise<ResultadoDaGravacao> {
        const ehTarefa = !!this.deps.tarefa(caminho);
        const atualizar = (c: string, fn: (fm: Record<string, any>) => Patch | null) => (ehTarefa ? this.deps.atualizarTarefa(c, fn) : this.deps.atualizarNota(c, fn));
        const novo = clone(patch ?? {}) as Record<string, unknown>;
        let gravado: Patch | null = null;
        const r = await atualizar(caminho, fm => {
            const mudou: Patch = {};
            for (const [k, v] of Object.entries(novo)) if (JSON.stringify(fm[k] ?? null) !== JSON.stringify(v ?? null)) mudou[k] = v as any;
            gravado = Object.keys(mudou).length ? mudou : null;
            return gravado;
        });
        if (!r.changed || !gravado) return this.falha(`${rotulo}: já estava assim`, avisar);
        this.deps.refrescar();
        this.pilha.registrar(this.entradaDoPatch(caminho, rotulo, r.before, gravado, ehTarefa ? 'tarefa' : 'nota'), avisar);
        return { ok: true, texto: rotulo };
    }

    /** O que faz: a entrada do Desfazer de um patch: volta só os campos que ainda têm o valor gravado. */
    private entradaDoPatch(caminho: string, rotulo: string, antes: Record<string, unknown>, gravado: Patch, onde: 'tarefa' | 'nota'): EntradaDoDesfazer {
        const atualizar = (c: string, fn: (fm: Record<string, any>) => Patch | null) => (onde === 'tarefa' ? this.deps.atualizarTarefa(c, fn) : this.deps.atualizarNota(c, fn));
        return {
            rotulo,
            desfazer: async () => {
                const aqui = onde === 'tarefa' ? (this.deps.localizar(caminho) ?? caminho) : caminho;
                let ficaram: string[] = [];
                const r = await atualizar(aqui, fm => {
                    const d = patchDeDesfazer(fm, antes, gravado);
                    ficaram = d.ficaram;
                    return d.patch;
                });
                if (r.changed) this.deps.refrescar();
                if (!r.changed) return { feito: false, texto: `Nada a desfazer: ${ficaram.length ? ficaram.join(', ') : 'a nota'} mudou depois (${rotulo})` };
                return { feito: true, texto: ficaram.length ? `Desfeito em parte: ${rotulo} (${ficaram.join(', ')} mudou depois e ficou)` : `Desfeito: ${rotulo}` };
            },
        };
    }

    /**
     * O que faz: troca o status (algum dia, cancelar, voltar a próxima…); `done` conclui, com
     * "Quando terminou?". O Desfazer volta o status de antes só se a tarefa ainda está no
     * status que o gesto deu.
     */
    async status(caminho: string, novo: string, avisar?: Avisar, rotuloDoGesto?: string): Promise<ResultadoDaGravacao> {
        const antes = String(this.deps.frontmatter(caminho)?.status ?? '').trim();
        if (antes === novo) return this.falha('Nada a mudar: já estava assim', avisar);
        // A que estava fechada (feita, cancelada) volta pelo `reopenTask`, que a tira do arquivo do TaskNotes.
        const reabre = novo !== 'done' && !!antes && this.deps.statusFechado(antes) && !this.deps.statusFechado(novo);
        const ok = novo === 'done' ? await this.deps.concluir(caminho) : reabre ? await this.deps.reabrir(caminho, novo) : await this.deps.status(caminho, novo);
        if (!ok) return { ok: false, texto: novo === 'done' ? 'Não concluída' : 'O status não mudou' };
        const rotulo = rotuloDoGesto ?? (novo === 'done' ? 'Concluída' : `Status: ${novo}`);
        this.deps.refrescar();
        this.pilha.registrar(this.entradaDoStatus(caminho, rotulo, antes, novo), avisar);
        return { ok: true, texto: rotulo };
    }

    private entradaDoStatus(caminho: string, rotulo: string, antes: string, depois: string): EntradaDoDesfazer {
        return {
            rotulo,
            desfazer: async () => {
                const aqui = this.deps.localizar(caminho);
                if (!aqui) return { feito: false, texto: `Nada a desfazer: a tarefa não está mais no cofre (${rotulo})` };
                const agora = String(this.deps.frontmatter(aqui)?.status ?? '').trim();
                if (agora !== depois) return { feito: false, texto: `Nada a desfazer: o status mudou depois (${rotulo})` };
                const volta = antes || 'next-action';
                const ok = this.deps.statusFechado(depois) ? await this.deps.reabrir(aqui, volta) : await this.deps.status(aqui, volta);
                if (ok) this.deps.refrescar();
                return ok ? { feito: true, texto: `Desfeito: ${rotulo}` } : { feito: false, texto: `Não deu para desfazer: ${rotulo}` };
            },
        };
    }

    /**
     * O que faz: arquiva a TaskNote (ou a tira do arquivo) pelo arquivo do TaskNotes, o mesmo gesto da
     * tela dele (a tag e a pasta `TaskNotes/Archive`), com o Desfazer, que faz o gesto contrário na nota
     * onde ela ficou.
     * Por quê: o menu de status oferece arquivar e excluir (02/11/2026).
     * Erro e ataque: o lugar sem o arquivo, a nota que sumiu e o TaskNotes que não mudou nada não gravam
     * nem entram na pilha; o Desfazer da nota que saiu dali depois diz que não há o que desfazer.
     * Prova: tests/missao/missaoWrites.test.ts ("Arquivar e Excluir").
     */
    async arquivar(caminho: string, sim: boolean, avisar?: Avisar, titulo?: string): Promise<ResultadoDaGravacao> {
        const arquivar = this.deps.arquivar;
        if (!arquivar) return this.falha('Este lugar não arquiva', avisar);
        if (!this.deps.localizar(caminho)) return this.falha('A tarefa não está mais no cofre', avisar);
        const nome = titulo || nomeDaNota(caminho);
        const depois = await arquivar(caminho, sim);
        if (!depois) return this.falha(sim ? `Não arquivou: ${nome}` : `Não saiu do arquivo: ${nome}`, avisar);
        const rotulo = sim ? STATUS.arquivada(nome) : STATUS.foraDoArquivo(nome);
        this.deps.refrescar();
        this.pilha.registrar({
            rotulo,
            desfazer: async () => {
                if (!this.deps.frontmatter(depois)) return { feito: false, texto: `Nada a desfazer: a tarefa saiu de ${depois} (${rotulo})` };
                const volta = await arquivar(depois, !sim);
                if (volta) this.deps.refrescar();
                return volta ? { feito: true, texto: `Desfeito: ${rotulo}` } : { feito: false, texto: `Não deu para desfazer: ${rotulo}` };
            },
        }, avisar);
        return { ok: true, texto: rotulo };
    }

    /**
     * O que faz: manda a nota para a lixeira do Obsidian (nunca apaga de vez); na `.trash` do cofre, o
     * Desfazer a traz de volta ao mesmo caminho (os links que apontavam para ela voltam a achar); na
     * lixeira do sistema, o aviso diz para recuperar por lá.
     * Por quê: o painel oferece excluir a tarefa direto, sem outro passo (02/11/2026).
     * A confirmação é da tela (uma linha no painel), antes de chamar aqui.
     * Erro e ataque: o lugar sem a lixeira e a nota que sumiu não gravam; o Desfazer com outra nota no
     * caminho, ou com a nota fora da lixeira, não sobrescreve nada e diz o porquê.
     * Prova: tests/missao/missaoWrites.test.ts ("Arquivar e Excluir").
     */
    async excluir(caminho: string, avisar?: Avisar, titulo?: string): Promise<ResultadoDaGravacao> {
        const lixeira = this.deps.lixeira;
        if (!lixeira) return this.falha('Este lugar não manda para a lixeira', avisar);
        const nome = titulo || nomeDaNota(caminho);
        const r = await lixeira(caminho);
        if (!r) return this.falha(`Não foi para a lixeira: ${nome}`, avisar);
        this.deps.refrescar();
        const naLixeira = r.naLixeira;
        const restaurar = this.deps.restaurar;
        if (!naLixeira || !restaurar) {
            const texto = STATUS.naLixeiraDoSistema(nome);
            if (avisar) avisar(texto);
            else this.pilha.avisar(texto);
            return { ok: true, texto };
        }
        const rotulo = STATUS.excluida(nome);
        this.pilha.registrar({
            rotulo,
            desfazer: async () => {
                const volta = await restaurar(naLixeira, caminho);
                if (volta === 'ok') { this.deps.refrescar(); return { feito: true, texto: `Desfeito: ${rotulo}` }; }
                return { feito: false, texto: volta === 'ocupado' ? `Nada a desfazer: outra nota está em ${caminho} (${rotulo})` : `Nada a desfazer: a nota não está mais na lixeira (${rotulo})` };
            },
        }, avisar);
        return { ok: true, texto: rotulo };
    }

    /** O que faz: concluir, pela conclusão única (pergunta "Quando terminou?"). */
    concluir(caminho: string, avisar?: Avisar): Promise<ResultadoDaGravacao> {
        return this.status(caminho, 'done', avisar, 'Concluída');
    }

    /**
     * O que faz: "Nova data": agenda no dia e, se a tarefa estava em algum dia, volta a ser a
     * próxima. Um Desfazer só para as duas gravações.
     */
    async novaData(caminho: string, data: string, statusAberto: string, emAlgumDia: boolean, avisar?: Avisar): Promise<ResultadoDaGravacao> {
        const tarefa = this.deps.tarefa(caminho);
        if (!tarefa) return this.falha('A tarefa não está mais no cofre', avisar);
        const intencao: Intencao = { gesto: 'dia', data };
        const ctx = this.deps.contexto();
        const previa = patchDoGesto(this.deps.frontmatter(caminho) ?? {}, tarefa, intencao, ctx);
        if (previa.problema) return this.falha(`Não mudou: ${previa.problema}`, avisar);
        let gravado: Patch | null = null;
        const r = await this.deps.atualizarTarefa(caminho, fm => { const p = patchDoGesto(fm, tarefa, intencao, ctx); gravado = p.patch; return p.patch; });
        const statusAntes = String(this.deps.frontmatter(caminho)?.status ?? '').trim();
        const mudouStatus = emAlgumDia && statusAntes !== statusAberto && await this.deps.status(caminho, statusAberto);
        if (!(r.changed && gravado) && !mudouStatus) return this.falha('Nada a mudar: já estava assim', avisar);
        const rotulo = `Nova data: ${rotuloDoGesto(tarefa, intencao).split(' → ').pop()}`;
        const texto = rotulo + this.cargaDoDia(caminho, diaDoGesto(gravado, tarefa, intencao));
        const datas = r.changed && gravado ? this.entradaDoPatch(caminho, rotulo, r.before, gravado, 'tarefa') : null;
        const st = mudouStatus ? this.entradaDoStatus(caminho, rotulo, statusAntes, statusAberto) : null;
        this.deps.refrescar();
        this.pilha.registrar({
            rotulo,
            desfazer: async () => {
                const a = st ? await st.desfazer() : null;
                const b = datas ? await datas.desfazer() : null;
                const feito = !!(a?.feito || b?.feito);
                return { feito, texto: feito ? `Desfeito: ${rotulo}` : (b ?? a)!.texto };
            },
        }, avisar, texto);
        return { ok: true, texto };
    }

    /** O que faz: 🤝 Fazer agora: abre o gesto com a tarefa (não grava aqui; o gesto grava no fim). */
    fazerAgora(caminho: string, motivos?: readonly WeightReason[]): void {
        this.deps.fazerAgora(caminho, motivos);
    }

    /**
     * O que faz: marca ou acrescenta um item da checklist da nota (29/10): só a linha do item muda
     * (`checklist.ts`), pelo texto do momento (`vault.process`), com o Desfazer na pilha única.
     * Por quê: os itens da checklist também viram nós no ramo (29/10/2026): o painel marca o item no lugar.
     * Erro e ataque: a linha que mudou depois da leitura, o item vazio e o mesmo estado não gravam nem
     * entram na pilha; o Desfazer volta só se a linha ainda é a que o gesto escreveu.
     */
    async checklist(caminho: string, gesto: GestoDaChecklist, avisar?: Avisar): Promise<ResultadoDaGravacao> {
        const processar = this.deps.processarTexto;
        if (!processar) return this.falha(`${CHECKLIST.titulo}: este lugar não grava o texto da nota`, avisar);
        let feita: EdicaoDaChecklist | null = null;
        const mudou = await processar(caminho, texto => {
            feita = gesto.via === 'marcar' ? marcarItem(texto, gesto.linha, gesto.feito, gesto.texto) : acrescentarItem(texto, gesto.texto);
            return 'texto' in feita ? feita.texto : null;
        });
        const e = feita as EdicaoDaChecklist | null;
        if (!mudou || !e || !('texto' in e)) {
            const porque = e && 'problema' in e ? (e.problema === 'igual' ? 'já estava assim' : e.problema === 'vazio' ? CHECKLIST.escrevaOItem : CHECKLIST.mudou) : 'a nota não está mais no cofre';
            return this.falha(`${CHECKLIST.titulo}: ${porque}`, avisar);
        }
        const linha = e.linha;
        const rotulo = gesto.via === 'marcar' ? (gesto.feito ? CHECKLIST.marcado(gesto.texto) : CHECKLIST.desmarcado(gesto.texto)) : CHECKLIST.acrescentado(gesto.texto.trim());
        this.deps.refrescar();
        this.pilha.registrar({
            rotulo,
            desfazer: async () => {
                let ok = false;
                await processar(caminho, texto => {
                    const d = gesto.via === 'marcar' ? marcarItem(texto, linha, !gesto.feito, gesto.texto) : tirarItem(texto, linha, gesto.texto);
                    ok = 'texto' in d;
                    return 'texto' in d ? d.texto : null;
                });
                if (ok) this.deps.refrescar();
                return ok ? { feito: true, texto: `Desfeito: ${rotulo}` } : { feito: false, texto: `Nada a desfazer: a linha mudou depois (${rotulo})` };
            },
        }, avisar);
        return { ok: true, texto: rotulo };
    }

    /** O que faz: ⌘Z: desfaz a última da pilha única. */
    desfazer(avisar?: Avisar): Promise<ResultadoDoDesfazer> {
        return this.pilha.desfazerUltimo(avisar);
    }

    private falha(texto: string, avisar?: Avisar): ResultadoDaGravacao {
        if (avisar) avisar(texto);
        else this.pilha.avisar(texto);
        return { ok: false, texto };
    }
}
