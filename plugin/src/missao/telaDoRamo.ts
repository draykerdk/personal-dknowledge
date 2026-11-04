/**
 * A tela do ramo: o mapa conectado que a vista do zoom da pinça desenha a partir do ramo de um nó
 * (`modelo.ramo`) e como as duas rolagens andam nele, pela formação do nó.
 *
 * Por quê: a proposta da pinça (29/10): o zoom da pinça vai ao ramo específico do objeto sob o zoom,
 * como uma aproximação de fractais; e a correção no mesmo dia do teste (30/10): a navegação é por
 * gestos, e tudo vira ramos conectados. O ramo é um mapa, na linguagem do mapa da Missão: cartões em
 * colunas e uma curva
 * de cada nó até o nó de onde ele sai. O nó do zoom fica no centro; o que o contém se abre de um lado
 * (à esquerda, como a asa do trabalho), o que ele tem dentro se ramifica do outro, e os pares ficam
 * na mesma coluna do nó de onde saem, ao lado dele. As direções não são rótulos: são para onde os
 * gestos levam (a vertical pelo eixo principal, a horizontal pelas conexões, a pinça mais fundo).
 *
 * A coluna de um item sai do caminho: o que está acima fica uma coluna à esquerda de quem o traz; o
 * que está abaixo, e o que ele liga ou o liga, uma coluna para fora (à direita do centro); só os pares
 * de verdade (a dependência, o par), poucos, ficam na mesma coluna, logo acima e abaixo. Os links de
 * pouco valor do mesmo tipo viram um cartão só. O antes e o depois do lado não se separam além disso:
 * decide-se no uso (30/10).
 *
 * Módulo puro: sem DOM nem Obsidian; a vista só desenha o que sai daqui.
 * Prova: tests/missao/telaDoRamo.test.ts.
 */
import { COLUNA_DO_CENTRO, COLUNA_DO_LADO, type Formacao } from '../engine/domainModel';
import type { DisposicaoDoRamo } from './formacao';
import { andar, idDoPeriodo, isChaveEspecial, periodoDoId, type NivelDaNavegacao } from './tempo';
import { FRASES, PINCA, RAMO } from './frases';
import type { EspecieDoRamo, ItemDoRamo, Ligacao, MissaoModelo, MissaoNo, RamoDoNo, RelacaoDoRamo, TipoDeNo } from './tipos';

/** Quantos itens de um nível o mapa mostra de cada vez ("mais conexões" abre mais tantos). */
export const CONEXOES_A_VISTA = 12;

export type SentidoDoRamo = ItemDoRamo['sentido'];

/** Um cartão do mapa do ramo: o nó (ou um grupo de conexões), a coluna, o nível e de quem sai (o centro tem nível 0). */
export interface CartaoDoRamo {
    id: string | null;
    /** A chave do cartão no mapa: o id; `?<nível>:<posição>` no nome sem nó; `#<origem>|<relação>|<rótulo>` no grupo. */
    chave: string;
    titulo: string;
    /** A relação com o nó de onde sai; `null` no centro. */
    relacao: RelacaoDoRamo | null;
    rotulo: string | null;
    profundidade: number;
    /** A coluna, relativa ao centro (0): negativa à esquerda (o que contém), positiva à direita (o que tem dentro e o que liga). */
    x: number;
    /** O id do cartão de onde sai; `null` no centro. */
    de: string | null;
    /**
     * O nó do cartão, o mesmo que o mapa desenha (`modelo.no`, o cartão único `noEl`): o que o modelo
     * conhece vem dele; o item da checklist, a nota solta, o nome sem nó e o grupo, de `noDoCartao`.
     */
    no: MissaoNo;
    /** A posição no passo horizontal (só os cartões do nível atual com nó ou grupo); `null` nos outros. */
    indice: number | null;
    /** No grupo: quantas conexões ele junta (abre pelo passo horizontal, pelo clique ou pelo "mais conexões"). */
    quantos?: number;
    /** O nó tem o que mostrar abaixo dele (30/10): fechado (o "expandir") ou aberto (o "recolher"). */
    filhos?: 'fechado' | 'aberto';
}

/** O mapa do ramo: as colunas da esquerda para a direita, as ligações e o que ficou de fora. */
export interface MapaDoRamo {
    id: string;
    titulo: string;
    especie: EspecieDoRamo;
    /** O nível mais fundo (o atual, onde o passo horizontal anda). */
    profundidade: number;
    /**
     * As colunas, da esquerda para a direita, com o centro no meio: o lado mais curto ganha colunas
     * vazias, para o nó do zoom ficar no centro da vista.
     */
    colunas: Array<{ x: number; cartoes: CartaoDoRamo[]; /** Na disposição declarada (02/11): o nome da coluna. */ grupo?: string }>;
    /** Uma curva de cada cartão até o de onde sai, com a ponta da esquerda em `de` (como o mapa da Missão desenha). */
    ligacoes: Ligacao[];
    /** A coluna do "+" do que se cria a partir do centro: a declarada (`formacao.mais`), senão a primeira à direita. */
    xDoMais: number;
    /** Os itens do nível atual que ficaram para o "mais conexões". */
    mais: number;
    /** Os grupos fechados (as chaves), que o "mais conexões" abre. */
    grupos: string[];
    /** Os itens dos níveis de cima que não cabem, ou cujo nó de origem não está no mapa (contados, não desenhados). */
    escondidos: number;
    /** As chaves do nível atual na ordem do ramo (com os grupos fechados como um só): o caminho do passo horizontal. */
    atuais: string[];
}

/**
 * A espécie do cartão de um nome sem nó, pela relação (o país sem nota, a pessoa que só está escrita):
 * o lugar e a pessoa guardam a forma deles; o resto é nota.
 */
const TIPO_SEM_NO: Partial<Record<RelacaoDoRamo, TipoDeNo>> = { pais: 'lugar', cidade: 'lugar', passagem: 'lugar', lugar: 'lugar', pessoa: 'pessoa' };

/** O que um cartão do ramo é antes de ter o nó: o id, o título, a relação, o rótulo e, no grupo, quantos junta. */
export type CartaoSemNo = Pick<CartaoDoRamo, 'id' | 'chave' | 'titulo' | 'relacao' | 'rotulo'> & { quantos?: number };

/**
 * O que faz: o nó de um cartão do ramo, para o cartão único (`noEl`): o que o modelo conhece, como o
 * mapa o compõe (`modelo.no`); o grupo ("3 · Dia"); o item da checklist (o texto e o feito da nota);
 * o nome sem nó (sem nota); a nota que o modelo não conhece, pelo título.
 * Por quê: o nó de tarefa tem o mesmo tipo no mapa e no ramo, e os outros nós seguem o mesmo padrão
 * (30/10/2026). O dado é o do mapa; o que só o ramo traz (o item, o
 * grupo) se compõe aqui, uma vez, e as Conexões do painel o reusam.
 * Entra → sai: o achador do modelo e o cartão → `MissaoNo` (nunca vazio).
 * Prova: tests/missao/cartaoUnico.test.ts.
 */
export function noDoCartao(noDe: (id: string) => MissaoNo | null, c: CartaoSemNo): MissaoNo {
    if (c.quantos) return { id: c.chave, tipo: 'grupo', titulo: PINCA.grupo(c.quantos, c.titulo), linha: c.relacao ? RAMO.relacao[c.relacao] ?? c.relacao : '', ramo: -1 };
    // A decisão escrita nos Suportes e decisões (02/11) não é nota: o cartão diz de onde ela veio.
    if (!c.id && c.relacao === 'suporte') return { id: '', tipo: 'nota', titulo: c.titulo, linha: c.rotulo ?? '', ramo: -1 };
    if (!c.id) return { id: '', tipo: (c.relacao && TIPO_SEM_NO[c.relacao]) || 'nota', titulo: c.titulo, linha: FRASES.semNota, ramo: -1 };
    const doModelo = noDe(c.id);
    if (doModelo) return doModelo;
    if (c.relacao === 'item') {
        const feito = c.rotulo === RAMO.itemFeito;
        return { id: c.id, tipo: 'item', titulo: c.titulo, linha: feito ? RAMO.itemFeito : RAMO.itemAberto, estado: feito ? 'feita' : 'aberta', ramo: -1 };
    }
    return { id: c.id, tipo: 'nota', titulo: c.titulo, linha: '', ramo: -1 };
}

/** O tipo de ligação de cada relação no mapa (o traço sai da tabela da vista): o ramo, a dependência, o tempo e o resto. */
export function tipoDaLigacao(item: Pick<ItemDoRamo, 'sentido' | 'relacao'>): Ligacao['tipo'] {
    // O que ficou de antes, tracejado como no mapa (02/11).
    if (item.relacao === 'pendente') return 'pendente';
    if (item.sentido !== 'lado') return 'estrutura';
    if (item.relacao === 'bloqueada-por' || item.relacao === 'bloqueia') return 'bloqueio';
    if (item.relacao === 'quando' || item.relacao === 'periodo' || item.relacao === 'trimestre') return 'tempo';
    return 'lugar';
}

/** Os pares de verdade (a dependência e o par): ficam na coluna de quem os traz, logo acima ou abaixo dele. */
const PARES: ReadonlySet<RelacaoDoRamo> = new Set<RelacaoDoRamo>(['bloqueada-por', 'bloqueia', 'par']);
/** Os pares que vêm antes do nó de onde saem (o começo da cadeia principal: quem o bloqueia). */
const VEM_ANTES: ReadonlySet<RelacaoDoRamo> = new Set<RelacaoDoRamo>(['bloqueada-por']);
/** Quantos pares cabem na coluna de quem os traz (o resto vai para a coluna de fora, ligado igual). */
export const PARES_AO_LADO = 4;
/**
 * As conexões de pouco valor no mapa (os links da nota, nas duas direções, e as notas que o ramo
 * liga): do mesmo tipo e da mesma origem, viram um cartão só ("3 · Dia"), que abre pelo passo
 * horizontal, pelo clique ou pelo "mais conexões" (30/10). As de estrutura (o projeto, a área, o
 * período, as tarefas, as subtarefas, a checklist) ficam um cartão cada.
 */
const AGRUPAVEIS: ReadonlySet<RelacaoDoRamo> = new Set<RelacaoDoRamo>(['entra', 'sai', 'ligada']);

/**
 * As relações sem curva até quem as traz (02/11): nenhum campo liga o cartão ao nó de onde ele sai. O
 * projeto da semana (`frente`) aparece porque as SMART e as tarefas dela o servem, e se liga a elas pelas
 * ligações a mais.
 */
export const SEM_CURVA: ReadonlySet<RelacaoDoRamo> = new Set<RelacaoDoRamo>(['frente']);

/** O que é da nota do nó, e não do caminho do ramo (02/11): os links dela, quem aponta para ela e os Suportes e decisões. */
const DA_NOTA: ReadonlySet<RelacaoDoRamo> = new Set<RelacaoDoRamo>(['sai', 'entra', 'ligada', 'suporte']);

/** O que faz: a chave do grupo de um item (a origem, a relação e o rótulo, que é o tipo de quem aponta ou a chave do link). */
export const grupoDe = (it: Pick<ItemDoRamo, 'de' | 'relacao' | 'rotulo'>) => `#${it.de}|${it.relacao}|${it.rotulo ?? ''}`;

/**
 * O que faz: os itens que o mapa pode desenhar em cada nível: o item cujo nó de origem está desenhado,
 * até `CONEXOES_A_VISTA` por nível nos de cima e até `visiveis` no atual.
 */
function desenhaveis(ramo: RamoDoNo, visiveis: number, aVista: number = CONEXOES_A_VISTA): Array<Array<ItemDoRamo & { i: number }>> {
    const noMapa = new Set<string>([ramo.id]);
    return ramo.niveis.map((nivel, n) => {
        const cabe = n === ramo.niveis.length - 1 ? visiveis : aVista;
        const out: Array<ItemDoRamo & { i: number }> = [];
        nivel.itens.forEach((it, i) => {
            if (i >= cabe || !noMapa.has(it.de)) return;
            out.push({ ...it, i });
        });
        for (const it of out) if (it.id) noMapa.add(it.id);
        return out;
    });
}

/** O que faz: as chaves do nível atual que o passo horizontal percorre (sem o teto do nível; os grupos fechados como um só). */
export function navegaveisDoRamo(ramo: RamoDoNo, abertos: readonly string[] = []): string[] {
    return mapaDoRamo(ramo, Infinity, abertos).atuais;
}

/**
 * O que faz: o mapa de um ramo: o centro na coluna 0 e no meio da vista; o que o contém uma coluna à
 * esquerda de quem o traz; o que ele tem dentro, e o que ele liga ou o liga, uma coluna para fora
 * (à direita do centro); os pares de verdade, poucos, logo acima e abaixo de quem os traz, na mesma
 * coluna; as conexões de pouco valor do mesmo tipo juntas num cartão; e uma ligação de cada cartão
 * até o de onde sai.
 * Por quê: tudo vira ramos conectados (30/10), e a correção da prévia no mesmo dia: o
 * centro no centro da vista, os filhos e os links à direita (sem o feixe de colchetes na coluna do
 * centro), os pares só os de verdade, e os links de pouco valor agrupados.
 * A disposição declarada (02/11, `formacao.colunas` do modelo do tipo; na semana, depois dos projetos vêm
 * as SMART, depois as tarefas, os dias e as semanas, tudo com as conexões):
 * cada cartão vai para a coluna do nome da sua relação, ou da sua espécie, na ordem declarada, com o
 * centro onde está `centro`; o que nenhuma coluna nomeia fica depois da última; o "+" vai para a coluna
 * `mais`; e cada nível mostra `aVista` itens antes do "mais conexões". As curvas são as mesmas: de cada
 * cartão a quem o traz (menos as relações sem campo, `SEM_CURVA`) e as ligações a mais do ramo.
 * Entra → sai: o ramo (`modelo.ramo`), quantos itens do nível atual mostrar, os grupos abertos, o nó de
 * cada id e a disposição (sem ela, pelo caminho e `CONEXOES_A_VISTA`) → `MapaDoRamo`.
 * Erro e ataque: o ramo sem níveis dá só o centro; `visiveis` não finito ou menor que 1 vale
 * `CONEXOES_A_VISTA` (`Infinity` vale tudo, para o passo horizontal); o item cujo nó de origem não está
 * no mapa não se desenha (conta em `escondidos`); o grupo de uma conexão só não existe (o cartão é o
 * item); o tamanho é limitado pelos níveis e pelos tetos de cada um, por maior que seja o ramo.
 * Prova: tests/missao/telaDoRamo.test.ts ("o mapa").
 */
export function mapaDoRamo(ramo: RamoDoNo, visiveis: number = CONEXOES_A_VISTA, abertos: readonly string[] = [], noDe: (id: string) => MissaoNo | null = () => null, disposicao: DisposicaoDoRamo | null = null): MapaDoRamo {
    const aVista = disposicao && Number.isInteger(disposicao.aVista) && disposicao.aVista >= 1 ? disposicao.aVista : CONEXOES_A_VISTA;
    const limite = visiveis === Infinity ? Infinity : Number.isFinite(visiveis) && visiveis >= 1 ? Math.floor(visiveis) : aVista;
    const niveis = desenhaveis(ramo, limite, aVista);
    // A disposição declarada (02/11): a coluna de cada cartão pelo nome da relação dele, ou da espécie.
    const declaradas = disposicao?.colunas && disposicao.colunas.includes(COLUNA_DO_CENTRO) ? disposicao.colunas : null;
    const xDoNome = (nome: string | null | undefined) => (declaradas && nome && declaradas.includes(nome) ? declaradas.indexOf(nome) - declaradas.indexOf(COLUNA_DO_CENTRO) : null);
    /**
     * A coluna declarada de um cartão: o que é da nota do nó (os links dela, quem aponta para ela, os Suportes e
     * decisões) vai para a coluna do lado; o resto, para a coluna da relação, senão da espécie; o que nenhuma
     * coluna nomeia, para a do lado, senão para depois da última.
     */
    const xDeclarado = (c: CartaoSemNo, tipo: TipoDeNo) => (c.relacao && DA_NOTA.has(c.relacao) ? xDoNome(COLUNA_DO_LADO) : null)
        ?? xDoNome(c.relacao) ?? xDoNome(tipo) ?? xDoNome(COLUNA_DO_LADO) ?? declaradas!.length - declaradas!.indexOf(COLUNA_DO_CENTRO);
    const doCentro: CartaoSemNo = { id: ramo.id, chave: ramo.id, titulo: ramo.titulo, relacao: null, rotulo: null };
    const centro: CartaoDoRamo = { ...doCentro, profundidade: 0, x: 0, de: null, no: noDoCartao(noDe, doCentro), indice: null };
    const colunas = new Map<number, CartaoDoRamo[]>([[0, [centro]]]);
    const xDe = new Map<string, number>([[ramo.id, 0]]);
    /** Quantos pares cada nó já tem ao lado, e quantos ficaram abaixo dele (o próximo de baixo entra depois deles). */
    const pares = new Map<string, number>();
    const abaixoDe = new Map<string, number>();
    const acimaDe = new Map<string, number>();
    const ligacoes: Ligacao[] = [];
    const grupos: string[] = [];
    const atuais: string[] = [];
    const ultimo = ramo.niveis.length - 1;
    const abertosSet = new Set(abertos);
    const tipoDe = (id: string | null) => (id ? noDe(id)?.tipo ?? null : null);
    niveis.forEach((itens, n) => {
        // As SMART e as tarefas em colunas separadas (30/10): quem tem SMART entre os filhos põe as tarefas na
        // coluna da frente, junto das que saem das SMART; nunca uma dentro da outra.
        const comSmart = new Set(itens.filter(it => it.sentido === 'abaixo' && tipoDe(it.id) === 'smart').map(it => it.de));
        // Os grupos do nível: as conexões de pouco valor do mesmo tipo e da mesma origem, duas ou mais.
        const contagem = new Map<string, number>();
        for (const it of itens) if (AGRUPAVEIS.has(it.relacao)) contagem.set(grupoDe(it), (contagem.get(grupoDe(it)) ?? 0) + 1);
        const postos = new Set<string>();
        for (const it of itens) {
            const g = AGRUPAVEIS.has(it.relacao) ? grupoDe(it) : null;
            const fechado = !!g && (contagem.get(g) ?? 0) > 1 && !abertosSet.has(g);
            if (fechado && postos.has(g!)) continue;
            const xPai = xDe.get(it.de) ?? 0;
            const ladoDoPai = (pares.get(it.de) ?? 0) < PARES_AO_LADO;
            const chave = fechado ? g! : it.id ?? `?${n + 1}:${it.i}`;
            const semNo: CartaoSemNo = {
                id: fechado ? null : it.id, chave, titulo: fechado ? it.rotulo || RAMO.grupoDoLink[it.relacao] || it.relacao : it.titulo, relacao: it.relacao, rotulo: fechado ? null : it.rotulo,
                ...(fechado ? { quantos: contagem.get(g!) } : {}),
            };
            const no = noDoCartao(noDe, semNo);
            // Na disposição declarada, a coluna é a do nome; o par entra na coluna dele, como os outros.
            const par = !declaradas && !fechado && it.sentido === 'lado' && PARES.has(it.relacao) && ladoDoPai;
            // Para fora: à direita do centro, e à esquerda de quem já está à esquerda.
            const fora = xPai < 0 ? xPai - 1 : xPai + 1;
            const naFrente = it.sentido === 'abaixo' && comSmart.has(it.de) && tipoDe(it.id) === 'acao';
            const x = declaradas ? xDeclarado(semNo, no.tipo) : it.sentido === 'acima' ? xPai - 1 : it.sentido === 'abaixo' ? xPai + (naFrente ? 2 : 1) : par ? xPai : fora;
            const c: CartaoDoRamo = { ...semNo, profundidade: n + 1, x, de: it.de, no, indice: null, ...(it.filhos && !fechado ? { filhos: it.filhos } : {}) };
            if (fechado) { postos.add(g!); grupos.push(g!); }
            if (n === ultimo && (c.id || fechado)) { c.indice = atuais.length; atuais.push(chave); }
            const col = colunas.get(x) ?? [];
            colunas.set(x, col);
            const p = par ? col.findIndex(k => k.chave === it.de) : -1;
            if (p < 0) col.push(c);
            else {
                const k = pares.get(it.de) ?? 0;
                pares.set(it.de, k + 1);
                // Quem bloqueia, acima; os outros pares se alternam abaixo e acima, logo junto de quem os traz.
                const acima = VEM_ANTES.has(it.relacao) || (it.relacao !== 'bloqueia' && k % 2 === 1);
                // O mais perto fica junto de quem o traz: o seguinte acima entra acima dos que já estão lá.
                if (acima) { const a = acimaDe.get(it.de) ?? 0; col.splice(p - a, 0, c); acimaDe.set(it.de, a + 1); }
                else { const b = abaixoDe.get(it.de) ?? 0; col.splice(p + 1 + b, 0, c); abaixoDe.set(it.de, b + 1); }
            }
            if (it.id && !fechado) xDe.set(it.id, x);
            // O que só se mostra por estar à vista (o projeto da semana) não tem
            // campo que o ligue a quem o traz: sem curva até ele; as ligações a mais fazem a cadeia (02/11).
            if (SEM_CURVA.has(it.relacao)) continue;
            // A ponta da esquerda é o `de` da ligação (o mapa da Missão desenha da esquerda para a direita).
            ligacoes.push(x < xPai ? { de: chave, para: it.de, tipo: tipoDaLigacao(it) } : { de: it.de, para: chave, tipo: tipoDaLigacao(it) });
        }
    });
    // As ligações a mais entre nós à vista (30/10): a tarefa com duas SMART tem as duas curvas, e a dependência
    // e a subtarefa entre tarefas à vista também, cada uma uma vez, com a ponta da esquerda em `de`.
    for (const e of ramo.extras ?? []) {
        const xa = xDe.get(e.de), xb = xDe.get(e.para);
        if (xa === undefined || xb === undefined) continue;
        const tipo = tipoDaLigacao(e);
        ligacoes.push(xb < xa ? { de: e.para, para: e.de, tipo } : { de: e.de, para: e.para, tipo });
    }
    // O que falta no nível atual e tem a origem no mapa abre pelo "mais conexões"; o resto conta como escondido.
    const candidatos = limite === Infinity ? niveis[ultimo]?.length ?? 0 : desenhaveis(ramo, Infinity, aVista)[ultimo]?.length ?? 0;
    const atual = ramo.niveis[ultimo];
    const mais = atual ? candidatos - (niveis[ultimo]?.length ?? 0) + atual.mais : 0;
    const escondidos = ramo.niveis.slice(0, ultimo).reduce((s, nivel, n) => s + nivel.itens.length + nivel.mais - niveis[n].length, 0)
        + (atual ? atual.itens.length - candidatos : 0);
    // O centro no meio: o lado mais curto ganha colunas vazias.
    // Na disposição declarada, as colunas do "+" e as nomeadas existem mesmo vazias (o lugar onde se cria).
    const xDoMais = xDoNome(disposicao?.mais) ?? 1;
    if (declaradas) for (const nome of declaradas) { const x = xDoNome(nome)!; if (!colunas.has(x)) colunas.set(x, []); }
    const xs = [...colunas.keys()];
    const raio = Math.max(0, ...xs.map(Math.abs));
    // Pelo caminho, o lado mais curto ganha colunas vazias para o centro ficar no meio; na disposição declarada,
    // as colunas são as dela (a vista se centra no nó pela rolagem), e nenhuma coluna vazia sobra na ponta.
    const [de, ate] = declaradas ? [Math.min(...xs), Math.max(...xs)] : [-raio, raio];
    for (let x = de; x <= ate; x++) if (!colunas.has(x)) colunas.set(x, []);
    const nomeDaColuna = (x: number) => (declaradas ? declaradas.find(nome => xDoNome(nome) === x && nome !== COLUNA_DO_CENTRO) : undefined);
    return {
        id: ramo.id, titulo: ramo.titulo, especie: ramo.especie, profundidade: ramo.niveis.length,
        colunas: [...colunas.entries()].sort((a, b) => a[0] - b[0]).map(([x, cartoes]) => { const grupo = nomeDaColuna(x); return grupo ? { x, cartoes, grupo } : { x, cartoes }; }),
        ligacoes, mais, grupos, escondidos, atuais, xDoMais,
    };
}

/** O passo horizontal: o item da vez no nível atual (`null` = nenhum), quantos itens do nível se mostram e os grupos abertos. */
export interface CursorDoRamo { cursor: number | null; visiveis: number; abertos: string[] }

export const CURSOR_INICIAL: CursorDoRamo = { cursor: null, visiveis: CONEXOES_A_VISTA, abertos: [] };

/**
 * O que faz: um passo da rolagem horizontal no ramo: anda um cartão pelas conexões do nível atual;
 * o grupo em que ele para se abre (o cursor fica no primeiro item dele); quando o item da vez passa
 * do que se mostra, abre o "mais conexões" (mais `CONEXOES_A_VISTA`).
 * Por quê: "a horizontal pode ser uma forma aprofundar em mais conexoes ou caso a cadeia de conxeoes
 * seja muito loga, navegar entre elas" (30/10).
 * Entra → sai: o ramo, o cursor e o sentido (1 adiante, −1 atrás) → o cursor seguinte (a entrada não é mutada).
 * Erro e ataque: sem conexão, o cursor fica `null`; nas pontas, fica onde está; o primeiro passo, nos
 * dois sentidos, vai à primeira conexão; um `visiveis` estragado volta ao padrão, sem laço.
 * Prova: tests/missao/telaDoRamo.test.ts ("o passo horizontal").
 */
export function passoHorizontal(ramo: RamoDoNo, c: CursorDoRamo, sentido: 1 | -1): CursorDoRamo {
    const abertos = Array.isArray(c.abertos) ? c.abertos : [];
    let navegaveis = navegaveisDoRamo(ramo, abertos);
    if (!navegaveis.length) return { ...c, abertos, cursor: null };
    const cursor = c.cursor === null ? 0 : Math.max(0, Math.min(navegaveis.length - 1, c.cursor + sentido));
    let novos = abertos;
    if (navegaveis[cursor].startsWith('#')) { novos = [...abertos, navegaveis[cursor]]; navegaveis = navegaveisDoRamo(ramo, novos); }
    const atual = ramo.niveis[ramo.niveis.length - 1]!.itens;
    const posicao = atual.findIndex(i => i.id === navegaveis[cursor]);
    // Sem laço: os passos de `CONEXOES_A_VISTA` que levam o item da vez para dentro do que se mostra.
    const base = Number.isFinite(c.visiveis) && c.visiveis >= 1 ? Math.floor(c.visiveis) : CONEXOES_A_VISTA;
    const visiveis = posicao >= base ? base + Math.ceil((posicao - base + 1) / CONEXOES_A_VISTA) * CONEXOES_A_VISTA : base;
    return { cursor, visiveis, abertos: novos };
}

/**
 * O que faz: o "mais conexões": abre os grupos fechados do mapa e mais `CONEXOES_A_VISTA` itens do nível atual.
 * Entra → sai: o cursor e os grupos fechados à vista → o cursor com tudo aberto (o item da vez fica).
 */
export function maisConexoes(c: CursorDoRamo, grupos: readonly string[] = []): CursorDoRamo {
    const abertos = [...new Set([...(Array.isArray(c.abertos) ? c.abertos : []), ...grupos])];
    return { ...c, abertos, visiveis: (Number.isFinite(c.visiveis) && c.visiveis >= 1 ? Math.floor(c.visiveis) : CONEXOES_A_VISTA) + CONEXOES_A_VISTA };
}

/** O que faz: abre um grupo (o clique no cartão dele). */
export function abrirGrupo(c: CursorDoRamo, grupo: string): CursorDoRamo {
    const abertos = Array.isArray(c.abertos) ? c.abertos : [];
    return abertos.includes(grupo) ? c : { ...c, abertos: [...abertos, grupo] };
}

/* ------------------------------------------------------------ a rolagem vertical (a formação) */

/**
 * A cadeia principal de um nó, por sentido: para cima, primeiro o que o bloqueia, depois o que está
 * acima; para baixo, o que ele bloqueia, depois o que está abaixo. É a cadeia de dependências da
 * tarefa e, sem dependência, o ramo para cima e para baixo (30/10).
 */
export const CADEIA_PRINCIPAL: Readonly<Record<'1' | '-1', { relacoes: readonly RelacaoDoRamo[]; sentido: SentidoDoRamo }>> = {
    '-1': { relacoes: ['bloqueada-por'], sentido: 'acima' },
    '1': { relacoes: ['bloqueia'], sentido: 'abaixo' },
};

/**
 * O que faz: o vizinho de um nó na cadeia principal (a formação `relacao`): o primeiro item do nível 1
 * pela relação da cadeia, senão pelo sentido.
 * Entra → sai: o ramo, o sentido (−1 sobe, 1 desce) e quem tem ramo → o id do vizinho, ou `null`.
 * Erro e ataque: só os itens com nó que têm ramo (o item da checklist não é passo); sem vizinho, `null`.
 * Prova: tests/missao/telaDoRamo.test.ts ("a formação relação").
 */
export function vizinhoNaRelacao(ramo: RamoDoNo, sentido: 1 | -1, temRamo: (id: string) => boolean): string | null {
    const regra = CADEIA_PRINCIPAL[sentido === 1 ? '1' : '-1'];
    const nivel1 = (ramo.niveis[0]?.itens ?? []).filter((i): i is ItemDoRamo & { id: string } => !!i.id && i.de === ramo.id);
    // Na ordem da cadeia: primeiro a relação, depois o sentido; quem tem ramo só se pergunta na vez dele.
    for (const i of [...nivel1.filter(x => regra.relacoes.includes(x.relacao)), ...nivel1.filter(x => x.sentido === regra.sentido)]) if (temRamo(i.id)) return i.id;
    return null;
}

/** O que a rolagem no tempo lê do modelo: as passagens e as tarefas do índice. */
export type FontesDoTempo = Pick<MissaoModelo, 'passagens'> & { indice: Pick<MissaoModelo['indice'], 'tarefas' | 'porId'> };

/**
 * O que faz: o vizinho de um nó no tempo (a formação `tempo`): o mesmo tipo em sequência. O período
 * anda na escala dele; a passagem, pela rota (as passagens pela chegada); a tarefa, pelas tarefas do
 * mesmo tipo pelo dia. Como na linha do tempo, descer (1) vai para antes e subir (−1) para depois.
 * Entra → sai: o id, o sentido e o modelo → o id do vizinho, ou `null`.
 * Erro e ataque: a prateleira, a tarefa fora da linha e o nó sem sequência (a visão, a cidade) dão `null`;
 * nas pontas, `null`.
 * Prova: tests/missao/telaDoRamo.test.ts ("a formação tempo").
 */
export function vizinhoNoTempo(id: string, sentido: 1 | -1, m: FontesDoTempo): string | null {
    const periodo = periodoDoId(id);
    if (periodo) return isChaveEspecial(periodo.chave) ? null : idDoPeriodo(periodo.escala, andar(periodo.escala, periodo.chave, -sentido));
    const rota = [...m.passagens].sort((a, b) => a.de.localeCompare(b.de) || a.id.localeCompare(b.id));
    const e = rota.findIndex(x => x.id === id);
    if (e >= 0) return rota[e - sentido]?.id ?? null;
    const t = m.indice.porId.get(id);
    if (!t || !t.colocacao.dia) return null;
    const seq = m.indice.tarefas
        .filter(x => x.tipo === t.tipo && !!x.colocacao.dia)
        .sort((a, b) => a.colocacao.dia!.localeCompare(b.colocacao.dia!) || a.titulo.localeCompare(b.titulo, 'pt-BR') || a.id.localeCompare(b.id));
    const i = seq.findIndex(x => x.id === id);
    return i >= 0 ? seq[i - sentido]?.id ?? null : null;
}

/**
 * O que faz: o vizinho de um nó pela rolagem vertical, segundo a formação dele.
 * Entra → sai: a formação, o ramo, o sentido, o modelo e quem tem ramo → o id do vizinho, ou `null`.
 * Erro e ataque: o vizinho sem ramo não vale (a vista não teria o que mostrar).
 * Prova: tests/missao/telaDoRamo.test.ts.
 */
export function vizinhoNaFormacao(f: Formacao, ramo: RamoDoNo, sentido: 1 | -1, m: FontesDoTempo, temRamo: (id: string) => boolean): string | null {
    if (f.vertical === 'relacao') return vizinhoNaRelacao(ramo, sentido, temRamo);
    const v = vizinhoNoTempo(ramo.id, sentido, m);
    return v && temRamo(v) ? v : null;
}

/* ------------------------------------------------------------ a pilha dos zooms na tela */

/**
 * O que faz: troca o nó do topo da pilha pelo vizinho (a rolagem vertical anda na cadeia, não entra
 * mais fundo): a profundidade fica, o resto da pilha também.
 * Entra → sai: a navegação e o id → a navegação nova (o nível e a partida da expansão ficam); sem pilha, a mesma.
 */
export function comTopo(nav: NivelDaNavegacao, id: string): NivelDaNavegacao {
    const n = nav.pilha.length;
    if (!n || !id) return nav;
    return { ...nav, pilha: [...nav.pilha.slice(0, n - 1), { id, profundidade: nav.pilha[n - 1].profundidade }] };
}

/**
 * O que faz: volta a pilha até guardar `manter` zooms (0 = sai do ramo, para a escala de onde se partiu).
 * Entra → sai: a navegação e quantos guardar → a navegação nova (o nível e a partida da expansão ficam).
 */
export function voltarAte(nav: NivelDaNavegacao, manter: number): NivelDaNavegacao {
    const k = Math.max(0, Math.min(nav.pilha.length, Math.floor(Number.isFinite(manter) ? manter : 0)));
    return k === nav.pilha.length ? nav : { ...nav, pilha: nav.pilha.slice(0, k) };
}

/** Uma parte do caminho do zoom: o texto, quantos zooms ficam ao clicar nela e se é onde se está. */
export interface MigalhaDoZoom { rotulo: string; manter: number; atual: boolean }

/**
 * O que faz: o caminho do zoom ("W44 › Projeto X › SMART Y"): o período de onde se partiu e cada nó
 * da pilha; os zooms seguidos no mesmo nó (cada um mais fundo) são uma parte só, a do mais fundo.
 * Por quê: cada parte volta com um clique (30/10), e o Esc volta um nível.
 * Entra → sai: a navegação, o texto do começo e o título de cada nó → as partes, a última é a atual.
 * Erro e ataque: sem pilha, só o começo (atual); o nó sem título mostra o id.
 * O zoom no próprio período de onde se partiu (o ramo da semana, a partir da W44) é a mesma raiz: uma
 * parte só, com o texto do começo, que volta a esse ramo (02/11: "W44 › W44" mostrava a raiz duas vezes).
 * Entra → sai: a navegação, o texto do começo, o título de cada nó e o id do período do começo (sem ele,
 * nenhuma fusão) → as partes, a última é a atual.
 * Erro e ataque: sem pilha, só o começo (atual); o nó sem título mostra o id; o mesmo período mais
 * fundo na pilha, depois de outro nó, é uma parte própria (não é mais a raiz).
 * Prova: tests/missao/telaDoRamo.test.ts ("o caminho do zoom").
 */
export function migalhasDoZoom(nav: NivelDaNavegacao, inicio: string, titulo: (id: string) => string | null, idDoInicio: string | null = null): MigalhaDoZoom[] {
    const out: MigalhaDoZoom[] = [{ rotulo: inicio, manter: 0, atual: !nav.pilha.length }];
    nav.pilha.forEach((z, i) => {
        const seguinte = nav.pilha[i + 1];
        if (seguinte && seguinte.id === z.id) return;
        const atual = i === nav.pilha.length - 1;
        // Os primeiros zooms no período do começo são o próprio começo: a parte dele passa a voltar a esse ramo.
        if (idDoInicio && nav.pilha.slice(0, i + 1).every(p => p.id === idDoInicio)) { out[0] = { rotulo: inicio, manter: i + 1, atual }; return; }
        out.push({ rotulo: titulo(z.id) || z.id, manter: i + 1, atual });
    });
    return out;
}

/**
 * O traço de cada tipo de ligação no mapa do ramo: o ramo contínuo, a dependência tracejada, o tempo e
 * os outros pares pontilhados (as mesmas classes de traço do mapa da Missão).
 */
export const TRACO_DAS_LIGACOES: Readonly<Record<Ligacao['tipo'], { traco: 'continuo' | 'pontilhado' | 'tracejado'; rotulo: string }>> = {
    estrutura: { traco: 'continuo', rotulo: 'o ramo: o que contém e o que tem dentro' },
    bloqueio: { traco: 'tracejado', rotulo: 'a dependência' },
    tempo: { traco: 'pontilhado', rotulo: 'o tempo' },
    pendente: { traco: 'tracejado', rotulo: 'pendente' },
    lugar: { traco: 'pontilhado', rotulo: 'os pares e os links' },
};

/**
 * A chave da expansão do mapa principal no estado da vista (`expansao`): o ramo do zoom guarda pela raiz
 * dele (o id do nó), e o mapa principal por esta chave, que não é id de nó.
 */
export const EXPANSAO_DO_MAPA = '#mapa';

/** O que o mapa principal mostra de uma linha pela expansão: o controle de cada nó que tem filho e os que somem. */
export interface ExpansaoNoMapa {
    /** O nó que tem o que mostrar abaixo dele na linha: aberto (o "recolher") ou fechado (o "expandir"). */
    filhos: Record<string, 'aberto' | 'fechado'>;
    /** Os nós que somem da linha: os que só saem de nós fechados (ou já escondidos). */
    escondidos: Set<string>;
}

/**
 * O que faz: a expansão do mapa principal numa linha (02/11): cada nó com filho pelo ramo (a ligação
 * `estrutura`, de quem contém para o que tem dentro: a área → o projeto → a SMART → a tarefa) leva o
 * controle, aberto por padrão; o recolhido esconde o que sai dele, e o que tem outro pai à vista e
 * aberto fica.
 * Por quê: §2b da arquitetura (30/10): expandir e recolher valem em qualquer nó que contém algo, com o
 * estado lembrado por tela. O mapa principal usa o mesmo estado da vista (`expansao`, pela chave do mapa),
 * o mesmo controle do ramo do zoom (`alternarEl`) e a mesma tecla.
 * Entra → sai: as ligações da linha, o estado da vista (id → aberto) e o nó que nunca some (o centro da
 * linha) → `{ filhos, escondidos }`.
 * Erro e ataque: um ciclo de estrutura não prende (cada nó se decide uma vez); o nó sem pai nunca some; o
 * fixo nunca some; sem estado, tudo aberto, como o mapa era.
 * Prova: tests/missao/telaDoRamo.test.ts ("a expansão do mapa principal").
 */
export function expansaoNoMapa(ligacoes: readonly Ligacao[], estado: Readonly<Record<string, boolean>> = {}, fixo: string | null = null): ExpansaoNoMapa {
    const pais = new Map<string, string[]>();
    const filhos: Record<string, 'aberto' | 'fechado'> = {};
    for (const l of ligacoes) {
        if (l.tipo !== 'estrutura' || l.de === l.para) continue;
        const lista = pais.get(l.para) ?? [];
        lista.push(l.de);
        pais.set(l.para, lista);
        filhos[l.de] = estado[l.de] === false ? 'fechado' : 'aberto';
    }
    const visivel = new Map<string, boolean>();
    const ver = (id: string, caminho: Set<string>): boolean => {
        const ja = visivel.get(id);
        if (ja !== undefined) return ja;
        const ps = pais.get(id);
        if (!ps || id === fixo || caminho.has(id)) return true;
        caminho.add(id);
        const v = ps.some(p => filhos[p] === 'aberto' && ver(p, caminho));
        caminho.delete(id);
        visivel.set(id, v);
        return v;
    };
    const escondidos = new Set<string>();
    for (const id of pais.keys()) if (!ver(id, new Set())) escondidos.add(id);
    return { filhos, escondidos };
}
