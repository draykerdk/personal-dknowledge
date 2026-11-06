/**
 * A repetição do aprendizado (05/11, o módulo de idiomas): a fila do dia, o próximo degrau da escada e a conta do
 * nível, sobre as notas do tipo que declara o `aprendizado` no modelo (o cartão).
 *
 * Por quê: a proposta de 05/11 (`305 - P&D/PROPOSTA_Modulo_de_Idiomas_2026-11-05.md`, §6) e o desenho de 19/10: a
 * frase é a unidade; o gesto diário tem 1 frase nova (até 5) e as revisões vencidas (até 10); a escada é
 * 1·3·7·14·30·60·120 dias; lembrei sobe um degrau, quase repete, não volta ao primeiro, e "usei de verdade" sobe dois.
 * A frase está consolidada quando o intervalo chega ao degrau declarado (14). Os números moram no modelo do tipo
 * (`aprendizado`), nunca aqui; nada aqui é de uma língua (a `lingua` é um filtro, como o módulo).
 *
 * Módulo puro: sem Obsidian. O motor dos protocolos (o passo `fila` e o `repeticao` do 🗣️), a Árvore e a Missão
 * leem por aqui. Prova: tests/engine/repeticao.test.ts.
 */
import { DIA } from './dia';
import { diaMais } from './periodo';
import { fieldText } from './choose';
import type { DomainLearning, EstadoDoAprendizado, FilaDoAprendizado } from './domainModel';
import { protocoloDaMarca } from './protocolGroups';

/** As respostas do cartão, na ordem do gesto: lembrei, quase, não lembrei e usei de verdade (em campo). */
export const RESPOSTAS_DO_CARTAO = ['lembrei', 'quase', 'nao', 'usei'] as const;
export type RespostaDoCartao = typeof RESPOSTAS_DO_CARTAO[number];

/** Um cartão como a repetição o lê: o caminho, o nome (a frase) e o frontmatter. */
export interface CartaoLido { caminho: string; nome: string; campos: Record<string, unknown> | null | undefined }

/** O próximo passo da repetição de um cartão: o intervalo, a próxima revisão, o estado e se foi usado em campo. */
export interface PassoDaRepeticao { intervalo: number; proxima_revisao: string; estado: EstadoDoAprendizado; usou: boolean }

/** Um item da fila do dia: o cartão, se é revisão ou nova, e o porquê ("vencida em 03/11", "nova do N1"). */
export interface ItemDaFila { caminho: string; nome: string; tipo: 'revisao' | 'nova'; motivo: string }

/** A fila do dia: os itens na ordem do gesto, e quantas revisões vencidas e novas há fora dos já vistos. */
export interface FilaDoDia { itens: ItemDaFila[]; revisoes: number; novas: number }

/** O que a rodada do gesto já sabe: as novas já vistas, se pediu mais uma nova e os cartões já feitos nela. */
export interface RodadaDaFila { novasVistas?: number; maisUmaNova?: boolean; vistos?: readonly string[] }

/** O filtro da fila: a língua e o módulo (o nome da nota-índice); sem a chave, todos. */
export interface FiltroDaFila { lingua?: string; modulo?: string }

const ESTADOS: readonly EstadoDoAprendizado[] = ['nova', 'aprendendo', 'consolidada'];

/** O que faz: o número inteiro de um campo (o intervalo gravado como 7 ou "7"); senão `null`. */
function inteiroDoCampo(v: unknown): number | null {
    const n = typeof v === 'number' ? v : Number.parseInt(String(v ?? '').trim(), 10);
    return Number.isInteger(n) && n >= 0 ? n : null;
}

/** O que faz: o dia `AAAA-MM-DD` de um campo de data (o texto, ou o começo de um texto com hora); senão `''`. */
function diaDoCampo(v: unknown): string {
    const t = fieldText(v).slice(0, 10);
    return DIA.test(t) ? t : '';
}

/**
 * O que faz: o estado da repetição de um cartão: o `estado` gravado, quando é um dos três; sem ele, `nova`.
 * Por quê: o cartão que a outra frente escreve nasce `nova`; o que falta não pode virar revisão vencida.
 * Entra → sai: o frontmatter → o estado.
 * Erro e ataque: o texto fora dos três estados vale como `nova` (nada se inventa).
 */
export function estadoDoCartao(campos: Record<string, unknown> | null | undefined): EstadoDoAprendizado {
    const e = fieldText(campos?.estado) as EstadoDoAprendizado;
    return ESTADOS.includes(e) ? e : 'nova';
}

/**
 * O que faz: o degrau da escada em que o cartão está, pelo intervalo gravado: o maior degrau que não passa do
 * intervalo; `-1` antes do primeiro (o 0 da frase nova, ou o campo vazio).
 * Por quê: a escada pode mudar no modelo (ele ajusta os números), e o intervalo gravado antes continua valendo.
 * Entra → sai: o intervalo cru e a escada → o índice.
 * Erro e ataque: o intervalo que não é inteiro vale como 0; a escada vazia dá `-1`.
 */
export function degrauDoIntervalo(intervalo: unknown, escada: readonly number[]): number {
    const n = inteiroDoCampo(intervalo) ?? 0;
    let degrau = -1;
    escada.forEach((d, i) => { if (d <= n) degrau = i; });
    return degrau;
}

/**
 * O que faz: o próximo passo da repetição de um cartão pela resposta: lembrei sobe um degrau, quase repete o degrau
 * (a nova vai ao primeiro), não volta ao primeiro, usei de verdade sobe dois; o topo da escada não passa. O intervalo
 * é o do degrau, a próxima revisão é hoje mais ele, e o estado é `consolidada` quando o intervalo chega ao
 * consolidado do modelo, senão `aprendendo`.
 * Por quê: a escada 1·3·7·14·30·60·120 do desenho de 19/10 e a regra do gesto de 05/11 (o brief da construção).
 * Entra → sai: o frontmatter do cartão, a resposta, hoje e o aprendizado do modelo → o passo, ou `null`.
 * Erro e ataque: a resposta fora das quatro, o hoje que não é dia e a escada vazia dão `null` (nada grava).
 * Prova: tests/engine/repeticao.test.ts ("a escada").
 */
export function proximoPasso(campos: Record<string, unknown> | null | undefined, resposta: string, hoje: string, aprendizado: Pick<DomainLearning, 'escada' | 'consolidada'>): PassoDaRepeticao | null {
    const escada = aprendizado.escada;
    if (!escada.length || !DIA.test(hoje) || !(RESPOSTAS_DO_CARTAO as readonly string[]).includes(resposta)) return null;
    const atual = estadoDoCartao(campos) === 'nova' ? -1 : degrauDoIntervalo(campos?.intervalo, escada);
    const topo = escada.length - 1;
    const r = resposta as RespostaDoCartao;
    const novo = r === 'lembrei' ? atual + 1 : r === 'quase' ? Math.max(atual, 0) : r === 'nao' ? 0 : atual + 2;
    const intervalo = escada[Math.min(Math.max(novo, 0), topo)];
    const proxima = diaMais(hoje, intervalo);
    if (!proxima) return null;
    return { intervalo, proxima_revisao: proxima, estado: intervalo >= aprendizado.consolidada ? 'consolidada' : 'aprendendo', usou: r === 'usei' };
}

/** O que faz: o número do nível ("N2" → 2) para a ordem; sem número, depois de todos. */
function ordemDoNivel(v: unknown): number {
    const m = fieldText(v).match(/(\d+)/);
    return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}

/** O que faz: o nome do módulo de um campo de link (`[[Inglês de viagem]]` → "Inglês de viagem"), sem a pasta. */
function nomeDoModulo(v: unknown): string {
    const t = fieldText(Array.isArray(v) ? v[0] : v);
    return t.slice(t.lastIndexOf('/') + 1).replace(/\.md$/, '').trim();
}

/** O que faz: o cartão é da língua e do módulo do filtro (sem caixa); o filtro sem a chave aceita todos. */
function passaNoFiltro(c: CartaoLido, filtro: FiltroDaFila): boolean {
    const igual = (a: string, b: string) => a.toLocaleLowerCase('pt-BR') === b.toLocaleLowerCase('pt-BR');
    if (filtro.lingua && !igual(fieldText(c.campos?.lingua), filtro.lingua)) return false;
    return !(filtro.modulo && !igual(nomeDoModulo(c.campos?.modulo), filtro.modulo));
}

/** O que faz: o dia em `DD/MM`, para o porquê da fila. */
function diaCurto(dia: string): string {
    return `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

/**
 * O que faz: o lugar do cartão na trilha (o campo `ordem`, um inteiro de 1 para cima); sem ele, `null`.
 * Por quê: 06/11, o método da construção: "cada cartão introduz uma peça lógica nova só, e reusa as anteriores";
 * a trilha é a ordem em que as peças acendem, e a frase nova entra por ela.
 */
export function ordemNaTrilha(campos: Record<string, unknown> | null | undefined): number | null {
    const n = inteiroDoCampo(campos?.ordem);
    return n !== null && n >= 1 ? n : null;
}

/**
 * O que faz: a ordem das novas: primeiro as da trilha, pela `ordem`; depois as de fora dela (a frase capturada, a
 * ideia construída por ele), pelo nível, pela data de criação e pelo nome.
 * Por quê: 06/11: "as frases novas entram pela `ordem` da trilha, e não por outra ordem"; o cartão N depende só das
 * peças dos cartões antes dele, e a fila não pode pular um degrau. O cartão sem `ordem` não tem lugar na trilha e
 * não fura a fila dela.
 * Entra → sai: dois cartões → o sinal da comparação.
 */
function compararNovas(a: CartaoLido, b: CartaoLido): number {
    const oa = ordemNaTrilha(a.campos), ob = ordemNaTrilha(b.campos);
    if (oa !== null && ob !== null && oa !== ob) return oa - ob;
    if ((oa === null) !== (ob === null)) return oa === null ? 1 : -1;
    return ordemDoNivel(a.campos?.nivel) - ordemDoNivel(b.campos?.nivel)
        || diaDoCampo(a.campos?.created).localeCompare(diaDoCampo(b.campos?.created))
        || a.nome.localeCompare(b.nome, 'pt-BR');
}

/**
 * O que faz: a fila do dia: as revisões vencidas (a próxima revisão até hoje, das mais antigas às de hoje, até o
 * teto) e as novas da rodada (as da trilha pela `ordem`; as de fora dela depois, pelo nível, pela data de criação
 * e pelo nome: `compararNovas`). As novas de partida são as da
 * fila do modelo; "mais uma nova" acrescenta uma, até o teto, contando as já vistas na rodada. Com "mais uma nova",
 * a nova vem primeiro; senão, as revisões e depois as novas. Os já vistos na rodada ficam de fora.
 * Por quê: o gesto de 05/11: "a fila do dia tem 1 cartão novo (até 5, opcional) e as revisões vencidas (até 10)".
 * Entra → sai: os cartões, hoje, a fila do modelo, a rodada e o filtro → a fila.
 * Erro e ataque: o cartão sem próxima revisão e fora de `nova` não é revisão vencida (ausência não é atraso); a
 * data malformada, também; a língua e o módulo comparam sem caixa; o mesmo caminho duas vezes conta uma.
 * Prova: tests/engine/repeticao.test.ts ("a fila do dia" e "a trilha").
 */
export function filaDoDia(cartoes: readonly CartaoLido[], hoje: string, fila: FilaDoAprendizado, rodada: RodadaDaFila = {}, filtro: FiltroDaFila = {}): FilaDoDia {
    const vistos = new Set(rodada.vistos ?? []);
    const unicos = [...new Map(cartoes.map(c => [c.caminho, c])).values()].filter(c => passaNoFiltro(c, filtro) && !vistos.has(c.caminho));
    const porNivel = (a: CartaoLido, b: CartaoLido) => ordemDoNivel(a.campos?.nivel) - ordemDoNivel(b.campos?.nivel);
    const vencidas = unicos
        .filter(c => estadoDoCartao(c.campos) !== 'nova' && diaDoCampo(c.campos?.proxima_revisao) !== '' && diaDoCampo(c.campos?.proxima_revisao) <= hoje)
        .sort((a, b) => diaDoCampo(a.campos?.proxima_revisao).localeCompare(diaDoCampo(b.campos?.proxima_revisao)) || porNivel(a, b) || a.nome.localeCompare(b.nome, 'pt-BR'));
    const novas = unicos
        .filter(c => estadoDoCartao(c.campos) === 'nova')
        .sort(compararNovas);
    const vistas = Math.max(0, rodada.novasVistas ?? 0);
    const alvo = Math.min(fila.maxNovas, rodada.maisUmaNova ? vistas + 1 : fila.novas);
    const quantasNovas = Math.max(0, alvo - vistas);
    const itensRevisao: ItemDaFila[] = vencidas.slice(0, fila.maxRevisoes).map(c => {
        const d = diaDoCampo(c.campos?.proxima_revisao);
        return { caminho: c.caminho, nome: c.nome, tipo: 'revisao', motivo: d === hoje ? 'revisão de hoje' : `revisão vencida em ${diaCurto(d)}` };
    });
    const itensNovos: ItemDaFila[] = novas.slice(0, quantasNovas).map(c => {
        const n = fieldText(c.campos?.nivel);
        return { caminho: c.caminho, nome: c.nome, tipo: 'nova', motivo: n ? `nova do ${n}` : 'nova' };
    });
    return {
        itens: rodada.maisUmaNova ? [...itensNovos, ...itensRevisao] : [...itensRevisao, ...itensNovos],
        revisoes: Math.min(vencidas.length, fila.maxRevisoes),
        novas: novas.length,
    };
}

/** O tipo do cartão como a linha da Day o escreve (o `{passo}_tipo` do passo `fila`, no `({{cartao_tipo}})` do modelo). */
export const TIPO_DA_NOVA = 'nova';

/**
 * O que faz: quantas frases novas o gesto já mostrou hoje, pelas linhas que ele grava na Day de hoje: em cada bloco
 * com a marca do id do protocolo (`<!-- dfm-protocolo:<id> -->`), as linhas com o tipo da nova entre parênteses
 * (`(nova)`), até a linha em branco ou o próximo registro.
 * Por quê: o hábito é uma frase nova por dia, e quem quiser continua com outras até um teto pequeno. O limite de uma nova valia por rodada, e abrir o gesto de novo no mesmo dia trazia outra; a Day
 * de hoje já tem o registro de cada frase, e é por ele que se conta (sem campo novo no cartão).
 * Entra → sai: o texto da Day e o id do protocolo → o número de novas.
 * Erro e ataque: a linha sem a marca do id (uma Day antiga, um registro de outro protocolo) não conta; o bloco do
 * protocolo sem a linha da nova também não; a Day vazia dá 0.
 * Prova: tests/engine/repeticao.test.ts ("as novas de hoje").
 */
export function novasDeHojeNaDay(texto: string, idDoProtocolo: string): number {
    const marcaDaNova = `(${TIPO_DA_NOVA})`;
    let dentro = false, n = 0;
    for (const linha of String(texto ?? '').split('\n')) {
        if (protocoloDaMarca(linha)) { dentro = protocoloDaMarca(linha) === idDoProtocolo; continue; }
        if (!linha.trim() || /^\s*\*\*\[/.test(linha)) { dentro = false; continue; }
        if (dentro && linha.includes(marcaDaNova)) n++;
    }
    return n;
}

/** As contas de um nível: as frases dominadas (consolidadas), as do nível e os usos de campo (as Days do `usado_em`). */
export interface ContasDoNivel { nivel: string; dominadas: number; doNivel: number; usos: number }

/**
 * O que faz: as contas de cada nível dos cartões, na ordem dos níveis (N1, N2…): as dominadas (o estado
 * `consolidada`), as do nível e os usos de campo (as entradas do `usado_em`, sem repetir o dia no mesmo cartão).
 * Por quê: o nível avança pelo domínio, e não pela data (proposta de 05/11, §5); o centro do módulo mostra
 * "dominadas · do nível · faltam" pela forma de mostrar, e a Árvore conta os mesmos números.
 * Entra → sai: os cartões e o filtro → uma linha por nível que tem cartão.
 * Erro e ataque: o cartão sem nível fica de fora (não há nível a contar); o `usado_em` solto (um link só) conta um.
 * Prova: tests/engine/repeticao.test.ts ("as contas do nível").
 */
export function contasDosNiveis(cartoes: readonly CartaoLido[], filtro: FiltroDaFila = {}): ContasDoNivel[] {
    const por = new Map<string, ContasDoNivel>();
    for (const c of new Map(cartoes.map(x => [x.caminho, x])).values()) {
        if (!passaNoFiltro(c, filtro)) continue;
        const nivel = fieldText(c.campos?.nivel);
        if (!nivel) continue;
        const conta = por.get(nivel) ?? { nivel, dominadas: 0, doNivel: 0, usos: 0 };
        conta.doNivel++;
        if (estadoDoCartao(c.campos) === 'consolidada') conta.dominadas++;
        const usos = c.campos?.usado_em;
        conta.usos += new Set((Array.isArray(usos) ? usos : usos ? [usos] : []).map(fieldText).filter(Boolean)).size;
        por.set(nivel, conta);
    }
    return [...por.values()].sort((a, b) => ordemDoNivel(a.nivel) - ordemDoNivel(b.nivel) || a.nivel.localeCompare(b.nivel));
}

/**
 * O que faz: o nível em curso: o primeiro, na ordem, com frase ainda por dominar; com todos dominados, o último.
 * Por quê: o centro do módulo mostra o nível em que ele está, e não uma data.
 * Entra → sai: as contas dos níveis → a do nível em curso, ou `null` sem nenhuma.
 */
export function nivelEmCurso(contas: readonly ContasDoNivel[]): ContasDoNivel | null {
    return contas.find(c => c.dominadas < c.doNivel) ?? contas[contas.length - 1] ?? null;
}

/**
 * O que faz: o nome da nota de um cartão a partir da frase: a frase como foi escrita, sem `?` e sem `/` (e sem os
 * outros sinais que o nome de arquivo não aceita), com os espaços juntados.
 * Por quê: o esquema do cartão (05/11): "o nome do arquivo igual à frase em inglês, sem `?` nem `/`"; o nome de
 * arquivo do motor troca esses sinais por " - " (`sanitizeFilename`), e "What made you choose this life?" viraria
 * "What made you choose this life -".
 * Entra → sai: a frase → o nome (vazio quando só havia sinais).
 * Erro e ataque: o controle e a quebra de linha viram espaço; o ponto e o espaço do fim saem.
 */
export function nomeDoCartao(frase: string): string {
    return String(frase ?? '')
        .replace(/[\u0000-\u001F]/g, ' ')
        .replace(/[\\/:*?"<>|#^[\]]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[. ]+$/g, '');
}

/** A consulta do critério da Árvore: o `type` das notas e os campos que filtram (`campo=valor`, ou a lista aceita). */
export interface ConsultaDoAprendizado { tipo: string; onde?: Record<string, string | string[]> }

/**
 * O que faz: as contas do critério `aprendizado` da Árvore de Progressão: entre as notas do `type` da consulta que
 * casam com cada campo do `onde` (sem caixa; o campo em lista casa se algum item casa), as dominadas (o estado
 * `consolidada`), as do filtro e os usos de campo (as Days do `usado_em`, sem repetir o dia na mesma nota).
 * Por quê: os níveis N1 a N5 pela Árvore que já existe (05/11): o nível se cumpre pelos cartões consolidados e pelos
 * usos de campo, e não pela data; a gêmea em Python é `contar_aprendizado` (`progression_tree.py`).
 * Entra → sai: as notas com o frontmatter (as do cofre, ou as de um teste) e a consulta → as contas.
 * Erro e ataque: a nota sem frontmatter, de outro tipo ou sem o campo do filtro fica de fora; o mesmo caminho duas
 * vezes conta uma.
 * Prova: tests/engine/repeticao.test.ts ("o critério da Árvore") e test_progression_learning_criterion (Python).
 */
export function contasDoAprendizado(notas: ReadonlyArray<{ path: string; frontmatter: Record<string, any> | null | undefined }>, consulta: ConsultaDoAprendizado): { dominadas: number; doFiltro: number; usos: number } {
    const fold = (t: string) => t.toLocaleLowerCase('pt-BR');
    let dominadas = 0, doFiltro = 0, usos = 0;
    for (const n of new Map(notas.map(x => [x.path, x])).values()) {
        const fm = n.frontmatter;
        if (!fm || fieldText(fm.type) !== consulta.tipo) continue;
        const casa = Object.entries(consulta.onde ?? {}).every(([campo, esperado]) => {
            const aceitos = (Array.isArray(esperado) ? esperado : [esperado]).map(v => fold(fieldText(v)));
            const valores = (Array.isArray(fm[campo]) ? fm[campo] : [fm[campo]]).map((v: unknown) => fold(fieldText(v))).filter(Boolean);
            return valores.some((v: string) => aceitos.includes(v));
        });
        if (!casa) continue;
        doFiltro++;
        if (estadoDoCartao(fm) === 'consolidada') dominadas++;
        const u = fm.usado_em;
        usos += new Set((Array.isArray(u) ? u : u ? [u] : []).map(fieldText).filter(Boolean)).size;
    }
    return { dominadas, doFiltro, usos };
}

/**
 * O que faz: as peças lógicas de um nível de um módulo: as notas do filtro (o módulo) com o `nivel` dado, na `ordem`
 * (a sem ordem por último) e depois pelo nome.
 * Por quê: o centro do módulo mostra as peças do nível em curso (05/11), lidas das notas da peça, nunca copiadas.
 * Entra → sai: as notas da peça, o nível e o filtro → o caminho e o nome de cada uma.
 * Erro e ataque: a nota sem nível, de outro nível ou de outro módulo fica de fora; a ordem em texto ("2") vale.
 * Prova: tests/engine/repeticao.test.ts ("as peças do nível").
 */
export function pecasDoNivel(pecas: readonly CartaoLido[], nivel: string, filtro: FiltroDaFila = {}): Array<{ caminho: string; nome: string }> {
    const ordem = (c: CartaoLido) => inteiroDoCampo(c.campos?.ordem) ?? Number.MAX_SAFE_INTEGER;
    return [...new Map(pecas.map(c => [c.caminho, c])).values()]
        .filter(c => passaNoFiltro(c, filtro) && fieldText(c.campos?.nivel) === nivel)
        .sort((a, b) => ordem(a) - ordem(b) || a.nome.localeCompare(b.nome, 'pt-BR'))
        .map(c => ({ caminho: c.caminho, nome: c.nome }));
}

/** Uma peça da trilha como o gesto a mostra: o cartão que a acende, a `ordem` e o nome da peça (a nota › o passo). */
export interface PassoDaTrilha { cartao: string; ordem: number; peca: string }

/** Onde ele está na trilha: quantos cartões já acenderam, quantos há, a última peça acesa e a próxima. */
export interface OndeNaTrilha { acesas: number; total: number; ultima: PassoDaTrilha | null; proxima: PassoDaTrilha | null }

/**
 * O que faz: o nome de uma peça pelo link do `introduz`: `[[Os modais#Would rather, a preferência firme]]` →
 * "Os modais › Would rather, a preferência firme"; o link sem passo dá só a nota; o apelido sai.
 * Entra → sai: o valor cru do campo → o nome, ou ''.
 */
export function nomeDaPeca(v: unknown): string {
    const t = fieldText(Array.isArray(v) ? v[0] : v).replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0].trim();
    const [nota, ...passo] = t.split('#');
    const n = nota.slice(nota.lastIndexOf('/') + 1).replace(/\.md$/, '').trim();
    const p = passo.join('#').trim();
    return n && p ? `${n} › ${p}` : n;
}

/**
 * O que faz: onde a pessoa está na trilha: entre os cartões do filtro com `ordem`, os já vistos (fora de `nova`) são as
 * peças acesas; a última acesa é a de maior `ordem` entre eles, e a próxima é a nova de menor `ordem`.
 * Por quê: no gesto 🧩 Construir uma ideia, cada passo mostra a explicação curta da camada e a peça da trilha onde
 * a pessoa está; a frase nova usa as peças que a pessoa já tem, e a próxima é a que vem.
 * Entra → sai: os cartões e o filtro → a conta, a última e a próxima (cada uma pode faltar).
 * Erro e ataque: o cartão sem `ordem` fica de fora (não é da trilha); o mesmo caminho duas vezes conta uma; sem
 * `introduz`, a peça sai vazia, e o cartão continua contando.
 * Prova: tests/engine/repeticao.test.ts ("a trilha").
 */
export function ondeNaTrilha(cartoes: readonly CartaoLido[], filtro: FiltroDaFila = {}): OndeNaTrilha {
    const daTrilha = [...new Map(cartoes.map(c => [c.caminho, c])).values()]
        .filter(c => passaNoFiltro(c, filtro) && ordemNaTrilha(c.campos) !== null)
        .sort((a, b) => ordemNaTrilha(a.campos)! - ordemNaTrilha(b.campos)!);
    const passo = (c: CartaoLido | undefined): PassoDaTrilha | null => c ? { cartao: c.nome, ordem: ordemNaTrilha(c.campos)!, peca: nomeDaPeca(c.campos?.introduz) } : null;
    const acesas = daTrilha.filter(c => estadoDoCartao(c.campos) !== 'nova');
    return { acesas: acesas.length, total: daTrilha.length, ultima: passo(acesas[acesas.length - 1]), proxima: passo(daTrilha.find(c => estadoDoCartao(c.campos) === 'nova')) };
}
