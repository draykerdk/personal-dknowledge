/**
 * O aviso de sync do iCloud ao abrir o plugin: a Day de hoje mudou há menos de 5 minutos, e a mudança não foi
 * gravada neste aparelho.
 *
 * Por quê: a percorrida de 06/11: o aviso disparava ao recarregar quando a própria Missão tinha gravado a Day
 * minutos antes ("provavelmente em outro device"), e não era. O critério mais simples que resolve: o plugin
 * guarda, no armazenamento local do aparelho (`app.saveLocalStorage`, fora do cofre e do `data.json`, que o
 * iCloud leva para os outros aparelhos), o `mtime` da última gravação da Day que este aparelho viu (o evento
 * `modify` do cofre, que vem das gravações do plugin e das edições daqui). A Day com esse `mtime` (ou anterior)
 * não é de outro aparelho. A mudança que chegou pelo iCloud com o Obsidian aberto também entra no registro: ela
 * já estava carregada nesta sessão, e o risco que o aviso cobre é o da Day que chega enquanto ele abre.
 *
 * Módulo puro: sem Obsidian, sem relógio. Prova: tests/engine/avisoDeSync.test.ts.
 */

/** A última gravação da Day que este aparelho viu: o caminho e o `mtime` (ms). */
export interface GravacaoVista { caminho: string; mtime: number }

/** A janela do aviso: a Day mudada há menos disto. */
export const JANELA_DO_AVISO_MS = 5 * 60 * 1000;

/** A folga entre o `mtime` registrado e o do arquivo (o sistema de arquivos arredonda). */
const FOLGA_MS = 2000;

/**
 * O que faz: lê o registro guardado no aparelho.
 * Entra → sai: o valor cru do armazenamento local → o registro, ou `null`.
 * Erro e ataque: texto, lista, caminho vazio ou `mtime` que não é número dão `null` (o aviso volta a valer).
 */
export function gravacaoVista(raw: unknown): GravacaoVista | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const { caminho, mtime } = raw as Record<string, unknown>;
    return typeof caminho === 'string' && caminho && typeof mtime === 'number' && Number.isFinite(mtime) ? { caminho, mtime } : null;
}

/**
 * O que faz: os minutos do aviso, ou `null` quando não há o que avisar: a Day não mudou há menos de 5 minutos,
 * ou a mudança é a que este aparelho gravou (o mesmo caminho, o `mtime` até o registrado, com a folga).
 * Entra → sai: a Day (o caminho e o `mtime`), agora (ms) e o registro → os minutos desde a mudança, ou `null`.
 * Erro e ataque: o registro de outra Day não vale; o `mtime` no futuro conta como 0 minuto.
 */
export function minutosDoAvisoDeSync(day: GravacaoVista, agora: number, vista: GravacaoVista | null): number | null {
    if (!(day.mtime > agora - JANELA_DO_AVISO_MS)) return null;
    if (vista && vista.caminho === day.caminho && day.mtime <= vista.mtime + FOLGA_MS) return null;
    return Math.max(0, Math.floor((agora - day.mtime) / 60000));
}
