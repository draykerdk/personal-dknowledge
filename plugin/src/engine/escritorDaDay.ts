/**
 * O escritor único da Day, a parte pura: onde o registro entra (a seção declarada, o marcador do ledger, ou a seção
 * de registros), a inserção sem repetir no mesmo dia, e a linha da marca de um hábito, com a marca invisível do id.
 *
 * Por quê: o registro de um protocolo na Day tem um escritor só desde 29/10 (`JSONProtocol.logToDailyNote`, a
 * harmonização H3, item 1); a inserção morava dentro dele, presa à instância do protocolo. A marca do hábito (06/11,
 * a hora que a reputação quer) é outro registro na mesma Day, pelo mesmo lugar e pela mesma inserção: as duas
 * escritas chamam estas funções, e nenhuma tem cópia do jeito de inserir.
 *
 * Módulo puro: sem Obsidian. Prova: tests/engine/escritorDaDay.test.ts e tests/engine/marcaDoHabitoNaDay.test.ts.
 */

/** A pasta das Days (a casa do Daymiss). */
export const PASTA_DA_DAY = '300 - RUNTIME/302 - Daymiss/Day';

/** O marcador do ledger da Day: o contrato estável de inserção dos registros automáticos. */
export const MARCADOR_DO_LEDGER = '<!-- DFM_LOGS_START -->';

/** A seção dos registros na Day sem o marcador (o modelo antigo). */
export const SECAO_DOS_REGISTROS = '## 🗂️ Registros automáticos';

/**
 * O que faz: onde o registro entra na Day: a seção declarada, quando a Day a tem; senão o marcador do ledger; sem o
 * marcador, a seção dos registros.
 * Por quê: desde 29/10 (um escritor só da Day) todo registro escreve aqui; a seção declarada só vale onde nomeia uma
 * seção de verdade da Day (o `### 🌙 Noite` do 🌙).
 * Entra → sai: o texto da Day e a seção declarada (ou vazio) → o cabeçalho ou o marcador.
 * Prova: tests/engine/jsonProtocol.test.ts ("resolveDailyNoteSection").
 */
export function secaoDoRegistro(content: string, declarada = ''): string {
    const alvo = String(declarada ?? '').trim();
    if (alvo && String(content ?? '').split('\n').some(l => l.trim().toLowerCase() === alvo.toLowerCase())) return declarada;
    if (String(content ?? '').includes(MARCADOR_DO_LEDGER)) return MARCADOR_DO_LEDGER;
    return SECAO_DOS_REGISTROS;
}

/**
 * O que faz: o trecho de uma seção (do cabeçalho até o próximo `## `), para conferir se o registro já está lá.
 * Entra → sai: o texto e o cabeçalho → o trecho (vazio sem o cabeçalho).
 */
export function trechoDaSecao(content: string, header: string): string {
    const capture: string[] = [];
    let active = false;
    for (const line of String(content ?? '').split('\n')) {
        if (line.trim() === header) { active = true; capture.push(line); continue; }
        if (active && line.startsWith('## ') && line.trim() !== header) break;
        if (active) capture.push(line);
    }
    return capture.join('\n');
}

/**
 * O que faz: insere o registro logo abaixo do cabeçalho (ou do marcador), depois das linhas em branco e de um bloco
 * ```dfm que esteja ali; sem o cabeçalho, cria-o no fim. Com o fragmento, não insere se a seção já o tem.
 * Por quê: o mesmo dia não repete o registro (a mesma nota do protocolo, a mesma marca do hábito).
 * Entra → sai: o texto, o cabeçalho, a linha e o fragmento (ou `null`) → `{ content, inserted }`.
 * Erro e ataque: o fragmento vazio não deduplica; o cabeçalho compara sem caixa.
 * Prova: tests/engine/jsonProtocol.test.ts e tests/engine/escritorDaDay.test.ts.
 */
export function inserirNaDay(content: string, targetHeader: string, entry: string, dedupeFragment: string | null = null): { content: string; inserted: boolean } {
    let updated = String(content ?? '');
    if (!updated.includes(targetHeader)) updated = updated.trimEnd() + `\n\n${targetHeader}\n`;
    if (dedupeFragment && trechoDaSecao(updated, targetHeader).includes(dedupeFragment)) return { content: updated, inserted: false };
    const lines = updated.split('\n');
    const headerIndex = lines.findIndex(l => l.trim().toLowerCase() === targetHeader.trim().toLowerCase());
    if (headerIndex === -1) return { content: updated.trimEnd() + `\n\n${targetHeader}\n${entry}\n`, inserted: true };
    let insertIndex = headerIndex + 1;
    while (insertIndex < lines.length && lines[insertIndex] === '') insertIndex += 1;
    if (insertIndex < lines.length && lines[insertIndex].trim().startsWith('```dfm')) {
        for (let j = insertIndex + 1; j < lines.length; j++) {
            if (lines[j].trim() === '```') { insertIndex = j + 1; break; }
        }
    }
    lines.splice(insertIndex, 0, entry);
    return { content: lines.join('\n'), inserted: true };
}

/* ------------------------------------------------------------ a marca do hábito (06/11) */

/** O texto no lugar da hora quando o dia marcado não é hoje: a hora do clique não é a do hábito. */
export const MARCADO_DEPOIS = 'marcado depois';

/**
 * O que faz: a marca invisível com o id do hábito (o nome da nota dele), no fim da linha da marca
 * (` <!-- dfm-habito:07 - Prática ACT diária -->`).
 * Por quê: como a marca do id do protocolo (02/11): o leitor acha a marca pelo hábito, e o título pode mudar.
 * Erro e ataque: o nome com `--`, `<`, `>` ou quebra de linha (que quebraria o comentário) não gera marca ('').
 * Prova: tests/engine/marcaDoHabitoNaDay.test.ts.
 */
export function marcaDoHabito(nome: string): string {
    const t = String(nome ?? '').trim();
    return t && !/--|[<>\r\n]/.test(t) ? ` <!-- dfm-habito:${t} -->` : '';
}

/**
 * O que faz: o hábito marcado numa linha da Day (o nome da nota); sem marca, ''.
 * Prova: tests/engine/marcaDoHabitoNaDay.test.ts.
 */
export function habitoDaMarca(linha: string): string {
    return /<!-- dfm-habito:(.+?) -->/.exec(String(linha ?? ''))?.[1]?.trim() ?? '';
}

/**
 * O que faz: a linha da marca de um hábito na Day: `**[HH:mm] Hábito marcado:** [[nota|título]]` com a marca do id;
 * sem hora (o dia marcado não é hoje), `**[marcado depois] Hábito marcado:** …`. E o fragmento que diz que ela já está
 * lá (a marca do id).
 * Por quê: 06/11 (a recomendação aprovada, "vamos completar tudo então"): a reputação contextual quer a hora em que o
 * hábito é marcado, e a lista `entries` só guarda dias; a marca deixa uma linha na Day do dia marcado. A marca de
 * outro dia (a célula de ontem clicada hoje, o 🌙 que fecha ontem depois da meia-noite) não tem a hora do hábito, e
 * dizer "marcado depois" é mais honesto que uma hora inventada ou que uma linha sem nada.
 * Entra → sai: o nome da nota, o título e a hora (`HH:mm`, ou `null`) → `{ entry, dedupe }`.
 * Erro e ataque: a hora fora de `HH:mm` vale como `null`; o título vazio usa o nome; sem marca possível, o dedupe é o
 * link da nota.
 * Prova: tests/engine/marcaDoHabitoNaDay.test.ts.
 */
export function linhaDaMarcaDoHabito(input: { nome: string; titulo?: string; hora: string | null }): { entry: string; dedupe: string } {
    const nome = String(input.nome ?? '').trim();
    const titulo = String(input.titulo ?? '').trim();
    const hora = typeof input.hora === 'string' && /^\d{1,2}:\d{2}$/.test(input.hora) ? input.hora : MARCADO_DEPOIS;
    const link = titulo && titulo !== nome ? `[[${nome}|${titulo.replace(/[[\]|]/g, '')}]]` : `[[${nome}]]`;
    const marca = marcaDoHabito(nome);
    return { entry: `**[${hora}] Hábito marcado:** ${link}${marca}`, dedupe: marca ? marca.trim() : `[[${nome}` };
}

/**
 * O que faz: tira da Day as linhas da marca de um hábito (pela marca do id).
 * Por quê: desmarcar o dia volta ao estado de antes, como o Desfazer de hoje (o +1 da Missão tira a marca do dia):
 * a linha da marca acompanha a lista `entries`, e o dia desmarcado não fica com "Hábito marcado" na Day.
 * Entra → sai: o texto da Day e o nome da nota → `{ content, removed }` (quantas saíram).
 * Erro e ataque: sem marca possível (o nome que não gera marca), nada sai; a linha escrita à mão sem a marca fica.
 * Prova: tests/engine/marcaDoHabitoNaDay.test.ts.
 */
export function semAMarcaDoHabito(content: string, nome: string): { content: string; removed: number } {
    const marca = marcaDoHabito(nome).trim();
    if (!marca) return { content, removed: 0 };
    const lines = String(content ?? '').split('\n');
    const ficam = lines.filter(l => !(l.includes(marca) && l.includes('Hábito marcado')));
    return { content: ficam.join('\n'), removed: lines.length - ficam.length };
}
