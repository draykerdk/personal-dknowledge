/**
 * O ramo de um nó: tudo a que ele se liga, em todos os períodos, nível por nível, para o zoom da
 * pinça entrar no objeto e cada zoom seguinte entrar um nível mais fundo.
 *
 * Por quê: a proposta da pinça (29/10): numa tarefa, o zoom mostra as dependências e as subtarefas,
 * todo o ramo daquela tarefa e ao que ela se conecta; na cidade e no país, o ramo daquele lugar em
 * detalhe, indo além do temporal; e assim para cada componente, como uma aproximação de fractais.
 * A mesma lógica vale para quase tudo: o ramo de cada componente.
 *
 * O ramo é genérico (29/10): as relações saem dos modelos de tipo (`Config/dominios/*.json`). Um
 * campo de link com `ramo` é uma conexão padrão: `acima` (a nota pertence ao alvo), `abaixo` (o
 * alvo pertence a ela) ou `lado` (a dependência, o par); o inverso sai sozinho, porque o ramo do
 * alvo lista quem aponta para ele no sentido contrário. Um tipo novo ganha o ramo ao ser declarado,
 * sem código próprio. O que só um tipo tem (a checklist da tarefa, as passagens do lugar, as semanas
 * do trimestre, o tempo da tarefa) mora numa tabela de extras por espécie (`EXTRAS_DO_RAMO`), e os
 * links da nota, nas duas direções, valem para todo tipo.
 *
 * A ordem de cada nível é a da proposta: para cima, para baixo e para os lados ("para cima, para
 * baixo e para os lados", 29/10); dentro de cada sentido, as conexões dos modelos e depois os
 * extras; os links da nota por último.
 *
 * Compõe o que o modelo da versão já tem (o índice das tarefas e dos projetos, as camadas do lugar,
 * as passagens, o detalhe das coleções do ramo, o nó de cada nota) e o que o leitor entrega da
 * borda (o frontmatter, os links e o texto da nota, pelo cache): nada aqui relê o cofre.
 *
 * Módulo puro: sem Obsidian e sem DOM. Prova: tests/missao/ramo.test.ts.
 */
import type { BranchDirection, DomainField, DomainModel } from '../engine/domainModel';
import { fold, linkTarget } from '../project/projectCanvasModel';
import { suportesDoTexto } from '../engine/suportes';
import { linkNames } from '../engine/temporada';
import { checklistDoTexto, idDoItem, textoLimpoDoItem } from './checklist';
import { nosDaLinha } from './conexoes';
import { nosDaFonte, type ColunaDoRamo } from './ramoPrincipal';
import { idDaArea, idDoProjeto, VISAO_ID } from './linhagem';
import { FRASES, RAMO } from './frases';
import { datasDaPassagem } from './lugares';
import { PREFIXO_DA_PESSOA } from './pessoas';
import { chaveDeHoje, chaveNaEscala, diaComAno, diasDoPeriodo, idDoPeriodo, isChaveEspecial, pendentesDe, periodoDoId, PROFUNDIDADE_MAXIMA, semanaCurta } from './tempo';
import type { EspecieDoRamo, Passagem, ItemDoRamo, LeitorDoRamo, Ligacao, LinhaAberta, MissaoModelo, MissaoProjeto, MissaoTarefa, NivelDoRamo, RamoDoNo, RelacaoDoRamo } from './tipos';

/** Quantos itens cada nível do ramo traz, no máximo (o resto conta em `mais`). */
export const ITENS_POR_NIVEL = 300;

/**
 * Quantos nós de um nível descem para o nível seguinte, no máximo (os primeiros, na ordem do ramo).
 * Por quê: o congelamento de 30/10 (o zoom num projeto grande): o nível 2 do projeto
 * saía das relações de até `ITENS_POR_NIVEL` nós, e cada nó varria a memória inteira; o custo
 * crescia com o produto. Com o teto, um ramo custa no máximo `1 + (PROFUNDIDADE_MAXIMA - 1) ×
 * EXPANDIDOS_POR_NIVEL` relações, por maior que seja o cofre.
 */
export const EXPANDIDOS_POR_NIVEL = 48;

/** O que o ramo lê do modelo: o índice, as passagens, o lugar, o hoje, a visão e os achadores de nó. */
export type ModeloDoRamo = Pick<MissaoModelo, 'indice' | 'passagens' | 'hoje' | 'visao' | 'arquivos' | 'detalhe' | 'noDaNota' | 'noDoNome' | 'pessoa' | 'pessoasDoLugar' | 'lugarDoNo' | 'ordemDasTarefas'>;

/** Um item antes de saber de onde sai (o nível o completa). */
type Relacao = Omit<ItemDoRamo, 'de'>;

/** A raiz de um nó: o título e a espécie. */
interface Raiz { titulo: string; especie: EspecieDoRamo }

const nomeDoCaminho = (c: string) => c.slice(c.lastIndexOf('/') + 1).replace(/\.md$/, '');
const tituloDoDia = diaComAno;
const ORDEM_DO_SENTIDO: Record<Relacao['sentido'], number> = { acima: 0, abaixo: 1, lado: 2 };
const INVERSO: Record<BranchDirection, BranchDirection> = { acima: 'abaixo', abaixo: 'acima', lado: 'lado' };

/* ------------------------------------------------------------ as tabelas declaradas */

/**
 * O domínio do modelo das espécies que a Missão monta na memória sem a nota dizer o `type` (a área
 * é a pasta do portfólio); as TaskNotes pelo `type` do registro, o projeto pela espécie do índice,
 * o lugar pelas camadas, e as outras notas pelo `type` do frontmatter.
 */
const DOMINIO_DA_ESPECIE: Partial<Record<EspecieDoRamo, string>> = { area: 'area' };

/** Os domínios dos nós de projeto do índice (a espécie que o portfólio dá a cada pasta). */
const DOMINIOS_DO_PROJETO: ReadonlySet<string> = new Set<string>(['projeto', 'departamento'] satisfies Array<MissaoProjeto['tipo']>);

/**
 * O nome da relação entre dois nós da mesma espécie (o campo que aponta o próprio tipo): a tarefa
 * mãe e a subtarefa (o jeito do TaskNotes), a central e o auxiliar. A relação de lado da TaskNote é
 * o bloqueio. Sem linha aqui, o nome é a espécie do outro lado.
 */
const RELACAO_ENTRE_IGUAIS: Partial<Record<EspecieDoRamo, Partial<Record<BranchDirection, { sai: RelacaoDoRamo; entra: RelacaoDoRamo }>>>> = {
    acao: { acima: { sai: 'mae', entra: 'subtarefa' } },
    projeto: { acima: { sai: 'central', entra: 'auxiliar' } },
};
const DE_LADO: Partial<Record<EspecieDoRamo, { sai: RelacaoDoRamo; entra: RelacaoDoRamo }>> = {
    acao: { sai: 'bloqueada-por', entra: 'bloqueia' },
    smart: { sai: 'bloqueada-por', entra: 'bloqueia' },
};

/** O nome da relação pela espécie do outro lado (a tarefa sob a SMART é a ação). */
const RELACAO_DA_ESPECIE: Record<EspecieDoRamo, RelacaoDoRamo> = {
    acao: 'acao', smart: 'smart', projeto: 'projeto', area: 'area', periodo: 'periodo', visao: 'periodo',
    pais: 'pais', cidade: 'cidade', passagem: 'passagem', pessoa: 'pessoa', nota: 'ligada', item: 'item',
};

/* ------------------------------------------------------------ o contexto de uma chamada */

/** Um nó como componente de um tipo: o domínio do modelo e o valor de um campo de link dele. */
interface Componente {
    id: string;
    titulo: string;
    especie: EspecieDoRamo;
    dominio: string | null;
    caminho: string | null;
    valor: (campo: DomainField) => unknown;
}

/** O que o ramo monta uma vez por chamada. */
interface Ctx {
    m: ModeloDoRamo;
    leitor: LeitorDoRamo;
    modelos: readonly DomainModel[];
    porNome: Map<string, MissaoTarefa>;
    /** Os `type` das TaskNotes do índice: o domínio cujo modelo tem um deles é de TaskNote. */
    typesDeTarefa: Set<string>;
    /** Os componentes que a Missão tem na memória (as TaskNotes, os projetos, as cidades): quem aponta, sem ler nota. */
    memoria: () => Componente[];
    /** Os ids da memória, para saber num passo se um nó já está nela. */
    idsDaMemoria: () => Set<string>;
    /** Quem aponta para quem, pela memória, montado uma vez (o inverso dos campos com `ramo`). */
    apontados: () => Map<string, Apontado[]>;
    /** O que já se calculou nesta chamada: o componente e as relações de cada nó. */
    componentes: Map<string, Componente | null>;
    relacoes: Map<string, Relacao[]>;
}

/** Um componente da memória que aponta para outro por um campo com `ramo` (a ordem guarda a da varredura). */
interface Apontado { fonte: Componente; campo: DomainField; ordem: number }

/** O que faz: os índices de uma chamada: as tarefas pelo nome (dobrado) e os modelos. */
function contexto(m: ModeloDoRamo, leitor: LeitorDoRamo): Ctx {
    const porNome = new Map<string, MissaoTarefa>();
    for (const t of m.indice.tarefas) { const k = fold(t.record.basename); if (k && !porNome.has(k)) porNome.set(k, t); }
    let memoria: Componente[] | null = null;
    let ids: Set<string> | null = null;
    let apontados: Map<string, Apontado[]> | null = null;
    const ctx: Ctx = {
        m, leitor, modelos: m.indice.tabelas?.tipos ?? [], porNome, typesDeTarefa: new Set(m.indice.tarefas.map(t => t.record.type)),
        memoria: () => (memoria ??= componentesNaMemoria(ctx)),
        idsDaMemoria: () => (ids ??= new Set(ctx.memoria().map(c => c.id))),
        apontados: () => (apontados ??= indiceDosApontados(ctx)),
        componentes: new Map(), relacoes: new Map(),
    };
    return ctx;
}

/** O que faz: os nomes de um valor de campo de link (um ou uma lista; o `{ uid }` do TaskNotes; o alias fora). */
function nomesDoValor(v: unknown): string[] {
    // O texto com vários links ("[[A]], [[B]]") é uma lista (02/11): um nome por link.
    const lista = Array.isArray(v) ? v : v === null || v === undefined || v === '' ? [] : [v];
    const itens = lista.flatMap(it => (typeof it === 'string' && (it.match(/\[\[/g) ?? []).length > 1 ? linkNames(it) : [it]));
    const out: string[] = [];
    for (const it of itens) {
        const cru = it && typeof it === 'object' && !Array.isArray(it) ? (it as Record<string, unknown>).uid : it;
        const n = linkTarget(cru);
        if (n && !out.some(x => fold(x) === fold(n))) out.push(n);
    }
    return out;
}

/* ------------------------------------------------------------ o lugar em camadas, pelas passagens */

/** O que faz: o último dia de uma passagem (a aberta vale até hoje, ou até a chegada, se ela é futura). */
const fimDaPassagem = (e: Passagem, hoje: string) => e.ate ?? (e.de > hoje ? e.de : hoje);

/**
 * O que faz: o nó de uma nota no ramo: o que o modelo dá para ela; a nota de uma cidade, que o
 * modelo resolve na passagem mais nova, fica a própria nota (`n:`), para o zoom entrar na cidade e
 * não numa passagem só; a nota sem nó, `n:` também.
 */
function noDaNotaNoRamo(m: ModeloDoRamo, caminho: string): { id: string; titulo: string } {
    const no = m.noDaNota(caminho);
    if (no && !(no.id.startsWith('l:') && m.passagens.some(e => e.nota === caminho))) return no;
    const e = m.passagens.find(x => x.nota === caminho);
    return { id: `n:${caminho}`, titulo: e?.cidade ?? no?.titulo ?? nomeDoCaminho(caminho) };
}

const itemDaPassagem = (e: Passagem): Relacao => ({ id: e.id, titulo: `${e.cidade} · ${datasDaPassagem(e)}`, relacao: 'passagem', sentido: 'abaixo', rotulo: null });

/** O que faz: as tarefas que caem nos dias de umas passagens (a tarefa ainda não tem campo de lugar). */
function tarefasNasPassagens(m: ModeloDoRamo, lista: readonly Passagem[]): Relacao[] {
    return m.indice.tarefas
        .filter(t => t.colocacao.dia && lista.some(e => e.de <= t.colocacao.dia! && t.colocacao.dia! <= fimDaPassagem(e, m.hoje)))
        .sort((a, b) => a.colocacao.dia!.localeCompare(b.colocacao.dia!) || a.titulo.localeCompare(b.titulo, 'pt-BR'))
        .map(t => ({ id: t.id, titulo: t.titulo, relacao: 'tarefa', sentido: 'abaixo', rotulo: 'pelo dia da passagem' }));
}

/* ------------------------------------------------------------ a raiz: o título e a espécie */

/** O que faz: a espécie de lugar de um nó que não é passagem: a cidade, o país, ou `null`. */
function especieDoLugar(m: ModeloDoRamo, id: string): 'cidade' | 'pais' | null {
    const l = m.lugarDoNo(id);
    if (!l || l.passagem) return null;
    return l.cidade ? 'cidade' : l.pais ? 'pais' : null;
}

/**
 * O que faz: o título e a espécie de um nó que a Missão conhece; `null` = não conhece.
 * Entra → sai: o contexto e o id → `{ titulo, especie }` ou `null`.
 */
function raizDe(ctx: Ctx, id: string): Raiz | null {
    const { m } = ctx;
    const t = m.indice.porId.get(id);
    if (t) return { titulo: t.titulo, especie: t.tipo === 'smart' ? 'smart' : 'acao' };
    if (id.startsWith('p:')) { const p = m.indice.projetos.get(id); return p ? { titulo: p.nome, especie: 'projeto' } : null; }
    if (id.startsWith('a:')) { const a = m.indice.areas.get(id); return a ? { titulo: a.nome, especie: 'area' } : null; }
    if (id.startsWith('l:')) { const e = m.passagens.find(x => x.id === id); return e ? { titulo: `${e.cidade} · ${datasDaPassagem(e)}`, especie: 'passagem' } : null; }
    if (id === VISAO_ID) return { titulo: m.visao.nome ?? 'Visão', especie: 'visao' };
    if (id.startsWith(PREFIXO_DA_PESSOA)) { const p = m.pessoa(id); return p ? { titulo: p.pessoa.nome, especie: 'pessoa' } : null; }
    const periodo = periodoDoId(id);
    if (periodo) {
        const { escala, chave } = periodo;
        if (isChaveEspecial(chave) || !diasDoPeriodo(escala, chave).length) return null;
        return { titulo: escala === 'dia' ? tituloDoDia(chave) : escala === 'semana' ? semanaCurta(chave) : chave, especie: 'periodo' };
    }
    if (!/^[ncr]:/.test(id)) return null;
    const detalhe = m.detalhe(id);
    const caminho = id.startsWith('n:') ? id.slice(2) : null;
    // O país sem nota (G6): o nó dele nas camadas do lugar, só pelo id que as camadas dão.
    const paisSemNota = !detalhe && id.startsWith('c:') ? m.lugarDoNo(id)?.pais : null;
    const titulo = detalhe?.titulo ?? (paisSemNota?.id === id ? paisSemNota.nome : null) ?? (caminho && (m.passagens.find(e => e.nota === caminho)?.cidade ?? m.noDaNota(caminho)?.titulo ?? (ctx.leitor.ligacoesDaNota?.(caminho) ? nomeDoCaminho(caminho) : null)));
    if (!titulo) return null;
    return { titulo, especie: especieDoLugar(m, id) ?? 'nota' };
}

/* ------------------------------------------------------------ o nó como componente de um tipo */

/** O que faz: o modelo de uma nota pelo `type` dela; `null` = nenhum. */
const modeloDoType = (ctx: Ctx, type: unknown) => (typeof type === 'string' && type.trim() ? ctx.modelos.find(x => x.candidatos.type === type.trim()) ?? null : null);

/** O que faz: os campos de link de um domínio que entram no ramo (os que declaram `ramo`). */
function camposDoRamo(ctx: Ctx, dominio: string | null): DomainField[] {
    if (!dominio) return [];
    return (ctx.modelos.find(x => x.dominio === dominio)?.campos ?? []).filter(c => c.tipo === 'link' && !!c.ramo);
}

/**
 * O que faz: o nó como componente do tipo dele: o domínio do modelo e o valor de cada campo de link.
 * A TaskNote lê do registro (o índice); o projeto, da pasta e da central que serve (o índice); a
 * cidade, do frontmatter ou, sem o leitor, do país das camadas; as outras notas, do frontmatter que
 * o leitor dá. `null` = o nó não tem tipo de modelo (a passagem, o período sem nota).
 */
function componenteDe(ctx: Ctx, id: string, raiz?: Raiz | null): Componente | null {
    if (ctx.componentes.has(id)) return ctx.componentes.get(id)!;
    const c = componenteSemMemo(ctx, id, raiz === undefined ? raizDe(ctx, id) : raiz);
    ctx.componentes.set(id, c);
    return c;
}

/** O que faz: o componente de um nó, sem a memória da chamada (`componenteDe` guarda o resultado). */
function componenteSemMemo(ctx: Ctx, id: string, raiz: Raiz | null): Componente | null {
    const { m, leitor } = ctx;
    if (!raiz) return null;
    const t = m.indice.porId.get(id);
    if (t) {
        const reg = t.record as unknown as Record<string, unknown>;
        return { id, titulo: t.titulo, especie: raiz.especie, dominio: modeloDoType(ctx, t.record.type)?.dominio ?? null, caminho: t.caminho, valor: c => reg[c.nome] };
    }
    const p = m.indice.projetos.get(id);
    if (p) {
        const daArea = DOMINIO_DA_ESPECIE.area;
        // A central que ele serve é o campo de cima; o lado (a dependência, 02/11/2026) a entrada do
        // projeto não traz, e o painel o lê da nota: sem o `ramo`, o lado ganharia a central.
        return { id, titulo: p.nome, especie: 'projeto', dominio: p.tipo, caminho: p.nota, valor: c => ((c.alvo ?? []).includes(daArea ?? '') ? [p.area] : (c.alvo ?? []).includes(p.tipo) && c.ramo === 'acima' ? p.serve ?? [] : undefined) };
    }
    const a = m.indice.areas.get(id);
    if (a) return { id, titulo: a.nome, especie: 'area', dominio: DOMINIO_DA_ESPECIE.area ?? null, caminho: a.nota, valor: () => undefined };
    if (id.startsWith('l:')) return null;
    const caminho = m.arquivos(id).nota ?? (id.startsWith('n:') ? id.slice(2) : null);
    const fm = caminho ? leitor.camposDaNota?.(caminho) ?? null : null;
    const lugar = raiz.especie === 'cidade' || raiz.especie === 'pais' ? m.lugarDoNo(id) : null;
    const dominio = lugar?.dominio ?? modeloDoType(ctx, fm?.type)?.dominio ?? null;
    // A cidade sem o leitor: o país das camadas, no campo de link dela que aponta outro tipo.
    const paisDaCidade = lugar?.cidade?.pais ?? null;
    return {
        id, titulo: raiz.titulo, especie: raiz.especie, dominio, caminho,
        valor: c => (fm ? fm[c.nome] : paisDaCidade && dominio && !(c.alvo ?? []).includes(dominio) ? paisDaCidade : undefined),
    };
}

/** O que faz: os componentes que a Missão tem na memória: as TaskNotes, os projetos e as cidades das passagens. */
function componentesNaMemoria(ctx: Ctx): Componente[] {
    const { m } = ctx;
    const out: Componente[] = [];
    const add = (id: string) => { const c = componenteDe(ctx, id); if (c?.dominio) out.push(c); };
    for (const t of m.indice.tarefas) add(t.id);
    for (const p of m.indice.projetos.values()) add(p.id);
    for (const nota of [...new Set(m.passagens.map(e => e.nota).filter((n): n is string => !!n))]) add(`n:${nota}`);
    return out;
}

/* ------------------------------------------------------------ as conexões padrão (os modelos) */

/**
 * O que faz: o nó que um nome escrito num campo de link acha, pelos tipos do `alvo`: a TaskNote do
 * tipo, o projeto ou o departamento, a área, o lugar pelo nome; senão a nota que o link do
 * frontmatter acha (o leitor); senão o nome, sem nó.
 */
function alvoDoNome(ctx: Ctx, nome: string, campo: DomainField, de: string | null): { id: string | null; titulo: string } {
    const { m, leitor } = ctx;
    const k = fold(nome);
    // O lugar pelo nome só quando o alvo tem um tipo que não é TaskNote, projeto nem área.
    let lugar = false;
    for (const d of campo.alvo ?? []) {
        const md = ctx.modelos.find(x => x.dominio === d);
        if (md && ctx.typesDeTarefa.has(md.candidatos.type)) {
            const t = ctx.porNome.get(k);
            if (t && t.record.type === md.candidatos.type) return { id: t.id, titulo: t.titulo };
        } else if (DOMINIOS_DO_PROJETO.has(d)) {
            const p = m.indice.projetos.get(idDoProjeto(nome));
            if (p && p.tipo === d) return { id: p.id, titulo: p.nome };
        } else if (d === DOMINIO_DA_ESPECIE.area) {
            const a = m.indice.areas.get(idDaArea(nome));
            if (a) return { id: a.id, titulo: a.nome };
        } else lugar = true;
    }
    if (lugar) { const no = m.noDoNome(nome); if (no) return no; }
    const l = de ? leitor.ligacoesDaNota?.(de)?.saem.find(x => x.chave === campo.nome && x.caminho && fold(linkTarget(x.nome)) === k) : undefined;
    if (l?.caminho) return noDaNotaNoRamo(m, l.caminho);
    return { id: null, titulo: nome };
}

/** O que faz: o nome da relação de um campo, pelo sentido e pelas espécies das duas pontas. */
function nomeDaRelacao(sentido: BranchDirection, de: EspecieDoRamo, para: EspecieDoRamo, lado: 'sai' | 'entra'): RelacaoDoRamo {
    if (sentido === 'lado') return DE_LADO[de]?.[lado] ?? 'par';
    if (de === para) { const r = RELACAO_ENTRE_IGUAIS[de]?.[sentido]; if (r) return r[lado]; }
    return RELACAO_DA_ESPECIE[lado === 'sai' ? para : de];
}

const especieDoId = (ctx: Ctx, id: string | null): EspecieDoRamo => (id ? raizDe(ctx, id)?.especie ?? 'nota' : 'nota');

/** O que faz: as conexões que saem do nó: cada campo de link com `ramo` do modelo dele, alvo por alvo. */
function conexoesQueSaem(ctx: Ctx, c: Componente): Relacao[] {
    const out: Relacao[] = [];
    for (const campo of camposDoRamo(ctx, c.dominio)) {
        for (const nome of nomesDoValor(c.valor(campo))) {
            const alvo = alvoDoNome(ctx, nome, campo, c.caminho);
            // O nome que não acha nó só entra de lado (o bloqueio sem tarefa); acima e abaixo, o link quebrado é do painel.
            if (alvo.id === c.id || (!alvo.id && campo.ramo !== 'lado')) continue;
            // Quem está do outro lado: a espécie do nó, ou, sem nó, a do primeiro tipo do alvo.
            const para = alvo.id ? especieDoId(ctx, alvo.id) : c.especie;
            out.push({ id: alvo.id, titulo: alvo.titulo, relacao: nomeDaRelacao(campo.ramo!, c.especie, para, 'sai'), sentido: campo.ramo!, rotulo: alvo.id ? null : FRASES.semNota });
        }
    }
    return out;
}

/**
 * O que faz: o índice inverso da memória: para cada nó (o id) e para cada nome sem nó (`?<nome dobrado>`),
 * quem aponta para ele por um campo com `ramo`, na ordem da varredura (os modelos, a memória, os campos).
 * Por quê: o congelamento de 30/10: as conexões que entram varriam a memória inteira a cada nó do
 * ramo; agora a varredura é uma só por chamada.
 * Entra → sai: o contexto → o índice.
 */
function indiceDosApontados(ctx: Ctx): Map<string, Apontado[]> {
    const out = new Map<string, Apontado[]>();
    const memoria = ctx.memoria();
    let ordem = 0;
    const por = (k: string, a: Apontado) => { const l = out.get(k); if (l) { if (!l.some(x => x.fonte === a.fonte && x.campo === a.campo)) l.push(a); } else out.set(k, [a]); };
    for (const modelo of ctx.modelos) {
        const campos = camposDoRamo(ctx, modelo.dominio);
        if (!campos.length) continue;
        for (const fonte of memoria) {
            if (fonte.dominio !== modelo.dominio) continue;
            for (const campo of campos) {
                const a: Apontado = { fonte, campo, ordem: ordem++ };
                for (const nome of nomesDoValor(fonte.valor(campo))) {
                    const achado = alvoDoNome(ctx, nome, campo, fonte.caminho);
                    por(achado.id ? achado.id : `?${fold(nome)}`, a);
                }
            }
        }
    }
    return out;
}

/**
 * O que faz: as conexões que entram no nó: quem aponta para ele por um campo com `ramo` (o inverso
 * do sentido do campo): os componentes da memória (pelo índice inverso) e, pelo leitor, as notas que
 * apontam para a nota dele.
 */
function conexoesQueEntram(ctx: Ctx, alvo: Componente): Relacao[] {
    if (!alvo.dominio) return [];
    const out: Relacao[] = [];
    const de = (fonte: Componente, campo: DomainField) => {
        if (fonte.id === alvo.id) return;
        const sentido = INVERSO[campo.ramo!];
        out.push({ id: fonte.id, titulo: fonte.titulo, relacao: nomeDaRelacao(campo.ramo!, fonte.especie, alvo.especie, 'entra'), sentido, rotulo: null });
    };
    // O nó pelo id e, para o nome sem nó, pelo título e pelo nome da nota (o nome escrito acha o nó dele, pelo título ou pela nota).
    const idx = ctx.apontados();
    const chaves = [alvo.id, `?${fold(alvo.titulo)}`, ...(alvo.caminho ? [`?${fold(nomeDoCaminho(alvo.caminho))}`] : [])];
    const vistos = new Set<Apontado>();
    const achados: Apontado[] = [];
    for (const k of chaves) for (const a of idx.get(k) ?? []) if (!vistos.has(a) && (a.campo.alvo ?? []).includes(alvo.dominio)) { vistos.add(a); achados.push(a); }
    for (const a of achados.sort((x, y) => x.ordem - y.ordem)) de(a.fonte, a.campo);
    const naMemoria = ctx.idsDaMemoria();
    // As notas que apontam para a nota do nó (o cache): o tipo delas pelo `type`, o campo pelo frontmatter.
    const entram = alvo.caminho && ctx.leitor.camposDaNota ? ctx.leitor.ligacoesDaNota?.(alvo.caminho)?.entram ?? [] : [];
    for (const e of entram) {
        const modelo = modeloDoType(ctx, e.type);
        const campos = camposDoRamo(ctx, modelo?.dominio ?? null).filter(c => (c.alvo ?? []).includes(alvo.dominio!));
        if (!modelo || !campos.length) continue;
        const no = noDaNotaNoRamo(ctx.m, e.caminho);
        if (naMemoria.has(no.id)) continue;
        const fm = ctx.leitor.camposDaNota!(e.caminho) ?? {};
        const fonte: Componente = { id: no.id, titulo: no.titulo, especie: especieDoId(ctx, no.id), dominio: modelo.dominio, caminho: e.caminho, valor: c => fm[c.nome] };
        for (const campo of campos) de(fonte, campo);
    }
    return out;
}

/** O que faz: "pela SMART", "pelo projeto": por onde veio o que está acima, pela espécie do passo de baixo. */
const pelo = (e: EspecieDoRamo) => RAMO.pelo[e] ?? null;

/**
 * O que faz: as conexões padrão de um nó (os modelos de tipo): as que saem e as que entram e, acima,
 * a subida inteira (a SMART, o projeto e a área de uma tarefa; o país de uma cidade), na ordem
 * acima, abaixo, lado; sem repetir nó.
 * Entra → sai: o contexto, o id e a raiz → as relações (nenhuma, se o nó não é componente de um tipo).
 */
function conexoesPadrao(ctx: Ctx, id: string, raiz: Raiz): Relacao[] {
    const c = componenteDe(ctx, id, raiz);
    if (!c) return [];
    const diretas = [...conexoesQueSaem(ctx, c), ...conexoesQueEntram(ctx, c)];
    // A subida: o que está acima do que está acima, até o topo (a tarefa vê a SMART, o projeto e a área).
    const subida: Relacao[] = [];
    const vistos = new Set<string>([id, ...diretas.map(r => r.id).filter((x): x is string => !!x)]);
    let fronteira = diretas.filter(r => r.sentido === 'acima' && r.id).map(r => ({ id: r.id!, especie: especieDoId(ctx, r.id) }));
    for (let passo = 0; passo < PROFUNDIDADE_MAXIMA + 2 && fronteira.length; passo++) {
        const proxima: typeof fronteira = [];
        for (const f of fronteira) {
            const cf = componenteDe(ctx, f.id);
            if (!cf) continue;
            for (const r of [...conexoesQueSaem(ctx, cf), ...conexoesQueEntram(ctx, cf)]) {
                if (r.sentido !== 'acima' || !r.id || vistos.has(r.id)) continue;
                // O período não se herda na subida (02/11): o trimestre que tem o projeto de cima no foco não é
                // o período deste nó (a tarefa da W45 aparecia em "Período · 2026-Q3" pelo foco de um projeto).
                // O período da tarefa é o do tempo dela (`lugarNoTempo`), o do Tempo do painel e da linha do tempo.
                if (DO_TEMPO.has(especieDoId(ctx, r.id))) continue;
                vistos.add(r.id);
                subida.push({ ...r, rotulo: pelo(f.especie) });
                proxima.push({ id: r.id, especie: especieDoId(ctx, r.id) });
            }
        }
        fronteira = proxima;
    }
    const acima = diretas.filter(r => r.sentido === 'acima');
    return [...acima, ...subida, ...diretas.filter(r => r.sentido !== 'acima')];
}

/** As espécies do tempo, que a subida não herda. */
const DO_TEMPO: ReadonlySet<EspecieDoRamo> = new Set<EspecieDoRamo>(['periodo', 'visao']);

/* ------------------------------------------------------------ os extras de cada espécie */

/** O que faz: o tempo e o lugar de uma tarefa: o trimestre da SMART, o dia ou a semana, a passagem do dia. */
function tempoDaTarefa(ctx: Ctx, t: MissaoTarefa): Relacao[] {
    const { m } = ctx;
    const out: Relacao[] = [];
    const c = t.colocacao;
    if (t.tipo === 'smart' && c.trimestre) out.push({ id: idDoPeriodo('trimestre', c.trimestre), titulo: c.trimestre, relacao: 'trimestre', sentido: 'acima', rotulo: null });
    if (c.lugar === 'linha' && c.dia) {
        const quando = c.daSemana && c.semana ? { id: idDoPeriodo('semana', c.semana), titulo: semanaCurta(c.semana) } : { id: idDoPeriodo('dia', c.dia), titulo: tituloDoDia(c.dia) };
        out.push({ ...quando, relacao: 'quando', sentido: 'lado', rotulo: c.fonte });
        for (const e of m.passagens) if (e.de <= c.dia && c.dia <= fimDaPassagem(e, m.hoje)) out.push({ ...itemDaPassagem(e), relacao: 'lugar', sentido: 'lado', rotulo: 'pelo dia' });
    }
    return out;
}


/** O que faz: os itens da checklist da nota da tarefa (as linhas `- [ ]` e `- [x]`), pelo texto que o leitor dá. */
function checklistDaTarefa(ctx: Ctx, t: MissaoTarefa): Relacao[] {
    const texto = ctx.leitor.textoDaNota?.(t.caminho);
    if (typeof texto !== 'string') return [];
    return checklistDoTexto(texto).map(i => ({ id: idDoItem(t.caminho, i.linha), titulo: textoLimpoDoItem(i.texto), relacao: 'item', sentido: 'abaixo', rotulo: i.feito ? RAMO.itemFeito : null }));
}

/** O que faz: o trimestre da Temporada (o projeto que está nela, ou a área que tem um projeto nela). */
function temporada(ctx: Ctx, estaNela: boolean): Relacao[] {
    if (!estaNela) return [];
    const q = chaveDeHoje('trimestre', ctx.m.hoje);
    return [{ id: idDoPeriodo('trimestre', q), titulo: q, relacao: 'trimestre', sentido: 'acima', rotulo: 'pela Temporada' }];
}

/** O que faz: o lugar em camadas (G6, `lugarDoNo`): a cidade e o país acima; as cidades, as passagens, as tarefas dos dias delas e as pessoas abaixo. */
function camadasDoLugar(ctx: Ctx, id: string): Relacao[] {
    const { m } = ctx;
    const l = m.lugarDoNo(id);
    if (!l) return [];
    const out: Relacao[] = [];
    const lugar = (x: { id: string | null; nome: string }, relacao: RelacaoDoRamo, sentido: Relacao['sentido']): Relacao => ({ id: x.id, titulo: x.nome, relacao, sentido, rotulo: null });
    const passagens = l.passagem ? [l.passagem] : l.passagens;
    if (l.passagem && l.cidade) out.push(lugar(l.cidade, 'cidade', 'acima'));
    else if (l.passagem) out.push({ id: null, titulo: l.passagem.cidade, relacao: 'cidade', sentido: 'acima', rotulo: null });
    if (l.passagem || l.cidade) {
        // O país das camadas; sem ele (a cidade de um tipo sem modelo), o que as passagens dizem.
        const nome = l.pais ? null : passagens.map(e => e.pais).find((p): p is string => !!p) ?? null;
        if (l.pais) out.push(lugar(l.pais, 'pais', 'acima'));
        else if (nome) { const no = m.noDoNome(nome); out.push({ id: no?.id ?? null, titulo: no?.titulo ?? nome, relacao: 'pais', sentido: 'acima', rotulo: null }); }
    } else {
        // O país: as cidades das camadas e as das passagens dele (a cidade sem campo de país lido).
        const cidades = [...l.cidades.map(x => lugar(x, 'cidade', 'abaixo'))];
        for (const e of passagens) {
            const no = e.nota ? noDaNotaNoRamo(m, e.nota) : null;
            const r: Relacao = { id: no?.id ?? null, titulo: no?.titulo ?? e.cidade, relacao: 'cidade', sentido: 'abaixo', rotulo: null };
            if (!cidades.some(x => (x.id && x.id === r.id) || fold(x.titulo) === fold(r.titulo))) cidades.push(r);
        }
        out.push(...cidades);
    }
    if (!l.passagem) out.push(...[...passagens].sort((a, b) => b.de.localeCompare(a.de)).map(itemDaPassagem));
    out.push(...tarefasNasPassagens(m, passagens));
    if (l.passagem) for (const p of m.pessoasDoLugar(id)) out.push({ id: p.id, titulo: p.nome, relacao: 'pessoa', sentido: 'abaixo', rotulo: null });
    return out;
}

/** O que faz: o período: o que o contém acima; as semanas do trimestre e as tarefas dele abaixo. */
function relacoesDoPeriodo(ctx: Ctx, id: string): Relacao[] {
    const { m } = ctx;
    const { escala, chave } = periodoDoId(id)!;
    const out: Relacao[] = [];
    const dias = diasDoPeriodo(escala, chave);
    if (escala === 'ano') out.push({ id: VISAO_ID, titulo: m.visao.nome ?? 'Visão', relacao: 'periodo', sentido: 'acima', rotulo: null });
    else if (dias[0]) {
        const cima = escala === 'dia' ? 'semana' : escala === 'semana' ? 'trimestre' : 'ano';
        const k = chaveDeHoje(cima, dias[0]);
        if (k) out.push({ id: idDoPeriodo(cima, k), titulo: cima === 'semana' ? semanaCurta(k) : k, relacao: 'periodo', sentido: 'acima', rotulo: null });
    }
    // As semanas do trimestre (G5): cada uma um nó, para o zoom entrar na semana.
    if (escala === 'trimestre') for (const w of [...new Set(dias.map(d => chaveDeHoje('semana', d)))]) out.push({ id: idDoPeriodo('semana', w), titulo: semanaCurta(w), relacao: 'periodo', sentido: 'abaixo', rotulo: null });
    // Os dias da semana (02/11: os dias são nós no ramo da semana): cada um um nó, com as tarefas
    // agendadas nele abaixo, a carga contra o Bloco Sagrado e a linha do dia no cartão (o mesmo nó do Dia).
    if (escala === 'semana') for (const d of dias) out.push({ id: idDoPeriodo('dia', d), titulo: tituloDoDia(d), relacao: 'periodo', sentido: 'abaixo', rotulo: null });
    // As SMART do período e as tarefas soltas, em grupos separados (30/10/2026: os ramos não separavam
    // as tarefas SMART das comuns); a tarefa de uma SMART do período vem pela SMART, na coluna da frente.
    const smarts = smartsDoPeriodo(m, escala, chave);
    const ids = new Set(smarts.map(s => s.id));
    for (const s of smarts) out.push({ id: s.id, titulo: s.titulo, relacao: 'smart', sentido: 'abaixo', rotulo: null });
    const soltas: MissaoTarefa[] = [];
    for (const t of m.indice.tarefas) {
        if (t.tipo !== 'acao' || chaveNaEscala(t.colocacao, escala) !== chave) continue;
        if (maesDaTarefa(m, t).some(s => ids.has(s))) continue;
        soltas.push(t);
        // Na semana, a tarefa com dia vem pelo dia dela; a que só tem a semana ("sem dia") fica na semana.
        if (escala === 'semana' && !t.colocacao.daSemana) continue;
        out.push({ id: t.id, titulo: t.titulo, relacao: 'tarefa', sentido: 'abaixo', rotulo: null });
    }
    // O que ficou de antes (02/11, item 8 do levantamento), pela mesma função da linha do mapa: o dia de hoje;
    // a semana de hoje e a seguinte, a que se planeja no domingo, só com as do trimestre dela (a regra do
    // canvas da semana). O dia seguinte não: no ramo da semana, ele tomaria as tarefas de hoje.
    const ficou = escala === 'dia' || escala === 'semana' ? pendentesDe(m.indice.tarefas, escala, chave, m.hoje, escala === 'semana' ? 'seguinte' : 'hoje')
        .filter(t => escala !== 'semana' || t.colocacao.trimestre === chaveDeHoje('trimestre', dias[0] ?? '')) : [];
    for (const t of ficou) {
        const de = chaveNaEscala(t.colocacao, escala)!;
        out.push({ id: t.id, titulo: t.titulo, relacao: 'pendente', sentido: 'abaixo', rotulo: RAMO.ficouDe(escala === 'semana' ? semanaCurta(de) : tituloDoDia(de)) });
    }
    if (escala !== 'ano') out.push(...frentesDoPeriodo(m, [...smarts, ...soltas, ...ficou]));
    if (escala === 'semana' || escala === 'trimestre') out.push(...suportesDoPeriodo(ctx, id, escala, chave, dias));
    return out;
}

/**
 * O que faz: a seção Suportes e decisões do período (02/11/2026): os itens da seção da nota dele (a Week,
 * a nota do trimestre) e, no trimestre, os das Weeks dele, lidos do texto que a borda dá (sem cópia). O item
 * com link é o nó da nota que ele aponta (pelos links da nota, já resolvidos pela borda); o item só de texto
 * é a decisão escrita, um cartão sem nota. O rótulo diz de onde veio (a semana, ou o próprio trimestre).
 * Por quê: a semana tem a sua seção, e o trimestre reúne tudo; o ramo da semana e o do trimestre
 * mostram a seção.
 * Entra → sai: o contexto, o id, a escala, a chave e os dias do período → os itens, na ordem das notas.
 * Erro e ataque: sem o leitor do texto, ou com a nota ainda não lida, nada se inventa (a seção aparece
 * quando o texto chega); a semana sem nota não traz nada.
 */
function suportesDoPeriodo(ctx: Ctx, id: string, escala: 'semana' | 'trimestre', chave: string, dias: readonly string[]): Relacao[] {
    const { m, leitor } = ctx;
    if (!leitor.textoDaNota) return [];
    const notas: Array<{ nota: string; rotulo: string }> = [];
    const propria = m.arquivos(id).nota;
    if (propria) notas.push({ nota: propria, rotulo: escala === 'semana' ? semanaCurta(chave) : RAMO.doTrimestre });
    if (escala === 'trimestre') {
        for (const w of [...new Set(dias.map(d => chaveDeHoje('semana', d)))]) {
            const nota = m.arquivos(idDoPeriodo('semana', w)).nota;
            if (nota) notas.push({ nota, rotulo: semanaCurta(w) });
        }
    }
    const out: Relacao[] = [];
    for (const { nota, rotulo } of notas) {
        const texto = leitor.textoDaNota(nota);
        if (typeof texto !== 'string') continue;
        const saem = leitor.ligacoesDaNota?.(nota)?.saem ?? [];
        for (const item of suportesDoTexto(texto)) {
            const alvo = item.links[0] ? fold(item.links[0].slice(item.links[0].lastIndexOf('/') + 1).replace(/\.(md|canvas)$/, '')) : null;
            const l = alvo ? saem.find(x => x.caminho && fold(nomeDoCaminho(x.caminho).replace(/\.canvas$/, '')) === alvo) : null;
            const no = l?.caminho ? noDaNotaNoRamo(m, l.caminho) : null;
            out.push({ id: no?.id ?? null, titulo: item.texto, relacao: 'suporte', sentido: 'lado', rotulo: RAMO.suporteDe(rotulo) });
        }
    }
    return out;
}

/** Uma candidata do "＋ Adicionar" de um nó (02/11): a tarefa e por que ela cabe ali. */
export interface CandidataDoNo { id: string; porque: string }

/**
 * O que faz: as candidatas de um nó para o "＋ Adicionar" (o "Escolher uma que já existe" do Novo): o que ficou de
 * antes primeiro, depois a ordem padrão (a hora, o peso, a reputação no empate), cada uma com o porquê; o
 * seletor as mostra antes das outras.
 * - a tarefa num período (a semana, o dia, pela semana dele): o que ficou das semanas anteriores do trimestre
 *   (e, na semana seguinte à de hoje, o que ainda está aberto na de hoje), as abertas sem semana dos projetos
 *   do foco (a Temporada: as centrais e os auxiliares) e as abertas das SMART da semana agendadas fora dela;
 * - a SMART num período: as mesmas regras, só das SMART (o que ficou, as sem semana dos projetos do foco);
 * - a tarefa numa SMART: as abertas do projeto dela que ainda não têm SMART nem tarefa mãe.
 * Por quê: as candidatas seguem um padrão de organização e aparecem nas opções do adicionar (a tarefa,
 * a SMART e o resto), e não numa coluna no ramo, que sairia do padrão e da simetria do sistema (02/11/2026).
 * As regras são as do canvas da semana ("📥 Sem semana", "Agendadas fora dela").
 * Entra → sai: o modelo, o nó de onde o Novo abriu e o tipo do que se cria (quem é dele: as notas do tipo que
 * o Novo lista) → as candidatas; outro nó, nada.
 * Erro e ataque: a que já está ali, a feita, a de algum dia, a cancelada e a subtarefa (segue a mãe) não
 * entram; o projeto fora da Temporada não traz as suas; cada uma uma vez.
 * Prova: tests/missao/candidatasNoAdicionar.test.ts.
 */
export function candidatasDoNo(m: ModeloDoRamo, no: string, doTipo: (t: MissaoTarefa) => boolean): CandidataDoNo[] {
    const p = periodoDoId(no);
    const doFoco = (t: MissaoTarefa) => !String(t.record.week ?? '').trim() && t.motivo !== 'pela-tarefa' && (m.indice.projetos.get(t.projeto ?? '')?.papel ?? 'fora') !== 'fora';
    const out = new Map<string, { t: MissaoTarefa; porque: string }>();
    const por = (t: MissaoTarefa, porque: string) => { if (t.aberta && doTipo(t) && !out.has(t.id)) out.set(t.id, { t, porque }); };
    if (p && (p.escala === 'semana' || p.escala === 'dia') && !isChaveEspecial(p.chave)) {
        const semana = p.escala === 'semana' ? p.chave : chaveDeHoje('semana', p.chave);
        const ja = (t: MissaoTarefa) => (p.escala === 'dia' ? chaveNaEscala(t.colocacao, 'dia') === p.chave : chaveNaEscala(t.colocacao, 'semana') === semana);
        const trimestre = chaveDeHoje('trimestre', diasDoPeriodo('semana', semana)[0] ?? '');
        // O que ficou das semanas anteriores do trimestre (e, na seguinte à de hoje, o que ainda está aberto hoje).
        for (const t of pendentesDe(m.indice.tarefas, 'semana', semana, m.hoje, 'seguinte')) {
            if (!ja(t) && t.colocacao.trimestre === trimestre) por(t, RAMO.ficouDe(semanaCurta(chaveNaEscala(t.colocacao, 'semana') ?? '')));
        }
        // As abertas das SMART da semana agendadas fora dela, e as sem semana dos projetos do foco.
        const daSemana = new Set(m.indice.tarefas.filter(x => x.tipo === 'smart' && chaveNaEscala(x.colocacao, 'semana') === semana).map(x => x.id));
        for (const t of m.indice.tarefas) {
            if (!t.aberta || ja(t) || !doTipo(t)) continue;
            const daSmart = chaveNaEscala(t.colocacao, 'semana') !== semana && maesDaTarefa(m, t).some(x => daSemana.has(x));
            if (!daSmart && !doFoco(t)) continue;
            const c = t.colocacao;
            const quando = c.lugar === 'linha' && c.dia ? (c.daSemana && c.semana ? semanaCurta(c.semana) : tituloDoDia(c.dia)) : RAMO.semDia;
            por(t, daSmart ? RAMO.candidataFora(quando) : RAMO.candidataSemSemana);
        }
    }
    // Na SMART: as abertas do projeto dela que ainda não têm SMART nem tarefa mãe.
    const smart = m.indice.porId.get(no);
    if (smart?.tipo === 'smart' && smart.projeto) {
        for (const t of m.indice.tarefas) {
            if (t.id === smart.id || t.projeto !== smart.projeto || t.motivo !== 'direto' || maesDaTarefa(m, t).length) continue;
            por(t, RAMO.candidataDoProjeto(m.indice.projetos.get(smart.projeto)?.nome ?? ''));
        }
    }
    const ordem = m.ordemDasTarefas?.(p?.escala === 'dia' ? 'dia' : 'semana') ?? ((a: MissaoTarefa, b: MissaoTarefa) => a.titulo.localeCompare(b.titulo, 'pt-BR'));
    // O que ficou de antes primeiro (a linha dela já passou); depois, a ordem padrão.
    return [...out.values()].sort((a, b) => Number(b.t.deAntes) - Number(a.t.deAntes) || ordem(a.t, b.t)).map(({ t, porque }) => ({ id: t.id, porque }));
}

/**
 * O que faz: os projetos que as SMART e as tarefas soltas de um período servem (02/11), na ordem em que
 * elas aparecem, cada um uma vez: à vista no ramo do período, ligados a elas pelas ligações a mais e não
 * ao período (nenhum campo liga o projeto à semana).
 * Por quê: no ramo do período, depois dos projetos vêm as SMART, depois as tarefas, os dias e as
 * semanas, tudo com as conexões (02/11/2026).
 */
function frentesDoPeriodo(m: ModeloDoRamo, tarefas: readonly MissaoTarefa[]): Relacao[] {
    const out: Relacao[] = [];
    for (const t of tarefas) {
        const p = t.projeto ? m.indice.projetos.get(t.projeto) : null;
        if (p && !out.some(r => r.id === p.id)) out.push({ id: p.id, titulo: p.nome, relacao: 'frente', sentido: 'lado', rotulo: null });
    }
    return out;
}

/**
 * As SMART do índice pelo nome (dobrado), uma vez por índice: as candidatas da semana perguntam a mãe de
 * cada tarefa do cofre (02/11), e montar o mapa a cada pergunta fazia o custo crescer com o quadrado.
 */
const SMARTS_POR_NOME = new WeakMap<object, Map<string, string>>();
function smartsPorNome(m: ModeloDoRamo): Map<string, string> {
    let mapa = SMARTS_POR_NOME.get(m.indice);
    if (!mapa) { mapa = new Map(m.indice.tarefas.filter(x => x.tipo === 'smart').map(x => [fold(x.record.basename), x.id])); SMARTS_POR_NOME.set(m.indice, mapa); }
    return mapa;
}

/**
 * O que faz: as SMART mães de uma tarefa: todas as do `projects` dela (uma tarefa liga a mais de uma), pelo
 * nome, e a que a linhagem achou.
 */
function maesDaTarefa(m: ModeloDoRamo, t: MissaoTarefa): string[] {
    const porNome = smartsPorNome(m);
    const out = new Set<string>(t.smart ? [t.smart] : []);
    for (const p of t.record.projects ?? []) { const s = porNome.get(fold(p)); if (s) out.add(s); }
    return [...out];
}

/**
 * O que faz: as SMART de um período (30/10): as da semana dele pela `week` (a SMART é da semana), as do dia
 * (as da semana do dia e as mães das tarefas do dia), as do trimestre e do ano (as das semanas dele e as mães
 * das tarefas dele); as abertas primeiro, cada uma uma vez.
 * Por quê: o ramo de hoje não mostrava as SMART, e o ramo da semana, onde é mais importante que elas
 * apareçam e se possa criar e conectar para planejar, também não (30/10/2026).
 */
function smartsDoPeriodo(m: ModeloDoRamo, escala: 'dia' | 'semana' | 'trimestre' | 'ano', chave: string): MissaoTarefa[] {
    const out = new Map<string, MissaoTarefa>();
    const semanaDoDia = escala === 'dia' ? chaveDeHoje('semana', chave) : null;
    for (const t of m.indice.tarefas) {
        if (t.tipo !== 'smart') continue;
        if (chaveNaEscala(t.colocacao, escala) === chave || (semanaDoDia && chaveNaEscala(t.colocacao, 'semana') === semanaDoDia)) out.set(t.id, t);
    }
    for (const t of m.indice.tarefas) {
        if (t.tipo !== 'acao' || chaveNaEscala(t.colocacao, escala) !== chave) continue;
        for (const s of maesDaTarefa(m, t)) { const x = m.indice.porId.get(s); if (x) out.set(x.id, x); }
    }
    return [...out.values()].sort((a, b) => Number(b.aberta) - Number(a.aberta) || a.titulo.localeCompare(b.titulo, 'pt-BR'));
}

/**
 * Os extras de cada espécie: o que só ela tem, além das conexões dos modelos e dos links da nota.
 * Uma espécie nova sem extra não precisa de linha aqui.
 */
const EXTRAS_DO_RAMO: Partial<Record<EspecieDoRamo, (ctx: Ctx, id: string) => Relacao[]>> = {
    // A tarefa: a checklist da nota (os itens como nós), o tempo e o lugar do dia.
    acao: (ctx, id) => { const t = ctx.m.indice.porId.get(id)!; return [...checklistDaTarefa(ctx, t), ...tempoDaTarefa(ctx, t)]; },
    smart: (ctx, id) => { const t = ctx.m.indice.porId.get(id)!; return [...checklistDaTarefa(ctx, t), ...tempoDaTarefa(ctx, t)]; },
    // O projeto e a área: o trimestre, pela Temporada.
    projeto: (ctx, id) => temporada(ctx, ctx.m.indice.projetos.get(id)?.papel !== 'fora'),
    area: (ctx, id) => temporada(ctx, (ctx.m.indice.areas.get(id)?.projetos ?? []).some(pid => (ctx.m.indice.projetos.get(pid)?.papel ?? 'fora') !== 'fora')),
    // O lugar em camadas, pelas camadas do lugar (lugarDoNo).
    passagem: camadasDoLugar,
    cidade: camadasDoLugar,
    pais: camadasDoLugar,
    // As semanas do trimestre, o período de cima e as tarefas.
    periodo: relacoesDoPeriodo,
    // A pessoa: os dias em que ela aparece.
    pessoa: (ctx, id) => (ctx.m.pessoa(id)?.dias ?? []).map(d => ({ id: idDoPeriodo('dia', d), titulo: tituloDoDia(d), relacao: 'quando', sentido: 'lado', rotulo: null })),
};

/* ------------------------------------------------------------ os links (todo tipo) */

/** O que faz: as notas que o ramo liga ao nó (as que o seguem, as que apontam o alvo do vínculo), pelo detalhe do modelo. */
function relacoesDoDetalhe(ctx: Ctx, id: string): Relacao[] {
    return (ctx.m.detalhe(id)?.ligadas ?? []).map(n => ({ id: n.id, titulo: n.titulo, relacao: 'ligada', sentido: 'lado', rotulo: n.sub ?? null }));
}

/**
 * O que faz: os links da nota do nó, nas duas direções, pelo leitor (a borda lê do cache de
 * metadados): os que saem, pela chave do frontmatter (ou no texto), e os que entram, pelo tipo de
 * quem aponta. A nota de uma passagem é a da cidade, e fica com a cidade.
 */
function relacoesDosLinks(ctx: Ctx, id: string): Relacao[] {
    const { m, leitor } = ctx;
    if (!leitor.ligacoesDaNota || id.startsWith('l:')) return [];
    const caminho = id.startsWith('n:') ? id.slice(2) : m.arquivos(id).nota;
    const ligacoes = caminho ? leitor.ligacoesDaNota(caminho) : null;
    if (!caminho || !ligacoes) return [];
    const out: Relacao[] = [];
    for (const l of ligacoes.saem ?? []) {
        if (l.caminho === caminho) continue;
        const nome = linkTarget(l.nome) || l.nome;
        const no = l.caminho ? noDaNotaNoRamo(m, l.caminho) : m.noDoNome(nome);
        out.push({ id: no?.id ?? null, titulo: no?.titulo ?? nome, relacao: 'sai', sentido: 'lado', rotulo: l.chave });
    }
    for (const e of ligacoes.entram ?? []) {
        if (e.caminho === caminho) continue;
        const no = noDaNotaNoRamo(m, e.caminho);
        out.push({ id: no.id, titulo: no.titulo, relacao: 'entra', sentido: 'lado', rotulo: leitor.rotuloDoType ? leitor.rotuloDoType(e.type) : e.type });
    }
    return out;
}

/** O que faz: tira as repetidas (a primeira fica; o nome sem nó se repete pelo nome) e o próprio nó. */
function semRepetir(id: string, todas: readonly Relacao[]): Relacao[] {
    const vistos = new Set<string>([id]);
    const out: Relacao[] = [];
    for (const r of todas) {
        // O nome sem nó se repete pelo nome (o país do campo e o mesmo país num link são um só).
        const k = r.id ?? `?${fold(r.titulo)}`;
        if (vistos.has(k)) continue;
        vistos.add(k);
        out.push(r);
    }
    return out;
}

/**
 * O que faz: as relações de um nó: as conexões dos modelos e os extras da espécie, em ordem acima,
 * abaixo e lado; depois as notas que o ramo liga e os links da nota; sem repetir o mesmo nó.
 * Entra → sai: o contexto, o id e a raiz → as relações.
 */
function relacoesDoNo(ctx: Ctx, id: string, raiz: Raiz): Relacao[] {
    const ja = ctx.relacoes.get(id);
    if (ja) return ja;
    const r = relacoesSemMemo(ctx, id, raiz);
    ctx.relacoes.set(id, r);
    return r;
}

/** O que faz: as relações de um nó, sem a memória da chamada (`relacoesDoNo` guarda o resultado). */
function relacoesSemMemo(ctx: Ctx, id: string, raiz: Raiz): Relacao[] {
    const doTipo = [...conexoesPadrao(ctx, id, raiz), ...(EXTRAS_DO_RAMO[raiz.especie]?.(ctx, id) ?? [])];
    const ordenadas = doTipo.map((r, i) => ({ r, i })).sort((a, b) => ORDEM_DO_SENTIDO[a.r.sentido] - ORDEM_DO_SENTIDO[b.r.sentido] || a.i - b.i).map(x => x.r);
    return semRepetir(id, [...ordenadas, ...relacoesDoDetalhe(ctx, id), ...relacoesDosLinks(ctx, id)]);
}

/* ------------------------------------------------------------ o ramo */

/**
 * As relações de lado que são dependência (o bloqueio dos modelos e o par de um campo `lado`): a
 * cadeia que o ramo segue de lado. As outras de lado (o tempo, o lugar, os links da nota) não descem.
 */
const DEPENDENCIAS: ReadonlySet<RelacaoDoRamo> = new Set<RelacaoDoRamo>(['bloqueada-por', 'bloqueia', 'par']);

/**
 * O que faz: se o ramo segue de um nó por uma relação dele, pelo caminho por onde se chegou ao nó:
 * o ramo não volta. Quem se alcançou acima segue acima (a área, o trimestre, o ano); quem se
 * alcançou abaixo segue abaixo e pelas dependências (a SMART dá as ações, a ação dá as subtarefas,
 * os itens da checklist e o que a bloqueia); quem se alcançou por uma dependência segue a mesma
 * cadeia (o que bloqueia o que bloqueia).
 * Por quê: o zoom num projeto grande (30/10/2026) deixava tudo desconectado: o nível 2 do
 * projeto saía do trimestre da Temporada (as 14 semanas e as SMART do trimestre inteiro) e dos
 * auxiliares voltando para cima (a outra central, a outra área), e o projeto → SMART → tarefa →
 * subtarefa → checklist se perdia no meio. A proposta da pinça diz o caminho: "o zoom num objetivo
 * desce pelas SMART, pelas tarefas, pelas subtarefas e pelos itens, até o mais específico".
 * Entra → sai: a relação de chegada ao nó e uma relação dele → `true` quando o ramo segue por ela.
 * Erro e ataque: a raiz não tem chegada e mostra tudo (acima, abaixo e de lado); um link da nota
 * nunca desce (o grafo do cofre é a última expansão, não um nível do ramo).
 * Prova: tests/missao/ramoDosProjetos.test.ts.
 */
export function segueNoRamo(chegada: Pick<ItemDoRamo, 'sentido' | 'relacao'>, r: Pick<ItemDoRamo, 'sentido' | 'relacao'>): boolean {
    if (chegada.sentido === 'acima') return r.sentido === 'acima';
    if (chegada.sentido === 'abaixo') return r.sentido === 'abaixo' || (r.sentido === 'lado' && DEPENDENCIAS.has(r.relacao));
    return DEPENDENCIAS.has(chegada.relacao) && r.sentido === 'lado' && r.relacao === chegada.relacao;
}

/**
 * O que faz: o ramo de um nó em níveis: o nível 1 são as relações do nó (as conexões dos modelos de
 * tipo para cima, para baixo e para os lados, os extras da espécie e os links da nota); cada nível
 * seguinte são as relações dos itens do nível de cima que seguem o caminho por onde se chegou a eles
 * (`segueNoRamo`: o ramo não volta), sem voltar a um nó já mostrado; até a profundidade pedida, ou
 * até não haver mais o que mostrar.
 * Por quê: a pinça (29/10): o zoom entra no ramo do objeto, além do temporal, e cada zoom
 * seguinte entra um nível mais fundo; a tela desenha os níveis, e o zoom seguinte pede um a mais.
 * Entra → sai: o modelo da versão, o id, a profundidade (1 a `PROFUNDIDADE_MAXIMA`) e o leitor da
 * borda (opcional: o frontmatter, os links e o texto da nota) → `RamoDoNo`, ou `null` quando a
 * Missão não conhece o nó.
 * Erro e ataque: em todos os períodos (o índice inteiro, não só o que os filtros mostram); a
 * profundidade fora da faixa, ou não numérica, fica na ponta mais próxima (`NaN` vale 1); um nó
 * aparece uma vez no ramo inteiro (o ciclo de bloqueio e o vaivém entre níveis param); o nome sem
 * nó (o país sem nota, o bloqueio que não acha tarefa) entra com `id: null` e não desce; o item da
 * checklist é um nó que não desce; cada nível traz até `ITENS_POR_NIVEL` e conta o resto, e só os
 * primeiros `EXPANDIDOS_POR_NIVEL` nós dele descem (o custo de um ramo tem teto, 30/10); sem
 * leitor, os links, o frontmatter das outras notas e a checklist ficam de fora (nunca inventados).
 * Prova: tests/missao/ramo.test.ts.
 */
export function ramoDoNo(modelo: ModeloDoRamo, id: string, profundidade = 1, leitor: LeitorDoRamo = {}, expansao: Readonly<Record<string, boolean>> = {}): RamoDoNo | null {
    const ctx = contexto(modelo, leitor);
    const raiz = raizDe(ctx, String(id ?? ''));
    if (!raiz) return null;
    const fundo = Math.max(1, Math.min(PROFUNDIDADE_MAXIMA, Math.floor(Number.isFinite(profundidade) ? profundidade : 1)));
    const vistos = new Set<string>([id]);
    const niveis: NivelDoRamo[] = [];
    type Ponta = { id: string; raiz: Raiz; chegada: Pick<ItemDoRamo, 'sentido' | 'relacao'> | null };
    /**
     * A expansão (30/10): o nó do nível de cima desce se foi aberto, ou se está dentro da profundidade da
     * pinça e não foi fechado; no período, a SMART dele começa aberta (as tarefas dela na coluna da frente).
     */
    const aberto = (x: Ponta, p: number) => {
        const k = expansao[x.id];
        if (k !== undefined) return k;
        if (p <= fundo) return true;
        if (raiz.especie !== 'periodo') return false;
        // No período, a cadeia do tempo segue aberta até a visão (02/11: a mesma gramática em toda escala, o
        // que contém de um lado, a que pertence do outro): a semana, o trimestre, o ano e a visão.
        if (x.chegada?.sentido === 'acima' && x.chegada.relacao === 'periodo') return true;
        if (p !== 2) return false;
        // No período, a SMART dele começa aberta; na semana, cada dia também (as tarefas dele, 02/11).
        return (x.raiz.especie === 'smart' && x.chegada?.relacao === 'smart') || (x.chegada?.relacao === 'periodo' && x.chegada.sentido === 'abaixo' && periodoDoId(x.id)?.escala === 'dia');
    };
    let fronteira: Ponta[] = [{ id, raiz, chegada: null }];
    const limiteDeNiveis = PROFUNDIDADE_MAXIMA + PROFUNDIDADE_DA_EXPANSAO;
    for (let p = 1; p <= limiteDeNiveis && fronteira.length; p++) {
        const itens: ItemDoRamo[] = [];
        const descem = p === 1 ? fronteira : fronteira.filter(x => aberto(x, p));
        if (!descem.length) break;
        for (const de of descem) {
            for (const r of relacoesDoNo(ctx, de.id, de.raiz)) {
                if (de.chegada && !segueNoRamo(de.chegada, r)) continue;
                if (r.id && vistos.has(r.id)) continue;
                if (r.id) vistos.add(r.id);
                itens.push({ ...r, de: de.id });
            }
        }
        if (!itens.length) break;
        const mostrados = itens.slice(0, ITENS_POR_NIVEL);
        niveis.push({ profundidade: p, itens: mostrados, mais: itens.length - mostrados.length });
        // Só os primeiros nós com id descem (o teto de 30/10): o custo do nível seguinte fica limitado.
        fronteira = mostrados
            .filter((x): x is ItemDoRamo & { id: string } => !!x.id)
            .slice(0, EXPANDIDOS_POR_NIVEL)
            .map(x => ({ id: x.id, raiz: raizDe(ctx, x.id), chegada: { sentido: x.sentido, relacao: x.relacao } }))
            .filter((x): x is Ponta => !!x.raiz);
        // O que tem filho e está fechado leva o "expandir"; o que desce, o "recolher" (30/10).
        const desce = new Set(fronteira.filter(x => aberto(x, p + 1)).map(x => x.id));
        for (const x of fronteira) {
            const item = mostrados.find(i => i.id === x.id)!;
            if (x.chegada?.sentido !== 'abaixo') continue;
            const temFilho = relacoesDoNo(ctx, x.id, x.raiz).some(r => segueNoRamo(x.chegada!, r) && r.sentido === 'abaixo' && !(r.id && vistos.has(r.id)));
            if (temFilho) item.filhos = desce.has(x.id) ? 'aberto' : 'fechado';
        }
    }
    return { id, titulo: raiz.titulo, especie: raiz.especie, niveis, extras: ligacoesAMais(ctx, niveis, id) };
}

/** Quantos níveis a expansão desce além da pinça (o "expandir" de cada nó; o teto do custo, 30/10). */
export const PROFUNDIDADE_DA_EXPANSAO = 4;

/** Quantos nós do ramo têm as ligações a mais procuradas (o teto do custo). */
export const NOS_COM_LIGACOES_A_MAIS = 160;

/**
 * O que faz: as ligações entre dois nós do ramo que não são a de onde um saiu (30/10): a tarefa ligada a duas
 * SMART tem as duas curvas, a dependência e a subtarefa entre duas tarefas à vista também; cada par uma vez.
 * Por quê: as tarefas aparecem na frente, separadas e conectadas, e podem se conectar entre si e a mais
 * de uma (30/10/2026): o nó aparece uma vez, e cada ligação é uma curva. Desde 02/11 também o projeto à vista (a
 * SMART e a tarefa sem mãe à vista se ligam a ele) e o tempo de cada tarefa (o dia agendado, senão a semana,
 * quando o período está abaixo da raiz ou é ela): tudo com as conexões.
 * Entra → sai: o contexto, os níveis e o id da raiz → as ligações a mais (de, para, a relação e o sentido, como no item).
 * Erro e ataque: só entre nós que estão no ramo (a raiz conta); o período acima da raiz não recebe a curva do
 * tempo; o nó sem raiz e o nome sem nó ficam de fora; o teto de nós (`NOS_COM_LIGACOES_A_MAIS`) limita o custo.
 */
function ligacoesAMais(ctx: Ctx, niveis: readonly NivelDoRamo[], raiz: string): Array<Pick<ItemDoRamo, 'de' | 'relacao' | 'sentido'> & { para: string }> {
    const { indice } = ctx.m;
    const itens = niveis.flatMap(n => n.itens).filter((i): i is ItemDoRamo & { id: string } => !!i.id);
    const noRamo = new Set(itens.map(i => i.id));
    const pares = new Set(itens.map(i => [i.de, i.id].sort().join('|')));
    const porNome = new Map(indice.tarefas.map(t => [fold(t.record.basename), t.id]));
    const out: Array<Pick<ItemDoRamo, 'de' | 'relacao' | 'sentido'> & { para: string }> = [];
    const ligar = (de: string, nome: string, relacao: RelacaoDoRamo, sentido: ItemDoRamo['sentido']) => {
        const para = porNome.get(fold(nome));
        if (!para || para === de || !noRamo.has(para)) return;
        const k = [de, para].sort().join('|');
        if (pares.has(k)) return;
        pares.add(k);
        out.push({ de, para, relacao, sentido });
    };
    /** Liga dois nós por id (o projeto, o período), cada par uma vez, só entre os que estão no ramo. */
    const ligarId = (de: string, para: string | null, relacao: RelacaoDoRamo, sentido: ItemDoRamo['sentido']) => {
        if (!para || para === de) return;
        const k = [de, para].sort().join('|');
        if (pares.has(k)) return;
        pares.add(k);
        out.push({ de, para, relacao, sentido });
    };
    // O tempo (02/11): o período abaixo da raiz (o dia na semana, a semana no trimestre) ou a própria raiz,
    // nunca o que está acima dela (a semana no ramo do dia ficaria cruzando o centro).
    const doTempo = new Set<string>([...(periodoDoId(raiz) ? [raiz] : []), ...itens.filter(i => i.sentido === 'abaixo' && periodoDoId(i.id)).map(i => i.id)]);
    const comProjeto = new Set<string>([...(indice.projetos.has(raiz) ? [raiz] : []), ...itens.filter(i => indice.projetos.has(i.id)).map(i => i.id)]);
    // As mães (a SMART e a tarefa mãe, pelo projects) e as dependências (o blockedBy) de cada tarefa à vista,
    // pelo registro que o índice já leu: nenhuma nota se relê, e o custo fica no tamanho do ramo.
    for (const it of itens.slice(0, NOS_COM_LIGACOES_A_MAIS)) {
        const t = indice.porId.get(it.id);
        if (!t) continue;
        for (const nome of t.record.projects ?? []) ligar(it.id, nome, t.tipo === 'acao' && indice.porId.get(porNome.get(fold(nome)) ?? '')?.tipo === 'acao' ? 'mae' : 'smart', 'acima');
        for (const b of t.record.blockedBy ?? []) ligar(it.id, String(b), 'bloqueada-por', 'lado');
        // O projeto à vista (02/11: depois dos projetos vêm as SMART, tudo com as conexões): a SMART, e a
        // tarefa sem mãe à vista, se ligam a ele.
        const temMae = (t.record.projects ?? []).some(nome => { const x = porNome.get(fold(nome)); return !!x && noRamo.has(x); }) || (!!t.smart && noRamo.has(t.smart));
        if (t.projeto && !temMae && comProjeto.has(t.projeto)) ligarId(t.projeto, it.id, 'projeto', 'acima');
        // O tempo dela: o dia agendado, senão a semana (a tarefa "sem dia" da semana se liga à semana).
        const c = t.colocacao;
        if (c.lugar === 'linha') {
            const dia = c.dia && !c.daSemana ? idDoPeriodo('dia', c.dia) : null;
            const quando = (dia && doTempo.has(dia) ? dia : null) ?? (c.semana && doTempo.has(idDoPeriodo('semana', c.semana)) ? idDoPeriodo('semana', c.semana) : null);
            ligarId(it.id, quando, 'quando', 'lado');
        }
    }
    return out;
}

/**
 * O que faz: só as conexões padrão de um nó, pelos modelos de tipo (sem os extras da espécie nem
 * os links da nota): o que está acima, abaixo e ao lado, com o nome da relação; a base dos ramos
 * (`"ligacoes": "padrao"`) e das Conexões do painel do nó.
 * Entra → sai: o modelo, o id e o leitor (opcional) → os itens (`de` = o próprio nó); vazio quando a
 * Missão não conhece o nó ou ele não é componente de um tipo.
 * Prova: tests/missao/ramo.test.ts ("as conexões padrão").
 */
export function conexoesPadraoDoNo(modelo: ModeloDoRamo, id: string, leitor: LeitorDoRamo = {}): ItemDoRamo[] {
    const ctx = contexto(modelo, leitor);
    const raiz = raizDe(ctx, String(id ?? ''));
    if (!raiz) return [];
    return semRepetir(id, conexoesPadrao(ctx, id, raiz)).map(r => ({ ...r, de: id }));
}

/**
 * O que faz: o domínio do modelo de um nó (a TaskNote pelo `type`, o projeto pela espécie, o lugar
 * pelas camadas, a nota pelo `type` do frontmatter que o leitor dá); `null` = o nó não é de um tipo.
 * Por quê: o "+ <Tipo>" do painel (29/10) cria o que fica abaixo do tipo do nó, pelos modelos.
 */
export function dominioDoNo(modelo: ModeloDoRamo, id: string, leitor: LeitorDoRamo = {}): string | null {
    return componenteDe(contexto(modelo, leitor), String(id ?? ''))?.dominio ?? null;
}

/* ------------------------------------------------------------ a base dos ramos ("ligacoes": "padrao") */

/** O que um nó liga para fora pelos modelos, na memória: o que está acima, do mais perto ao topo, e o que está de lado. */
export interface PadraoNaMemoria { acima: string[]; lado: string[] }

/**
 * O que faz: as conexões padrão que saem de cada nó, só pelo que a Missão tem na memória (sem ler
 * nota), com um contexto só para uma linha inteira: a subida (a SMART, o projeto, a área) e o lado
 * (o bloqueio).
 * Por quê: a base dos ramos (29/10): a coluna com `"ligacoes": "padrao"` liga cada nó ao mais perto
 * acima dele que a linha mostra, pelos modelos de tipo, em vez de uma regra escrita por coluna.
 * Entra → sai: o modelo → uma função id → `PadraoNaMemoria` (vazia para o nó que não é de um tipo).
 */
export function conexoesNaMemoria(modelo: ModeloDoRamo): (id: string) => PadraoNaMemoria {
    const ctx = contexto(modelo, {});
    const feitos = new Map<string, PadraoNaMemoria>();
    return id => {
        const ja = feitos.get(id);
        if (ja) return ja;
        const c = componenteDe(ctx, id);
        const out: PadraoNaMemoria = { acima: [], lado: [] };
        if (c) {
            const saem = conexoesQueSaem(ctx, c);
            out.lado = saem.filter(r => r.sentido === 'lado' && r.id).map(r => r.id!);
            const vistos = new Set<string>([id]);
            let fronteira = [c];
            for (let passo = 0; passo < PROFUNDIDADE_MAXIMA + 2 && fronteira.length; passo++) {
                const proxima: Componente[] = [];
                for (const f of fronteira) for (const r of f === c ? saem : conexoesQueSaem(ctx, f)) {
                    if (r.sentido !== 'acima' || !r.id || vistos.has(r.id)) continue;
                    vistos.add(r.id);
                    out.acima.push(r.id);
                    const cr = componenteDe(ctx, r.id);
                    if (cr) proxima.push(cr);
                }
                fronteira = proxima;
            }
        }
        feitos.set(id, out);
        return out;
    };
}

/** Uma coluna do ramo como a base dos ramos a lê: a fonte, os tipos, a lista dos pendentes e se toma as ligações padrão. */
export type ColunaParaLigar = Pick<ColunaDoRamo, 'fonte' | 'tipo' | 'pendentes' | 'ligacoes'>;

/** O que faz: os nós de uma coluna numa linha (as faixas abrem nos nós delas; os pendentes entram). */
function nosDaColuna(linha: LinhaAberta, c: ColunaParaLigar): string[] {
    const ids: string[] = [];
    for (const fonte of [c.fonte, ...(c.pendentes ? [c.pendentes] : [])]) {
        for (const x of nosDaFonte<Record<string, unknown>>(linha as unknown as Record<string, unknown>, fonte, c.tipo)) {
            const nos = Array.isArray(x?.nos) ? (x.nos as Array<{ id?: unknown }>) : [x as { id?: unknown }];
            for (const n of nos) if (typeof n?.id === 'string' && !ids.includes(n.id)) ids.push(n.id);
        }
    }
    return ids;
}

/**
 * O que faz: as ligações de uma linha com as colunas `"ligacoes": "padrao"` tomadas dos modelos:
 * cada nó dessas colunas liga ao nó acima mais perto que a linha mostra em outra coluna (a ação à
 * SMART, ou ao projeto quando a SMART não está; o projeto à área) e aos que o bloqueiam; as
 * ligações de estrutura e de bloqueio escritas para esses nós saem; as outras (o tempo, o lugar,
 * as coleções) ficam.
 * Entra → sai: a linha aberta, as colunas do ramo e as conexões na memória → a linha com as ligações novas.
 * Erro e ataque: sem coluna `padrao`, a linha volta igual; o nó acima na mesma coluna (a central do
 * auxiliar, a tarefa mãe) não liga, e a subida segue até o próximo que está em outra coluna. O nó
 * do centro (o primeiro da fonte do centro, `centro`) é uma coluna à parte (30/10, o ramo de
 * Projetos): a central no centro liga aos auxiliares da coluna, que lê a mesma lista.
 * Prova: tests/missao/ramoGenerico.test.ts ("a base dos ramos") e tests/missao/ramoPrincipalDosProjetos.test.ts.
 */
export function comLigacoesPadrao(linha: LinhaAberta, colunas: readonly ColunaParaLigar[], padrao: (id: string) => PadraoNaMemoria, centro?: Pick<ColunaParaLigar, 'fonte' | 'tipo'> | null): LinhaAberta {
    const padroes = colunas.filter(c => c.ligacoes === 'padrao');
    if (!padroes.length) return linha;
    const colunaDe = new Map<string, number>();
    const noDoCentro = centro ? nosDaColuna(linha, { ...centro, pendentes: null, ligacoes: null })[0] : undefined;
    if (noDoCentro) colunaDe.set(noDoCentro, -1);
    colunas.forEach((c, i) => { for (const id of nosDaColuna(linha, c)) if (!colunaDe.has(id)) colunaDe.set(id, i); });
    const visiveis = new Set(nosDaLinha(linha).keys());
    const alvos = new Set(padroes.flatMap(c => nosDaColuna(linha, c)));
    const ligacoes: Ligacao[] = (linha.ligacoes ?? []).filter(l => !(alvos.has(l.para) && (l.tipo === 'estrutura' || l.tipo === 'bloqueio')));
    for (const id of alvos) {
        const p = padrao(id);
        const acima = p.acima.find(a => visiveis.has(a) && colunaDe.get(a) !== colunaDe.get(id));
        if (acima) ligacoes.push({ de: acima, para: id, tipo: 'estrutura' });
        for (const b of p.lado) if (b !== id && visiveis.has(b)) ligacoes.push({ de: b, para: id, tipo: 'bloqueio' });
    }
    return { ...linha, ligacoes };
}
