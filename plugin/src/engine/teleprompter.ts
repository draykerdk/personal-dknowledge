/**
 * O teleprompter de um roteiro (03/11/2026, o fluxo da ideia ao vídeo): só a fala, do Gancho ao CTA, em linhas curtas
 * para ler no celular ou colar num app de teleprompter.
 *
 * Por quê: o roteiro precisa estar bem estruturado para ler ou colocar num teleprompter de celular. A
 * nota do roteiro (`type: roteiro_video`) mistura a fala com as indicações de cena (*Na tela: …*), os trechos a
 * preencher ([A SUA HISTÓRIA…]), as notas de produção e os checklists, em parágrafos longos. A fala mora nas seções
 * 🎣 Gancho, ⚔️ Conflito, 🧱 Desenvolvimento, 🔺 Clímax e 🚀 CTA (as do 🎬 Roteiro de Vídeo, com os nomes dele ou os
 * da nota escrita à mão); o resto fica de fora. O trecho a preencher não some: vira uma linha "⚠️ FALTA n" e entra na
 * lista das faltas.
 *
 * Módulo puro: sem Obsidian. Prova: tests/engine/teleprompter.test.ts (com a nota de 02/11 como caso real).
 */

/** As seções da fala, na ordem do roteiro: o emoji do título e o nome que o marcador mostra. */
export const SECOES_DA_FALA: ReadonlyArray<{ emoji: string; nome: string }> = [
    { emoji: '🎣', nome: 'Gancho' },
    { emoji: '⚔', nome: 'Conflito' },
    { emoji: '🧱', nome: 'Desenvolvimento' },
    { emoji: '🔺', nome: 'Clímax' },
    { emoji: '🚀', nome: 'CTA' },
];

/** Quantas palavras cabem numa linha do teleprompter (de 8 a 12 é o alvo; o limite é o de cima). */
export const PALAVRAS_POR_LINHA = 12;

export interface TeleprompterDoRoteiro {
    /** A fala pronta: o marcador de cada seção, as linhas curtas, uma linha em branco entre os blocos. */
    texto: string;
    /** Os trechos a preencher, inteiros e na ordem em que aparecem (o "⚠️ FALTA n" do texto aponta o n-ésimo). */
    faltas: string[];
    /** Quantos blocos de fala saíram (0 = o roteiro não tem as seções da fala). */
    blocos: number;
}

const palavras = (t: string) => t.split(/\s+/).filter(Boolean);

/** As palavras antes das quais a voz pausa numa frase longa sem vírgula (a quebra cai antes delas). */
const LIGACOES = new Set(['e', 'que', 'ou', 'mas', 'pois', 'quando', 'como', 'onde', 'porque', 'enquanto', 'se', 'para', 'com', 'sem']);

/** O que faz: divide as palavras de um pedaço longo: antes da ligação mais perto do meio, ou ao meio; de novo, até caber. */
function partido(w: string[], limite: number): string[] {
    if (w.length <= limite) return [w.join(' ')];
    const meio = w.length / 2;
    let corte = Math.ceil(meio);
    let melhor = Infinity;
    for (let i = 3; i <= w.length - 3; i++) {
        if (LIGACOES.has(w[i].toLowerCase()) && Math.abs(i - meio) < melhor && Math.abs(i - meio) <= w.length / 4) { melhor = Math.abs(i - meio); corte = i; }
    }
    return [...partido(w.slice(0, corte), limite), ...partido(w.slice(corte), limite)];
}

/**
 * O que faz: quebra um trecho de fala em linhas curtas: primeiro nas frases, depois nas pausas da frase (vírgula,
 * ponto e vírgula, dois-pontos, travessão), juntando os pedaços até o limite de palavras; o pedaço que ainda passa do
 * limite se divide antes da ligação (e, que, mas…) mais perto do meio, ou ao meio.
 * Por quê: no celular, a linha de 8 a 12 palavras se lê de uma olhada, e a quebra na pausa é a quebra da voz.
 * Entra → sai: o texto e o limite → as linhas, na ordem, sem linha vazia.
 * Erro e ataque: texto vazio dá nenhuma linha; uma palavra maior que a linha fica inteira; o limite abaixo de 1 vale 1.
 * Prova: tests/engine/teleprompter.test.ts ("as linhas curtas").
 */
export function linhasCurtas(texto: string, max: number = PALAVRAS_POR_LINHA): string[] {
    const limite = Math.max(1, Math.floor(max));
    const out: string[] = [];
    const frases = String(texto ?? '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?…])\s+/).filter(Boolean);
    for (const frase of frases) {
        if (palavras(frase).length <= limite) { out.push(frase); continue; }
        const pedacos = frase.split(/(?<=[,;:])\s+|\s+(?=[—–]\s)/).filter(Boolean);
        let atual: string[] = [];
        const fecha = () => { if (atual.length) out.push(atual.join(' ')); atual = []; };
        for (const p of pedacos) {
            const w = palavras(p);
            if (w.length > limite) {
                fecha();
                out.push(...partido(w, limite));
                continue;
            }
            if (atual.length + w.length > limite) fecha();
            atual.push(...w);
        }
        fecha();
    }
    return out;
}

/** O que faz: tira do texto falado a marcação do Markdown que não se lê: links, negrito, itálico de ênfase, código. */
function semMarcacao(t: string): string {
    return t
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
        .replace(/\[\[([^\]]+)\]\]/g, (_m, alvo: string) => alvo.split('#')[0].split('/').pop()!.replace(/\.md$/, ''))
        .replace(/\[([^\]]+)\]\((?:[^)]+)\)/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/(^|[^*\w])\*([^*\n]+)\*(?=[^*\w]|$)/g, '$1$2')
        .replace(/(^|\W)_([^_\n]+)_(?=\W|$)/g, '$1$2')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
}

/** O que faz: o resumo de um trecho a preencher para a linha da fala: as primeiras palavras. */
function resumoDaFalta(t: string, n = 8): string {
    const w = palavras(t);
    return w.length > n ? `${w.slice(0, n).join(' ').replace(/[.,;:!?]+$/, '')}…` : w.join(' ');
}

/** A seção da fala de um título de nível 2, ou `null` (as outras seções: a tese, as notas, os cortes, o checklist). */
function secaoDoTitulo(linha: string): string | null {
    const m = linha.match(/^##\s+(.*)$/);
    if (!m) return null;
    const titulo = m[1].trim();
    return SECOES_DA_FALA.find(s => titulo.startsWith(s.emoji))?.nome ?? null;
}

/**
 * O que faz: o teleprompter de uma nota de roteiro: as seções da fala (🎣 → 🚀) na ordem, cada uma com um marcador
 * pequeno ("— Gancho —"), os subtítulos em negrito do Desenvolvimento como marcador menor ("· 1. Do animal ao
 * símbolo"), e a fala em linhas curtas (`linhasCurtas`), com uma linha em branco entre os blocos.
 * Por quê: ver o cabeçalho do módulo.
 * Entra → sai: o texto inteiro da nota (com ou sem frontmatter) e o limite de palavras → `TeleprompterDoRoteiro`.
 * Erro e ataque: fica de fora a indicação em itálico no começo da linha ("*Na tela: …*", "*Pausa. Depois:*", com a
 * fala que vem depois dela mantida), a citação de aviso (`> [!…]`), o item de checklist, a linha `---`, o comentário e
 * o tempo entre parênteses dos títulos; o itálico no meio da fala (o nome do livro) fica, sem os asteriscos; o trecho
 * entre colchetes (que não é link) vira "⚠️ FALTA n: <começo>…" e entra em `faltas`, inteiro; sem as seções da fala,
 * o texto vem vazio e `blocos` é 0.
 * Prova: tests/engine/teleprompter.test.ts.
 */
export function teleprompterDoRoteiro(nota: string, max: number = PALAVRAS_POR_LINHA): TeleprompterDoRoteiro {
    const corpo = String(nota ?? '').replace(/\r\n/g, '\n').replace(/^---\n[\s\S]*?\n---\n/, '');
    const faltas: string[] = [];
    const saida: string[] = [];
    let blocos = 0;
    let secao: string | null = null;
    let paragrafo: string[] = [];

    const bloco = (linhas: string[]) => { if (linhas.length) { saida.push(linhas.join('\n')); blocos++; } };
    const fechaParagrafo = () => {
        const texto = paragrafo.join(' ').trim();
        paragrafo = [];
        if (!texto) return;
        // O trecho a preencher ([…], que não é link nem `[ ]` de checklist) vira linha própria e entra nas faltas.
        const partes = texto.split(/(\[(?!\[)[^\]]+\](?!\(|\]))/);
        const linhas: string[] = [];
        for (const parte of partes) {
            const ph = parte.match(/^\[([^\]]+)\]$/);
            if (ph && !/^\s*[xX ]?\s*$/.test(ph[1])) {
                faltas.push(semMarcacao(ph[1]));
                linhas.push(`⚠️ FALTA ${faltas.length}: ${resumoDaFalta(semMarcacao(ph[1]))}`);
                continue;
            }
            linhas.push(...linhasCurtas(semMarcacao(parte), max));
        }
        bloco(linhas);
    };

    for (const bruta of corpo.split('\n')) {
        const linha = bruta.trim();
        if (/^#{1,2}\s/.test(linha)) {
            fechaParagrafo();
            const nova = secaoDoTitulo(linha);
            secao = nova;
            if (nova) saida.push(`— ${nova} —`);
            continue;
        }
        if (!secao) continue;
        if (!linha || /^(-{3,}|\*{3,}|_{3,})$/.test(linha) || /^#{3,}\s/.test(linha)) { fechaParagrafo(); continue; }
        if (/^>\s*\[!/.test(linha) || /^[-*+]\s+\[[ xX]\]/.test(linha)) { fechaParagrafo(); continue; }
        // O subtítulo em negrito sozinho na linha (a parte do Desenvolvimento): marcador menor, sem o tempo.
        const sub = linha.match(/^\*\*([^*]+)\*\*$/);
        if (sub) { fechaParagrafo(); saida.push(`· ${sub[1].replace(/\s*\([^)]*\)\s*$/, '').trim()}`); continue; }
        // A indicação de cena em itálico no começo da linha sai; a fala depois dela fica.
        let resto = linha.replace(/^>\s?/, '');
        while (/^\*[^*\n]+\*/.test(resto)) resto = resto.replace(/^\*[^*\n]+\*\s*/, '');
        if (!resto) { fechaParagrafo(); continue; }
        // O item de lista é um bloco de fala próprio.
        if (/^[-*+]\s+/.test(resto)) { fechaParagrafo(); paragrafo.push(resto.replace(/^[-*+]\s+/, '')); fechaParagrafo(); continue; }
        paragrafo.push(resto);
    }
    fechaParagrafo();

    // Os marcadores sem fala depois deles saem (a seção vazia não vira um marcador solto no fim).
    const limpa = saida.filter((l, i) => !(l.startsWith('— ') && (i === saida.length - 1 || saida[i + 1].startsWith('— '))));
    return { texto: blocos ? limpa.join('\n\n') : '', faltas, blocos };
}

/**
 * O que faz: a lista das faltas para o topo da nota do teleprompter (um aviso do Obsidian), ou vazio sem faltas.
 * Entra → sai: as faltas → o bloco em Markdown.
 * Prova: tests/engine/teleprompter.test.ts ("as faltas").
 */
export function avisoDasFaltas(faltas: readonly string[]): string {
    if (!faltas.length) return '';
    return [`> [!warning] Falta preencher (${faltas.length})`, ...faltas.map((f, i) => `> ${i + 1}. ${f}`)].join('\n');
}
