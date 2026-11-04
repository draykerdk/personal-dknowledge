/**
 * Índice vivo das TaskNotes: uma leitura do vault, reaproveitada por quem pedir.
 *
 * O cache cai quando qualquer nota muda (`metadataCache.changed`, apagar,
 * renomear) e é refeito na próxima consulta — ler 150 frontmatters do cache do
 * Obsidian é barato; ler de novo a cada widget não seria.
 */
import type { App } from 'obsidian';
import { TFile, getAllTags } from 'obsidian';
import type { TaskRecord } from './taskRecord';
import { isTaskTagged, toTaskRecord } from './taskRecord';

export class TaskIndex {
    private cache: TaskRecord[] | null = null;
    private byPath = new Map<string, TaskRecord>();

    constructor(private readonly app: App) {}

    /** Liga a invalidação aos eventos do vault; `register` é o do plugin. */
    attach(register: (ref: any) => void): void {
        const drop = () => { this.cache = null; };
        register(this.app.metadataCache.on('changed', drop));
        register(this.app.vault.on('delete', drop));
        register(this.app.vault.on('rename', drop));
    }

    invalidate(): void {
        this.cache = null;
    }

    read(file: TFile): TaskRecord | null {
        if (file.extension !== 'md') return null;
        const cache = this.app.metadataCache.getFileCache(file);
        if (!cache) return null;
        const tags = getAllTags(cache) ?? [];
        if (!isTaskTagged(tags)) return null;
        return toTaskRecord(file.path, file.basename, cache.frontmatter ?? {}, tags);
    }

    all(): TaskRecord[] {
        if (!this.cache) {
            this.cache = this.app.vault.getMarkdownFiles().map(f => this.read(f)).filter((t): t is TaskRecord => t !== null);
            this.byPath = new Map(this.cache.map(t => [t.path, t]));
        }
        return this.cache;
    }

    get(path: string): TaskRecord | null {
        this.all();
        return this.byPath.get(path) ?? null;
    }
}
