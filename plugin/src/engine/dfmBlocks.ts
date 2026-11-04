/**
 * Bloco ```dfm``` — a notação de botões, lida **sem** Obsidian e **sem** DOM.
 *
 * A regra viva desta notação é o processador de código registrado em `main.ts`
 * (`registerMarkdownCodeBlockProcessor("dfm")`): ele recebe o **corpo** do bloco
 * já sem as cercas e monta os botões. Este módulo repete essa regra do lado de
 * fora por dois motivos:
 *
 * 1. um nó de TEXTO de canvas precisa saber o que o bloco promete **antes** de
 *    desenhar qualquer coisa, e o motor de canvas formata nó a nó, síncrono;
 * 2. assim a notação passa a ter teste sem abrir o Obsidian.
 *
 * **Fidelidade é o contrato.** Isto não é uma versão "melhorada" do processador:
 * é a mesma decisão, incluindo as estranhas. Onde a regra original tem defeito,
 * o defeito fica e vira comentário — "consertar" aqui faria o canvas e a nota
 * discordarem sobre o mesmo bloco, que é exatamente o problema que este módulo
 * existe para evitar.
 *
 * **A exceção de 15/09/2026 — e por que ela não quebra o contrato.** Uma única
 * decisão da notação foi mudada de propósito: a célula de destino que começa com
 * `command:` no formato com `|` agora **preserva** o prefixo (ver `pipeCell`).
 * Como o `main.ts` passou a chamar este parser, nota e canvas mudam juntos — a
 * fidelidade entre as duas superfícies continua inteira; o que mudou foi o
 * significado da notação, e ele está fixado em
 * `tests/engine/dfmBlocksFidelity.test.ts`.
 */

/** Um botão declarado no bloco, com os campos já no formato do processador. */
export interface DfmBlockAction {
    /** Rótulo visível: `params.button`. */
    button: string;
    /** Destino declarado: `params.id` — pode ser `command:<id>`, `""` ou vazio. */
    id: string;
    /** Comando explícito: `params.command` (às vezes entre aspas no bloco). */
    command: string;
    /** `params.type`; o valor exato `command` força a via de comando. */
    type: string;
    /** `params.vars` — base64 de JSON para retomar protocolo (ver `jsonProtocol`). */
    vars: string;
}

/**
 * O que um clique vai de fato fazer.
 *
 * `command` carrega o id **cru**, e é assim que ele deve ser executado — tanto na
 * nota quanto no canvas. Nada aqui prefixa `dfm-system:`: o bloco já traz o id
 * completo (`tasknotes:create-new-task`, `dfm-system:open-action-matrix`), e
 * prefixar faria o mesmo botão funcionar na nota e falhar dentro do canvas.
 */
export type DfmBlockTarget =
    | { kind: 'command'; commandId: string }
    | { kind: 'protocol'; protocolId: string };

/** Valor depois do primeiro `:`; sem `:`, o próprio token (igual ao processador). */
function valueAfterColon(token: string): string {
    const colonIndex = token.indexOf(':');
    return (colonIndex > -1 ? token.substring(colonIndex + 1) : token).trim();
}

/**
 * Célula de **destino** no formato com `|` — a única regra da notação que foi
 * mudada de propósito.
 *
 * POR QUÊ: o autor escreve `id: A | command:dfm-system:x` querendo um comando. A
 * regra antiga (`valueAfterColon`) comia tudo antes do primeiro `:` — inclusive
 * o `command:` — e a célula saía como `dfm-system:x`. Sem o prefixo literal,
 * `resolveDfmAction` procurava um PROTOCOLO com esse nome e o clique respondia
 * `❌ Protocolo não encontrado`. Medido no vault em 15/09/2026: **53 botões em 51
 * notas**, 3 deles em modelos (`200 - FUNCTIONS/Models/`), que espalhavam o
 * defeito para toda nota nova criada a partir deles.
 *
 * A exceção é mínima e vale só para o destino: célula que começa com `command:`
 * fica como está (só apara o espaço); qualquer outra continua perdendo o que vem
 * antes do primeiro `:`, e o rótulo (`button:`) não é tocado. Nada mais da
 * notação muda — os blocos que já funcionavam seguem resolvendo igual.
 */
function pipeTargetCell(token: string): string {
    const cell = token.trim();
    if (cell.startsWith('command:')) return cell;
    return valueAfterColon(cell);
}

/** Ação com os cinco campos sempre presentes: `undefined` e `""` decidem igual. */
function actionFrom(button: string, id: string, params?: Record<string, string>): DfmBlockAction {
    return {
        button,
        id,
        command: params?.command ?? '',
        type: params?.type ?? '',
        vars: params?.vars ?? '',
    };
}

/**
 * Extrai os botões do **corpo** de um bloco `dfm` (o texto entre as cercas, que é
 * o que o Obsidian entrega ao processador).
 *
 * Dois formatos, decididos para o bloco inteiro:
 *
 * - **por linhas com `|`** — qualquer linha não vazia contendo `|` liga este
 *   formato. A **primeira** linha começando por `button` dá os rótulos e a
 *   primeira começando por `id` dá os destinos; os dois são partidos por `|` e
 *   casados por posição. Cada token perde o que vem antes do primeiro `:`
 *   (`button: A | B` → `A`, `B`) — **exceto** a célula de destino que começa com
 *   `command:`, que preserva o prefixo (ver `pipeTargetCell`). Só entra o par com
 *   rótulo **e** destino.
 * - **`chave: valor`** — cada linha com `:` vira uma chave (a última repetida
 *   vence) e o bloco inteiro rende **um único** botão, quando existe `button` e
 *   algum destino (`id`, `command` ou `type: command`). Linha sem `:` é ignorada.
 */
export function parseDfmBlock(source: string): DfmBlockAction[] {
    const actions: DfmBlockAction[] = [];
    if (!source) return actions;

    // Linhas não vazias sem `trim()`: o processador compara prefixo literal, e o
    // espaço à esquerda é a diferença entre os dois formatos aceitarem a linha.
    const rows = source.split('\n').filter(row => row.length > 0);

    if (rows.some(row => row.includes('|'))) {
        const buttonRow = rows.find(row => row.startsWith('button'));
        const idRow = rows.find(row => row.startsWith('id'));
        const titles = buttonRow ? buttonRow.split('|').map(cell => cell.trim()) : [];
        const ids = idRow ? idRow.split('|').map(cell => cell.trim()) : [];

        // `Math.max` de propósito: linha de rótulos mais curta que a de destinos
        // (ou o contrário) casa por posição e o par incompleto cai fora.
        for (let i = 0; i < Math.max(titles.length, ids.length); i++) {
            const title = titles[i] ? valueAfterColon(titles[i]) : '';
            const id = ids[i] ? pipeTargetCell(ids[i]) : '';
            if (title && id) actions.push(actionFrom(title, id));
        }
        return actions;
    }

    const params: Record<string, string> = {};
    for (const row of rows) {
        const colonIndex = row.indexOf(':');
        if (colonIndex < 0) continue;
        const key = row.substring(0, colonIndex).trim();
        const value = row.substring(colonIndex + 1).trim();
        // Chave vazia (`: valor`) não vira parâmetro; chave repetida é sobrescrita.
        if (key) params[key] = value;
    }

    if (params.button && (params.id || params.command || params.type === 'command')) {
        actions.push(actionFrom(params.button, params.id ?? '', params));
    }
    return actions;
}

/**
 * Decide o destino de uma ação pela **mesma** regra do clique no processador.
 *
 * Devolve `null` quando não há o que executar — o caso do processador que só
 * consegue avisar "nenhum comando especificado". `vars` não entra aqui: o
 * contexto do canvas executa protocolo por id, sem variáveis.
 */
export function resolveDfmAction(action: DfmBlockAction): DfmBlockTarget | null {
    const isCommandId = String(action.id).startsWith('command:');
    if (action.type === 'command' || action.command || isCommandId) {
        const raw = action.command || (isCommandId ? String(action.id).substring(8) : '');
        // As aspas do bloco existem para o YAML do autor, não para o id: o
        // processador as tira, e `command: "tasknotes:x"` precisa virar
        // `tasknotes:x` também aqui.
        const commandId = raw ? raw.replace(/"/g, '').replace(/'/g, '').trim() : '';
        return commandId ? { kind: 'command', commandId } : null;
    }
    return action.id ? { kind: 'protocol', protocolId: action.id } : null;
}

/**
 * Corpos dos blocos `dfm` de um texto markdown, na ordem em que aparecem.
 *
 * Percorre as cercas de fora para dentro como o Obsidian faz: uma cerca de outra
 * linguagem é consumida inteira e **não** revela um ```` ```dfm ```` escrito
 * dentro dela como exemplo. Cerca sem fechamento vale até o fim do texto, que é
 * o que o CommonMark manda e o que o Obsidian de fato renderiza.
 *
 * Só cerca de crase é reconhecida, igual ao detector de nó operável do mapa.
 */
export function extractDfmBlocks(text: string): string[] {
    const blocks: string[] = [];
    // O texto vem do nó vivo do canvas: ausência aqui é ausência de bloco.
    if (!text) return blocks;

    const lines = text.split('\n');
    let index = 0;

    while (index < lines.length) {
        const opening = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(lines[index]);
        if (!opening) {
            index++;
            continue;
        }

        const marker = opening[1].charAt(0);
        const length = opening[1].length;
        const language = opening[2].trim().split(/\s+/)[0].toLowerCase();

        const body: string[] = [];
        index++;
        const closing = new RegExp(`^\\s{0,3}[${marker}]{${length},}\\s*$`);
        while (index < lines.length && !closing.test(lines[index])) {
            body.push(lines[index]);
            index++;
        }
        if (index < lines.length) index++; // consome a linha de fechamento

        if (language === 'dfm') blocks.push(body.join('\n'));
    }

    return blocks;
}

/**
 * Quem executa o destino de um botão.
 *
 * As duas superfícies têm meios diferentes de executar — a nota troca para o modo
 * fonte e foca o editor antes de disparar o comando; o canvas executa direto, sem
 * editor — mas a **decisão** de o que fazer é uma só, e é esta função que a toma.
 * Sem ela, a regra viveria duas vezes (uma no processador das notas, outra no
 * widget) e divergiria no primeiro ajuste.
 */
export interface DfmBlockHandlers {
    /** Executa o comando pelo id cru, como o bloco o declara. */
    executeCommand(commandId: string): void;
    /** Dispara o protocolo, com `vars` quando o bloco pedir retomada de rascunho. */
    runProtocol(protocolId: string, vars: string): void;
    /** Aviso quando não há o que executar. */
    notice(message: string): void;
}

/**
 * Executa a ação de um botão `dfm`, decidindo pelo destino resolvido.
 *
 * Botão sem destino executável **avisa** em vez de falhar em silêncio: foi assim
 * que um protocolo aposentado ficou meses parecendo funcional na nota.
 */
export function applyDfmAction(action: DfmBlockAction, handlers: DfmBlockHandlers): void {
    const target = resolveDfmAction(action);
    if (!target) {
        handlers.notice('❌ Nenhum comando especificado no botão.');
        return;
    }
    if (target.kind === 'command') {
        handlers.executeCommand(target.commandId);
        return;
    }
    handlers.runProtocol(target.protocolId, action.vars ?? '');
}
