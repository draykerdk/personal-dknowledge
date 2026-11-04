/**
 * "Registrar o que fiz": o que foi feito fora do plano vira uma TaskNote já feita, no dia dito.
 *
 * Por quê: a arquitetura da página Missão (27/10/2026, §8.7) e o plano (3d.2): "registrar o
 * que fiz" cria a TaskNote já feita, com a conclusão no dia dito, **sem `scheduled` e sem
 * `week`** (a herança da semana não vale para o registro, mesmo ligado a uma SMART), com
 * `origem: registrar_feito`; projeto e onde são opcionais; o quanto levou vai para o registro
 * dos blocos (a reputação contextual), e não para a estimativa. A conclusão é a de sempre
 * (`completeTask` com `{ when }`): a linha no dia dito, ou na Week sem criar a Day, e a hora
 * real na reputação. Sem horizonte, a tarefa conta como "fora do plano" em toda escala, pela
 * função única (`showGrammar`).
 *
 * Não há Desfazer: a conclusão pontua (a gamificação), escreve a linha na Day ou na Week e
 * entra no registro dos blocos; desfazer só a nota deixaria o resto pela metade.
 *
 * O cálculo é puro (`pedidoDoRegistro`, `linhasDoRegistro`); a criação e a conclusão chegam
 * pela borda (`DepsDoRegistro`). Prova: tests/missao/registrarFeito.test.ts.
 */
import type { CompletionWhen } from '../board/taskCompletion';
import { TASK_CONTEXTS } from '../engine/taskContexts';
import { pedidoDoFrontmatter, TIPO_DA_TAREFA, type PedidoDeCriacao } from '../engine/tasknotesCreate';
import { addDays } from './tempo';
import { DIA } from './formatos';
import type { RegistroDoFeito } from './tipos';

/** A `origem` do registro (convencoes.md, "Tarefas"). */
export const ORIGEM_DO_REGISTRO = 'registrar_feito';

export type PedidoDoRegistro =
    | { ok: true; frontmatter: Record<string, unknown>; quando: CompletionWhen }
    | { ok: false; problema: string };

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const texto = (v: unknown) => String(v ?? '').trim();
const diaValido = (d: string) => DIA.test(d) && addDays(d, 0) === d;

/** O que faz: o nome de um link digitado (`[[Nota|x]]`, `Pasta/Nota.md`, `Nota`). */
function nomeDoLink(v: unknown): string {
    return texto(v).replace(/^\[\[|\]\]$/g, '').split('|')[0].split('/').pop()!.replace(/\.md$/, '').trim();
}

/**
 * O que faz: confere o registro e devolve o frontmatter inicial da TaskNote e a resposta do
 * "Quando terminou?" (o dia dito, a hora, o onde e o quanto levou).
 * Por quê: §8.7: sem `scheduled` e sem `week` (nem herdados), com a `origem`; os minutos não
 * viram `timeEstimate`.
 * Entra → sai: o registro, hoje e a hora de agora (`HH:MM`, opcional) → o pedido, ou o problema.
 * Erro e ataque: título vazio ou de várias linhas; dia que não existe ou no futuro; hora fora
 * do formato ou depois de agora, hoje; onde fora dos contextos; minutos que não são inteiro
 * positivo (até 24 h), ou sem o onde (o registro dos blocos guarda o tempo junto do lugar).
 * Prova: tests/missao/registrarFeito.test.ts ("o pedido").
 */
export function pedidoDoRegistro(r: RegistroDoFeito, hoje: string, agora?: string | null): PedidoDoRegistro {
    const erro = (problema: string): PedidoDoRegistro => ({ ok: false, problema });
    const titulo = texto(r?.titulo);
    if (!titulo) return erro('O que fiz: escreva o que foi feito');
    if (/\n/.test(titulo)) return erro('O que fiz: uma linha por registro');
    const dia = texto(r?.dia);
    if (!diaValido(dia)) return erro('O dia é AAAA-MM-DD');
    if (dia > hoje) return erro('O dia ainda não chegou: registre depois de feito');
    const hora = texto(r?.hora) || null;
    if (hora && !HORA.test(hora)) return erro('A hora é HH:MM');
    if (hora && dia === hoje && agora && HORA.test(agora) && hora > agora) return erro('A hora ainda não chegou');
    const onde = texto(r?.onde) || null;
    if (onde && !(TASK_CONTEXTS as readonly string[]).includes(onde)) return erro(`Onde: “${onde}” não está entre os contextos`);
    const cru = r?.minutos;
    const temMinutos = !(cru === undefined || cru === null || texto(cru) === '');
    const minutos = temMinutos ? Number(texto(cru).replace(',', '.')) : null;
    if (temMinutos && (!Number.isInteger(minutos) || minutos! <= 0 || minutos! > 24 * 60)) return erro('Quanto levou: minutos inteiros, de 1 a 1440');
    if (temMinutos && !onde) return erro('Quanto levou vai junto com o onde (o registro dos blocos guarda o tempo com o lugar)');
    const projeto = nomeDoLink(r?.projeto);

    const frontmatter: Record<string, unknown> = { title: titulo, origem: ORIGEM_DO_REGISTRO };
    if (projeto) frontmatter.projects = [`[[${projeto}]]`];
    if (onde) frontmatter.contexts = [onde];
    const choice: CompletionWhen['choice'] = dia === hoje ? 'mais_cedo' : dia === addDays(hoje, -1) ? 'ontem' : 'outro_dia';
    const quando: CompletionWhen = { choice, date: dia, time: hora, ...(onde ? { lugar: onde } : {}), ...(minutos !== null ? { bloco_min: minutos } : {}) };
    return { ok: true, frontmatter, quando };
}

/**
 * O que faz: as linhas de um texto ("Uma linha por coisa", a pergunta do 🌙): cada linha
 * não vazia, sem o marcador de lista do começo, sem repetir.
 * Erro e ataque: texto vazio, só espaços, `- [ ]`, `•`, `1.`; a mesma linha duas vezes.
 * Prova: tests/missao/registrarFeito.test.ts ("as linhas").
 */
export function linhasDoRegistro(textoLivre: unknown): string[] {
    const vistas = new Set<string>();
    const out: string[] = [];
    for (const bruta of String(textoLivre ?? '').split(/\r?\n/)) {
        const linha = bruta.replace(/^\s*(?:[-*•]\s*(?:\[[ xX]?\]\s*)?|\d+[.)]\s+)/, '').trim();
        if (!linha || vistas.has(linha.toLowerCase())) continue;
        vistas.add(linha.toLowerCase());
        out.push(linha);
    }
    return out;
}

/** Os efeitos do registro (a borda dá): criar pela API do TaskNotes e a conclusão única. */
export interface DepsDoRegistro {
    /** `tasknotesBridge.createTaskViaApi`: devolve o caminho. */
    criar(pedido: PedidoDeCriacao): Promise<string>;
    /** `MissionBoard.completeTask(caminho, { when })`: a conclusão de sempre, sem perguntar de novo. */
    concluir(caminho: string, quando: CompletionWhen): Promise<boolean>;
}

export interface ResultadoDoRegistro { ok: boolean; texto: string; caminho?: string }

/**
 * O que faz: registra o que foi feito: confere, cria a TaskNote pela API do TaskNotes (com o
 * `type`, sem `scheduled`) e conclui no dia dito.
 * Entra → sai: os efeitos, o registro, hoje e agora → o resultado, com o aviso em palavras.
 * Erro e ataque: o problema do registro não cria nada; a recusa do TaskNotes vira aviso; a
 * criada que não concluiu fica na lista, e o aviso diz.
 * Prova: tests/missao/registrarFeito.test.ts ("o registro").
 */
export async function registrarFeito(deps: DepsDoRegistro, r: RegistroDoFeito, hoje: string, agora?: string | null): Promise<ResultadoDoRegistro> {
    const p = pedidoDoRegistro(r, hoje, agora);
    if (p.ok === false) return { ok: false, texto: `Não registrou: ${p.problema}` };
    const pedido = pedidoDoFrontmatter(p.frontmatter, TIPO_DA_TAREFA);
    let caminho: string;
    try {
        caminho = await deps.criar(pedido);
    } catch (e) {
        return { ok: false, texto: `Não registrou: ${(e as Error)?.message ?? e}` };
    }
    const feito = await deps.concluir(caminho, p.quando);
    if (!feito) return { ok: false, texto: `Criada, mas não concluída: ${pedido.title} (conclua pela tarefa)`, caminho };
    return { ok: true, texto: `Registrado como feito: ${pedido.title}`, caminho };
}
