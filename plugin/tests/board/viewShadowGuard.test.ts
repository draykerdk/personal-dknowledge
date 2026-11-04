/**
 * Nenhuma view do plugin pode declarar métodos com nome de ciclo de vida do
 * `View` do Obsidian. Nasceu de um caso real: o painel novo tinha um
 * `private open(path)` que substituía o `View.open(containerEl)` usado pela aba
 * para montar a view — o Obsidian chamava o nosso, nada era montado e a aba
 * ficava preta. O TypeScript não acusa porque a tipagem pública do `View` não
 * declara esses métodos.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../src', import.meta.url));
const RESERVED = ['open', 'close', 'load', 'unload'];

function files(dir: string): string[] {
    return readdirSync(dir).flatMap(name => {
        const full = join(dir, name);
        return statSync(full).isDirectory() ? files(full) : full.endsWith('.ts') ? [full] : [];
    });
}

/** Corpo de cada classe que estende uma view (ItemView, View, TextFileView ou view do próprio plugin). */
function viewClasses(source: string): Array<{ name: string; body: string }> {
    const out: Array<{ name: string; body: string }> = [];
    const re = /class\s+(\w+)\s+extends\s+(\w*View)\b[^{]*\{/g;
    for (let m = re.exec(source); m; m = re.exec(source)) {
        let depth = 1;
        let i = re.lastIndex;
        while (i < source.length && depth > 0) {
            if (source[i] === '{') depth++;
            else if (source[i] === '}') depth--;
            i++;
        }
        out.push({ name: m[1], body: source.slice(re.lastIndex, i) });
    }
    return out;
}

describe('views não sombreiam o ciclo de vida do Obsidian', () => {
    const all = files(root).flatMap(f => viewClasses(readFileSync(f, 'utf8')).map(c => ({ ...c, file: f.slice(root.length + 1) })));

    it('encontra as views do plugin', () => {
        expect(all.map(c => c.name)).toEqual(expect.arrayContaining(['BoardPanelView', 'MissaoView']));
    });

    it.each(RESERVED)('nenhuma view declara %s()', method => {
        const decl = new RegExp(`^\\s*(?:private |protected |public )?(?:async )?${method}\\s*\\(`, 'm');
        const offenders = all.filter(c => decl.test(c.body)).map(c => `${c.file} ${c.name}`);
        expect(offenders).toEqual([]);
    });
});
