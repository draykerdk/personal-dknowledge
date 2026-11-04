/**
 * O protocolo de inicialização do pacote (`cofre-modelo/200 - FUNCTIONS/Protocolos/inicializacao.json`),
 * rodado pelo próprio plugin num cofre vazio em memória.
 *
 * Por quê: o protocolo é escrito no repositório (C do mapa da v0); esta prova é dele. Ela confere que
 * uma rodada com respostas fixas cria a árvore esperada (o esqueleto do `cofre-modelo/`, uma pasta para
 * cada área com o que ela ganha e a nota dela, e uma nota de valor para cada valor respondido, que a
 * 🌳 sugere), grava as respostas nas definições do plugin com `inicializado: true`, e que a segunda
 * rodada não muda nada. Com os moldes do `cofre-modelo/` no cofre, a nota da área e a do valor têm o
 * nome no título, e a do valor tem a ordem e o porquê.
 *
 * Onde roda: no pacote, com o plugin inteiro em `plugin/` e `cofre-modelo/` ao lado. Sem
 * `cofre-modelo/` ao lado, o arquivo inteiro fica de fora.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as momentNs from 'moment';

vi.mock('obsidian', () => import('../fixtures/obsidianFalso'));

import { TFile } from 'obsidian';
import { JSONProtocol } from '../../src/engine/jsonProtocol';
import { lerDefinicoes } from '../../src/definicoes';
import { DEFAULT_SETTINGS } from '../../src/settings';

const moment: any = (momentNs as any).default ?? momentNs;
const RAIZ = join(__dirname, '..', '..', '..');
const MODELO = join(RAIZ, 'cofre-modelo');
const ARQUIVO = join(MODELO, '200 - FUNCTIONS', 'Protocolos', 'inicializacao.json');
const noPacote = existsSync(ARQUIVO);

const RESPOSTAS: Record<string, string> = {
    nome: 'Ana',
    areas: 'Saúde\nTrabalho',
    valores: 'Calma | para decidir sem pressa\nCuriosidade\nCuidado',
    foco: 'Trabalho',
};

/** As pastas do esqueleto do `cofre-modelo/` (as que têm `.gitkeep`) e os ancestrais delas. */
function pastasDoModelo(): string[] {
    const out = new Set<string>();
    const andar = (dir: string, rel: string) => {
        for (const nome of readdirSync(dir)) {
            const p = join(dir, nome);
            const r = rel ? `${rel}/${nome}` : nome;
            if (statSync(p).isDirectory()) andar(p, r);
            else if (nome === '.gitkeep') { const partes = rel.split('/'); for (let i = 1; i <= partes.length; i++) out.add(partes.slice(0, i).join('/')); }
        }
    };
    andar(MODELO, '');
    return [...out].sort();
}

/** Os moldes da área e do valor, como estão no `cofre-modelo/`. */
const MOLDES = ['200 - FUNCTIONS/Templates/Areas_template.md', '200 - FUNCTIONS/Templates/Valor_template.md'];

/** O cofre vazio (ou só com os moldes): as pastas e as notas que o motor cria, e as configurações que ele grava. */
function cofreVazio(comMoldes = false) {
    const pastas = new Set<string>();
    const textos = new Map<string, string>();
    const arquivos = new Map<string, any>();
    let gravacoes = 0;
    const novo = (path: string) => {
        const name = path.split('/').pop()!;
        const dot = name.lastIndexOf('.');
        const f = Object.assign(new (TFile as any)(), { path, name, basename: dot > 0 ? name.slice(0, dot) : name, extension: dot > 0 ? name.slice(dot + 1) : '' });
        arquivos.set(path, f);
        return f;
    };
    const filhos = (p: string) => [...pastas].filter(x => x.startsWith(`${p}/`) && !x.slice(p.length + 1).includes('/')).map(x => ({ path: x, name: x.split('/').pop(), children: [] }));
    const app: any = {
        vault: {
            getAbstractFileByPath: (p: string) => arquivos.get(p) ?? (pastas.has(p) ? { path: p, name: p.split('/').pop(), children: filhos(p) } : null),
            getMarkdownFiles: () => [...arquivos.values()],
            getFiles: () => [...arquivos.values()],
            read: async (f: any) => textos.get(f.path) ?? '',
            create: async (p: string, c: string) => { if (arquivos.has(p) || pastas.has(p)) throw new Error('File already exists.'); textos.set(p, c); return novo(p); },
            createFolder: async (p: string) => { if (pastas.has(p) || arquivos.has(p)) throw new Error('Folder already exists.'); pastas.add(p); },
            modify: async () => { throw new Error('nada se sobrescreve'); },
        },
        metadataCache: { getFileCache: () => null },
        workspace: { getActiveFile: () => null, getLeaf: () => ({ openFile: async () => undefined }), trigger: () => undefined },
    };
    const plugin: any = {
        app,
        settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
        partidaDasDefinicoes: [],
        get definicoes() { return lerDefinicoes(this.settings, this.partidaDasDefinicoes); },
        saveSettings: async () => { gravacoes++; },
        manager: { get: () => null },
    };
    if (comMoldes) for (const m of MOLDES) { textos.set(m, readFileSync(join(MODELO, m), 'utf8')); novo(m); }
    return { app, plugin, pastas, textos, gravacoes: () => gravacoes };
}

/** O que faz: roda o protocolo de verdade (`JSONProtocol.run`), com as respostas por id do passo. */
async function rodar(cofre: ReturnType<typeof cofreVazio>): Promise<void> {
    (globalThis as any).window = { moment };
    const def = JSON.parse(readFileSync(ARQUIVO, 'utf8'));
    const protocolo: any = new JSONProtocol(cofre.plugin, def);
    const idDe = (texto: string) => def.steps.find((s: any) => String(texto ?? '').startsWith(s.prompt))?.id;
    protocolo.prompt = async (texto: string) => ({ status: 'submit', value: RESPOSTAS[idDe(texto)] ?? '' });
    protocolo.promptTextarea = protocolo.prompt;
    (globalThis as any).__aviso = () => undefined;
    try { await protocolo.run({}); } finally { delete (globalThis as any).__aviso; }
}

afterEach(() => vi.useRealTimers());

describe.skipIf(!noPacote)('o protocolo de inicialização do pacote', () => {
    it('cada passo tem id único, pergunta e um tipo que o motor conhece; a ação é inicializar', () => {
        const def = JSON.parse(readFileSync(ARQUIVO, 'utf8'));
        expect(def.id).toBe('inicializacao');
        expect(def.acao).toBe('inicializar');
        const ids = def.steps.map((s: any) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids).toEqual(['nome', 'areas', 'valores', 'foco']);
        for (const s of def.steps) expect(['text', 'textarea']).toContain(s.type);
    });

    it('num cofre vazio, cria o esqueleto do cofre-modelo e as áreas, e grava as respostas nas definições', async () => {
        const cofre = cofreVazio();
        await rodar(cofre);
        const area = (pasta: string) => [
            `100 - AREAS/${pasta}`, `100 - AREAS/${pasta}/000 - INDEX`, `100 - AREAS/${pasta}/100 - PROJECTS`,
            ...['1 - Backlog', '2 - Active', '3 - Waiting', '4 - Review', '5 - Done', '6 - Integration'].map(c => `100 - AREAS/${pasta}/100 - PROJECTS/${c}`),
            `100 - AREAS/${pasta}/200 - DEPARTMENTS`, `100 - AREAS/${pasta}/300 - ARCHIVES`,
        ];
        const esperadas = new Set([...pastasDoModelo(), '200 - FUNCTIONS/Config', ...area('01 - Saúde'), ...area('02 - Trabalho')]);
        expect([...cofre.pastas].sort()).toEqual([...esperadas].sort());
        expect([...cofre.textos.keys()].sort()).toEqual([
            '100 - AREAS/01 - Saúde/000 - INDEX/README.md', '100 - AREAS/02 - Trabalho/000 - INDEX/README.md',
            '400 - MEMORY/Valores/Calma.md', '400 - MEMORY/Valores/Cuidado.md', '400 - MEMORY/Valores/Curiosidade.md',
        ]);
        expect(cofre.textos.get('100 - AREAS/01 - Saúde/000 - INDEX/README.md')).toContain('type: area');

        const d = lerDefinicoes(cofre.plugin.settings);
        expect(d.inicializado).toBe(true);
        expect(d.pessoa.nome).toBe('Ana');
        expect(d.areas.map(a => [a.nome, a.pasta])).toEqual([['Saúde', '01 - Saúde'], ['Trabalho', '02 - Trabalho']]);
        expect(d.valores.map(v => v.nome)).toEqual(['Calma', 'Curiosidade', 'Cuidado']);
        expect(d.valores[0].porque).toBe('para decidir sem pressa');
        expect(d.trimestre.foco).toEqual(['Trabalho']);
        expect(cofre.gravacoes()).toBe(1);
    });

    it('com os moldes do cofre-modelo: o nome no título da área e do valor; o valor com tipo, ordem, grupo e porquê', async () => {
        const cofre = cofreVazio(true);
        await rodar(cofre);
        expect(cofre.textos.get('100 - AREAS/01 - Saúde/000 - INDEX/README.md')).toMatch(/^# 🎯 Saúde$/m);
        const calma = cofre.textos.get('400 - MEMORY/Valores/Calma.md')!;
        expect(calma).toMatch(/^type: valor$/m);
        expect(calma).toMatch(/^ordem: 1$/m);
        expect(calma).toMatch(/^grupo: individual$/m);
        expect(calma).toMatch(/^# 🧭 Calma$/m);
        expect(calma).toContain('**Por quê:** para decidir sem pressa');
        expect(calma).not.toContain('{{');
        expect(cofre.textos.get('400 - MEMORY/Valores/Cuidado.md')).toMatch(/^ordem: 3$/m);
    });

    it('rodar duas vezes não muda nada: nenhuma pasta, nota ou definição nova, e nada é gravado de novo', async () => {
        const cofre = cofreVazio();
        await rodar(cofre);
        const antes = { pastas: [...cofre.pastas].sort(), textos: [...cofre.textos.entries()].sort(), definicoes: JSON.stringify(cofre.plugin.settings.definicoes) };
        await rodar(cofre);
        expect({ pastas: [...cofre.pastas].sort(), textos: [...cofre.textos.entries()].sort(), definicoes: JSON.stringify(cofre.plugin.settings.definicoes) }).toEqual(antes);
        expect(cofre.gravacoes()).toBe(1);
    });
});
