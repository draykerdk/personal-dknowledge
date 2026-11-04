/**
 * O módulo `obsidian` falso dos testes que rodam o motor de protocolos de verdade
 * (`protocolHarness.ts`): as classes que o motor e os modais importam, sem DOM.
 *
 * Os avisos (`Notice`) e a abertura de um seletor (`SuggestModal.open`) chamam os ganchos
 * globais `__aviso` e `__abrirSeletor`, que o arnês liga: é assim que o seletor de notas de
 * verdade (`NoteSuggester`, com as candidatas e a ordem dele) responde no teste.
 *
 * Uso: `vi.mock('obsidian', () => import('../fixtures/obsidianFalso'))`.
 */
const g = globalThis as any;

export class App {}
export class TFile {}
export class TFolder {}
export class Notice {
    constructor(message: unknown) { g.__aviso?.(String(message)); }
    setMessage() { return this; }
    hide() {}
}
export class Modal {
    app: any;
    constructor(app: any) { this.app = app; }
    open() { g.__abrirModal?.(this); }
    close() {}
}
export class SuggestModal {
    app: any;
    placeholder = '';
    constructor(app: any) { this.app = app; }
    setPlaceholder(text: string) { this.placeholder = text; }
    open() { g.__abrirSeletor?.(this); }
    close() {}
    selectSuggestion() {}
}
export class FuzzySuggestModal extends SuggestModal {}
export class ItemView {}
export class Setting {}
export class PluginSettingTab {}
export class Plugin {}
export class Component {}
export class MarkdownRenderer {}
export class TextAreaComponent {}
export const Platform = { isMobile: false };
export const moment = (...args: any[]) => g.window?.moment?.(...args);
export const setIcon = () => undefined;
export const setTooltip = () => undefined;
export const displayTooltip = () => undefined;
export const debounce = (fn: any) => fn;
export const normalizePath = (p: string) => p;
export const parseYaml = () => ({});
/** O YAML do frontmatter, chave por chave, com o valor em JSON (o bastante para os testes lerem de volta). */
export const stringifyYaml = (o: Record<string, unknown>) => Object.entries(o ?? {}).map(([k, v]) => `${k}: ${JSON.stringify(v)}\n`).join('');
export const getFrontMatterInfo = () => ({ exists: false, frontmatter: '' });
