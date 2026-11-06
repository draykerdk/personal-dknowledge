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
 * O que faz: onde a seção `secao` (o título exato) está nas linhas: a linha do título e a primeira linha depois
 * dela (o próximo título do mesmo nível ou de cima, a régua `---`, ou o fim); `null` sem a seção.
 * Por quê: a linha a mais (`acrescentarNaSecao`), os itens da seção (`itensDaSecao`) e a seção nova
 * (`comSecao`) acham a seção pela mesma regra.
 * Erro e ataque: o título dentro do frontmatter não conta; o título vazio não acha nada.
 */
function limitesDaSecao(linhas: readonly string[], secao: string): { titulo: number; fim: number } | null {
    const alvo = String(secao ?? '').trim();
    if (!alvo) return null;
    const titulo = linhas.findIndex((l, i) => i >= inicioDoCorpo(linhas) && TITULO.test(semCR(l)) && semCR(l).trim() === alvo);
    if (titulo < 0) return null;
    const nivel = TITULO.exec(semCR(linhas[titulo]))![1].length;
    for (let i = titulo + 1; i < linhas.length; i++) {
        const l = semCR(linhas[i]);
        const t = TITULO.exec(l);
        if ((t && t[1].length <= nivel) || REGUA.test(l)) return { titulo, fim: i };
    }
    return { titulo, fim: linhas.length };
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
    const linhas = String(texto ?? '').split('\n');
    const cr = linhas.some(l => l.endsWith('\r')) ? '\r' : '';
    const limites = limitesDaSecao(linhas, secao);
    if (!limites) return { problema: 'sem-secao' };
    const { titulo, fim } = limites;
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

/** Um item da checklist de uma seção: se está marcado e o texto (sem a caixa). */
export interface ItemDaSecao { feito: boolean; texto: string }

const CAIXA = /^\s*[-*+] \[([ xX])\] ?(.*)$/;
const CERCA = /^\s*(```|~~~)/;

/**
 * O que faz: os itens da checklist (`- [ ]` e `- [x]`) de uma seção da nota, na ordem do texto.
 * Por quê: a conferência de uma pesquisa (05/11): o protocolo copia o 📋 Planejar da nota de função para a nota
 * da tarefa (`appendToSection` com `checklistDe`), e a Missão conta os itens abertos da seção 🔎 Conferência da
 * tarefa; os dois leem a seção pela mesma regra da linha a mais.
 * Entra → sai: o texto da nota e o título da seção → os itens (vazio sem a seção ou sem item).
 * Erro e ataque: o item dentro de um bloco de código não conta; o item vazio fica de fora; o item de outra seção
 * (a seguinte, ou a de cima) não entra; o subtítulo é parte da seção.
 * Prova: tests/engine/secaoDaNota.test.ts ("os itens de uma seção").
 */
export function itensDaSecao(texto: string, secao: string): ItemDaSecao[] {
    const linhas = String(texto ?? '').split('\n');
    const limites = limitesDaSecao(linhas, secao);
    if (!limites) return [];
    const out: ItemDaSecao[] = [];
    let cerca = false;
    for (let i = limites.titulo + 1; i < limites.fim; i++) {
        const l = semCR(linhas[i]);
        if (CERCA.test(l)) { cerca = !cerca; continue; }
        const m = cerca ? null : CAIXA.exec(l);
        if (m && m[2].trim()) out.push({ feito: m[1] !== ' ', texto: m[2].trim() });
    }
    return out;
}

/**
 * O que faz: a nota com a seção `secao` no fim do corpo, quando ela ainda não existe; com a seção, o mesmo texto.
 * Por quê: a nota da tarefa não tem a seção 🔎 Conferência até a primeira conferência (05/11); só o protocolo que
 * declara `criarSecao` a cria, e a revisão do trecho continua sem criar seção (a nota de função já tem as três).
 * Entra → sai: o texto da nota e o título (`## 🔎 Conferência`) → o texto, com o título no fim, entre linhas em branco.
 * Erro e ataque: o título que não é título de Markdown (sem `#`) não entra; a quebra do fim fica; o `\r` volta.
 * Prova: tests/engine/secaoDaNota.test.ts ("a seção nova").
 */
export function comSecao(texto: string, secao: string): string {
    const base = String(texto ?? '');
    const alvo = String(secao ?? '').trim();
    if (!TITULO.test(alvo) || /[\r\n]/.test(alvo)) return base;
    const linhas = base.split('\n');
    if (limitesDaSecao(linhas, alvo)) return base;
    const cr = linhas.some(l => l.endsWith('\r')) ? '\r' : '';
    const corpo = base.replace(/[\r\n\s]+$/, '');
    return `${corpo}${corpo ? `${cr}\n${cr}\n` : ''}${alvo}${cr}\n${cr}\n`;
}

/**
 * O que faz: os títulos de seção do corpo da nota (`## 🌃 Fechamento da noite`), na ordem do texto, aparados.
 * Por quê: a proposta de uma linha numa nota (05/11, o Dk pessoal): a seção que não existe recusa, e a recusa
 * diz quais seções a nota tem, para o agente corrigir com o título exato; a seção se acha pela mesma regra
 * (`limitesDaSecao`), então o título que esta lista dá é um que `acrescentarNaSecao` acha.
 * Entra → sai: o texto da nota → os títulos (vazio sem título).
 * Erro e ataque: o título dentro do frontmatter ou de um bloco de código não conta; o `\r` do fim sai.
 * Prova: tests/engine/secaoDaNota.test.ts ("os títulos da nota").
 */
export function titulosDaNota(texto: string): string[] {
    const linhas = String(texto ?? '').split('\n');
    const out: string[] = [];
    let cerca = false;
    for (let i = inicioDoCorpo(linhas); i < linhas.length; i++) {
        const l = semCR(linhas[i]);
        if (CERCA.test(l)) { cerca = !cerca; continue; }
        if (!cerca && TITULO.test(l)) out.push(l.trim());
    }
    return out;
}

/**
 * O que faz: o texto de uma seção da nota, sem o título, sem as linhas em branco das pontas e sem os blocos de
 * código, cortado em `limite` caracteres (com "…" no corte); sem a seção, `''`.
 * Por quê: o 🗣️ Inglês de hoje (05/11) revela, depois da frase, o "Como funciona" do cartão, lido da própria nota
 * pela mesma regra de seção da linha a mais e dos itens; a nota é o dono do texto, e o protocolo só o mostra.
 * Entra → sai: o texto da nota, o título exato da seção e o limite → o texto.
 * Erro e ataque: o subtítulo é parte da seção; a seção vazia dá `''`; o limite menor que 1 não corta.
 * Prova: tests/engine/secaoDaNota.test.ts ("o texto de uma seção").
 */
export function textoDaSecao(texto: string, secao: string, limite = 0): string {
    const linhas = String(texto ?? '').split('\n');
    const limites = limitesDaSecao(linhas, secao);
    if (!limites) return '';
    const corpo: string[] = [];
    let cerca = false;
    for (let i = limites.titulo + 1; i < limites.fim; i++) {
        const l = semCR(linhas[i]);
        if (CERCA.test(l)) { cerca = !cerca; continue; }
        if (!cerca) corpo.push(l);
    }
    const out = corpo.join('\n').replace(/^\s*\n/, '').trim();
    return limite >= 1 && out.length > limite ? `${out.slice(0, limite).trimEnd()}…` : out;
}
