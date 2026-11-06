/**
 * A checklist de uma nota: as linhas `- [ ]` e `- [x]` do corpo, como itens, e as duas edições que
 * a Missão faz nelas (marcar um item e acrescentar um), sempre numa linha só.
 *
 * Por quê: a proposta da pinça (29/10): além das subtarefas, as dependências e os itens da checklist
 * também viram nós no ramo. A checklist mora no texto da nota (o jeito do Obsidian e
 * do TaskNotes), sem campo novo no frontmatter; o ramo e o painel a leem daqui, e a gravação usa as
 * mesmas funções para fazer e para desfazer.
 *
 * Nada aqui lê o cofre: o texto entra pela borda (o leitor do lugar) e o texto novo sai para a
 * gravação (liga.gravar). O frontmatter e os blocos de código não têm item.
 *
 * Módulo puro: sem Obsidian e sem DOM. Prova: tests/missao/checklist.test.ts.
 */

/** O id de um item da checklist como nó (o ramo e o painel): a nota e a linha (`k:<caminho>#<linha>`); o zoom não desce nele. */
export const idDoItem = (caminho: string, linha: number) => `k:${caminho}#${linha}`;

/**
 * O que faz: limpa os links `[[alvo|rótulo]]` e `[[alvo]]` de um texto de item da checklist para mostrar na tela.
 * Por quê: itens de checklist com links internos aparecem no ramo e no painel como a pessoa os lê, enquanto a
 * marcação continua conferindo a linha crua da nota (`marcarItem`).
 * Entra → sai: o texto cru do item → o texto com cada `[[...]]` trocado pelo rótulo ou pelo nome sem o caminho.
 * O negrito (`**…**`, `__…__`) sai também: o item da 🔎 Conferência ("**A fonte primária.** O site…") aparecia com
 * os asteriscos no painel e no ramo (a percorrida de 06/11).
 * Erro e ataque: sem `[[...]]`, devolve o próprio texto; links vazios `[[]]` ficam vazios; o `**` sem par fica.
 * Prova: tests/missao/checklist.test.ts.
 */
export function textoLimpoDoItem(texto: string): string {
    return String(texto ?? '').replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, alvo: string, rotulo?: string) => {
        const limpo = (rotulo ?? alvo ?? '').trim();
        return rotulo ? limpo : (limpo.split('/').pop() ?? limpo).replace(/\.md$/i, '');
    }).replace(/\*\*(.+?)\*\*|__(.+?)__/g, (_, a?: string, b?: string) => a ?? b ?? '');
}

/** Um item da checklist: a linha (0 = a primeira do arquivo), se está marcado e o texto. */
export interface ItemDaChecklist { linha: number; feito: boolean; texto: string }

/** A linha de um item: o recuo, o marcador da lista, a caixa e o texto. */
const ITEM = /^(\s*[-*+] \[)([ xX])(\] ?)(.*)$/;
const CERCA = /^\s*(```|~~~)/;

/** O que faz: as linhas do texto, sem o `\r` do fim (que volta na gravação). */
const linhasDe = (texto: string) => texto.split('\n');
const semCR = (l: string) => (l.endsWith('\r') ? l.slice(0, -1) : l);

/** O que faz: onde o corpo começa (a primeira linha depois do frontmatter; 0 sem frontmatter). */
function inicioDoCorpo(linhas: readonly string[]): number {
    if (semCR(linhas[0] ?? '') !== '---') return 0;
    for (let i = 1; i < linhas.length; i++) if (/^(---|\.\.\.)$/.test(semCR(linhas[i]))) return i + 1;
    return 0;
}

/** O que faz: as linhas que são item da checklist (no corpo, fora dos blocos de código), com o índice. */
function linhasDeItem(linhas: readonly string[]): number[] {
    const out: number[] = [];
    let cerca = false;
    for (let i = inicioDoCorpo(linhas); i < linhas.length; i++) {
        const l = semCR(linhas[i]);
        if (CERCA.test(l)) { cerca = !cerca; continue; }
        if (!cerca && ITEM.test(l)) out.push(i);
    }
    return out;
}

/**
 * O que faz: os itens da checklist de uma nota, na ordem do texto.
 * Entra → sai: o texto da nota → os itens (vazio sem checklist).
 * Erro e ataque: o frontmatter e os blocos de código não têm item; o item sem texto (o lugar vazio do modelo)
 * não conta; o texto que não é texto dá vazio.
 */
export function checklistDoTexto(texto: string): ItemDaChecklist[] {
    if (typeof texto !== 'string') return [];
    const linhas = linhasDe(texto);
    // O item sem texto é o lugar vazio do modelo da nota (o "- [ ] " do 📋 Checklist da TaskNote nova): não é um
    // item, e o painel mostrava uma caixa sem nada ao lado (a percorrida de 06/11).
    return linhasDeItem(linhas).map(i => {
        const m = ITEM.exec(semCR(linhas[i]))!;
        return { linha: i, feito: m[2] !== ' ', texto: m[4].trim() };
    }).filter(item => item.texto !== '');
}

/**
 * O que faz: as checagens de uma nota de função (o "como se faz", 30/10): cada item da checklist dela,
 * marcado ou não, vira o texto curto da checagem. O item escrito "**A checagem:** o detalhe. Porquê:
 * …" dá só o que está em negrito no começo; o item sem negrito, o texto até o "Porquê:". O ":" e o
 * "." do fim saem.
 * Por quê: a estadia nasce com as checagens do 🏨 Hospedagem (o modelo dela declara a fonte
 * `checklist`); a caixa da nota de função é o modelo, e marcá-la lá não diz nada da estadia, por isso
 * todo item conta.
 * Entra → sai: o texto da nota → as checagens, na ordem do texto, sem repetir.
 * Erro e ataque: a nota sem checklist dá vazio; o item vazio, ou só com "Porquê:", fica de fora; o
 * frontmatter e os blocos de código não têm item (`checklistDoTexto`).
 * Prova: tests/missao/checklist.test.ts ("as checagens de uma nota de função").
 */
export function checagensDoTexto(texto: string): string[] {
    const out: string[] = [];
    for (const { texto: t } of checklistDoTexto(texto)) {
        const negrito = /^\*\*(.+?)\*\*/.exec(t);
        const cru = negrito ? negrito[1] : t.split(/\s*\bPorqu[êe]:/)[0];
        const c = cru.replace(/[\s:.]+$/, '').trim();
        if (c && !out.includes(c)) out.push(c);
    }
    return out;
}

/** O resultado de uma edição: o texto novo e a linha que mudou, ou o problema (nada muda). */
export type EdicaoDaChecklist = { texto: string; linha: number } | { problema: string };

/**
 * O que faz: marca ou desmarca um item: só a caixa daquela linha muda (`[ ]` ↔ `[x]`).
 * Por quê: o painel marca o item no lugar; o Desfazer usa a mesma função ao contrário.
 * Entra → sai: o texto, a linha, o estado novo e o texto do item como o painel o leu → a edição.
 * Erro e ataque: a linha que não é mais aquele item (a nota mudou depois da leitura) não grava; o
 * item já no estado pedido também não; nenhuma outra linha, nem o `\r` do fim, muda.
 */
export function marcarItem(texto: string, linha: number, feito: boolean, esperado: string): EdicaoDaChecklist {
    const linhas = linhasDe(texto);
    if (!linhasDeItem(linhas).includes(linha)) return { problema: 'mudou' };
    const cru = linhas[linha];
    const cr = cru.endsWith('\r') ? '\r' : '';
    const m = ITEM.exec(semCR(cru))!;
    if (m[4].trim() !== String(esperado ?? '').trim()) return { problema: 'mudou' };
    if ((m[2] !== ' ') === feito) return { problema: 'igual' };
    linhas[linha] = `${m[1]}${feito ? 'x' : ' '}${m[3]}${m[4]}${cr}`;
    return { texto: linhas.join('\n'), linha };
}

/**
 * O que faz: acrescenta um item aberto (`- [ ] texto`) no fim do bloco da última checklist da
 * nota, com o recuo e o marcador do item de cima; sem checklist, no fim do corpo.
 * Entra → sai: o texto da nota e o texto do item → a edição (a linha nova).
 * Erro e ataque: o item vazio, ou com quebra de linha (viraria duas linhas), não grava; as outras
 * linhas não mudam (a linha nova só se insere; no fim, a quebra que falta entra antes dela).
 */
export function acrescentarItem(texto: string, item: string): EdicaoDaChecklist {
    const t = String(item ?? '').trim();
    if (!t || /[\r\n]/.test(t)) return { problema: 'vazio' };
    const linhas = linhasDe(String(texto ?? ''));
    const itens = linhasDeItem(linhas);
    const ultimo = itens[itens.length - 1];
    if (ultimo !== undefined) {
        // O fim do bloco: a última linha de item seguida (as linhas de item contíguas ao último).
        const cru = linhas[ultimo];
        const cr = cru.endsWith('\r') ? '\r' : '';
        const m = /^(\s*[-*+]) /.exec(semCR(cru))!;
        linhas.splice(ultimo + 1, 0, `${m[1]} [ ] ${t}${cr}`);
        return { texto: linhas.join('\n'), linha: ultimo + 1 };
    }
    // Sem checklist: no fim do corpo, depois da última linha com texto (a quebra do fim fica).
    const cr = linhas.some(l => l.endsWith('\r')) ? '\r' : '';
    const fimComQuebra = linhas.length > 1 && linhas[linhas.length - 1] === '';
    if (fimComQuebra) {
        linhas.splice(linhas.length - 1, 0, `- [ ] ${t}${cr}`);
        return { texto: linhas.join('\n'), linha: linhas.length - 2 };
    }
    const base = String(texto ?? '');
    const novo = `${base}${base ? `${cr}\n` : ''}- [ ] ${t}`;
    return { texto: novo, linha: linhasDe(novo).length - 1 };
}

/**
 * O que faz: tira um item acrescentado (o Desfazer do "+ Item"): só se a linha ainda é aquele item
 * aberto, com o mesmo texto; as outras linhas não mudam.
 * Entra → sai: o texto, a linha e o texto do item → a edição.
 */
export function tirarItem(texto: string, linha: number, item: string): EdicaoDaChecklist {
    const linhas = linhasDe(texto);
    if (!linhasDeItem(linhas).includes(linha)) return { problema: 'mudou' };
    const m = ITEM.exec(semCR(linhas[linha]))!;
    if (m[2] !== ' ' || m[4].trim() !== String(item ?? '').trim()) return { problema: 'mudou' };
    linhas.splice(linha, 1);
    return { texto: linhas.join('\n'), linha };
}
