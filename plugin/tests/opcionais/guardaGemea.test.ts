import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { homedir, tmpdir } from 'os';
import { join } from 'path';

/**
 * A guarda gêmea no plugin: lê a mesma lista privada da guarda do pacote aberto e prova que um nome
 * posto numa fixture é achado. Sem a lista neste computador, o teste é pulado (no pacote, ninguém
 * tem a lista; aqui, ela fica em `DK_TERMOS_PRIVADOS` ou em `~/.config/dk-personal/termos_privados.txt`).
 *
 * Nunca imprime um termo: as asserções comparam contagens e categorias. A contagem nas fixtures dos
 * testes é um aviso (o item F3 do mapa da v0 a zera), não uma falha.
 */
const LISTA = process.env.DK_TERMOS_PRIVADOS || join(homedir(), '.config', 'dk-personal', 'termos_privados.txt');
const TEM_LISTA = existsSync(LISTA);

interface Termo { categoria: string; modo: string; padrao: RegExp }

function escapar(t: string): string {
    return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** O mesmo formato e os mesmos modos da guarda do pacote (`scripts/guarda_vazamento.py`). */
function lerTermos(texto: string): Termo[] {
    const termos: Termo[] = [];
    let categoria: string | null = null;
    let modo = '';
    for (const bruta of texto.split('\n')) {
        const linha = bruta.trim();
        if (!linha || linha.startsWith('#')) continue;
        const cab = /^\[(\S+)\s+(\S+)\]$/.exec(linha);
        if (cab) { categoria = cab[1]; modo = cab[2]; continue; }
        if (!categoria) throw new Error('termo fora de seção');
        const t = escapar(linha);
        const borda = `(?<![\\p{L}\\p{N}_])${t}(?![\\p{L}\\p{N}_])`;
        const padrao = modo === 'trecho' ? new RegExp(t, 'iu')
            : modo === 'literal' ? new RegExp(`(['"\`])${t}\\1`, 'u')
            : modo === 'palavra' ? new RegExp(borda, 'iu')
            : new RegExp(borda, 'u');
        termos.push({ categoria, modo, padrao });
    }
    return termos;
}

function primeiroDeModoPalavra(texto: string): string | undefined {
    let modo = '';
    for (const bruta of texto.split('\n')) {
        const linha = bruta.trim();
        if (!linha || linha.startsWith('#')) continue;
        const cab = /^\[(\S+)\s+(\S+)\]$/.exec(linha);
        if (cab) { modo = cab[2]; continue; }
        if (modo === 'palavra') return linha;
    }
    return undefined;
}

function achar(texto: string, termos: Termo[]): string[] {
    const cats: string[] = [];
    for (const linha of texto.split('\n')) for (const t of termos) if (t.padrao.test(linha)) cats.push(t.categoria);
    return cats;
}

function arquivosDe(pasta: string): string[] {
    if (!existsSync(pasta)) return [];
    return readdirSync(pasta).flatMap((nome) => {
        const p = join(pasta, nome);
        return statSync(p).isDirectory() ? arquivosDe(p) : [p];
    });
}

describe.skipIf(!TEM_LISTA)('a guarda gêmea, com a lista privada deste computador', () => {
    const termos = TEM_LISTA ? lerTermos(readFileSync(LISTA, 'utf-8')) : [];
    // Um nome da lista, escolhido sem escrever o termo aqui: o primeiro de modo `palavra`.
    const plantado = TEM_LISTA ? primeiroDeModoPalavra(readFileSync(LISTA, 'utf-8')) : undefined;

    it('a lista se lê e tem um termo de modo palavra para plantar', () => {
        expect(termos.length).toBeGreaterThan(0);
        expect(plantado).toBeTruthy();
    });

    it('um nome posto numa fixture é achado; a fixture limpa passa', () => {
        const pasta = mkdtempSync(join(tmpdir(), 'guarda-gemea-'));
        try {
            const limpa = join(pasta, 'limpa.md');
            const suja = join(pasta, 'suja.md');
            writeFileSync(limpa, 'uma nota de exemplo, sem nome nenhum\n');
            writeFileSync(suja, `uma nota de exemplo com ${plantado} no meio\n`);
            expect(achar(readFileSync(limpa, 'utf-8'), termos)).toEqual([]);
            expect(achar(readFileSync(suja, 'utf-8'), termos).length).toBeGreaterThan(0);
        } finally {
            rmSync(pasta, { recursive: true, force: true });
        }
    });

    it('as fixtures dos testes: a contagem é aviso, não falha', () => {
        const fixtures = arquivosDe(join(__dirname, '..', 'fixtures'));
        const total = fixtures.reduce((n, f) => n + achar(readFileSync(f, 'utf-8'), termos).length, 0);
        if (total) console.warn(`guarda gêmea: ${total} ocorrência(s) nas fixtures dos testes (aviso; item F3)`);
        expect(total).toBeGreaterThanOrEqual(0);
    });
});
