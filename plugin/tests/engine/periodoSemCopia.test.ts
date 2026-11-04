/**
 * O guarda da semana e do trimestre escritos (02/11/2026): fora de `src/engine/periodo.ts`, nenhum arquivo do
 * plugin escreve à mão a regex da semana (`AAAA-Www`) ou do trimestre (`AAAA-Qn`), a não ser as formas próprias
 * da lista abaixo, cada uma com o porquê.
 *
 * Por quê: o item 10 da fila (Arquitetura e Roteiro, §6), como o dia em 30/10 (tests/engine/diaSemCopia.test.ts).
 * Sem o guarda, a próxima leitura de semana volta a nascer escrita à mão, frouxa (`W\d{2}`) ou estrita, no
 * arquivo que a usa.
 *
 * Como manter: a leitura nova usa uma função de `engine/periodo.ts` (ou ganha uma lá, com a prova em
 * tests/engine/periodo.test.ts); na Missão, pelos formatos (`missao/formatos.ts` reexporta). Uma forma que não é
 * a semana nem o trimestre (o id de um nó, um sufixo de título, a pasta dos canvas) entra na lista com o porquê,
 * e a linha de cima no código leva o comentário "Forma própria (não é a `SEMANA`)". Linha de comentário não conta.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '../../src');
const DONO = 'engine/periodo.ts';

/** A semana ou o trimestre numa regex: `-W\d`, `-W(0[1-9]`, `-Q[1-4]`, `-Q(`, `-Q\d`, `(W\d{2})` e as alternativas `|W\d{2}`, `|Q\d`. */
const PERIODO_NA_REGEX = /-\(?W\(?(\?:)?(\\d|0\[1-9\])|-\(?Q\(?(\[1-4\]|\\d)|\\?\(W\\d\{2\}\\?\)|\|W\\d\{2\}|\|Q(\\d|\[1-4\])/;

const FORMAS_PROPRIAS: Record<string, { linhas: number; porque: string }> = {
    'canvas/edgeLinks.ts': { linhas: 1, porque: 'o id da célula da semana no canvas do trimestre (`dfm-qw-AAAA-Www`)' },
    'missao/conexoes.ts': { linhas: 1, porque: 'qualquer período no começo do nome (o dia, a semana ou o trimestre)' },
    'engine/cycleTemplate.ts': { linhas: 1, porque: 'o número no fim da chave do trimestre, sem conferir o ano' },
    'engine/missionPlan.ts': { linhas: 1, porque: 'a semana digitada com um dígito (`2026-W5`), conferida pelo ano' },
};

function arquivos(pasta: string): string[] {
    return readdirSync(pasta, { withFileTypes: true }).flatMap(e => {
        const caminho = join(pasta, e.name);
        if (e.isDirectory()) return arquivos(caminho);
        return e.name.endsWith('.ts') ? [caminho] : [];
    });
}

const ehComentario = (linha: string) => /^\s*(\/\/|\/\*|\*)/.test(linha);

function achados(): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const caminho of arquivos(SRC)) {
        const rel = relative(SRC, caminho).split('\\').join('/');
        if (rel === DONO) continue;
        const linhas = readFileSync(caminho, 'utf8').split('\n').filter(l => !ehComentario(l) && PERIODO_NA_REGEX.test(l));
        if (linhas.length) out[rel] = linhas.map(l => l.trim());
    }
    return out;
}

describe('a semana e o trimestre escritos têm um dono só', () => {
    it('fora de engine/periodo.ts, só as formas próprias escrevem a semana ou o trimestre numa regex', () => {
        const contagem = Object.fromEntries(Object.entries(achados()).map(([f, l]) => [f, l.length]));
        const esperado = Object.fromEntries(Object.entries(FORMAS_PROPRIAS).map(([f, v]) => [f, v.linhas]));
        expect(contagem).toEqual(esperado);
    });

    it('cada forma própria tem o porquê na lista e a linha do porquê no código', () => {
        for (const [arquivo, { porque, linhas }] of Object.entries(FORMAS_PROPRIAS)) {
            expect(porque.length, arquivo).toBeGreaterThan(10);
            const fonte = readFileSync(join(SRC, arquivo), 'utf8');
            expect((fonte.match(/Forma própria \(não é a `SEMANA`\)/g) ?? []).length, arquivo).toBeGreaterThanOrEqual(linhas);
        }
    });

    it('o guarda morde: a regex da semana ou do trimestre escrita à mão aparece', () => {
        for (const copia of ['/^\\d{4}-W\\d{2}$/', '/^(\\d{4})-W(\\d{2})$/', '/^\\d{4}-W(0[1-9]|[1-4]\\d|5[0-3])$/', '/^\\d{4}-Q[1-4]$/', '/^(\\d{4})-Q([1-4])$/', '/(\\d{4}-Q[1-4])\\.canvas$/']) {
            expect(PERIODO_NA_REGEX.test(copia), copia).toBe(true);
        }
        for (const outra of ['/^\\d{4}-\\d{2}-\\d{2}$/', "format('GGGG-[W]WW')", '`${ano}-W${n}`']) {
            expect(PERIODO_NA_REGEX.test(outra), outra).toBe(false);
        }
    });

    // A segunda-feira ISO (item 10 do roteiro, 02/11/2026): a conta pelo 4 de janeiro mora em
    // `engine/periodo.ts` (`segundaDaSemana`). As outras âncoras no 4 de janeiro fazem outra conta, cada uma
    // com o porquê; uma cópia nova da segunda-feira aparece aqui.
    it('a conta da segunda-feira pelo 4 de janeiro só tem as âncoras da lista', () => {
        const ANCORAS: Record<string, string> = {
            'engine/periodo.ts': 'a segunda-feira da semana (o dono)',
            'engine/calendario.ts': 'a conta inversa: a semana de um dia (isoWeekOf)',
            'engine/missionPlan.ts': 'a segunda da W01 de cada ano, para saber se o ano tem 52 ou 53 semanas',
            'engine/cycleTemplate.ts': 'a primeira quinta-feira do ano, para o número da semana do modelo do trimestre',
        };
        const achadas = arquivos(SRC)
            .map(c => relative(SRC, c).split('\\').join('/'))
            .filter(rel => readFileSync(join(SRC, rel), 'utf8').split('\n').some(l => !ehComentario(l) && /Date\.UTC\(.*,\s*0,\s*4\)/.test(l)))
            .sort();
        expect(achadas).toEqual(Object.keys(ANCORAS).sort());
    });
});
