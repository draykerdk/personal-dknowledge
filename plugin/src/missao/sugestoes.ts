/**
 * As sugestões dos campos do Novo: de onde vem o valor de partida de cada campo, sempre com
 * o porquê em palavras.
 *
 * Por quê: a arquitetura da página Missão (27/10/2026, §4.2): o campo do modelo do tipo
 * declara `sugestao`, uma lista de fontes em ordem; "a primeira fonte com valor vence,
 * sempre com o porquê", e as fontes são uma lista fechada (`SUGGESTION_SOURCES`), resolvida
 * numa função pura só. O que o Novo sabe do lugar onde abriu (a linha, o nó, o "Onde estou",
 * a SMART mãe) chega pronto no contexto; aqui nada lê o cofre.
 *
 * A fonte `checklist` (30/10) lê as checagens de uma nota de função, que a borda dá já lidas
 * (`ctx.checklist`); a nota ainda não lida não tem valor, e a próxima fonte vale até ela chegar.
 *
 * As fontes que o cofre ainda não sustenta devolvem "sem valor" (`null`), e a próxima da
 * lista vale: `trimestre_alvo` (o 🧭 escolhe o trimestre-alvo pela nota aberta e pelo
 * deslocamento, não há regra pura dele fora do motor).
 *
 * Módulo puro: sem Obsidian e sem DOM. Prova: tests/missao/sugestoes.test.ts.
 */
import type { DomainField, FieldSuggestion, SuggestionSource } from '../engine/domainModel';
import { linkDoNome } from '../engine/fieldModel';
import { quarterOfWeek } from '../engine/calendario';
import { partesDoDia } from './formatos';
import { addWeeks, chaveDeHoje, diaDaSemana, diaMes, isChaveEspecial, semanaCurta, trimestreDoDia, type Escala } from './tempo';
import { ehSemana } from './formatos';

/** Um nó de onde o Novo abriu (ou que o nó dá): o nome que o link grava. */
export interface NoDaSugestao { nome: string }

/** As espécies de nó que as fontes `no.*` leem. */
export type FonteDoNo = 'smart' | 'projeto' | 'central' | 'area' | 'cidade' | 'pais';

/** O que o Novo sabe do lugar onde abriu, já lido (a borda e o modelo dão). */
export interface ContextoDaSugestao {
    hoje: string;
    /** A linha onde o Novo abriu: a escala e a chave (a prateleira não sugere data). */
    linha: { escala: Escala; chave: string } | null;
    /** Os nós da origem: o próprio nó e o que ele dá (a SMART dá o projeto, o projeto dá a área). */
    no: Partial<Record<FonteDoNo, NoDaSugestao>>;
    /** O fio: o projeto da tarefa ou da SMART de onde o Novo abriu. */
    fio: { projeto?: NoDaSugestao };
    /** O "Onde estou" da Missão (um contexto do vocabulário), ou `null`. */
    onde: string | null;
    /** O lugar do dia da linha: viagem = dia de trajeto. */
    lugarDoDia: { viagem: boolean; texto: string } | null;
    /** A passagem mais recente (a última chegada): a cidade e o país. */
    ultimoLugar: { cidade: string; pais: string | null } | null;
    /** A SMART mãe: o nome e o frontmatter dela (a herança, `heranca.smart`). */
    heranca: { nome: string; campos: Record<string, unknown> } | null;
    /** Os contextos do vocabulário (o de trajeto é o do celular). */
    contextos: readonly string[];
    /** O valor atual da nota (criar: nada). */
    nota: Record<string, unknown> | null;
    /**
     * As checagens da nota de função de um caminho (a fonte `checklist`, 30/10), já lidas pela borda:
     * o nome da nota e os itens; `null` = a nota não existe ou ainda não foi lida.
     */
    checklist?: (caminho: string) => { nome: string; itens: readonly string[] } | null;
}

/** Uma sugestão: o valor, o porquê e a fonte que deu. */
export interface Sugestao { valor: unknown; porque: string; de: SuggestionSource }

const vazio = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);

/** O que faz: o dia ISO da semana (1 = segunda … 7 = domingo) de `AAAA-MM-DD`; inválido → 0. */
function diaIso(dia: string): number {
    const p = partesDoDia(String(dia ?? ''));
    if (!p) return 0;
    const d = new Date(Date.UTC(p.ano, p.mes - 1, p.dia));
    return Number.isNaN(d.getTime()) ? 0 : d.getUTCDay() || 7;
}

/**
 * O que faz: a semana sendo planejada: de sexta a domingo, a próxima; de segunda a quinta, a
 * de hoje (a mesma regra do `{{planweek}}` do motor, `templateTokens.planWeekStart`).
 * Entra → sai: hoje → `AAAA-Www`; dia inválido → `''`.
 */
export function semanaAlvo(hoje: string): string {
    const atual = chaveDeHoje('semana', hoje);
    if (!ehSemana(atual)) return '';
    return diaIso(hoje) >= 5 ? addWeeks(atual, 1) : atual;
}

/** O que faz: o valor de um nome para o campo (o link vira `[[nome]]` pelo dono único, sem embrulhar o que já é link; em lista se o campo é múltiplo). */
function valorDoNome(campo: DomainField, nome: string): unknown {
    if (campo.tipo !== 'link') return nome;
    const link = linkDoNome(nome);
    return campo.multiplo ? [link] : link;
}

/** O que faz: o valor de um contexto para o campo (lista, ou o texto). */
function valorDoContexto(campo: DomainField, contexto: string): unknown {
    return campo.tipo === 'lista' ? [contexto] : contexto;
}

/** O porquê das fontes `no.*` (o nó de onde o Novo abriu). */
const PORQUE_DO_NO: Record<FonteDoNo, (nome: string) => string> = {
    smart: n => `aberto na SMART ${n}`,
    projeto: n => `aberto no projeto ${n}`,
    central: n => `a central ${n}`,
    area: n => `a área ${n}`,
    cidade: n => `a cidade ${n}`,
    pais: n => `o país ${n}`,
};

/**
 * O que faz: o valor de uma fonte para um campo, com o porquê; `null` = a fonte não tem valor.
 * Entra → sai: a fonte, o campo e o contexto → a sugestão ou `null`.
 */
function daFonte(fonte: FieldSuggestion, campo: DomainField, ctx: ContextoDaSugestao): Sugestao | null {
    const de = fonte.de;
    const s = (valor: unknown, porque: string): Sugestao | null => (vazio(valor) ? null : { valor, porque, de });
    const l = ctx.linha && !isChaveEspecial(ctx.linha.chave) ? ctx.linha : null;
    switch (de) {
        case 'linha.dia':
            return l?.escala === 'dia' ? s(l.chave, `a linha de ${diaDaSemana(l.chave)} ${diaMes(l.chave)}`) : null;
        case 'linha.semana': {
            if (l?.escala === 'dia') { const w = chaveDeHoje('semana', l.chave); return s(w, `a semana da linha de ${diaDaSemana(l.chave)} ${diaMes(l.chave)} (${semanaCurta(w)})`); }
            return l?.escala === 'semana' ? s(l.chave, `a linha da ${semanaCurta(l.chave)}`) : null;
        }
        case 'linha.trimestre': {
            if (l?.escala === 'dia') return s(trimestreDoDia(l.chave), `o trimestre da linha de ${diaDaSemana(l.chave)} ${diaMes(l.chave)}`);
            if (l?.escala === 'semana') return s(quarterOfWeek(l.chave), `o trimestre da ${semanaCurta(l.chave)}`);
            return l?.escala === 'trimestre' ? s(l.chave, `a linha do ${l.chave}`) : null;
        }
        case 'no.smart': case 'no.projeto': case 'no.central': case 'no.area': case 'no.cidade': case 'no.pais': {
            const qual = de.slice(3) as FonteDoNo;
            const n = ctx.no[qual];
            return n?.nome ? s(valorDoNome(campo, n.nome), PORQUE_DO_NO[qual](n.nome)) : null;
        }
        case 'fio.projeto':
            return ctx.fio.projeto?.nome ? s(valorDoNome(campo, ctx.fio.projeto.nome), `o projeto do nó de onde abriu (${ctx.fio.projeto.nome})`) : null;
        case 'onde_estou':
            return ctx.onde ? s(valorDoContexto(campo, ctx.onde), 'o “Onde estou”') : null;
        case 'lugar.do_dia': {
            if (!ctx.lugarDoDia?.viagem) return null;
            const celular = ctx.contextos.find(c => /celular/i.test(c));
            return celular ? s(valorDoContexto(campo, celular), `dia de trajeto (${ctx.lugarDoDia.texto}): o que dá para fazer no celular`) : null;
        }
        case 'ultimo_lugar': {
            const u = ctx.ultimoLugar;
            if (!u) return null;
            const pais = campo.alvo?.includes('pais') || campo.nome === 'pais';
            const nome = pais ? u.pais : u.cidade;
            return nome ? s(valorDoNome(campo, nome), `o último lugar (${u.cidade}${u.pais ? `, ${u.pais}` : ''})`) : null;
        }
        case 'heranca.smart': {
            const h = ctx.heranca;
            const v = h?.campos[campo.nome];
            return h && !vazio(v) ? s(v, `herdado da SMART ${h.nome}`) : null;
        }
        case 'semana_alvo': {
            const w = semanaAlvo(ctx.hoje);
            return s(w, w === chaveDeHoje('semana', ctx.hoje) ? `a semana de hoje (${semanaCurta(w)})` : `a semana sendo planejada (${semanaCurta(w)}): de sexta a domingo, a próxima`);
        }
        case 'trimestre_alvo':
            return null;
        case 'fixo':
            return fonte.valor !== undefined ? s(fonte.valor, 'o padrão do tipo') : null;
        case 'nota':
            return ctx.nota ? s(ctx.nota[campo.nome], 'o valor atual da nota') : null;
        case 'checklist': {
            const c = fonte.caminho && ctx.checklist ? ctx.checklist(fonte.caminho) : null;
            return c ? s([...c.itens], `a checklist de ${c.nome}`) : null;
        }
    }
    return null;
}

/**
 * O que faz: a sugestão de um campo: a primeira fonte da lista do modelo que tem valor, com o
 * porquê; nenhuma → `null`.
 * Por quê: §4.2, "a primeira fonte com valor vence, sempre com o porquê".
 * Entra → sai: o campo do modelo e o contexto → a sugestão (a entrada não muda).
 * Erro e ataque: fonte fora da lista fechada não vale (o leitor do modelo já a recusa); a
 * prateleira ("Algum dia", "Sem data") não sugere data; o valor vazio de uma fonte passa à
 * seguinte; o link vira `[[nome]]` (em lista, no campo múltiplo).
 * Prova: tests/missao/sugestoes.test.ts.
 */
export function sugestaoDoCampo(campo: DomainField, ctx: ContextoDaSugestao): Sugestao | null {
    for (const fonte of campo.sugestao ?? []) {
        const s = daFonte(fonte, campo, ctx);
        if (s) return s;
    }
    return null;
}
