/**
 * Os sinais das conferências do plano da semana: a tarefa agendada fora da semana dela, a data planejada
 * depois do prazo, os dias úteis sem nada marcado e o projeto com tarefa na semana e fora do foco do trimestre.
 *
 * Por quê: o inventário do painel antigo aposentado (02/11/2026, item 8; o que ele fazia bem se incorpora).
 * As contas mudaram de casa para o motor (`engine/conferenciasDoPlano.ts`), que o
 * plano e o grafo antigos também leem; aqui elas viram sinais da Missão, na forma de todos: o fato, a data e o
 * próximo passo (um gesto que já existe). Descrevem o plano e os dados, nunca a pessoa: o dia vazio é
 * informação de onde a semana tem espaço, não um pedido (a semana é de quem a planeja), e o dia que passou não entra.
 *
 * Módulo puro (chamado por `sinais`, do mesmo módulo). Prova: tests/missao/sinaisDoPlano.test.ts.
 */
import { agendadaForaDaSemana, diasUteisVazios, planejadaDepoisDoPrazo, projetoForaDoFoco } from '../engine/conferenciasDoPlano';
import { weekDates } from '../engine/calendario';
import { weekGrammar } from '../engine/tarefasNoPeriodo';
import type { MissaoEntrada } from './entrada';
import type { MissaoIndice, MissaoTarefa, ProximoPasso, Sinal } from './tipos';
import { ehDia } from './formatos';
import { addWeeks, chaveDeHoje, diaDaSemana, diaMes, semanaCurta } from './tempo';

const MOVER: ProximoPasso = { acao: 'mover-para', rotulo: 'Mover para…' };

/** O que faz: a data `AAAA-MM-DD` de um campo (a hora sai); o que não é dia, vazio. */
const diaDoCampo = (v: unknown) => { const d = String(v ?? '').trim().slice(0, 10); return ehDia(d) ? d : ''; };

/**
 * O que faz: as semanas que se conferem: a de hoje e, no sábado e no domingo, também a seguinte (a que se
 * planeja no domingo).
 * Entra → sai: hoje → as chaves `AAAA-Www`, a de hoje primeiro.
 */
export function semanasDoPlano(hoje: string): string[] {
    const semana = chaveDeHoje('semana', hoje);
    const dia = new Date(`${hoje}T00:00:00Z`).getUTCDay();
    return dia === 0 || dia === 6 ? [semana, addWeeks(semana, 1)] : [semana];
}

/**
 * O que faz: os sinais de data de uma tarefa aberta: a agendada fora da semana que ela declara
 * (`fora-da-semana`) e a data planejada depois do prazo (`depois-do-prazo`).
 * Por quê: as duas são contradições do próprio plano, e quem decide qual data vale é quem planeja; o "Mover para…"
 * grava o dia e a semana juntos.
 * Entra → sai: a tarefa e hoje → `Sinal[]`.
 * Erro e ataque: a que ficou de antes já tem o sinal dela (não repete); o prazo que já passou é o
 * `prazo-vencido` (não repete); a semana malformada e a data sem dia não dão sinal.
 */
export function sinaisDeDataDaTarefa(t: MissaoTarefa, hoje: string): Sinal[] {
    const out: Sinal[] = [];
    if (!t.aberta || t.deAntes) return out;
    const r = t.record;
    const agendado = diaDoCampo(r.scheduled);
    const semana = String(r.week ?? '').trim();
    const dias = weekDates(semana);
    if (agendado && dias.length === 7 && agendadaForaDaSemana(agendado, dias[0], dias[6])) {
        out.push({ tipo: 'fora-da-semana', alvo: t.id, fato: `da ${semanaCurta(semana)} e marcada para ${diaMes(agendado)}, fora dela`, desde: agendado, proximoPasso: MOVER });
    }
    const prazo = diaDoCampo(r.due);
    if (prazo && prazo >= hoje && planejadaDepoisDoPrazo(agendado, prazo)) {
        out.push({ tipo: 'depois-do-prazo', alvo: t.id, fato: `marcada para ${diaMes(agendado)}, depois do prazo em ${diaMes(prazo)}`, desde: prazo, proximoPasso: MOVER });
    }
    return out;
}

/**
 * O que faz: os sinais da semana do plano: os dias úteis sem nada marcado (`dia-util-vazio`, no nó da
 * semana) e o projeto com tarefa aberta na semana e fora do foco do trimestre (`fora-do-foco`, no nó do
 * projeto), nas semanas de `semanasDoPlano`.
 * Por quê: o dia útil vazio diz onde a semana tem espaço; o projeto fora do foco é uma decisão a conferir
 * (ou ele entra no foco, pelo 🧭, ou a tarefa não é desta semana). Os dois são informação: nenhum julga.
 * Entra → sai: o índice, o foco do trimestre (`entrada.foco`, vazio sem `projetos_foco`), hoje e as semanas
 * que já têm o sinal de sem plano → `Sinal[]`.
 * Erro e ataque: o dia que já passou não conta (a falta de registro não é dado contra nada); a semana sem
 * plano (o `semana-sem-plano`, ou nada no horizonte) não ganha também os dias vazios; a tarefa só da semana
 * (sem dia) não marca dia; sem `projetos_foco` não há foco declarado, e nenhum projeto está fora; a tarefa
 * recorrente (🌳, 💰) é rotina, não plano, e não conta para o foco; a semana de outro trimestre não se
 * confere contra este foco.
 */
export function sinaisDaSemanaDoPlano(indice: MissaoIndice, entrada: Pick<MissaoEntrada, 'foco'>, hoje: string, semPlano: ReadonlySet<string>): Sinal[] {
    const out: Sinal[] = [];
    const trimestre = chaveDeHoje('trimestre', hoje);
    const foco = entrada.foco ?? [];
    const marcados = new Set(indice.vivas.filter(t => t.colocacao.lugar === 'linha' && t.colocacao.dia && !t.colocacao.daSemana).map(t => t.colocacao.dia as string));
    for (const semana of semanasDoPlano(hoje)) {
        const dias = weekDates(semana);
        const segunda = dias[0] ?? hoje;
        const w = semanaCurta(semana);
        const temPlano = !semPlano.has(`w:${semana}`) && weekGrammar(semana, indice.registros, '').shown;
        const vazios = temPlano ? diasUteisVazios(dias.filter(d => d >= hoje), marcados) : [];
        if (vazios.length) {
            const lista = vazios.map(d => `${diaDaSemana(d)} ${diaMes(d)}`).join(', ');
            out.push({ tipo: 'dia-util-vazio', alvo: `w:${semana}`, fato: `${vazios.length === 1 ? 'dia útil' : 'dias úteis'} da ${w} sem nada marcado: ${lista}`, desde: segunda, proximoPasso: { acao: 'mais-acao', rotulo: '+ Nova tarefa' } });
        }
        if (!foco.length || chaveDeHoje('trimestre', segunda) !== trimestre) continue;
        const porProjeto = new Map<string, number>();
        for (const t of indice.vivas) {
            if (!t.aberta || !t.projeto || t.record.recurrence || t.colocacao.semana !== semana) continue;
            porProjeto.set(t.projeto, (porProjeto.get(t.projeto) ?? 0) + 1);
        }
        for (const [id, n] of porProjeto) {
            const p = indice.projetos.get(id);
            if (!p || !projetoForaDoFoco(p.nome, foco)) continue;
            const q = trimestre.slice(5);
            out.push({ tipo: 'fora-do-foco', alvo: id, fato: `${n} ${n === 1 ? 'tarefa aberta' : 'tarefas abertas'} na ${w}, e o projeto não está no foco do ${q}`, desde: segunda, proximoPasso: MOVER });
        }
    }
    return out;
}
