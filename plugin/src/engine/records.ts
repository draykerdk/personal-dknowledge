/**
 * O registro com tipo (arquitetura do núcleo de 21/10, seção 2, "Guardar"; plano da
 * etapa 1, seção 2).
 *
 * Um registro é uma nota com `registro: <tipo>` (snake_case) e `data: AAAA-MM-DD` no
 * frontmatter; opcionalmente `hora`, `lugar`, `cidade`, `dominio` e os campos do
 * domínio. Hoje o registro tem quatro formatos (a linha na Day, o registro de blocos, as
 * notas da pasta de um protocolo e um diário de viagem); este é o formato comum, e nada é migrado
 * nesta etapa.
 *
 * A contagem é por tipo, no vault inteiro, fora da lixeira, dos modelos e dos arquivos
 * mortos (`_archive`). A gêmea em Python fica em `progression_tree.py`
 * (`contar_registros`), para o motor das árvores contar igual.
 */
import { dayOf } from './decisionWeights';
import { fieldText } from './choose';

/** O nome de um tipo de registro (e de um domínio): snake_case. */
export const RECORD_TYPE_PATTERN = /^[a-z][a-z0-9_]*$/;

/** Onde um registro não conta: a lixeira, os modelos e qualquer pasta `_archive`. */
export const RECORD_EXCLUDED_PREFIXES = ['.trash/', '200 - FUNCTIONS/Models/'];

/** Uma nota com o frontmatter (do metadataCache, ou de um teste). */
export interface NotaComCampos {
    path: string;
    frontmatter: Record<string, any> | null | undefined;
}

export interface ConsultaRegistros {
    tipo: string;
    /** Campo → valor (ou lista de valores aceitos); todos os campos precisam casar. */
    onde?: Record<string, string | string[]>;
    /** `AAAA-MM-DD`, inclusive. */
    desde?: string;
    /** `AAAA-MM-DD`, inclusive. */
    ate?: string;
}

/** O que faz: o caminho entra na contagem (fora da lixeira, dos modelos e de `_archive`). */
export function isRecordPathCounted(path: string): boolean {
    const p = String(path ?? '');
    if (!p.endsWith('.md')) return false;
    if (RECORD_EXCLUDED_PREFIXES.some(prefix => p.startsWith(prefix))) return false;
    return !p.split('/').includes('_archive');
}

/** O que faz: os textos de um valor de campo (lista ou valor solto), sem vazios. */
function textsOf(value: unknown): string[] {
    const list = Array.isArray(value) ? value : [value];
    return list.map(fieldText).filter(text => text !== '');
}

/**
 * O que faz: a nota é um registro desta consulta?
 * Regra: `registro` igual ao tipo, `data` válida (registro sem data não conta), dentro de
 * `desde`/`ate` e com cada campo de `onde` casando (campo em lista casa se algum item
 * casa; valor da consulta em lista aceita qualquer um).
 */
export function matchesRecord(fm: Record<string, any> | null | undefined, consulta: ConsultaRegistros): boolean {
    if (!fm || typeof fm !== 'object') return false;
    if (fieldText(fm.registro) !== consulta.tipo) return false;
    const data = dayOf(fm.data);
    if (!data) return false;
    if (consulta.desde && data < consulta.desde) return false;
    if (consulta.ate && data > consulta.ate) return false;
    for (const [campo, esperado] of Object.entries(consulta.onde || {})) {
        const aceitos = (Array.isArray(esperado) ? esperado : [esperado]).map(fieldText);
        if (!textsOf(fm[campo]).some(value => aceitos.includes(value))) return false;
    }
    return true;
}

/**
 * O que faz: os registros de uma consulta, entre as notas dadas.
 * Por quê: uma contagem por tipo, usada pela forma de mostrar, pelas escadas e pelo 📨
 * (núcleo, 2, "Contar e mostrar"), em vez de cada leitor contar arquivos de uma pasta.
 * Entra → sai: consulta e notas → as notas que casam, na ordem da data (e do caminho).
 * Erro e ataque: tipo fora do snake_case → nenhuma; frontmatter ausente; data inválida.
 * Prova: tests/engine/records.test.ts.
 */
export function registrosDe(consulta: ConsultaRegistros, notas: NotaComCampos[]): NotaComCampos[] {
    if (!consulta || !RECORD_TYPE_PATTERN.test(String(consulta.tipo ?? ''))) return [];
    return (notas || [])
        .filter(nota => isRecordPathCounted(nota?.path) && matchesRecord(nota.frontmatter, consulta))
        .sort((a, b) => dayOf(a.frontmatter?.data).localeCompare(dayOf(b.frontmatter?.data)) || a.path.localeCompare(b.path));
}

/** O que faz: quantos registros casam com a consulta (ver `registrosDe`). */
export function contarRegistros(consulta: ConsultaRegistros, notas: NotaComCampos[]): number {
    return registrosDe(consulta, notas).length;
}

/**
 * O que faz: as properties que a chave de topo `"registro": "<tipo>"` de um protocolo
 * acrescenta à nota que ele salva: `registro` e `data` (a data de contexto da rodada,
 * salvo se o protocolo já grava uma `data` válida).
 * Por quê: o protocolo vira gerador de registro com uma chave só; sem ela, nada muda.
 * Entra → sai: o tipo declarado, as properties já processadas e o dia `AAAA-MM-DD` →
 * as properties novas (a entrada não é mutada). Tipo fora do snake_case → nenhuma (o
 * juiz de protocolos acusa).
 * Prova: tests/engine/records.test.ts e tests/engine/protocolNucleo.test.ts.
 */
export function recordPropertiesFor(tipo: unknown, properties: Record<string, any>, dia: string): Record<string, any> {
    if (typeof tipo !== 'string' || !RECORD_TYPE_PATTERN.test(tipo)) return {};
    const own = dayOf(properties?.data);
    return { registro: tipo, data: own || dia };
}

/** O nome de uma nota a partir de um link ou caminho (`[[Pasta/Nome|x]]`, `Pasta/Nome.md` → `Nome`). */
export function noteNameOf(value: unknown): string {
    return fieldText(value).split('/').pop()!.replace(/\.md$/i, '').trim();
}

/**
 * O que faz: a nota pertence ao projeto? Sobe pelos `projects` (o pai, campo único da
 * arquitetura universal 3.1): a peça 📤 → a SMART → o projeto, até `maxNiveis` degraus.
 * Por quê: o 📤 de um criativo de uma obra conta como exposição de ideias (o plano de
 * uma área, 22/10, seção 1), e a peça liga ao projeto por essa cadeia, não direto.
 * Entra → sai: o nome da nota de partida, o nome do projeto e quem dá os pais de uma nota
 * (nome → nomes) → `true` se o projeto está na cadeia (a própria nota também vale).
 * Erro e ataque: ciclo de `projects` (cada nome é visitado uma vez); nomes vazios.
 * Prova: tests/engine/records.test.ts ("pertenceAoProjeto").
 */
export function pertenceAoProjeto(inicio: string, projeto: string, paisDe: (nome: string) => string[], maxNiveis = 6): boolean {
    const alvo = noteNameOf(projeto);
    let atual = [noteNameOf(inicio)].filter(Boolean);
    const vistos = new Set<string>();
    for (let nivel = 0; nivel <= maxNiveis && atual.length; nivel++) {
        const proximos: string[] = [];
        for (const nome of atual) {
            if (vistos.has(nome)) continue;
            vistos.add(nome);
            if (alvo && nome === alvo) return true;
            for (const pai of paisDe(nome) || []) {
                const limpo = noteNameOf(pai);
                if (limpo && !vistos.has(limpo)) proximos.push(limpo);
            }
        }
        atual = proximos;
    }
    return false;
}

/**
 * O que faz: lê o parâmetro do critério `registros | <tipo>[; campo=valor] | <n>` das
 * árvores de progressão. `campo=a,b` aceita qualquer um dos valores.
 * Entra → sai: o texto do meio (ex.: "exposicao; trilha=ideias") → a consulta, ou `null`
 * se o tipo não é snake_case ou um filtro não tem a forma `campo=valor`.
 * Prova: tests/engine/records.test.ts (e a gêmea `parse_records_criterion` no Python).
 */
export function parseRecordCriterion(param: string): ConsultaRegistros | null {
    const parts = String(param ?? '').split(';').map(part => part.trim()).filter(Boolean);
    const tipo = parts.shift() ?? '';
    if (!RECORD_TYPE_PATTERN.test(tipo)) return null;
    const onde: Record<string, string | string[]> = {};
    for (const part of parts) {
        const match = part.match(/^([^=\s][^=]*?)\s*=\s*(.+)$/);
        if (!match) return null;
        const values = match[2].split(',').map(value => value.trim()).filter(Boolean);
        if (!values.length) return null;
        onde[match[1].trim()] = values.length === 1 ? values[0] : values;
    }
    return Object.keys(onde).length ? { tipo, onde } : { tipo };
}
