/**
 * O registro com tipo lido do cofre: as notas do vault com o frontmatter do metadataCache, que o
 * registro (records.ts) conta e filtra.
 *
 * Por quê: o passo `notasDoVault` da divisão do motor (tests/engine/modeloMotor.test.ts). A
 * leitura morava no records.ts, nas funções dos leitores (camada 3), que não leem o cofre pelo
 * `app`. Ela sobe para um módulo que liga: o da progressão (liga.progressao, camada 7), o mais
 * baixo dos dois que a usam. O motor das árvores (progressionEngine) e o serviço do núcleo
 * (nucleoService, camada 8) a importam daqui; no serviço do núcleo, a progressão a importaria
 * para cima (o motor de canvas, na camada 8, já importa a progressão).
 */
import { isRecordPathCounted, type NotaComCampos } from './records';

/**
 * O que faz: as notas do vault com o frontmatter do metadataCache.
 * Por quê: a contagem lê o vault inteiro sem abrir arquivo (o cache já tem o frontmatter).
 * Entra → sai: o `app` do Obsidian (ou um igual, nos testes) → notas; nunca lança.
 * Erro e ataque: sem vault ou sem cache, []; a nota sem frontmatter vem com `null`; o caminho que
 * não conta (a lixeira, os modelos, `_archive`) fica de fora pelo `isRecordPathCounted`.
 * Prova: tests/engine/records.test.ts ("as notas do vault vêm do metadataCache").
 */
export function notasDoVault(app: any): NotaComCampos[] {
    try {
        return (app?.vault?.getMarkdownFiles?.() || [])
            .filter((file: any) => isRecordPathCounted(file?.path))
            .map((file: any) => ({ path: file.path, frontmatter: app.metadataCache?.getFileCache?.(file)?.frontmatter ?? null }));
    } catch (e) {
        return [];
    }
}
