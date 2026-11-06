/**
 * As coleções de um ramo: as notas de um tipo que já existe, lidas da casa do protocolo
 * dono delas, postas no tempo pelos campos que elas já têm, e os nós que saem delas.
 *
 * Por quê: a arquitetura da página Missão (27/10/2026, §3.8): um ramo declara o que fica
 * em cada coluna, e tudo o que muda de um ramo para outro mora no arquivo dele. Uma
 * coleção diz, numa lista de fontes, de onde vem cada nota (o protocolo que a grava, cuja
 * `targetFolder` é a casa, e o `type` que ela leva) e como ela cai no tempo: por um campo de
 * data (`de`, e até outro, `ate`), pelos dias das passagens que têm a nota (`lugar`), ou pelo
 * tempo da nota a que ela se liga (`segue`). Uma coleção de vínculo (`vinculo`) mostra as
 * notas que um campo de link das notas de outra coleção aponta (o país das cidades). Uma
 * fonte pode dizer que cada nota é um trecho planejado (`trecho`: de onde, para onde e o dia).
 * Nada aqui tem nome de tipo nem de campo: os nomes vêm do ramo.
 *
 * Módulo puro: sem Obsidian e sem DOM. Prova: tests/missao/colecoes.test.ts.
 */
import { fieldNumber } from '../engine/choose';
import { fold, linkTarget } from '../project/projectCanvasModel';
import type { DetalheDoNo, Passagem, Ligacao, MissaoNo, Trecho } from './tipos';
import type { NotaComCampos } from './entrada';
import { dataDoCampo, ehDia, reais, semEmojiInicial, textoDoCampo } from './formatos';
import { addDays, diaComAno, diaDaSemana, diaMes } from './tempo';
import { FRASES } from './frases';
import { showGrammar, timeHorizon } from '../engine/showGrammar';
import type { ColecaoDoRamo, FonteDaColecao, OrdemDaColecao } from './ramoPrincipal';

/** A chave de uma fonte (o protocolo, o modelo ou a casa dita direto, e o tipo), a mesma do leitor. */
export const chaveDaFonte = (f: Pick<FonteDaColecao, 'protocolo' | 'type'> & { dominio?: string | null; casa?: string | null }) =>
    `${f.protocolo ?? (f.casa ? `casa:${f.casa}` : `@${f.dominio ?? ''}`)}#${f.type}`;

/** O que faz: os nomes que um campo de link aponta (um ou uma lista; o texto solto vale como nome). */
export function nomesDoCampo(v: unknown): string[] {
    const itens = Array.isArray(v) ? v : [v];
    const out: string[] = [];
    for (const it of itens) { const n = linkTarget(it); if (n && !out.some(x => fold(x) === fold(n))) out.push(n); }
    return out;
}

/* ------------------------------------------------------------ as notas no tempo */

/** Uma nota de uma coleção, com a fonte e os trechos de tempo em que ela cai. */
export interface NotaDaColecao {
    colecao: string;
    fonte: FonteDaColecao;
    nota: NotaComCampos;
    /** `[de, até]` em `AAAA-MM-DD` (inclusivo); vazio = a nota não cai no tempo. */
    spans: Array<[string, string]>;
    /** O nó da nota. */
    no: MissaoNo;
}

export interface IndiceDasColecoes {
    colecoes: ColecaoDoRamo[];
    /** As notas das coleções com tempo (as de vínculo ficam de fora). */
    notas: NotaDaColecao[];
    /** As notas de cada coleção de vínculo, pelo nome (dobrado), para achar o alvo do link. */
    alvos: Map<string, Map<string, NotaDaColecao>>;
    /** A nota que o modelo do tipo dela dá por feita (a peça publicada, 05/11), para a contagem das coleções com `conta`. */
    feita: (nota: NotaComCampos) => boolean;
}

/** O que faz: o título de uma nota pela fonte (o campo, ou o nome do arquivo). */
function tituloDe(nota: NotaComCampos, fonte: FonteDaColecao): string {
    return (fonte.titulo ? textoDoCampo(nota.campos?.[fonte.titulo]) : '') || nota.nome;
}

/** O que faz: um valor na linha ou no painel: a data como dd/mm, o resto como texto. */
function valorNaLinha(v: unknown): string {
    const d = dataDoCampo(v);
    return d && String(v).trim().length <= 16 ? diaMes(d) : textoDoCampo(v);
}

/**
 * O que faz: o nó de uma nota de coleção (`n:<caminho>`): o título, a linha dos campos e o tipo dela; com o
 * estado da tabela do modelo (02/11), o rótulo dele abre a linha no lugar do `status` cru, e a forma vai no cartão.
 */
export function noDaNota(nota: NotaComCampos, fonte: FonteDaColecao, estado: { valor: string; rotulo: string; forma?: MissaoNo['estado'] } | null = null): MissaoNo {
    // O campo da linha cujo valor é o do estado sai: o rótulo dele já abre a linha.
    const valores = fonte.linha.map(k => valorNaLinha(nota.campos?.[k])).filter(v => !estado || v !== estado.valor);
    const linha = [estado?.rotulo ?? '', ...valores].filter(Boolean).join(' · ');
    return { id: `n:${nota.caminho}`, tipo: 'nota', titulo: tituloDe(nota, fonte), linha, sub: fonte.rotulo, ramo: -1, ...(estado?.forma ? { estado: estado.forma } : {}) };
}

const maxData = (a: string, b: string) => (a > b ? a : b);

/**
 * O que faz: diz se uma nota passa no filtro da fonte: cada campo do filtro tem um dos valores aceitos
 * (o campo lista vale se um item casa); sem filtro, toda nota passa.
 * Por quê: 02/11, o ramo de Roteiros: o longo e o corte são o mesmo tipo, em colunas diferentes.
 * Erro e ataque: o campo vazio ou ausente não passa; a comparação ignora maiúsculas e acentos (`fold`).
 * Prova: tests/missao/colecoesFiltradas.test.ts.
 */
export function passaNoFiltro(nota: NotaComCampos, fonte: Pick<FonteDaColecao, 'filtro'> & Partial<Pick<FonteDaColecao, 'com' | 'sem'>>): boolean {
    const valoresDe = (campo: string) => { const v = nota.campos?.[campo]; return (Array.isArray(v) ? v : [v]).map(x => fold(textoDoCampo(x))).filter(Boolean); };
    for (const [campo, aceitos] of Object.entries(fonte.filtro ?? {})) {
        if (!valoresDe(campo).some(x => aceitos.some(a => fold(a) === x))) return false;
    }
    // 03/11, o ramo Criação: o campo preenchido (`com`) ou vazio (`sem`); o link vazio (`"[[]]"`) conta como vazio.
    if ((fonte.com ?? []).some(c => !valoresDe(c).some(preenchido))) return false;
    if ((fonte.sem ?? []).some(c => valoresDe(c).some(preenchido))) return false;
    return true;
}

/** O que faz: diz se um valor dobrado tem conteúdo: o link vazio do protocolo (`[[]]`, só colchetes e aspas) não tem. */
const preenchido = (v: string) => v.replace(/[\[\]"'\s]/g, '') !== '';

/**
 * O que faz: o índice das coleções de uma versão do cofre: cada nota de cada fonte, com os
 * trechos de tempo em que cai, e as notas das coleções de vínculo pelo nome.
 * Por quê: §9.2 ("montar o modelo uma vez por versão"); cada linha só pergunta quem cai nela.
 * Entra → sai: as coleções do ramo, as notas lidas por fonte (`chaveDaFonte`), as passagens,
 * hoje e os nós que o modelo já dá a uma nota pelo caminho (a estadia, 30/10) → `IndiceDasColecoes`.
 * Erro e ataque: data malformada não cai no tempo (a nota fica fora da linha, nunca num dia
 * inventado); a mesma nota em duas fontes conta uma vez por coleção; `segue` só um nível
 * (a nota ligada que também segue outra não leva a lugar nenhum); a `ate` antes da `de`
 * vale só o primeiro dia.
 * Prova: tests/missao/colecoes.test.ts ("no tempo").
 */
export function indiceDasColecoes(colecoes: readonly ColecaoDoRamo[], notasPorFonte: Readonly<Record<string, readonly NotaComCampos[]>>, passagens: readonly Passagem[], hoje: string, conhecidos: ReadonlyMap<string, MissaoNo> = new Map(), feita: (nota: NotaComCampos) => boolean = () => false): IndiceDasColecoes {
    const notas: NotaDaColecao[] = [];
    const alvos = new Map<string, Map<string, NotaDaColecao>>();
    for (const c of colecoes) {
        const vistos = new Set<string>();
        for (const fonte of c.fontes) {
            for (const nota of notasPorFonte[chaveDaFonte(fonte)] ?? []) {
                if (vistos.has(nota.caminho) || !passaNoFiltro(nota, fonte)) continue;
                vistos.add(nota.caminho);
                // O nó que o modelo já dá à nota (30/10: a estadia, com o estado no cartão) é o mesmo cartão aqui.
                const item: NotaDaColecao = { colecao: c.id, fonte, nota, spans: [], no: conhecidos.get(nota.caminho) ?? noDaNota(nota, fonte) };
                if (c.vinculo) {
                    const m = alvos.get(c.id) ?? new Map<string, NotaDaColecao>();
                    const t = tituloDe(nota, fonte);
                    for (const k of new Set([fold(t), fold(semEmojiInicial(t)), fold(nota.nome), fold(semEmojiInicial(nota.nome))])) if (k && !m.has(k)) m.set(k, item);
                    alvos.set(c.id, m);
                    continue;
                }
                if (fonte.de || fonte.desde) {
                    // `desde` (03/11): o dia da fonte, quando ela não tem `de` ou a nota não tem a data dele.
                    const de = (fonte.de ? dataDoCampo(nota.campos?.[fonte.de]) : null) ?? fonte.desde;
                    if (de) {
                        const ate = fonte.ate ? dataDoCampo(nota.campos?.[fonte.ate]) : de;
                        item.spans.push([de, !fonte.ate ? de : ate ? (ate >= de ? ate : de) : maxData(de, hoje)]);
                    }
                } else if (fonte.lugar) {
                    for (const e of passagens) if (e.nota === nota.caminho) item.spans.push([e.de, e.ate ?? maxData(e.de, hoje)]);
                }
                notas.push(item);
            }
        }
    }
    // `segue`: a nota toma o tempo da nota ligada (pelo nome), um nível só; a que tem o tempo dela (a
    // `de`, 30/10: a estadia com a entrada) fica com o dela, e a ligação continua desenhada.
    const porNome = new Map<string, NotaDaColecao>();
    for (const n of notas) if (!n.fonte.segue) porNome.set(fold(n.nota.nome), n);
    for (const n of notas) {
        if (!n.fonte.segue || n.spans.length) continue;
        for (const nome of nomesDoCampo(n.nota.campos?.[n.fonte.segue])) {
            const alvo = porNome.get(fold(nome));
            if (alvo) n.spans.push(...alvo.spans);
        }
    }
    return { colecoes: [...colecoes], notas: semAsUsadas(notas), alvos, feita };
}

/**
 * O que faz: tira as notas usadas: a de uma fonte com `usada` sai quando alguma nota das coleções dela a aponta pelo
 * campo (pelo nome da nota ou pelo título).
 * Por quê: 03/11, o fluxo da ideia ao vídeo: a ideia que virou roteiro (o `ideia` do roteiro) não aparece duas vezes,
 * a capturada e a do banco antigo; o original fica onde está, e só sai da coluna.
 * Entra → sai: as notas do índice → as mesmas, sem as usadas (a ordem de entrada).
 * Erro e ataque: a nota que aponta a si mesma não conta; a coleção que não está no índice não tira nada; o roteiro que
 * nenhum filtro aceita (o arquivado) não tira, e a ideia volta à coluna.
 * Prova: tests/missao/colecoesDosBancos.test.ts ("a usada sai").
 */
function semAsUsadas(notas: NotaDaColecao[]): NotaDaColecao[] {
    const apontados = (u: NonNullable<FonteDaColecao['usada']>) => {
        const out = new Map<string, Set<string>>();
        for (const n of notas) {
            if (!u.colecoes.includes(n.colecao)) continue;
            for (const nome of nomesDoCampo(n.nota.campos?.[u.campo])) out.set(fold(nome), (out.get(fold(nome)) ?? new Set()).add(n.nota.caminho));
        }
        return out;
    };
    const porRegra = new Map<string, Map<string, Set<string>>>();
    return notas.filter(n => {
        const u = n.fonte.usada;
        if (!u) return true;
        const k = `${u.colecoes.join('|')}#${u.campo}`;
        if (!porRegra.has(k)) porRegra.set(k, apontados(u));
        const m = porRegra.get(k)!;
        const quem = [...(m.get(fold(n.nota.nome)) ?? []), ...(m.get(fold(n.no.titulo)) ?? [])].filter(c => c !== n.nota.caminho);
        return quem.length === 0;
    });
}

const cobre = (spans: ReadonlyArray<[string, string]>, de: string, ate: string) => spans.some(([a, b]) => a <= ate && b >= de);

export interface ColecoesDaLinha {
    /** Os nós de cada coleção que caem na linha, pela ordem do começo e do título. */
    nos: Record<string, MissaoNo[]>;
    ligacoes: Ligacao[];
}

/**
 * O que faz: os nós das coleções numa linha (do dia `de` ao dia `ate`) e as ligações entre
 * eles: a nota que segue outra → a outra; a nota de lugar → a passagem dela; o alvo do
 * vínculo → as notas que o apontam.
 * Entra → sai: o índice, os dias da linha, as passagens da linha e, opcional, hoje → `ColecoesDaLinha`.
 * A ordem por data (`ordem`) conta de hoje quando a linha o contém (o trimestre em curso), senão do começo da linha.
 * Erro e ataque: o alvo do vínculo sem nota vira nó só com o nome (`c:<coleção>:<nome>`),
 * com "sem nota" na linha (ausência em palavras), e nunca uma nota inventada.
 * Prova: tests/missao/colecoes.test.ts ("na linha"), tests/missao/colecoesOrdem.test.ts.
 */
export function colecoesDaLinha(ix: IndiceDasColecoes, de: string, ate: string, passagensDaLinha: readonly Passagem[], hoje: string | null = null): ColecoesDaLinha {
    const desde = hoje && de < hoje && hoje <= ate ? hoje : de;
    const nos: Record<string, MissaoNo[]> = {};
    const ligacoes: Ligacao[] = [];
    const naLinha = new Map<string, NotaDaColecao[]>();
    for (const n of ix.notas) {
        if (!cobre(n.spans, de, ate)) continue;
        naLinha.set(n.colecao, [...(naLinha.get(n.colecao) ?? []), n]);
    }
    const ordem = (a: NotaDaColecao, b: NotaDaColecao) => (a.spans[0]?.[0] ?? '').localeCompare(b.spans[0]?.[0] ?? '') || a.no.titulo.localeCompare(b.no.titulo, 'pt-BR');
    const ids = new Set<string>();
    for (const c of ix.colecoes) {
        if (c.vinculo) continue;
        const itens = [...(naLinha.get(c.id) ?? [])].sort(c.ordem ? ordemPelaData(c.ordem, desde, ordem) : ordem);
        nos[c.id] = itens.map(n => n.no);
        for (const n of itens) ids.add(n.no.id);
    }
    const todas = [...naLinha.values()].flat();
    const porNome = new Map(todas.map(n => [fold(n.nota.nome), n]));
    for (const n of todas) {
        if (n.fonte.segue) for (const nome of nomesDoCampo(n.nota.campos?.[n.fonte.segue])) {
            const alvo = porNome.get(fold(nome));
            if (alvo && alvo !== n) ligacoes.push({ de: n.no.id, para: alvo.no.id, tipo: 'estrutura' });
        }
        if (n.fonte.lugar) for (const e of passagensDaLinha) if (e.nota === n.nota.caminho) ligacoes.push({ de: n.no.id, para: e.id, tipo: 'estrutura' });
    }
    for (const c of ix.colecoes) {
        if (!c.vinculo) continue;
        const out: MissaoNo[] = [];
        for (const origem of naLinha.get(c.vinculo.colecao) ?? []) {
            for (const nome of nomesDoCampo(origem.nota.campos?.[c.vinculo.campo])) {
                const no = alvoDoVinculo(ix, c, nome);
                if (!out.some(x => x.id === no.id)) out.push(no);
                ligacoes.push({ de: no.id, para: origem.no.id, tipo: 'estrutura' });
            }
        }
        const contadas = c.conta ? c.conta.colecoes.flatMap(k => naLinha.get(k) ?? []) : [];
        nos[c.id] = c.conta ? out.map(no => comAContagem(ix, c, no, contadas, de, ate)) : out;
    }
    return { nos, ligacoes };
}

/**
 * O que faz: a contagem que as coleções com `conta` deram aos nós de uma linha, pelo id do nó: o rótulo da primeira
 * coleção contada (as Peças), a linha e a conta crua de `comAContagem`.
 * Por quê: 05/11, a frente de renda no Projetos: o cartão do projeto (o `p:<nome>`, o mesmo nó que a coluna Frentes da
 * Criação mostra) leva a contagem das peças da linha, pela mesma conta, e nenhuma outra.
 * Entra → sai: o índice e os nós das coleções na linha (`colecoesDaLinha(...).nos`) → id → a contagem.
 * Erro e ataque: o nó sem contagem (a coleção sem `conta`) não entra; dois alvos com o mesmo id ficam com o primeiro.
 * Prova: tests/engine/refinosDosRamos.test.ts ("a frente de renda").
 */
export function contasDaLinha(ix: Pick<IndiceDasColecoes, 'colecoes'>, nos: Readonly<Record<string, readonly MissaoNo[]>>): Map<string, NonNullable<MissaoNo['conta']>> {
    const out = new Map<string, NonNullable<MissaoNo['conta']>>();
    for (const c of ix.colecoes) {
        if (!c.conta || !c.vinculo) continue;
        const rotulo = ix.colecoes.find(x => x.id === c.conta!.colecoes[0])?.rotulo ?? c.rotulo;
        for (const no of nos[c.id] ?? []) if (no.contagens && !out.has(no.id)) out.set(no.id, { rotulo, linha: no.linha, contagens: no.contagens });
    }
    return out;
}

/** O que faz: os dias de `de` a `ate` (inclusivo); a data malformada, ou o fim antes do começo, dá só o começo. */
function diasDe(de: string, ate: string): string[] {
    if (!ehDia(de) || !ehDia(ate)) return [];
    const out: string[] = [de];
    for (let d = addDays(de, 1); d <= ate && out.length < 400; d = addDays(d, 1)) out.push(d);
    return out;
}

/**
 * O que faz: o alvo de um vínculo com a contagem das notas da linha que o apontam, pela forma de mostrar: do plano é a
 * nota ligada com a data do campo da contagem no período da linha; feita é a que o modelo do tipo dela dá por feita (a
 * peça publicada). A linha do nó passa a ser a contagem, seguida dos campos da linha da fonte do alvo (os perfis do
 * canal, 05/11); os traços, a mesma conta.
 * Por quê: 05/11, a campanha da semana: a frente e o canal mostram "do plano · publicadas · faltam" das peças da
 * semana pela função única (`showGrammar`), e nenhuma outra conta.
 * Entra → sai: o índice, a coleção (com `conta`), o nó do alvo, as notas das coleções contadas na linha e os dias da
 * linha → uma cópia do nó (o nó do índice, que outras linhas usam, não muda).
 * Erro e ataque: a nota sem a data, ou com a data fora do período, não entra no plano; a feita sem a data não conta
 * (não se sabe quando foi ao ar); sem nada no plano, o texto de ausência da coleção; a linha do ramo da central
 * (`doRamo`) sai da cópia, para o cartão mostrar a contagem.
 * Prova: tests/missao/contaDaColecao.test.ts.
 */
function comAContagem(ix: IndiceDasColecoes, c: ColecaoDoRamo, no: MissaoNo, origens: readonly NotaDaColecao[], de: string, ate: string): MissaoNo {
    const conta = c.conta!;
    const ligadas = origens.filter(n => nomesDoCampo(n.nota.campos?.[c.vinculo!.campo]).some(x => alvoDoVinculo(ix, c, x).id === no.id));
    const unidades = ligadas.map(n => {
        const dia = dataDoCampo(n.nota.campos?.[conta.data]) ?? undefined;
        return { status: ix.feita(n.nota) ? 'done' : 'open', scheduled: dia, completedDate: dia };
    });
    const g = showGrammar(unidades, timeHorizon({ weeks: [], dates: diasDe(de, ate) }), conta.vazio);
    // Os campos da linha da fonte do alvo (05/11: os perfis do canal) vêm depois da contagem; sem eles, só a contagem.
    const alvo = [...(ix.alvos.get(c.id)?.values() ?? [])].find(n => n.no.id === no.id);
    const daFonte = alvo ? alvo.fonte.linha.map(k => valorNaLinha(alvo.nota.campos?.[k])).filter(Boolean) : [];
    // A linha do ramo da central (`doRamo`, as tarefas dela e dos auxiliares) sai: o cartão a mostraria no lugar da
    // contagem das peças (uma frente na coluna Frentes aparecia com as tarefas, e não com as peças).
    const { doRamo: _doRamo, ...semRamo } = no;
    return { ...semRamo, linha: [g.text, ...daFonte].join(' · '), contagens: g.counts };
}

/**
 * O que faz: a comparação de uma coleção com `ordem` numa linha que começa em `de`: primeiro as notas com a data
 * do campo em `de` ou depois, da mais perto à mais longe; depois as sem a data, pelo começo no tempo (as mais
 * novas primeiro com `recente`, as mais velhas com `antigo`); por fim as com a data antes de `de`, da mais
 * recente à mais velha. O empate cai na ordem de sempre (`desempate`).
 * Por quê: num ramo de coleção com data de publicação, o próximo a publicar fica no centro e no alto da coluna (02/11/2026).
 * Entra → sai: a ordem da coleção, o primeiro dia da linha e a ordem de sempre → a comparação.
 * Erro e ataque: a data malformada vale como sem data; a mesma entrada dá a mesma ordem (o desempate é total).
 * Prova: tests/missao/colecoesOrdem.test.ts.
 */
export function ordemPelaData(o: OrdemDaColecao, de: string, desempate: (a: NotaDaColecao, b: NotaDaColecao) => number): (a: NotaDaColecao, b: NotaDaColecao) => number {
    const chave = (n: NotaDaColecao): [number, string] => {
        const d = dataDoCampo(n.nota.campos?.[o.campo]);
        return d ? (d >= de ? [0, d] : [2, d]) : [1, n.spans[0]?.[0] ?? ''];
    };
    return (a, b) => {
        const [ga, ka] = chave(a), [gb, kb] = chave(b);
        if (ga !== gb) return ga - gb;
        const decrescente = ga === 2 || (ga === 1 && o.semValor === 'recente');
        return (decrescente ? kb.localeCompare(ka) : ka.localeCompare(kb)) || desempate(a, b);
    };
}

/** O que faz: o nó do alvo de um vínculo: a nota dele, ou só o nome, quando a nota não existe. */
function alvoDoVinculo(ix: IndiceDasColecoes, c: ColecaoDoRamo, nome: string): MissaoNo {
    const achada = ix.alvos.get(c.id)?.get(fold(nome));
    if (achada) return achada.no;
    // O vínculo sem fonte (02/11, os canais) é só o valor: não há nota a faltar.
    return { id: `c:${c.id}:${fold(nome)}`, tipo: 'nota', titulo: nome, linha: c.fontes.length ? FRASES.semNota : '', sub: c.fontes[0]?.rotulo ?? c.rotulo, ramo: -1 };
}

/**
 * O que faz: o nó de uma nota de coleção (com tempo) pelo nome da nota ou pelo título dela.
 * Por quê: 02/11, o ramo de Roteiros: a tarefa aponta o roteiro pelo `projects`, e a ligação padrão
 * (a coluna `"ligacoes": "padrao"`) acha o roteiro pelo nome escrito, como acha o país do vínculo.
 * Entra → sai: o índice e o nome → o nó, ou `null` (nenhuma nota com esse nome).
 * Prova: tests/missao/colecoesFiltradas.test.ts.
 */
export function noDaColecaoPeloNome(ix: IndiceDasColecoes, nome: string): MissaoNo | null {
    const k = fold(nome);
    if (!k) return null;
    return ix.notas.find(n => fold(n.nota.nome) === k || fold(n.no.titulo) === k)?.no ?? null;
}

/**
 * O que faz: o nó de um nome que um vínculo aponta (P10c, as conexões do painel): a nota do
 * alvo, quando existe; senão o nó só com o nome, quando alguma nota da coleção de origem o
 * aponta pelo campo do vínculo (o país sem nota de uma cidade).
 * Entra → sai: o índice e o nome → o nó, ou `null` (nenhum vínculo aponta esse nome).
 */
export function noDoVinculo(ix: IndiceDasColecoes, nome: string): MissaoNo | null {
    const k = fold(nome);
    if (!k) return null;
    for (const c of ix.colecoes) {
        if (!c.vinculo) continue;
        const achada = ix.alvos.get(c.id)?.get(k);
        if (achada) return achada.no;
        const aponta = ix.notas.some(n => n.colecao === c.vinculo!.colecao && nomesDoCampo(n.nota.campos?.[c.vinculo!.campo]).some(x => fold(x) === k));
        if (aponta) return alvoDoVinculo(ix, c, nome);
    }
    return null;
}

/* ------------------------------------------------------------ os trechos planejados */

export const idDoTrecho = (dia: string, de: string, para: string | null) => `r:${dia}:${fold(de)}>${fold(para ?? '')}`;

/**
 * O que faz: os trechos planejados: cada nota de uma fonte com `trecho`, com o dia de hoje em
 * diante, vira um trecho de onde ela diz para onde ela diz (ou "a decidir"), no dia que ela diz.
 * Por quê: §3.8 ("o trecho como nó"), derivado e nunca guardado; o dia que passou deixa de ser
 * plano (o trecho feito vem das passagens, pelo ✈️).
 * Erro e ataque: sem dia, sem origem, ou o dia antes de hoje, não há trecho; nenhum
 * transporte é dito, só os lugares e o dia.
 * Prova: tests/missao/colecoes.test.ts ("os trechos planejados").
 */
export function trechosPlanejados(ix: IndiceDasColecoes, hoje: string): Trecho[] {
    const out: Trecho[] = [];
    for (const n of ix.notas) {
        const t = n.fonte.trecho;
        if (!t) continue;
        const dia = dataDoCampo(n.nota.campos?.[t.data]);
        const de = textoDoCampo(n.nota.campos?.[t.de]);
        if (!dia || !de || dia < hoje) continue;
        const para = textoDoCampo(n.nota.campos?.[t.para]) || null;
        out.push({ id: idDoTrecho(dia, de, para), de, para, dia, planejado: true, nota: n.nota.caminho });
    }
    return out.sort((a, b) => a.dia.localeCompare(b.dia) || a.de.localeCompare(b.de));
}

/** O que faz: o nó de um trecho: de → para, o dia e de onde vem ("pela chegada" ou "planejado"). */
export function noDoTrecho(t: Trecho): MissaoNo {
    return {
        id: t.id, tipo: 'trecho', titulo: `${t.de} → ${t.para ?? FRASES.destinoADecidir}`,
        linha: `${diaDaSemana(t.dia)} ${diaMes(t.dia)} · ${t.planejado ? 'planejado' : 'pela chegada'}`, sub: t.planejado ? 'planejado' : 'feito', ramo: -1,
    };
}

/* ------------------------------------------------------------ o painel do nó */

/** O que faz: os campos de uma nota no painel, pela fonte (o valor formatado; vazio, "sem dado"). */
export function linhasDaNota(nota: NotaComCampos, fonte: FonteDaColecao): Array<[string, string]> {
    return fonte.campos.map(c => {
        const v = nota.campos?.[c.nome];
        let valor = '';
        if (c.formato === 'reais') { const n = fieldNumber(v); valor = n === null ? textoDoCampo(v) : reais(n); }
        else if (c.formato === 'data') { const d = dataDoCampo(v); valor = d ? `${diaMes(d)}/${d.slice(0, 4)}` : textoDoCampo(v); }
        else valor = textoDoCampo(v);
        return [c.rotulo, valor ? `${valor}${c.nota ? ` · ${c.nota}` : ''}` : FRASES.semDado] as [string, string];
    });
}

/**
 * O que faz: o detalhe de um nó que não é tarefa, projeto nem período: a nota de uma coleção
 * (`n:`), o trecho (`r:`) e o alvo do vínculo sem nota (`c:`).
 * Entra → sai: o índice, os trechos do modelo e o id → `DetalheDoNo`, ou `null` (id de outro tipo).
 * Prova: tests/missao/colecoes.test.ts ("o painel").
 */
export function detalheDoNo(ix: IndiceDasColecoes, trechos: readonly Trecho[], id: string): DetalheDoNo | null {
    const seguidoras = (caminho: string) => {
        const nome = fold(caminho.split('/').pop()!.replace(/\.md$/, ''));
        return ix.notas.filter(n => n.fonte.segue && nomesDoCampo(n.nota.campos?.[n.fonte.segue]).some(x => fold(x) === nome));
    };
    const ligadasDe = (lst: NotaDaColecao[]) => ({
        ligadas: lst.map(n => n.no),
        linhasDasLigadas: Object.fromEntries(lst.map(n => [n.no.id, linhasDaNota(n.nota, n.fonte)])),
    });
    if (id.startsWith('r:')) {
        const t = trechos.find(x => x.id === id);
        if (!t) return null;
        const linhas: Array<[string, string]> = [['Dia', diaComAno(t.dia)], ['De', t.de], ['Para', t.para ?? FRASES.destinoADecidir], ['Registro', t.planejado ? 'pelo planejamento' : 'pelas passagens']];
        return { titulo: noDoTrecho(t).titulo, rotulo: 'Trecho', nota: t.nota, linhas, ...ligadasDe(t.nota ? seguidoras(t.nota) : []) };
    }
    if (id.startsWith('c:')) {
        const [, col, ...resto] = id.split(':');
        const c = ix.colecoes.find(x => x.id === col);
        if (!c?.vinculo) return null;
        const nome = resto.join(':');
        const origens = ix.notas.filter(n => n.colecao === c.vinculo!.colecao && nomesDoCampo(n.nota.campos?.[c.vinculo!.campo]).some(x => fold(x) === nome));
        const titulo = origens.flatMap(n => nomesDoCampo(n.nota.campos?.[c.vinculo!.campo])).find(x => fold(x) === nome) ?? nome;
        const fonte = c.fontes[0];
        return {
            titulo, rotulo: fonte?.rotulo ?? c.rotulo, nota: null, linhas: fonte ? [['Nota', FRASES.semNota]] : [], ...ligadasDe(origens),
            ...(fonte ? { semNota: { type: fonte.type, campo: fonte.titulo, nome: titulo } } : {}),
        };
    }
    if (!id.startsWith('n:')) return null;
    const caminho = id.slice(2);
    const item = ix.notas.find(n => n.nota.caminho === caminho) ?? [...ix.alvos.values()].flatMap(m => [...m.values()]).find(n => n.nota.caminho === caminho);
    if (!item) return null;
    const c = ix.colecoes.find(x => x.id === item.colecao);
    // O alvo de um vínculo: as notas que o apontam; os outros: as que o seguem.
    const ligadas = c?.vinculo
        ? ix.notas.filter(n => n.colecao === c.vinculo!.colecao && nomesDoCampo(n.nota.campos?.[c.vinculo!.campo]).some(x => fold(x) === fold(item.no.titulo) || fold(x) === fold(item.nota.nome)))
        : seguidoras(caminho);
    return { titulo: item.no.titulo, rotulo: item.fonte.rotulo, nota: caminho, linhas: linhasDaNota(item.nota, item.fonte), ...ligadasDe(ligadas) };
}
