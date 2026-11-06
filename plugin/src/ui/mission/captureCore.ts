/**
 * A captura rápida, num lugar só: o saneamento do nome, o corpo canônico e a escrita na
 * Caixa de entrada. A Captura rápida do Mission Control (`panelCapture.ts`) e a 💡 da
 * Missão chamam a mesma função (`capturarNaCaixa`).
 *
 * Módulo puro (o cofre entra como argumento). Prova: tests/missao/refinos.test.ts ("a 💡 Captura").
 */
import { DIA } from '../../engine/dia';

/** Mesmo saneamento do Control Center antigo: o que o sistema de arquivos recusa. */
export function sanitizeCaptureTitle(raw: string, max = 50): string {
    return String(raw ?? '').replace(/[\\/:*?"<>|]/g, '').trim().slice(0, max);
}

/**
 * Corpo canônico da captura: frontmatter mínimo, sem inventar metadado: o `status` e o dia em que ela
 * nasceu (`created`, o nome das notas que não são tarefa; as datas da reputação, 05/11: a data da captura
 * dependia do nome ou da data do arquivo, que a sincronização troca). Sem o dia, sem `created`.
 *
 * O título do H1 é o que o operador escreveu — saneado só para o NOME do
 * arquivo, onde `:` e `?` são proibidos pelo sistema de arquivos. Gravar o
 * saneado no corpo apagaria a pontuação do título: `Reunião: pauta` viraria
 * `Reunião pauta` dentro da nota, e o nome do arquivo já resolve o problema que
 * o saneamento existe para resolver.
 */
export function captureBody(title: string, dia = ''): string {
    const criada = DIA.test(dia) ? `created: ${dia}\n` : '';
    return `---\nstatus: backlog\n${criada}---\n\n# ${String(title ?? '').trim()}\n`;
}

/** O resultado de uma captura: deu ou não, o texto do aviso e, quando deu, onde a nota nasceu. */
export interface ResultadoDaCaptura { ok: boolean; texto: string; caminho?: string; titulo?: string }

/** O que a captura usa do cofre (o `Vault` do Obsidian; os testes dão um falso). */
export interface CofreDaCaptura {
    getAbstractFileByPath(path: string): unknown;
    createFolder(path: string): Promise<unknown>;
    create(path: string, data: string): Promise<{ path: string }>;
}

/**
 * O que faz: a captura, num lugar só: a nota crua na Caixa de entrada (`📥 <título>.md`, com
 * `status: backlog`), criando a pasta que falta. A Captura rápida do Mission Control e a 💡
 * da Missão chamam esta mesma função; cada uma decide o que mostrar depois.
 * Por quê: "A 💡 Captura no topo | a 💡 do dia" (plano da Missão, §3): o mesmo caminho de
 * escrita, e não um segundo.
 * Entra → sai: o cofre, a pasta, o texto digitado e o dia de hoje (`AAAA-MM-DD`, o `created`) → `ResultadoDaCaptura`.
 * Erro e ataque: sem título não cria; nome que já existe não sobrescreve; o que o sistema de
 * arquivos recusa sai do nome (o título do corpo fica como foi escrito); a falha de escrita
 * lança (quem chama mostra).
 * Prova: tests/missao/refinos.test.ts ("a 💡 Captura").
 */
export async function capturarNaCaixa(vault: CofreDaCaptura, pasta: string, bruto: string, dia = ''): Promise<ResultadoDaCaptura> {
    const title = sanitizeCaptureTitle(bruto);
    if (!title) return { ok: false, texto: 'Escreva um título para capturar.' };
    if (!vault.getAbstractFileByPath(pasta)) await vault.createFolder(pasta);
    const path = `${pasta}/📥 ${title}.md`;
    if (vault.getAbstractFileByPath(path)) return { ok: false, texto: `Já existe uma captura com esse nome: ${title}` };
    const created = await vault.create(path, captureBody(bruto, dia));
    return { ok: true, texto: `📥 Capturado: ${title}`, caminho: created.path, titulo: title };
}

