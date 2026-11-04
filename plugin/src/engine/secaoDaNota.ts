/**
 * Uma linha a mais numa seção de uma nota que já existe (02/11, a revisão do trecho): a lição de uma
 * função entra no fim da lista da seção dela (o 🔄 Revisar, o 📋 Planejar da nota de função), e nada mais
 * muda no texto.
 *
 * Por quê: a viagem nos ciclos (proposta de 29/10, §4): "A revisão da tarefa grava a lição na nota da
 * função, e a próxima viagem já começa com ela". A nota de função já tem as três partes (📋 ✅ 🔄); a
 * revisão só acrescenta uma linha, nunca cria a nota nem a seção, e não reescreve o que ele escreveu.
 *
 * Módulo puro: sem Obsidian. O motor (`liga.protocolo`, o `appendToSection` do protocolo) lê e grava;
 * aqui só o texto entra e sai. Prova: tests/engine/secaoDaNota.test.ts.
 */

/** O resultado: o texto novo, ou o problema (o texto não muda). */
export type LinhaNaSecao = { texto: string } | { problema: 'vazio' | 'sem-secao' | 'igual' };

const semCR = (l: string) => (l.endsWith('\r') ? l.slice(0, -1) : l);
const TITULO = /^(#{1,6})\s+\S/;
const ITEM = /^\s*[-*+]\s/;
const RECUO = /^\s+\S/;
const REGUA = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;

/** O que faz: onde o corpo começa (a primeira linha depois do frontmatter; 0 sem frontmatter). */
function inicioDoCorpo(linhas: readonly string[]): number {
    if (semCR(linhas[0] ?? '') !== '---') return 0;
    for (let i = 1; i < linhas.length; i++) if (/^(---|\.\.\.)$/.test(semCR(linhas[i]))) return i + 1;
    return 0;
}

/**
 * O que faz: acrescenta `linha` no fim da lista da seção `secao` (o título exato, como `## 🔄 Revisar`):
 * logo depois do último item da lista da seção (ou da última linha recuada que o continua); sem lista,
 * logo abaixo do título, com uma linha em branco entre os dois. A seção acaba no próximo título do mesmo
 * nível ou de cima, ou na régua (`---`).
 * Por quê: a lição vai para a seção da nota da função, junto das que já estão lá, e o parágrafo que fecha
 * a seção (a dica, a régua, o rodapé) fica onde estava.
 * Entra → sai: o texto da nota, o título da seção e a linha → o texto novo, ou o problema.
 * Erro e ataque: a linha vazia não grava (`vazio`); a quebra de linha dentro dela vira espaço (uma linha
 * só, nunca duas entradas); sem a seção, nada grava (`sem-secao`: a revisão não cria seção); a mesma linha
 * já na seção não entra de novo (`igual`: rodar duas vezes grava uma); o título dentro do frontmatter não
 * conta; o `\r` do fim das linhas volta na linha nova.
 * Prova: tests/engine/secaoDaNota.test.ts.
 */
export function acrescentarNaSecao(texto: string, secao: string, linha: string): LinhaNaSecao {
    const nova = String(linha ?? '').replace(/\s*[\r\n]+\s*/g, ' ').trim();
    if (!nova) return { problema: 'vazio' };
    const alvo = String(secao ?? '').trim();
    const linhas = String(texto ?? '').split('\n');
    const cr = linhas.some(l => l.endsWith('\r')) ? '\r' : '';
    const titulo = linhas.findIndex((l, i) => i >= inicioDoCorpo(linhas) && TITULO.test(semCR(l)) && semCR(l).trim() === alvo);
    if (!alvo || titulo < 0) return { problema: 'sem-secao' };
    const nivel = TITULO.exec(semCR(linhas[titulo]))![1].length;
    let fim = linhas.length;
    for (let i = titulo + 1; i < linhas.length; i++) {
        const l = semCR(linhas[i]);
        const t = TITULO.exec(l);
        if ((t && t[1].length <= nivel) || REGUA.test(l)) { fim = i; break; }
    }
    let ultimo = -1;
    let naLista = false;
    for (let i = titulo + 1; i < fim; i++) {
        const l = semCR(linhas[i]);
        if (l.trim() === nova) return { problema: 'igual' };
        if (ITEM.test(l)) { ultimo = i; naLista = true; }
        else if (naLista && RECUO.test(l)) ultimo = i;
        else if (l.trim() !== '') naLista = false;
    }
    if (ultimo >= 0) {
        linhas.splice(ultimo + 1, 0, `${nova}${cr}`);
        return { texto: linhas.join('\n') };
    }
    // Sem lista: abaixo do título, com a linha em branco entre os dois (e depois, se vem texto logo em seguida).
    const embaixo = linhas[titulo + 1];
    if (embaixo === undefined) linhas.push(cr, `${nova}${cr}`);
    else if (semCR(embaixo).trim() === '') {
        const depois = linhas[titulo + 2];
        linhas.splice(titulo + 2, 0, ...(depois !== undefined && semCR(depois).trim() !== '' ? [`${nova}${cr}`, cr] : [`${nova}${cr}`]));
    } else {
        linhas.splice(titulo + 1, 0, cr, `${nova}${cr}`, ...(titulo + 1 < linhas.length ? [cr] : []));
    }
    return { texto: linhas.join('\n') };
}
