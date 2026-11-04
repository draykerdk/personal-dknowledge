/**
 * A leitura do diário da Day (itens 2.28 e 2.29 de "O que falta", plano de 22/10/2026).
 *
 * O diário é o atalho para revisar o dia de cabeça e já escrever algo sobre o próximo
 * (21/10/2026): o diário é a revisão do dia. Esta leitura, só por regras de texto, serve a três
 * peças:
 * - a pauta da manhã: "📝 Do diário de ontem", as frases sobre o dia seguinte;
 * - o 🌙: "📖 Pelo diário" (em teste), as tarefas da semana e os hábitos que o texto cita,
 *   para marcar com um toque cada;
 * - o hábito "🌒 Fechar o dia": o diário escrito conta como fechamento.
 *
 * Só calcula (texto entra, frases e candidatos saem). Quem lê o vault é o
 * `diaryService.ts`; a pauta tem a gêmea em JS (`day_context.js`, entre os marcadores
 * `diarioDeOntem`), e tests/engine/diaryReader.test.ts confere que as duas dizem o mesmo.
 */

export const DIARY_HEADING = '## ✍️ Diário';
export const NIGHT_HEADING = '### 🌙 Noite';
/** Quantas frases a pauta mostra e até quantos caracteres cada uma. */
export const TOMORROW_MAX = 3;
export const TOMORROW_CUT = 140;

/**
 * O que faz: as linhas que ele escreveu numa seção da nota: depois do título `de` até um
 * dos títulos `ate` (ou o próximo título do mesmo nível ou acima, a partir de "## "), sem
 * títulos, separadores, comentários, linhas de dica em itálico e as linhas do modelo.
 * Por quê: o diário (e o "### 🌙 Noite" que o 🌙 grava) é lido pela mesma régua no 🌙,
 * na pauta e na contagem do ECH (`ech.ts`); uma regra só para "texto escrito por ele".
 * Entra → sai: texto da nota, o título de início, os de parada e as linhas do modelo →
 * linhas (aparadas), na ordem.
 * Erro e ataque: nota sem a seção → []; comentário de várias linhas é pulado inteiro.
 * Prova: tests/engine/diaryReader.test.ts e tests/engine/ech.test.ts.
 */
export function sectionOwnLines(content: string, de: string, ate: readonly string[] = [], templateLines: Iterable<string> = []): string[] {
    const model = new Set(Array.from(templateLines || []).map(line => String(line ?? '').trim()).filter(Boolean));
    const lines = String(content ?? '').replace(/\r\n/g, '\n').split('\n');
    const head = String(de ?? '').trim();
    if (!head) return [];
    const start = lines.findIndex(line => line.trim().startsWith(head));
    if (start < 0) return [];
    const level = Math.max(2, (head.match(/^#+/)?.[0].length) ?? 2);
    const stops = [...ate.map(s => String(s ?? '').trim()).filter(Boolean)];
    for (let k = 2; k <= level; k++) stops.push(`${'#'.repeat(k)} `);
    const out: string[] = [];
    let inComment = false;
    for (const raw of lines.slice(start + 1)) {
        const line = raw.trim();
        if (stops.some(stop => line.startsWith(stop))) break;
        if (inComment) {
            if (line.includes('-->')) inComment = false;
            continue;
        }
        if (line.startsWith('<!--')) {
            if (!line.includes('-->')) inComment = true;
            continue;
        }
        if (!line || line === '---' || line.startsWith('#')) continue;
        if (model.has(line)) continue;
        if (/^\*[^*].*\*$/.test(line)) continue;
        out.push(line);
    }
    return out;
}

/**
 * O que faz: as linhas que ele escreveu no diário: entre "## ✍️ Diário" e "### 🌙 Noite"
 * (ou o próximo "## "), sem títulos, separadores, comentários, linhas de dica em itálico
 * e as linhas do modelo da Day (`sectionOwnLines`).
 * Por quê: o 🌙 grava o fechamento em "### 🌙 Noite"; o que conta como diário é o que vem
 * antes, escrito por ele. As Days antigas ainda têm "🌅 Manhã" e "🕒 Tarde" com a dica em
 * itálico: os títulos e as dicas não contam.
 * Entra → sai: texto da Day e as linhas do modelo → linhas (aparadas), na ordem.
 * Erro e ataque: Day sem a seção → []; comentário de várias linhas é pulado inteiro.
 */
export function diaryOwnLines(content: string, templateLines: Iterable<string> = []): string[] {
    return sectionOwnLines(content, DIARY_HEADING, [NIGHT_HEADING], templateLines);
}

/** O que faz: o diário tem texto escrito por ele? (o diário escrito conta como fechamento). */
export function diaryHasOwnText(content: string, templateLines: Iterable<string> = []): boolean {
    return diaryOwnLines(content, templateLines).length > 0;
}

/** Minúsculas e sem acento: "Amanhã" e "amanha" casam. */
export function foldText(text: string): string {
    return String(text ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Tira a marca de lista ou de citação do começo da linha ("- ", "* ", "> ", "1. "). */
function stripMarker(line: string): string {
    return String(line ?? '').replace(/^(?:>\s*)+/, '').replace(/^(?:[-*+]\s+(?:\[.\]\s+)?|\d+[.)]\s+)/, '').trim();
}

/** As frases das linhas: cada linha é uma ou mais frases, cortadas depois de . ! ? ou …. */
export function diarySentences(lines: string[]): string[] {
    const out: string[] = [];
    for (const line of lines || []) {
        const clean = stripMarker(line);
        if (!clean) continue;
        for (const piece of clean.replace(/([.!?…])\s+/g, '$1\u0000').split('\u0000')) {
            const sentence = piece.trim();
            if (sentence) out.push(sentence);
        }
    }
    return out;
}

const STARTS = /^(?:amanha\b|🤝|📍)/;
/** Os grupos de STARTS, na ordem em que entram: "Amanhã", depois 🤝, depois 📍. */
const START_GROUPS = [/^amanha\b/, /^🤝/, /^📍/];
const CONTAINS = /(?:^|[^a-z0-9])(?:amanha|tenho que|preciso)(?![a-z0-9])|(?:^|[^a-z0-9])vou\s/;

/** O que faz: corta a frase em `max` caracteres, com "…" no fim quando corta. */
export function cutSentence(sentence: string, max = TOMORROW_CUT): string {
    const text = String(sentence ?? '').trim();
    const chars = Array.from(text);
    if (chars.length <= max) return text;
    return `${chars.slice(0, max - 1).join('').trimEnd()}…`;
}

/**
 * O que faz: até 3 frases do diário sobre o dia seguinte: primeiro as que começam com
 * "Amanhã" (ou "amanha"), depois as que começam com "🤝", depois com "📍"; por último as
 * que contêm "amanhã", "tenho que", "preciso" ou "vou ". Cada uma cortada em ~140
 * caracteres, sem repetir. A ordem entre os grupos (26/10): as duas linhas 📍/🤝 de cada
 * deslize do dia não tiram da lista o "Amanhã…" escrito mais tarde.
 * Por quê: "A manhã começa pelo que você escreveu" (2.28); o treino dele é começar a frase
 * sobre amanhã com "Amanhã" (ou 🤝), para o sistema reconhecer.
 * Entra → sai: as linhas dele (`diaryOwnLines`) → frases, na ordem do texto dentro de
 * cada grupo. Sem frase → [] (a linha da pauta não aparece).
 * Prova: tests/engine/diaryReader.test.ts.
 */
export function tomorrowSentences(lines: string[], max = TOMORROW_MAX, cut = TOMORROW_CUT): string[] {
    const sentences = diarySentences(lines);
    const starts = START_GROUPS.flatMap(group => sentences.filter(sentence => group.test(foldText(sentence))));
    const contains = sentences.filter(sentence => !STARTS.test(foldText(sentence)) && CONTAINS.test(foldText(sentence)));
    const out: string[] = [];
    for (const sentence of [...starts, ...contains]) {
        const short = cutSentence(sentence, cut);
        if (!out.includes(short)) out.push(short);
        if (out.length >= max) break;
    }
    return out;
}

/* ==========================================================================
   📖 Pelo diário: as tarefas e os hábitos que o texto cita
   ========================================================================== */

/** Palavras vazias: não contam como palavra significativa do título. */
const STOPWORDS = new Set([
    'a', 'o', 'as', 'os', 'um', 'uma', 'uns', 'umas', 'de', 'da', 'do', 'das', 'dos', 'e', 'ou', 'em', 'no', 'na',
    'nos', 'nas', 'ao', 'aos', 'por', 'pra', 'pro', 'para', 'com', 'sem', 'que', 'se', 'mais', 'menos', 'como',
    'sobre', 'entre', 'ate', 'sua', 'seu', 'suas', 'seus', 'meu', 'minha', 'meus', 'minhas', 'este', 'esta',
    'esse', 'essa', 'isso', 'isto', 'aquele', 'aquela', 'nao', 'sim', 'mas', 'tambem', 'ja', 'so', 'the', 'and',
    'for', 'with', 'from', 'to', 'of', 'in', 'on', 'via', 'cada', 'todo', 'toda', 'todos', 'todas', 'ser', 'ter',
    'estar', 'fazer', 'feito', 'dia', 'hoje', 'amanha', 'semana', 'tarefa', 'versao',
]);

/** As palavras de um texto, minúsculas e sem acento (letras e números). */
export function wordsOf(text: string): string[] {
    return foldText(text).split(/[^a-z0-9]+/).filter(Boolean);
}

/** A chave de casamento: as 5 primeiras letras ("tradução" e "traduzir" → "tradu"). */
export function wordKey(word: string): string {
    return word.length > 5 ? word.slice(0, 5) : word;
}

/** As chaves significativas de um título: sem palavras vazias, com 3 letras ou mais. */
export function significantKeys(title: string): string[] {
    return [...new Set(wordsOf(title).filter(word => word.length >= 3 && !STOPWORDS.has(word)).map(wordKey))];
}

export interface DiaryTaskCandidate {
    path: string;
    name: string;
}

export interface DiaryHabitCandidate {
    path: string;
    title: string;
    /** O nome do hábito (o nome do arquivo sem o número: "Meditacao", "Estudar ingles"). */
    nome: string;
    palavras: string[];
}

/**
 * O que faz: as tarefas cujo título tem pelo menos `minimo` palavras significativas no
 * texto (casando pelo começo da palavra, 5 letras).
 * Por quê: "as tarefas abertas da semana que o texto parece citar como feitas" (2.28). É
 * só candidato: nada é concluído sem o toque dele.
 */
export function diaryTaskMatches<T extends DiaryTaskCandidate>(text: string, tasks: T[], minimo = 2): T[] {
    const keys = new Set(wordsOf(text).map(wordKey));
    return (tasks || []).filter(task => significantKeys(task?.name ?? '').filter(key => keys.has(key)).length >= minimo);
}

/** O que faz: a frase (uma ou mais palavras) aparece inteira no texto, sem acento nem caixa. */
function hasPhrase(textWords: string, phrase: string): boolean {
    const words = wordsOf(phrase);
    return words.length > 0 && ` ${textWords} `.includes(` ${words.join(' ')} `);
}

/**
 * O que faz: os hábitos cujo nome ou palavra-chave (`palavras`) aparece no texto.
 * Por quê: "meditei" → marcar? (2.29). Só candidato: a marca pede o toque dele.
 */
export function diaryHabitMatches<T extends DiaryHabitCandidate>(text: string, habits: T[]): T[] {
    const textWords = wordsOf(text).join(' ');
    return (habits || []).filter(habit => [habit?.nome ?? '', ...(habit?.palavras || [])].some(term => hasPhrase(textWords, term)));
}

/** O que faz: o nome de um hábito pelo arquivo ("10 - Meditacao.md" → "Meditacao"). */
export function habitNameOf(path: string): string {
    return String(path ?? '').split('/').pop()!.replace(/\.md$/, '').replace(/^\d+\s*-\s*/, '').trim();
}

/** Os rótulos do passo "📖 Pelo diário" (um toque cada). */
export const DIARY_TASK_PREFIX = '✅ Concluir: ';
export const DIARY_HABIT_PREFIX = '🔁 Marcar: ';
