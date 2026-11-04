/**
 * Os filtros da Missão: um objeto só, lido do bloco ```dfm-widget``` `tipo: missao` no
 * canvas e do estado nos outros lugares, e ajustável na barra do componente.
 *
 * Por quê: a arquitetura da página Missão (27/10/2026, 3.5): escala, período, foco,
 * área, projeto (com o ramo), Temporada, zoom, modo, colunas, linhas e título, com os
 * padrões da tabela. `este` vem do que o canvas sabe de si (o projeto do canvas de
 * projeto, o trimestre do canvas do trimestre); `resolverFiltros` o traduz.
 *
 * Módulo puro. Prova: tests/missao/filtros.test.ts.
 */
import { fold, linkTarget } from '../project/projectCanvasModel';
import { quarterWeeks, weekDates } from '../engine/calendario';
import { DIA } from './formatos';
import { chaveDeHoje, diasDoPeriodo, ESCALAS, type Escala, type Recorte } from './tempo';
import type { Coluna, FiltrosResolvidos, FocoFiltro, MissaoFiltros, PeriodoFiltro } from './tipos';
import { ehSemana, ehTrimestre } from './formatos';
export const COLUNAS: readonly Coluna[] = ['lugar', 'areas', 'projetos', 'smart', 'tarefas', 'semana', 'trimestre', 'visao'];
export const ASAS: Record<'trabalho' | 'tempo', readonly Coluna[]> = {
    trabalho: ['areas', 'projetos', 'smart', 'tarefas'],
    tempo: ['semana', 'trimestre', 'visao'],
};

export type Lugar = 'pagina' | 'aba' | 'canvas';

/** O que faz: os filtros padrão de um lugar (a tabela do 3.5): tudo à vista, foco em hoje, leitura só no canvas. */
export function filtrosPadrao(lugar: Lugar = 'pagina'): MissaoFiltros {
    return {
        escala: 'dia', periodo: { tipo: 'tudo' }, foco: { tipo: 'hoje' }, areas: [], projeto: { tipo: 'todos' },
        ramo: false, temporada: false, zoom: 'foco', modo: lugar === 'canvas' ? 'leitura' : 'edicao',
        colunas: [...COLUNAS], linhas: 9, titulo: 'Missão',
    };
}

const SIM = new Set(['sim', 'true', 'yes', 's', '1']);
const NAO = new Set(['nao', 'false', 'no', 'n', '0']);
const ESCALA_ALIAS: Record<string, Escala> = { dia: 'dia', dias: 'dia', semana: 'semana', semanas: 'semana', trimestre: 'trimestre', trimestres: 'trimestre', ano: 'ano', anos: 'ano' };
const COLUNA_ALIAS: Record<string, Coluna> = {
    lugar: 'lugar', lugares: 'lugar', area: 'areas', areas: 'areas', projeto: 'projetos', projetos: 'projetos',
    smart: 'smart', smarts: 'smart', tarefa: 'tarefas', tarefas: 'tarefas', acoes: 'tarefas', semana: 'semana',
    trimestre: 'trimestre', visao: 'visao',
};

const validDate = (s: string) => DIA.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/**
 * O que faz: um período escrito (`AAAA-MM-DD..AAAA-MM-DD`, `AAAA-MM-DD`, `AAAA-Www`,
 * `AAAA-Qn`, `AAAA`, `hoje`, `este`, `tudo`) → o período dos filtros; ilegível, `null`.
 * Prova: tests/missao/filtros.test.ts ("o período").
 */
export function lerPeriodo(raw: string): PeriodoFiltro | null {
    const text = String(raw ?? '').trim();
    const key = fold(text);
    if (!key || key === 'tudo') return { tipo: 'tudo' };
    if (key === 'hoje') return { tipo: 'hoje' };
    if (key === 'este' || key === 'esta') return { tipo: 'este' };
    // Forma própria (não é a `DIA`): o recorte `AAAA-MM-DD..AAAA-MM-DD`, dois dias numa entrada, cada um conferido no calendário abaixo.
    const range = text.match(/^(\d{4}-\d{2}-\d{2})\s*\.\.\s*(\d{4}-\d{2}-\d{2})$/);
    if (range) {
        if (!validDate(range[1]) || !validDate(range[2])) return null;
        const [de, ate] = range[1] <= range[2] ? [range[1], range[2]] : [range[2], range[1]];
        return { tipo: 'recorte', de, ate };
    }
    if (validDate(text)) return { tipo: 'recorte', de: text, ate: text };
    const upper = text.toUpperCase();
    if (ehSemana(upper) && weekDates(upper).length) {
        const d = weekDates(upper);
        return { tipo: 'recorte', de: d[0], ate: d[6] };
    }
    if (ehTrimestre(upper) && quarterWeeks(upper).length) {
        const d = diasDoPeriodo('trimestre', upper);
        return { tipo: 'recorte', de: d[0], ate: d[d.length - 1] };
    }
    if (/^\d{4}$/.test(text)) {
        const d = diasDoPeriodo('ano', text);
        return d.length ? { tipo: 'recorte', de: d[0], ate: d[d.length - 1] } : null;
    }
    return null;
}

/** O que faz: um foco escrito (`hoje`, data, semana, trimestre, ano, `p:<projeto>`, `s:<caminho>`) → o foco; ilegível, `null`. */
export function lerFoco(raw: string): FocoFiltro | null {
    const text = String(raw ?? '').trim();
    if (!text || fold(text) === 'hoje') return { tipo: 'hoje' };
    if (/^[ptsa]:.+/.test(text)) {
        const [kind, ...rest] = text.split(':');
        const value = rest.join(':').trim();
        return { tipo: 'no', id: kind === 'p' || kind === 'a' ? `${kind}:${fold(linkTarget(value))}` : `${kind}:${value}` };
    }
    if (validDate(text)) return { tipo: 'periodo', escala: 'dia', chave: text };
    const upper = text.toUpperCase();
    if (ehSemana(upper) && weekDates(upper).length) return { tipo: 'periodo', escala: 'semana', chave: upper };
    if (ehTrimestre(upper)) return { tipo: 'periodo', escala: 'trimestre', chave: upper };
    if (/^\d{4}$/.test(text)) return { tipo: 'periodo', escala: 'ano', chave: text };
    return null;
}

/** O que faz: as linhas `chave: valor` de um bloco → mapa com as chaves sem acento nem caixa. */
export function camposDoBloco(fonte: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const raw of String(fonte ?? '').split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const m = line.match(/^([^:]+):\s*(.*)$/);
        if (!m) continue;
        out[fold(m[1]).replace(/\s+/g, '_')] = m[2].trim().replace(/^["']|["']$/g, '');
    }
    return out;
}

/**
 * O que faz: os filtros de um bloco (o texto do ```dfm-widget``` ou o mapa das chaves),
 * a partir dos padrões do lugar. Cada valor que não se lê fica no padrão e vira um
 * problema dito em palavras; nada quebra.
 * Por quê: o bloco é a fonte dos filtros no canvas (3.5); o mesmo leitor serve à aba e à
 * página quando o estado vier guardado como bloco.
 * Entra → sai: texto ou mapa e o lugar → { filtros, problemas }.
 * Erro e ataque: chave desconhecida é ignorada sem erro (o bloco também tem `tipo`);
 * `linhas` fora de 1–60 fica no limite; coluna desconhecida é dita e ignorada; sem
 * nenhuma coluna válida, todas.
 * Prova: tests/missao/filtros.test.ts.
 */
export function lerFiltros(fonte: string | Record<string, string>, lugar: Lugar = 'pagina'): { filtros: MissaoFiltros; problemas: string[] } {
    const f = filtrosPadrao(lugar);
    const problemas: string[] = [];
    const campos: Record<string, string> = typeof fonte === 'string' ? camposDoBloco(fonte) : Object.fromEntries(Object.entries(fonte ?? {}).map(([k, v]) => [fold(k), String(v ?? '')]));
    const has = (k: string) => campos[k] !== undefined && String(campos[k]).trim() !== '';
    const bool = (k: string): boolean | null => {
        const v = fold(campos[k] ?? '');
        if (SIM.has(v)) return true;
        if (NAO.has(v)) return false;
        problemas.push(`${k}: "${campos[k]}" não é sim nem não; ficou o padrão.`);
        return null;
    };

    if (has('escala')) {
        const e = ESCALA_ALIAS[fold(campos.escala)];
        if (e) f.escala = e; else problemas.push(`escala: "${campos.escala}" não é dia, semana, trimestre nem ano; ficou ${f.escala}.`);
    }
    if (has('periodo')) {
        const p = lerPeriodo(campos.periodo);
        if (p) f.periodo = p; else problemas.push(`periodo: "${campos.periodo}" não foi lido; ficou tudo.`);
    }
    if (has('foco')) {
        const p = lerFoco(campos.foco);
        if (p) f.foco = p; else problemas.push(`foco: "${campos.foco}" não foi lido; ficou hoje.`);
    }
    if (has('area')) f.areas = campos.area.split(',').map(a => linkTarget(a)).filter(Boolean);
    if (has('projeto')) {
        const v = campos.projeto.trim();
        f.projeto = fold(v) === 'este' ? { tipo: 'este' } : fold(v) === 'todos' ? { tipo: 'todos' } : { tipo: 'nome', nome: linkTarget(v) };
    }
    if (has('ramo')) { const b = bool('ramo'); if (b !== null) f.ramo = b; }
    if (has('temporada')) { const b = bool('temporada'); if (b !== null) f.temporada = b; }
    if (has('zoom')) {
        const z = fold(campos.zoom);
        if (z === 'compacto' || z === 'foco' || z === 'tudo') f.zoom = z; else problemas.push(`zoom: "${campos.zoom}" não é compacto, foco nem tudo; ficou ${f.zoom}.`);
    }
    if (has('modo')) {
        const m = fold(campos.modo);
        if (m === 'leitura' || m === 'edicao') f.modo = m; else problemas.push(`modo: "${campos.modo}" não é leitura nem edição; ficou ${f.modo}.`);
    }
    const chosen = new Set<Coluna>();
    let anyColumnKey = false;
    if (has('colunas')) {
        anyColumnKey = true;
        for (const raw of campos.colunas.split(',')) {
            const c = COLUNA_ALIAS[fold(raw).replace(/\s+/g, '')];
            if (c) chosen.add(c); else if (raw.trim()) problemas.push(`colunas: "${raw.trim()}" não é coluna da Missão.`);
        }
    }
    if (has('asas')) {
        anyColumnKey = true;
        for (const raw of campos.asas.split(',')) {
            const a = fold(raw) as 'trabalho' | 'tempo';
            if (ASAS[a]) ASAS[a].forEach(c => chosen.add(c)); else problemas.push(`asas: "${raw.trim()}" não é trabalho nem tempo.`);
        }
    }
    if (anyColumnKey) f.colunas = chosen.size ? COLUNAS.filter(c => chosen.has(c)) : [...COLUNAS];
    if (has('linhas')) {
        const n = Number.parseInt(campos.linhas, 10);
        if (Number.isFinite(n)) f.linhas = Math.max(1, Math.min(60, n)); else problemas.push(`linhas: "${campos.linhas}" não é número; ficou ${f.linhas}.`);
    }
    if (has('titulo')) f.titulo = campos.titulo.trim();
    return { filtros: f, problemas };
}

function periodoTexto(p: PeriodoFiltro): string | null {
    if (p.tipo === 'tudo') return null;
    if (p.tipo === 'recorte') return p.de === p.ate ? p.de : `${p.de}..${p.ate}`;
    return p.tipo;
}

/**
 * O que faz: o texto do bloco com os filtros que diferem do padrão do lugar (o inverso
 * de `lerFiltros`, para o "Gravar no bloco" do P14).
 * Prova: tests/missao/filtros.test.ts ("ida e volta").
 */
export function blocoDosFiltros(f: MissaoFiltros, lugar: Lugar = 'canvas'): string {
    const d = filtrosPadrao(lugar);
    const lines = ['tipo: missao'];
    if (f.escala !== d.escala) lines.push(`escala: ${f.escala}`);
    const per = periodoTexto(f.periodo);
    if (per) lines.push(`periodo: ${per}`);
    if (f.foco.tipo === 'periodo') lines.push(`foco: ${f.foco.chave}`);
    if (f.foco.tipo === 'no') lines.push(`foco: ${f.foco.id}`);
    if (f.areas.length) lines.push(`area: ${f.areas.join(', ')}`);
    if (f.projeto.tipo === 'este') lines.push('projeto: este');
    if (f.projeto.tipo === 'nome') lines.push(`projeto: ${f.projeto.nome}`);
    if (f.ramo) lines.push('ramo: sim');
    if (f.temporada) lines.push('temporada: sim');
    if (f.zoom !== d.zoom) lines.push(`zoom: ${f.zoom}`);
    if (f.modo !== d.modo) lines.push(`modo: ${f.modo}`);
    if (f.colunas.length !== COLUNAS.length) lines.push(`colunas: ${f.colunas.join(', ')}`);
    if (f.linhas !== d.linhas) lines.push(`linhas: ${f.linhas}`);
    if (f.titulo !== d.titulo) lines.push(`titulo: ${f.titulo}`);
    return lines.join('\n');
}

/** O que o lugar sabe de si para resolver `este`. */
export interface ContextoDosFiltros {
    hoje: string;
    /** O projeto do canvas de projeto onde o bloco mora. */
    projetoDoCanvas?: string | null;
}

/**
 * O que faz: traduz `este` e `hoje`: o período de hoje na escala (o canvas da semana e o do
 * trimestre, que davam o período deles, se aposentaram em 02/11/2026), o projeto deste canvas,
 * e o foco na linha certa da escala.
 * Por quê: "`este` vem do que o canvas já sabe de si" (3.5).
 * Erro e ataque: `projeto: este` fora de canvas de projeto vale todos, com o problema dito.
 * Prova: tests/missao/filtros.test.ts ("este").
 */
export function resolverFiltros(f: MissaoFiltros, ctx: ContextoDosFiltros): FiltrosResolvidos {
    const problemas: string[] = [];
    const today = ctx.hoje;
    let recorte: Recorte | null = null;
    const span = (escala: Escala, chave: string): Recorte | null => {
        const d = diasDoPeriodo(escala, chave);
        return d.length ? { de: d[0], ate: d[d.length - 1] } : null;
    };
    if (f.periodo.tipo === 'recorte') recorte = { de: f.periodo.de, ate: f.periodo.ate };
    else if (f.periodo.tipo === 'hoje') recorte = { de: today, ate: today };
    else if (f.periodo.tipo === 'este') recorte = span(f.escala, chaveDeHoje(f.escala, today));
    let projeto: string | null = null;
    if (f.projeto.tipo === 'nome') projeto = f.projeto.nome;
    if (f.projeto.tipo === 'este') {
        if (ctx.projetoDoCanvas) projeto = ctx.projetoDoCanvas;
        else problemas.push('projeto: este vale só num canvas de projeto; aqui ficaram todos.');
    }
    let focoChave: string | null = null;
    let focoNo: string | null = null;
    if (f.foco.tipo === 'periodo') {
        const d = diasDoPeriodo(f.foco.escala, f.foco.chave)[0];
        focoChave = f.foco.escala === f.escala ? f.foco.chave : d ? chaveDeHoje(f.escala, d) : null;
    } else if (f.foco.tipo === 'no') focoNo = f.foco.id;
    if (!focoChave && !focoNo && recorte && (today < recorte.de || today > recorte.ate)) focoChave = chaveDeHoje(f.escala, recorte.de);
    if (!ESCALAS.includes(f.escala)) problemas.push(`escala desconhecida: ${f.escala}`);
    return { filtros: f, recorte, projeto, focoChave, focoNo, problemas };
}

/* ------------------------------------------------------------ o "Onde estou" */

/**
 * O que faz: a chave de um contexto do TaskNotes para comparar: só as letras, sem acento nem caixa
 * ("💻 Computador" → "computador"); é também o id de um lugar do "Onde estou".
 * Por quê: o contexto gravado na tarefa e o do filtro se comparam pela palavra, nunca pelo emoji.
 * Entra → sai: o contexto → a chave ('' sem letras).
 * Erro e ataque: `null` e `undefined` dão ''.
 * Prova: tests/missao/onde.test.ts.
 */
export const chaveDoContexto = (c: string) => fold(String(c ?? '').replace(/[^\p{L}]/gu, ''));

/** Um lugar do filtro "Onde estou": o valor (o contexto como o TaskNotes o grava), o nome sem o emoji e o texto da dica. */
export type LugarDoOnde = readonly [valor: string, nome: string, texto: string];

/**
 * O que faz: os lugares do filtro "Onde estou": os ids na ordem e no recorte do filtro, cada um com o
 * rótulo e o emoji do vocabulário dos contextos (o valor), o nome sem o emoji e o texto da dica.
 * Por quê: o texto de cada contexto tem um dono só (`TASK_CONTEXTS`); quais lugares o filtro mostra,
 * e em que ordem, é decisão do filtro (passo `onde` da divisão da Missão).
 * Entra → sai: os ids com o texto da dica e os contextos → os lugares, na ordem dos ids.
 * Erro e ataque: o id que o vocabulário não tem sai (não se inventa rótulo).
 * Prova: tests/missao/onde.test.ts.
 */
export function lugaresDoOnde(ids: ReadonlyArray<readonly [id: string, texto: string]>, contextos: readonly string[]): LugarDoOnde[] {
    const out: LugarDoOnde[] = [];
    for (const [id, texto] of ids) {
        const valor = contextos.find(c => chaveDoContexto(c) === id);
        if (valor) out.push([valor, valor.slice(valor.indexOf(' ') + 1), texto]);
    }
    return out;
}
