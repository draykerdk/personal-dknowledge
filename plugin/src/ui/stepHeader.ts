/**
 * Cabeçalho de um passo de protocolo — compartilhado por modais e suggesters.
 *
 * Antes o prompt inteiro virava um único <h3>: prompts didáticos — os da ACT chegam a
 * 259 caracteres, com listas e exemplos — apareciam como um título gigante, e a parte
 * explicativa era justamente a que ficava ilegível. Aqui a PRIMEIRA linha é o título e
 * o resto é texto normal. `info` é o "por quê" do passo, opcional e discreto.
 *
 * Vive em módulo próprio de propósito: os suggesters precisam do mesmo cabeçalho e não
 * devem depender de `modals.ts` (que importa Modal do Obsidian) só para desenhar texto.
 */
export function renderStepHeader(container: HTMLElement, promptText: string, info?: string) {
    const linhas = String(promptText ?? '').split('\n');
    const titulo = (linhas.shift() || '').trim();
    if (titulo) container.createEl("h3", { text: titulo, cls: "dfm-step-title" });

    const corpo = linhas.join('\n').trim();
    if (corpo) {
        const bloco = container.createDiv({ cls: "dfm-step-body" });
        for (const linha of corpo.split('\n')) bloco.createDiv({ text: linha });
    }

    const explicacao = String(info ?? '').trim();
    if (explicacao) {
        const bloco = container.createDiv({ cls: "dfm-step-info" });
        for (const linha of explicacao.split('\n')) bloco.createDiv({ text: linha });
    }
}
