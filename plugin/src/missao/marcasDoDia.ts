/**
 * As marcas 📤 no ar e 🎭 exposições do nó do dia (P9; o plano, §3, "o uso de todo dia": "as
 * marcas 📤 no ar e 🎭 exposições · os registros"); o 📤 da semana e a marca de um ramo (o ✈️ da
 * Viagem) no dia e na semana (02/11, o que a Missão trouxe dos canvas da semana e do trimestre).
 *
 * Por quê: as duas contagens já existem e têm dono: o "no ar" é a peça 📤 concluída (`peca:
 * soltar`, `releasedOnDay`, a mesma regra do "📤 N no ar" da semana no trimestre) e a exposição é
 * o registro `exposicao` com `data` e `trilha` (convencoes.md, a seção das exposições). Aqui só se
 * conta o dia e se escreve a marca discreta, com o texto inteiro na dica; o zero não aparece.
 *
 * Módulo puro. Prova: tests/missao/marcasDoDia.test.ts.
 */
import { TRILHAS_EXPOSICAO } from '../engine/exposicoes';
import { releasedInWeek, releasedOnDay, type BlockTask } from '../engine/tarefasNoPeriodo';

/** Uma marca discreta: o que o nó mostra e o texto inteiro (a dica e a linha do painel). */
export interface MarcaDoDia { marca: string; dica: string }

/**
 * O que faz: a marca "📤 N" das peças 📤 concluídas no dia, com os títulos na dica; nenhuma, `null`.
 * Erro e ataque: a peça sem data de conclusão, a aberta e a de outro dia não contam.
 */
export function marcaDoNoAr(dia: string, tarefas: readonly BlockTask[]): MarcaDoDia | null {
    const pecas = releasedOnDay(dia, tarefas);
    if (!pecas.length) return null;
    const nomes = pecas.map(t => t.title || t.basename).filter(Boolean);
    return { marca: `📤 ${pecas.length}`, dica: `📤 ${pecas.length} no ar neste dia${nomes.length ? `: ${nomes.join(', ')}` : ''}` };
}

/**
 * O que faz: a marca "🎭 N" dos registros `exposicao` do dia, com as trilhas na dica (🤝 social ·
 * 💡 ideias · 🌍 mundo, o zerado fora); nenhum, `null`.
 * Erro e ataque: registro sem data ou de outro dia não conta; trilha desconhecida conta no total, sem ícone.
 */
export function marcaDasExposicoes(dia: string, registros: ReadonlyArray<{ data: string; trilha: string | null }>): MarcaDoDia | null {
    const doDia = (registros ?? []).filter(r => r.data === dia);
    if (!doDia.length) return null;
    const trilhas = TRILHAS_EXPOSICAO.map(t => [t.icone, doDia.filter(r => r.trilha === t.chave).length] as const).filter(([, n]) => n > 0);
    const n = doDia.length;
    return { marca: `🎭 ${n}`, dica: `🎭 ${n} ${n === 1 ? 'exposição' : 'exposições'} neste dia${trilhas.length ? ` (${trilhas.map(([i, k]) => `${i} ${k}`).join(' · ')})` : ''}` };
}

/**
 * O que faz: a marca "📤 N" das peças 📤 concluídas na semana (`releasedInWeek`, a conta do "📤 N no ar" da célula
 * da semana no canvas do trimestre), com os títulos na dica; nenhuma, `null`.
 * Por quê: o inventário da aposentadoria (fase 2, item 2): a semana no ramo do trimestre diz o que foi ao ar, como
 * a célula dela no canvas dizia; a mesma forma da marca do dia (a discreta, com o texto inteiro na dica).
 * Erro e ataque: a aberta e a de outra semana não contam; a sem data de conclusão vale pela `week` dela.
 */
export function marcaDoNoArNaSemana(semana: string, tarefas: readonly BlockTask[]): MarcaDoDia | null {
    const pecas = releasedInWeek(semana, tarefas);
    if (!pecas.length) return null;
    const nomes = pecas.map(t => t.title || t.basename).filter(Boolean);
    return { marca: `📤 ${pecas.length}`, dica: `📤 ${pecas.length} no ar nesta semana${nomes.length ? `: ${nomes.join(', ')}` : ''}` };
}

/** Quantos títulos a dica da marca de um ramo diz, no máximo (o resto conta em "+N"). */
export const TITULOS_NA_DICA = 3;

/**
 * O que faz: a marca de um ramo num período (o ✈️ da Viagem no dia ou na semana): o emoji, com o título do ramo
 * e as tarefas do recorte que caem ali na dica ("✈️ Viagem neste dia: Partida, Check-out +1"); nenhuma, `null`.
 * Por quê: o inventário da aposentadoria (fase 2, item 1): a linha "✈️ Deslocamentos" do canvas da semana e a
 * marca "✈️ viagem" da semana no canvas do trimestre; quem diz quais tarefas são do ramo é o recorte dele
 * (`noRecorteDoRamo`), na borda, e aqui só se escreve a marca.
 * Entra → sai: a marca do ramo, os títulos das tarefas dele no período e onde ("neste dia", "nesta semana").
 * Erro e ataque: sem tarefa, `null`; os títulos vazios não entram na dica; mais de três contam em "+N".
 */
export function marcaDoRamoNoPeriodo(ramo: { marca: string; titulo: string }, titulos: readonly string[], onde: string): MarcaDoDia | null {
    const nomes = titulos.map(t => String(t ?? '').trim()).filter(Boolean);
    if (!titulos.length) return null;
    const mais = nomes.length > TITULOS_NA_DICA ? ` +${nomes.length - TITULOS_NA_DICA}` : '';
    return { marca: ramo.marca, dica: `${ramo.marca} ${ramo.titulo} ${onde}${nomes.length ? `: ${nomes.slice(0, TITULOS_NA_DICA).join(', ')}${mais}` : ''}` };
}
