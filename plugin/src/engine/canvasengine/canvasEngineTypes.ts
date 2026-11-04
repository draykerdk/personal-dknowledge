/**
 * Os tipos que o motor de canvas entrega a quem trabalha para ele: o motor como interface
 * (`CanvasEngine`, o que o formatador, a sincronização, os widgets, os planos do menu e a data
 * do contexto leem dele) e o contexto da criação de uma tarefa (`TaskCreationContext`).
 *
 * Por quê: o passo `tiposDoCanvas` da divisão do motor (tests/engine/modeloMotor.test.ts). Esses
 * tipos moravam no `canvasEngine.ts`, que importa em execução os mesmos arquivos que os liam: o
 * ciclo de nove arquivos, e os imports para cima dos planos do menu (camada 6), da data do
 * contexto (camada 3) e dos widgets (camada 7) até o motor (camada 8). Aqui, nas funções do
 * canvas (camada 1), os tipos só descem; a classe `CanvasEngine` do `canvasEngine.ts` implementa
 * a interface.
 *
 * Só tipos: nada roda deste arquivo.
 */
import type { TFile } from 'obsidian';
import type DFMPlugin from '../../main';

/** O contexto de criação de uma tarefa pelo canvas (o projeto, o canvas de destino, os campos). */
export interface TaskCreationContext {
    projectPath?: string | null;
    projectName?: string | null;
    canonicalWikilink?: string | null;
    targetCanvasPath?: string | null;
    /** Não solta nó avulso no canvas: quem posiciona é a zona gerida do projeto. */
    skipCanvasNode?: boolean;
    /** Campos gravados na tarefa recém-criada (ex.: `type: tarefa_smart`, `week`). `tags` é somado. */
    frontmatter?: Record<string, unknown> | null;
    /** Não liga a tarefa a projeto nenhum (canvas de semana/trimestre: o nome do canvas não é projeto). */
    noProjectLink?: boolean;
}

/** O que os ajudantes do motor pedem da sincronização: ligar o canvas à nota e ao projeto. */
export interface CanvasEngineSync {
    addCanvasToProject(taskFile: TFile, canvasFile: TFile): Promise<void>;
    addCanvasToRelations(noteFile: TFile, canvasFile: TFile): Promise<void>;
}

/**
 * O motor de canvas como interface: o plugin, a sincronização, o tipo de um arquivo e as chaves
 * do canvas que pergunta (`promptingCanvas`) e do que se ignora ao modificar (`ignoreModifyFor`).
 * A classe `CanvasEngine` do `canvasEngine.ts` a implementa.
 */
export interface CanvasEngine {
    plugin: DFMPlugin;
    syncManager: CanvasEngineSync;
    getFileType(file: TFile): string | null;
    getPromptingCanvas(): string | null;
    setPromptingCanvas(val: string | null): void;
    setIgnoreModifyFor(val: string | null): void;
}
