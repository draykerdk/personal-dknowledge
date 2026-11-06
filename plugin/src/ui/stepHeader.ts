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
/** O que o cabeçalho precisa do app para tocar um áudio do cofre: achar o arquivo do link e o endereço dele. */
export interface LeitorDeAudio {
    metadataCache: { getFirstLinkpathDest(linkpath: string, sourcePath: string): { path: string; extension?: string } | null };
    vault: { getResourcePath(file: any): string };
}

/** As extensões de áudio que o cabeçalho toca. */
const EXTENSOES_DE_AUDIO = /\.(mp3|m4a|wav|ogg|oga|webm|flac|aac)$/i;

/**
 * O que faz: separa de uma linha do cabeçalho os links internos para um arquivo de áudio (`[[Áudios/x.mp3]]`, com ou
 * sem rótulo, com ou sem `!`): o texto da linha sem eles e os caminhos dos links.
 * Por quê: 06/11, o áudio dos cartões: o 🗣️ Inglês de hoje mostra "🔊 Áudio da frase: [[Áudios/x.mp3]]" (o campo de
 * link `audio` da nota, pelo `contextFrom`), e o texto puro não toca. Só o link interno do Obsidian para um arquivo de
 * áudio vira player: nenhum HTML do texto se abre.
 * Entra → sai: a linha → `{ texto, audios }` (sem link de áudio, a linha como veio e a lista vazia).
 * Prova: tests/ui/stepHeader.test.ts.
 */
export function audiosDaLinha(linha: string): { texto: string; audios: string[] } {
    const audios: string[] = [];
    const texto = String(linha ?? '').replace(/!?\[\[([^\[\]|#]+?)(?:#[^\[\]|]*)?(?:\|[^\[\]]*)?\]\]/g, (inteiro, alvo: string) => {
        const caminho = alvo.trim();
        if (!EXTENSOES_DE_AUDIO.test(caminho)) return inteiro;
        audios.push(caminho);
        return '';
    });
    return { texto: audios.length ? texto.replace(/\s+$/, '').replace(/:\s*$/, '') : texto, audios };
}

/**
 * O que faz: desenha uma linha do cabeçalho: o texto e, com o leitor do app, um `<audio controls>` para cada link de
 * áudio que se acha no cofre (`audiosDaLinha`); sem o leitor, ou com o link que não se acha, a linha como veio.
 */
function linhaEl(bloco: HTMLElement, linha: string, leitor?: LeitorDeAudio | null): void {
    const { texto, audios } = leitor ? audiosDaLinha(linha) : { texto: linha, audios: [] };
    const achados = audios.map(a => ({ a, f: leitor!.metadataCache.getFirstLinkpathDest(a, '') })).filter(x => x.f);
    if (!achados.length) { bloco.createDiv({ text: linha }); return; }
    const div = bloco.createDiv({ text: texto, cls: 'dfm-step-audio' });
    for (const { a, f } of achados) {
        const audio = div.createEl('audio', { attr: { controls: 'true', preload: 'none', 'aria-label': a } });
        audio.setAttribute('src', leitor!.vault.getResourcePath(f));
    }
}

/**
 * Desenha o cabeçalho. Com o leitor do app (`leitor`: o `app` do modal), o link interno para um áudio do cofre vira um
 * player (06/11, os áudios dos cartões); sem ele, todo texto fica como texto.
 */
export function renderStepHeader(container: HTMLElement, promptText: string, info?: string, leitor?: LeitorDeAudio | null) {
    const linhas = String(promptText ?? '').split('\n');
    const titulo = (linhas.shift() || '').trim();
    if (titulo) container.createEl("h3", { text: titulo, cls: "dfm-step-title" });

    const corpo = linhas.join('\n').trim();
    if (corpo) {
        const bloco = container.createDiv({ cls: "dfm-step-body" });
        for (const linha of corpo.split('\n')) linhaEl(bloco, linha, leitor);
    }

    const explicacao = String(info ?? '').trim();
    if (explicacao) {
        const bloco = container.createDiv({ cls: "dfm-step-info" });
        for (const linha of explicacao.split('\n')) bloco.createDiv({ text: linha });
    }
}
