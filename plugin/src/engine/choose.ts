/**
 * Escolher, para qualquer lista de candidatos (arquitetura do núcleo de 21/10, seção 2;
 * plano da etapa 1, seção 1).
 *
 * candidatos → filtros → pesos → a ordem, cada candidato com os motivos. É a decisão por
 * pesos categóricos da arquitetura universal (3.7) sem as categorias fixas da tarefa:
 * quem diz o que pesa é o modelo do domínio (`domainModel.ts`), e os pontos vêm da
 * tabela única (`pesos.<domínio>`). Os eliminados por filtro aparecem à parte, com o
 * motivo, e nunca somem. O peso propõe a ordem, com o porquê; a escolha é sua.
 *
 * O pontuador das tarefas (`scoreTask`, `decisionWeights.ts`) continua o seu; migrá-lo
 * para cá é uma etapa futura. Este módulo só calcula: quem lê o vault é o serviço
 * (`nucleoService.ts`) e o passo `suggest_note` com `rankWith`.
 */
import { formatPoints } from './decisionWeights';
import { bandsOf, type DomainCategory, type DomainChoice, type DomainFilter } from './domainModel';

/** Uma nota candidata: o caminho (id), o nome e o frontmatter. */
export interface Candidato {
    id: string;
    titulo: string;
    campos: Record<string, any>;
}

export interface Motivo {
    chave: string;
    pontos: number;
    texto: string;
}

export interface Ordenado {
    id: string;
    titulo: string;
    total: number;
    motivos: Motivo[];
}

export interface Eliminado {
    id: string;
    titulo: string;
    motivo: string;
}

export interface Escolha {
    ordenados: Ordenado[];
    eliminados: Eliminado[];
}

/** O que faz: o texto de um valor de campo (link `[[x|y]]` vira `x`); vazio → ''. */
export function fieldText(value: unknown): string {
    if (value === undefined || value === null) return '';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    return String(value).trim().replace(/^\[\[([^\]|]*)(?:\|[^\]]*)?\]\]$/, '$1').trim();
}

/**
 * O que faz: um número de um campo (número ou texto "1200", "1200,5", "R$ 4.200",
 * "4.200,50"); senão `null`.
 * Por quê: o custo do mês é escrito à mão, em reais; "4.200" lido como 4,2 poria um
 * destino caro na faixa mais barata.
 * Erro e ataque: ponto seguido de exatamente três dígitos (e só assim) é separador de
 * milhar; "1.5" continua 1,5. Texto com letras fora do "R$" não é número.
 */
export function fieldNumber(value: unknown): number | null {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value !== 'string' || value.trim() === '') return null;
    let text = value.trim().replace(/^R\$\s*/i, '').replace(/\s+/g, '');
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(text)) text = text.replace(/\./g, '');
    const n = Number(text.replace(',', '.'));
    return text !== '' && Number.isFinite(n) ? n : null;
}

/**
 * O que faz: os itens de um campo lista; um texto vira lista pelas vírgulas, `·` ou
 * `;` ("inglês, programação" → 2). "0", "nenhum" ou "nenhuma" sozinhos → lista vazia.
 * Por quê: a lista das frentes com grupo na cidade é respondida como texto no protocolo.
 */
export function fieldList(value: unknown): string[] {
    const items = Array.isArray(value) ? value : String(value ?? '').split(/[,;·]/);
    const out = items.map(item => fieldText(item)).filter(item => item !== '');
    return out.length === 1 && /^(0|nenhum|nenhuma|-)$/i.test(out[0]) ? [] : out;
}

/** O que faz: sim/não de um campo (true/false, sim/não, yes/no); senão `null`. */
export function fieldBoolean(value: unknown): boolean | null {
    if (typeof value === 'boolean') return value;
    const text = fieldText(value).toLowerCase();
    if (['sim', 'true', 'yes', 's'].includes(text)) return true;
    if (['nao', 'não', 'false', 'no', 'n'].includes(text)) return false;
    return null;
}

const isEmpty = (value: unknown) => value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

/** O que faz: a razão campo ÷ referência; `null` sem um dos dois ou com referência 0. */
function ratioOf(campos: Record<string, any>, campo: string, referencia: string, contexto: Record<string, number>): number | null {
    const value = fieldNumber(campos?.[campo]);
    const base = contexto?.[referencia];
    if (value === null || typeof base !== 'number' || !Number.isFinite(base) || base === 0) return null;
    return value / base;
}

/** O que faz: o filtro elimina este candidato? Sem dado no campo, não elimina. */
function filterHits(filtro: DomainFilter, campos: Record<string, any>, contexto: Record<string, number>): boolean {
    if (filtro.regra === 'igual') {
        const raw = campos?.[filtro.campo];
        const values = Array.isArray(raw) ? raw.map(fieldText) : [fieldText(raw)];
        return values.some(value => value !== '' && (filtro.valores ?? []).includes(value));
    }
    const ratio = ratioOf(campos, filtro.campo, filtro.referencia ?? '', contexto);
    return ratio !== null && typeof filtro.limite === 'number' && ratio > filtro.limite;
}

/** O que faz: um ponto da tabela (número) ou 0. */
function pointOf(tabela: Record<string, any>, chave: string, sub: string): number {
    const value = tabela?.[chave]?.[sub];
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * O que faz: o motivo de uma categoria para um candidato.
 * Campo ausente: 0 ponto e "sem dado: <campo>", visível (a falta também é informação).
 */
function reasonFor(cat: DomainCategory, campos: Record<string, any>, tabela: Record<string, any>, contexto: Record<string, number>, rotulos: Record<string, string>): Motivo {
    const rotulo = rotulos[cat.chave] || cat.chave;
    const raw = campos?.[cat.campo];
    const semDado = (campo: string): Motivo => ({ chave: cat.chave, pontos: 0, texto: `sem dado: ${campo}` });
    if (cat.regra === 'contagem') {
        if (raw === undefined || raw === null) return semDado(cat.campo);
        const n = fieldList(raw).length;
        const maximo = Math.max(0, pointOf(tabela, cat.chave, 'maximo'));
        const conta = Math.min(n, maximo);
        return { chave: cat.chave, pontos: conta * pointOf(tabela, cat.chave, 'cada'), texto: `${rotulo} ${n}` };
    }
    if (isEmpty(raw) || (Array.isArray(raw) && raw.length === 0)) return semDado(cat.campo);
    if (cat.regra === 'valor') {
        const value = fieldText(Array.isArray(raw) ? raw[0] : raw);
        const known = tabela?.[cat.chave] && Object.prototype.hasOwnProperty.call(tabela[cat.chave], value);
        return {
            chave: cat.chave,
            pontos: pointOf(tabela, cat.chave, value),
            texto: known ? `${rotulo} ${value}` : `${rotulo} ${value} (sem ponto na tabela)`,
        };
    }
    if (cat.regra === 'booleano') {
        const value = fieldBoolean(raw);
        if (value === null) return semDado(cat.campo);
        return { chave: cat.chave, pontos: pointOf(tabela, cat.chave, value ? 'sim' : 'nao'), texto: `${rotulo} ${value ? 'sim' : 'não'}` };
    }
    // faixa_relativa
    const referencia = cat.referencia ?? '';
    const base = contexto?.[referencia];
    if (typeof base !== 'number' || !Number.isFinite(base) || base === 0) return semDado(referencia);
    const ratio = ratioOf(campos, cat.campo, referencia, contexto);
    if (ratio === null) return semDado(cat.campo);
    const { faixas, senao } = bandsOf(cat);
    const band = faixas.find(item => ratio <= item.ate)?.chave ?? senao;
    const refLabel = rotulos[referencia] || referencia;
    return { chave: cat.chave, pontos: pointOf(tabela, cat.chave, band), texto: `${rotulo} ${formatPoints(ratio)}× ${refLabel}` };
}

/**
 * O que faz: filtra, pontua e ordena os candidatos de um domínio.
 * Por quê: "a mesma função para qualquer lista de candidatos: tarefas, protocolos,
 * destinos" (núcleo, 2). Cada domínio declara campos, filtros e pesos; a função é uma.
 * Entra → sai: candidatos, o bloco `escolher` do modelo, o bloco `pesos.<domínio>` e as
 * referências do contexto → { ordenados, eliminados }. Ordenados: total decrescente e,
 * no empate, o título. Eliminados: pelo título, com o motivo do primeiro filtro que pegou.
 * Cada ordenado tem um motivo por categoria (os pontos zero também), do maior ao menor.
 * Erro e ataque: candidato sem `campos`, valor fora da tabela (0, com o aviso no texto),
 * referência ausente ou 0 (sem divisão por zero: "sem dado"), tabela vazia (tudo 0).
 * Não muta a entrada.
 * Prova: tests/engine/choose.test.ts.
 */
export function escolher(candidatos: Candidato[], modelo: DomainChoice, tabela: Record<string, any>, contexto: Record<string, number> = {}): Escolha {
    const ordenados: Ordenado[] = [];
    const eliminados: Eliminado[] = [];
    const rotulos = modelo?.rotulos || {};
    const tabelaOk = tabela && typeof tabela === 'object' ? tabela : {};
    for (const candidato of candidatos || []) {
        const campos = candidato?.campos && typeof candidato.campos === 'object' ? candidato.campos : {};
        const filtro = (modelo?.filtros || []).find(item => filterHits(item, campos, contexto));
        if (filtro) {
            eliminados.push({ id: candidato.id, titulo: candidato.titulo, motivo: filtro.motivo });
            continue;
        }
        const motivos = (modelo?.categorias || [])
            .map((cat, index) => ({ motivo: reasonFor(cat, campos, tabelaOk, contexto, rotulos), index }))
            .sort((a, b) => b.motivo.pontos - a.motivo.pontos || a.index - b.index)
            .map(entry => entry.motivo);
        const total = motivos.reduce((sum, motivo) => sum + motivo.pontos, 0);
        ordenados.push({ id: candidato.id, titulo: candidato.titulo, total, motivos });
    }
    const byTitle = (a: { titulo: string }, b: { titulo: string }) => String(a.titulo).localeCompare(String(b.titulo), 'pt-BR');
    ordenados.sort((a, b) => b.total - a.total || byTitle(a, b));
    eliminados.sort(byTitle);
    return { ordenados, eliminados };
}

/**
 * O que faz: a linha dos motivos de um candidato, no padrão do gesto (`nowReasonLine`):
 * "🛂 visto e-visa +1 · 💰 custo 1,1× gasto-base +1 · sem dado: clima".
 */
export function choiceReasonLine(item: Pick<Ordenado, 'motivos'>): string {
    return (item?.motivos || [])
        .map(motivo => motivo.texto.startsWith('sem dado:')
            ? motivo.texto
            : `${motivo.texto} ${motivo.pontos > 0 ? '+' : ''}${formatPoints(motivo.pontos)}`)
        .join(' · ');
}

/** Uma linha da lista do seletor de notas com `rankWith`. */
export interface ChoiceRankItem {
    path: string;
    title: string;
    note: string;
    destaque: boolean;
    eliminado: boolean;
    /** Os pontos (0 no eliminado) e a linha dos motivos, que o passo grava. */
    pontos: number;
    motivo: string;
}

/**
 * O que faz: a escolha como linhas do seletor, na ordem: os ordenados (os 3 primeiros
 * em destaque, como no gesto) e depois os eliminados, marcados, com o motivo.
 * Por quê: no `suggest_note` com `rankWith`, a ordem e o porquê aparecem como o gesto
 * já mostra; o eliminado continua na lista, à parte (a escolha é dele).
 */
export function choiceRankItems(escolha: Escolha): ChoiceRankItem[] {
    const ranked = (escolha?.ordenados || []).map((item, index) => {
        const line = choiceReasonLine(item);
        return {
            path: item.id,
            title: `${index < 3 ? '⭐ ' : ''}${item.titulo}`,
            note: line || 'sem peso',
            destaque: index < 3,
            eliminado: false,
            pontos: Math.round(item.total * 10) / 10,
            motivo: line,
        };
    });
    const out = (escolha?.eliminados || []).map(item => ({
        path: item.id,
        title: `🚫 ${item.titulo}`,
        note: `fora: ${item.motivo}`,
        destaque: false,
        eliminado: true,
        pontos: 0,
        motivo: `fora: ${item.motivo}`,
    }));
    return [...ranked, ...out];
}
