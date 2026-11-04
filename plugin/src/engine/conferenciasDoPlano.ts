/**
 * As conferências do plano da semana: a agendada fora da semana dela, o dia útil sem nada marcado, a data
 * planejada depois do prazo e o projeto com tarefa na semana e fora do foco do trimestre.
 *
 * Por quê: o inventário da aposentadoria (02/11, seção O que se reaproveita, item 8): as quatro contas moravam
 * escritas no meio do plano (`missionPlan`, os avisos da semana) e do grafo (`missionGraph`, as violações),
 * que só o painel antigo mostrava. As recomendações do inventário foram aprovadas em 02/11/2026. As contas
 * mudaram de casa para cá, com um dono só: o plano e o grafo antigos leem daqui, e a Missão também
 * (`missao/sinais.ts`, os sinais do plano).
 *
 * Funções puras: sem relógio, sem cofre; as datas chegam escritas (`AAAA-MM-DD`, a hora é ignorada).
 * Prova: tests/engine/conferenciasDoPlano.test.ts.
 */
import { diaNoInicio } from './dia';

/** O que faz: a data `AAAA-MM-DD` do começo de um texto (`2026-11-04T09:00` → `2026-11-04`); sem data, vazio. */
const diaDe = (texto: unknown) => diaNoInicio(String(texto ?? '').trim());

/**
 * O que faz: diz se o dia agendado cai fora da semana (de `inicio` a `fim`, os dois inclusos).
 * Por quê: a tarefa que declara a semana e um dia fora dela tem uma das duas datas a conferir, e quem decide
 * qual é ele (era o `agendada-fora-da-semana` do plano e a violação `agenda` do grafo).
 * Entra → sai: o agendado, o primeiro e o último dia da semana → sim/não.
 * Erro e ataque: sem agendado, ou sem a semana, não há o que conferir (não); a hora do agendado não conta
 * (`2026-11-09T09:00` é o dia 09).
 * Prova: tests/engine/conferenciasDoPlano.test.ts ("fora da semana").
 */
export function agendadaForaDaSemana(agendado: unknown, inicio: string, fim: string): boolean {
    const dia = diaDe(agendado);
    if (!dia || !diaDe(inicio) || !diaDe(fim)) return false;
    return dia < diaDe(inicio) || dia > diaDe(fim);
}

/**
 * O que faz: diz se a data planejada vem depois do prazo.
 * Por quê: a intenção depois do prazo é uma contradição do próprio plano (era a violação `agenda` do grafo,
 * "a intenção está depois do prazo").
 * Entra → sai: o agendado e o prazo → sim/não.
 * Erro e ataque: sem uma das duas datas, não; a hora não conta, então o mesmo dia não é "depois".
 * Prova: tests/engine/conferenciasDoPlano.test.ts ("depois do prazo").
 */
export function planejadaDepoisDoPrazo(agendado: unknown, prazo: unknown): boolean {
    const a = diaDe(agendado), p = diaDe(prazo);
    return !!a && !!p && a > p;
}

/** O que faz: o dia da semana ISO de uma data (1 = segunda … 7 = domingo); data malformada, `null`. */
function diaDaSemanaIso(dia: string): number | null {
    const t = Date.parse(`${dia}T00:00:00Z`);
    return Number.isNaN(t) ? null : new Date(t).getUTCDay() || 7;
}

/**
 * O que faz: os dias úteis (segunda a sexta) de uma lista que não têm nada marcado, na ordem da lista.
 * Por quê: era o `dia-vazio` do plano ("dia útil sem nada agendado"): a informação de onde a semana tem
 * espaço, sem pedir nada; a semana é dele.
 * Entra → sai: os dias (`AAAA-MM-DD`) e o conjunto dos dias com alguma coisa marcada → os dias vazios.
 * Erro e ataque: o sábado e o domingo nunca entram; a data malformada fica de fora; o mesmo dia repetido
 * sai uma vez.
 * Prova: tests/engine/conferenciasDoPlano.test.ts ("dia útil vazio").
 */
export function diasUteisVazios(dias: readonly string[], marcados: ReadonlySet<string>): string[] {
    const out: string[] = [];
    for (const d of dias) {
        const dia = diaDe(d);
        const semana = dia ? diaDaSemanaIso(dia) : null;
        if (!semana || semana > 5 || marcados.has(dia) || out.includes(dia)) continue;
        out.push(dia);
    }
    return out;
}

/** O que faz: a chave comparável de um nome de projeto: `[[X]]`, `[[X|y]]`, `X` e ` x ` são o mesmo. */
export function chaveDoProjeto(nome: unknown): string {
    return String(nome ?? '').trim().replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0].trim().normalize('NFC').toLowerCase();
}

/**
 * O que faz: diz se um projeto está fora da lista de foco do trimestre.
 * Por quê: o projeto com tarefa aberta na semana e fora do `projetos_foco` é uma decisão a conferir (ou ele
 * entra no foco, ou a tarefa não é desta semana); era a violação `foco` do grafo.
 * Entra → sai: o nome do projeto e a lista de foco → sim/não.
 * Erro e ataque: o nome vazio não está fora de nada (não); `[[X]]`, `[[X|y]]` e a caixa diferente são o
 * mesmo projeto. A lista vazia deixa todo projeto fora: quem chama decide se a falta da lista é dado.
 * Prova: tests/engine/conferenciasDoPlano.test.ts ("fora do foco").
 */
export function projetoForaDoFoco(nome: unknown, foco: readonly unknown[]): boolean {
    const chave = chaveDoProjeto(nome);
    if (!chave) return false;
    return !foco.some(f => chaveDoProjeto(f) === chave);
}
