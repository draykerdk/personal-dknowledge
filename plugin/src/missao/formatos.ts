/**
 * Os formatos curtos da Missão: o dia escrito (`AAAA-MM-DD`), a leitura de um campo cru (a data e o
 * texto), os minutos, os reais e a marca das pessoas.
 *
 * Por quê: o passo `formatos` da divisão da Missão (H5, tests/missao/modeloDfm.test.ts). A regex
 * do dia estava escrita 16 vezes em 14 arquivos, e os textos curtos moravam em quem os usava
 * primeiro (a borboleta, o dinheiro, as coleções), de onde as outras funções os importavam de lado
 * ou para cima. Aqui, na camada 0, a regra mora num lugar só.
 *
 * Módulo puro: sem DOM, sem cofre, sem relógio. Prova: tests/missao/formatos.test.ts.
 */
import { linkTarget } from '../project/projectCanvasModel';
import { DIA, diaDoArquivo, diaEHoraNoInicio, diaNoInicio, ehDia, partesDoDia } from '../engine/dia';

// O dia escrito (`DIA`, `ehDia` e as leituras do dia num texto maior) tem um dono só no plugin
// inteiro, a base do motor (engine/dia.ts, o passo `dia` da divisão do motor); a Missão o
// reexporta daqui, para os arquivos dela continuarem lendo os formatos de um lugar só.
export { DIA, diaDoArquivo, diaEHoraNoInicio, diaNoInicio, ehDia, partesDoDia };

// A semana e o trimestre escritos também têm um dono só (engine/periodo.ts, 02/11/2026), reexportado daqui.
export { SEMANA, TRIMESTRE, ehSemana, ehTrimestre, partesDaSemana, partesDoTrimestre, semanaNoTexto, semanaOuVazio, trimestreNoTexto, trimestreOuVazio } from '../engine/periodo';

/* ------------------------------------------------------------ a leitura de um campo cru */

/**
 * O que faz: a data de um campo cru (`AAAA-MM-DD`, ou o começo de um `AAAA-MM-DDTHH:mm`); sem data, ''.
 * Por quê: as coleções, os sinais declarados e os trechos leem a data de um campo da mesma forma
 * (vinha das coleções).
 * Entra → sai: o valor do frontmatter (texto, lista, data) → `AAAA-MM-DD` ou ''.
 * Erro e ataque: a lista vale pelo primeiro item; o que não é dia escrito dá ''.
 * Prova: tests/missao/colecoes.test.ts e tests/missao/sinais.test.ts.
 */
export function dataDoCampo(v: unknown): string {
    const s = String(Array.isArray(v) ? v[0] ?? '' : v ?? '').trim().slice(0, 10);
    return DIA.test(s) ? s : '';
}

/**
 * O que faz: o texto de um campo cru (o link vira o nome; a lista, os nomes juntos); vazio, ''.
 * Por quê: o painel, os trechos e os sinais mostram o campo como a pessoa o lê (vinha das coleções).
 * Entra → sai: o valor do frontmatter → texto.
 * Erro e ataque: `null` e `undefined` dão ''; só o `[[link]]` inteiro vira nome.
 * Prova: tests/missao/colecoes.test.ts e tests/missao/sinais.test.ts.
 */
export function textoDoCampo(v: unknown): string {
    if (Array.isArray(v)) return v.map(textoDoCampo).filter(Boolean).join(', ');
    if (v === null || v === undefined) return '';
    const s = String(v).trim();
    return /^\[\[.*\]\]$/.test(s) ? linkTarget(s) : s;
}

/**
 * O que faz: tira o emoji ou sinal inicial de um nome de nota (`"🇻🇳 Vietnam"` → `"Vietnam"`).
 * Por quê: notas de país e de hub levam bandeira ou emoji no nome do arquivo, mas os links das
 * outras notas apontam o nome limpo (`[[Vietnam]]`) ou com o emoji.
 * Entra → sai: qualquer valor → o texto sem o prefixo não alfanumérico, ou o próprio texto se só tiver emoji.
 * Erro e ataque: `null` e `undefined` dão `""`; texto só de emoji preserva o original aparado.
 * Prova: tests/missao/lugarDoNo.test.ts.
 */
export function semEmojiInicial(s: unknown): string {
    const t = String(s ?? '').trim();
    return t.replace(/^[^\p{L}\p{N}]+/u, '').trim() || t;
}

/* ------------------------------------------------------------ os textos curtos */

/**
 * O que faz: os minutos em texto curto (`45 min`, `1h30`); sem estimativa, `null`.
 * Por quê: a estimativa aparece igual no nó, no painel e nos campos do nó (vinha da borboleta).
 * Entra → sai: minutos → texto, ou `null`.
 * Erro e ataque: `null`, `undefined`, zero, negativo e o que não é finito dão `null`.
 * Prova: tests/missao/borboleta.test.ts e tests/missao/camposDoNo.test.ts.
 */
export function minutosTexto(m: number | null | undefined): string | null {
    if (m === null || m === undefined || !Number.isFinite(m) || m <= 0) return null;
    const h = Math.floor(m / 60), r = Math.round(m % 60);
    return h ? `${h}h${r ? String(r).padStart(2, '0') : ''}` : `${r} min`;
}

/**
 * O que faz: a marca das pessoas ("👥 2") e o texto inteiro dela (os nomes), no dia e no lugar; nenhuma, `null`.
 * Por quê: o nó do dia e a faixa do lugar mostram a mesma marca (vinha da borboleta).
 * Entra → sai: os nomes → { marca, dica }, ou `null`.
 * Erro e ataque: a lista vazia dá `null`; os nomes vão como vieram.
 * Prova: tests/missao/pessoas.test.ts e tests/missao/borboleta.test.ts.
 */
export function marcaDePessoas(nomes: readonly string[]): { marca: string; dica: string } | null {
    return nomes.length ? { marca: `👥 ${nomes.length}`, dica: `👥 ${nomes.join(', ')}` } : null;
}

/**
 * O que faz: `1234.5` → `R$ 1.234,50`; inteiro sem centavos (`R$ 52`).
 * Por quê: o dinheiro do dia, a reserva, as coleções e os campos do nó escrevem os reais do mesmo
 * jeito (vinha do dinheiro).
 * Entra → sai: número → texto.
 * Erro e ataque: o negativo leva o sinal `−`; os centavos se arredondam.
 * Prova: tests/missao/dinheiro.test.ts.
 */
export function reais(n: number): string {
    const neg = n < 0;
    const abs = Math.abs(n);
    const cents = Math.round(abs * 100) % 100;
    const int = Math.floor(Math.round(abs * 100) / 100);
    const grouped = String(int).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${neg ? '−' : ''}R$ ${grouped}${cents ? `,${String(cents).padStart(2, '0')}` : ''}`;
}
