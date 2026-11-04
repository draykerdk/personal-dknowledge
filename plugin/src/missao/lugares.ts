/**
 * Os lugares da Missão: as passagens (cidade, país, de, até) e o lugar de cada dia.
 *
 * Por quê: a arquitetura da página Missão (27/10/2026, 8.1). A chegada mora em dois
 * lugares que já existem: a Day do dia da chegada (`cidade`, o registro, que deixa voltar
 * a uma cidade já visitada) e a nota da cidade (`chegada`, `saida` e `pais` da passagem
 * mais recente). Cada chegada vale até a véspera da próxima, ou até a `saida`; no dia de
 * viagem as duas aparecem; a última fica aberta até hoje; sem nada, "sem lugar marcado".
 * Nada é inventado: o protótipo tinha os lugares escritos à mão.
 *
 * Módulo puro. Prova: tests/missao/lugares.test.ts.
 */
import { FRASES } from './frases';
import { fold, linkTarget } from '../project/projectCanvasModel';
import type { NotaComCampos, NotaDeLugar, NotaDePeriodo } from './entrada';
import type { DomainModel } from '../engine/domainModel';
import { estadoDaNota, formaDoEstado } from './estados';
import { addDays, diaMes } from './tempo';
import { idDoTrecho } from './colecoes';
import type { MissaoNo, Passagem, Trecho, TrechoDeLugar } from './tipos';
import { DIA } from './formatos';

export const SEM_LUGAR = FRASES.semLugar;

export interface LugarDoDia {
    passagens: Passagem[];
    /** Dia de viagem: a passagem que acaba e a que começa. */
    viagem: boolean;
    /** "Kunming → Sapa", "Sapa", ou "sem lugar marcado". */
    texto: string;
}

const dateOf = (v: unknown) => { const s = String(Array.isArray(v) ? v[0] ?? '' : v ?? '').trim().slice(0, 10); return DIA.test(s) ? s : ''; };
const nameOf = (v: unknown) => linkTarget(Array.isArray(v) ? v[0] ?? '' : v ?? '');

/**
 * O que faz: as passagens, em ordem, a partir das Days com `cidade` e das notas de cidade
 * com `chegada`. A mesma cidade no mesmo dia, pelas duas fontes, é uma chegada só.
 * Por quê: 8.1; voltar a uma cidade é outra chegada (a Day guarda o registro), e a nota
 * da cidade guarda a saída da passagem mais recente.
 * Entra → sai: as Days e as notas de cidade → `Passagem[]`, da mais antiga à mais nova.
 * Erro e ataque: data malformada é ignorada; saída antes da chegada não encurta nada
 * (fica para `conferirPassagens` dizer); chegada no futuro conta (planejada).
 * Prova: tests/missao/lugares.test.ts ("as passagens").
 */
export function passagens(dias: Record<string, NotaDePeriodo>, cidades: readonly NotaDeLugar[]): Passagem[] {
    const notaDe = new Map(cidades.map(c => [fold(nameOf(c.campos.cidade) || c.nome), c]));
    const chegadas: Array<{ data: string; cidade: string; fonte: 'dia' | 'cidade' }> = [];
    for (const [data, nota] of Object.entries(dias ?? {})) {
        const cidade = nameOf(nota?.campos?.cidade);
        if (cidade && DIA.test(data)) chegadas.push({ data, cidade, fonte: 'dia' });
    }
    for (const c of cidades ?? []) {
        const data = dateOf(c.campos.chegada);
        const cidade = nameOf(c.campos.cidade) || c.nome;
        if (data && cidade && !chegadas.some(x => x.data === data && fold(x.cidade) === fold(cidade))) chegadas.push({ data, cidade, fonte: 'cidade' });
    }
    chegadas.sort((a, b) => a.data.localeCompare(b.data) || (a.fonte === b.fonte ? 0 : a.fonte === 'dia' ? -1 : 1));
    // Duas chegadas no mesmo dia (a Day e a nota da cidade, cidades diferentes) são uma
    // viagem no mesmo dia: a primeira vale só aquele dia.
    const out: Passagem[] = [];
    chegadas.forEach((c, i) => {
        const nota = notaDe.get(fold(c.cidade)) ?? null;
        const next = chegadas[i + 1];
        const saida = nota ? dateOf(nota.campos.saida) : '';
        const lastOfCity = !chegadas.slice(i + 1).some(x => fold(x.cidade) === fold(c.cidade));
        let ate: string | null = next ? (next.data > c.data ? addDays(next.data, -1) : c.data) : null;
        // A saída da nota é da passagem mais recente daquela cidade.
        if (lastOfCity && saida && saida >= c.data && (ate === null || saida < ate)) ate = saida;
        out.push({
            id: `l:${fold(c.cidade)}:${c.data}`, cidade: c.cidade, pais: nota ? nameOf(nota.campos.pais) || null : null,
            nota: nota?.caminho ?? null, de: c.data, ate, fonte: c.fonte,
        });
    });
    return out;
}

/**
 * O nome antigo de `passagens` (a estadia virou a nota do lugar onde se fica, 30/10). Fica só para o
 * motor (`engine/jsonProtocol.ts`), que outra cópia refaz agora; sai quando o motor importar `passagens`.
 */
export const estadias = passagens;

/**
 * O que faz: o lugar de um dia: a passagem que o cobre e, no dia de uma chegada, a que
 * acabou na véspera (o dia de viagem, "Kunming → Sapa"). A passagem aberta vale até hoje;
 * depois de hoje, só o que já tem chegada marcada.
 * Prova: tests/missao/lugares.test.ts ("o lugar do dia").
 */
export function lugarDoDia(lista: readonly Passagem[], dia: string, hoje: string): LugarDoDia {
    const cobre = (e: Passagem) => e.de <= dia && (e.ate !== null ? dia <= e.ate : dia <= hoje || e.de > hoje);
    const found: Passagem[] = [];
    for (const e of lista) if (cobre(e)) found.push(e);
    // No dia da chegada, a passagem anterior aparece junto (a viagem).
    const chegando = lista.filter(e => e.de === dia);
    for (const e of chegando) {
        const idx = lista.indexOf(e);
        const prev = idx > 0 ? lista[idx - 1] : null;
        if (prev && !found.includes(prev) && (prev.ate === null || prev.ate >= addDays(dia, -1))) found.unshift(prev);
    }
    const ordered = [...new Set(found)].sort((a, b) => a.de.localeCompare(b.de));
    const viagem = ordered.length > 1;
    return { passagens: ordered, viagem, texto: ordered.length ? ordered.map(e => e.cidade).join(' → ') : SEM_LUGAR };
}

/** O que faz: a faixa do lugar de um período (os dias, em trechos seguidos por passagem; viagem conta na que começa). */
export function faixaDoPeriodo(lista: readonly Passagem[], dias: readonly string[], hoje: string): TrechoDeLugar[] {
    const out: TrechoDeLugar[] = [];
    for (const d of dias) {
        const l = lugarDoDia(lista, d, hoje).passagens;
        const id = l.length ? l[l.length - 1].id : null;
        const last = out[out.length - 1];
        if (last && last.passagem === id) last.dias++;
        else out.push({ passagem: id, dias: 1, desde: d });
    }
    return out;
}

/** O que faz: os dias de cada passagem dentro de uma lista de dias (para a linhagem do lugar). */
export function diasPorPassagem(lista: readonly Passagem[], dias: readonly string[], hoje: string): Map<string, string[]> {
    const out = new Map<string, string[]>();
    for (const d of dias) for (const e of lugarDoDia(lista, d, hoje).passagens) out.set(e.id, [...(out.get(e.id) ?? []), d]);
    return out;
}

/** O que faz: as datas de uma passagem em texto ("29/09–27/10", "desde 28/10"). */
export function datasDaPassagem(e: Passagem): string {
    return e.ate === null ? `desde ${diaMes(e.de)}` : e.ate === e.de ? diaMes(e.de) : `${diaMes(e.de)}–${diaMes(e.ate)}`;
}

/** O que faz: a ordem dos países como aparecem (a cor da faixa segue essa ordem). */
export function ordemDosPaises(lista: readonly Passagem[]): string[] {
    const out: string[] = [];
    for (const e of lista) if (e.pais && !out.some(p => fold(p) === fold(e.pais!))) out.push(e.pais);
    return out;
}

/**
 * O que faz: confere as passagens do cofre: chegada antes da saída e no máximo uma aberta.
 * Prova: tests/missao/lugares.test.ts ("conferir").
 */
export function conferirPassagens(cidades: readonly NotaDeLugar[], lista: readonly Passagem[], hoje: string): string[] {
    const problemas: string[] = [];
    for (const c of cidades) {
        const chegada = dateOf(c.campos.chegada);
        const saida = dateOf(c.campos.saida);
        if (chegada && saida && saida < chegada) problemas.push(`${c.nome}: a saída (${saida}) vem antes da chegada (${chegada}).`);
        if (!chegada && saida) problemas.push(`${c.nome}: tem saída (${saida}) sem chegada.`);
    }
    const abertas = lista.filter(e => e.ate === null && e.de <= hoje);
    if (abertas.length > 1) problemas.push(`${abertas.length} passagens abertas: ${abertas.map(e => e.cidade).join(', ')}.`);
    return problemas;
}

/**
 * O que faz: os trechos feitos, pelas passagens: de cada passagem para a seguinte, no dia da
 * chegada da seguinte ("Kunming → Sapa", 28/10).
 * Por quê: §3.8 ("o trecho como nó"), derivado e nunca guardado; o que os dados dizem é de
 * onde, para onde e o dia da chegada, e nada mais (nenhum transporte, nenhuma hora).
 * Entra → sai: as passagens, da mais antiga à mais nova → `Trecho[]`, do mais antigo ao mais novo.
 * Erro e ataque: a primeira passagem não tem trecho (não se sabe de onde veio); a mesma
 * cidade seguida (a Day e a nota, no mesmo lugar) não é trecho.
 * Prova: tests/missao/colecoes.test.ts ("os trechos feitos").
 */
export function trechosDasPassagens(lista: readonly Passagem[]): Trecho[] {
    const out: Trecho[] = [];
    for (let i = 1; i < lista.length; i++) {
        const a = lista[i - 1], b = lista[i];
        if (fold(a.cidade) === fold(b.cidade)) continue;
        out.push({ id: idDoTrecho(b.de, a.cidade, b.cidade), de: a.cidade, para: b.cidade, dia: b.de, planejado: false, nota: null });
    }
    return out;
}

/* ------------------------------------------------------------ as estadias (30/10) */

/** Uma estadia lida: a nota, a cidade (o nome), a entrada e a saída (`AAAA-MM-DD` ou `null`) e o nó dela. */
export interface EstadiaLida { caminho: string; cidade: string | null; de: string | null; ate: string | null; no: MissaoNo }

/**
 * O que faz: as estadias das notas (30/10), pelo modelo do tipo de cada uma: o título é o campo do nome
 * (`criar.titulo`), a cidade é o campo de link do ramo de cima, e a entrada e a saída são os dois campos de
 * data, na ordem do modelo; o nó é o cartão da nota, com o estado da tabela (`estadoDaNota`).
 * Por quê: a estadia é a pequena nota do lugar onde a pessoa se hospedou (29/10/2026): ela aparece na cidade e na
 * passagem que cobre os dias dela, com o estado do planejamento no cartão; os nomes dos campos são do
 * modelo, e nenhum mora aqui.
 * Entra → sai: as notas e os modelos → as estadias, pela entrada (as sem data por último, pelo nome).
 * Erro e ataque: a nota sem modelo fica de fora; a data malformada vale como sem data (nunca um dia
 * inventado); a saída antes da entrada vale só o dia da entrada.
 * Prova: tests/missao/lugares.test.ts ("as estadias").
 */
export function estadiasDasNotas(notas: readonly NotaComCampos[], modelos: readonly DomainModel[]): EstadiaLida[] {
    const out: EstadiaLida[] = [];
    for (const n of notas) {
        const type = String(n.campos?.type ?? '').trim();
        const m = modelos.find(x => x.candidatos.type === type);
        if (!m) continue;
        const nome = m.criar?.titulo ? String(n.campos?.[m.criar.titulo] ?? '').trim() : '';
        const doLugar = m.campos.find(c => c.tipo === 'link' && c.ramo === 'acima');
        const datas = m.campos.filter(c => c.tipo === 'data');
        const de = datas[0] ? dateOf(n.campos?.[datas[0].nome]) || null : null;
        const fim = datas[1] ? dateOf(n.campos?.[datas[1].nome]) || null : null;
        const ate = de && fim && fim >= de ? fim : de;
        const cidade = doLugar ? nameOf(n.campos?.[doLugar.nome]) || null : null;
        const st = estadoDaNota(n.campos, modelos);
        const quando = de ? (ate && ate !== de ? `${diaMes(de)}–${diaMes(ate)}` : diaMes(de)) : FRASES.datasADefinir;
        out.push({
            caminho: n.caminho, cidade, de, ate,
            no: {
                id: `n:${n.caminho}`, tipo: 'nota', titulo: nome || n.nome, linha: [st?.rotulo, quando].filter(Boolean).join(' · '),
                sub: m.dominio[0].toUpperCase() + m.dominio.slice(1), ramo: -1, ...(formaDoEstado(st) ? { estado: formaDoEstado(st) } : {}),
            },
        });
    }
    return out.sort((a, b) => (a.de ?? '9999').localeCompare(b.de ?? '9999') || a.no.titulo.localeCompare(b.no.titulo, 'pt-BR'));
}

/**
 * O que faz: as estadias de uma passagem: as da mesma cidade cujos dias cruzam os dela (a passagem aberta
 * vale até hoje, ou até a chegada, se for no futuro).
 * Por quê: as estadias de um período são as notas de hospedagem que caem nele (29/10/2026).
 * Erro e ataque: a estadia sem data não cai em passagem nenhuma (fica na cidade).
 */
export function estadiasDaPassagem(p: Passagem, lista: readonly EstadiaLida[], hoje: string): EstadiaLida[] {
    const fim = p.ate ?? (hoje > p.de ? hoje : p.de);
    return lista.filter(e => e.cidade && fold(e.cidade) === fold(p.cidade) && e.de && e.de <= fim && (e.ate ?? e.de) >= p.de);
}

/** O que faz: as estadias de uma cidade (pelo nome), com e sem data. */
export function estadiasDaCidade(nome: string, lista: readonly EstadiaLida[]): EstadiaLida[] {
    const k = fold(nome);
    return k ? lista.filter(e => e.cidade && fold(e.cidade) === k) : [];
}
