import { App, Notice, SuggestModal, TFile, TFolder } from "obsidian";
import type DFMPlugin from "../main";
import { DFM_Suggester } from "./suggesters";
import { InputModal } from "./modals";
import { conventionalCanvasPath } from "../project/projectCanvasPath";
import { canvasWritesAllowed } from "../canvas/managedZone";
import { STAGE } from "../engine/missionPortfolio";
import { definicoesDe, rotuloDoAgente } from "../definicoes";

interface ProjectCandidate {
    folder: TFolder;
    readme: TFile;
}

/** Suggester dedicado: varre 100 - PROJECTS/1 - Backlog e 2 - Active de todas as áreas. */
class ProjectFolderSuggestModal extends SuggestModal<ProjectCandidate> {
    private candidates: ProjectCandidate[];
    private onChoose: (result: { status: string; item?: ProjectCandidate }) => void;
    private submitted = false;

    constructor(app: App, onChoose: (result: { status: string; item?: ProjectCandidate }) => void) {
        super(app);
        this.onChoose = onChoose;
        this.candidates = this.collectCandidates();
        this.setPlaceholder("🌳 Selecione o projeto (Backlog ou Active):");
    }

    private collectCandidates(): ProjectCandidate[] {
        const out: ProjectCandidate[] = [];
        const areasRoot = this.app.vault.getAbstractFileByPath("100 - AREAS");
        if (!(areasRoot instanceof TFolder)) return out;

        for (const areaChild of areasRoot.children) {
            if (!(areaChild instanceof TFolder)) continue;
            const projectsRoot = this.app.vault.getAbstractFileByPath(`${areaChild.path}/100 - PROJECTS`);
            if (!(projectsRoot instanceof TFolder)) continue;

            for (const kanbanCol of [STAGE.backlog, STAGE.active]) {
                const colFolder = this.app.vault.getAbstractFileByPath(`${projectsRoot.path}/${kanbanCol}`);
                if (!(colFolder instanceof TFolder)) continue;

                for (const projFolder of colFolder.children) {
                    if (!(projFolder instanceof TFolder)) continue;
                    const readmePath = `${projFolder.path}/${projFolder.name}.md`;
                    const readme = this.app.vault.getAbstractFileByPath(readmePath);
                    if (readme instanceof TFile) {
                        out.push({ folder: projFolder, readme });
                    }
                }
            }
        }
        return out;
    }

    getSuggestions(query: string): ProjectCandidate[] {
        const q = query.toLowerCase();
        return this.candidates.filter(c => c.folder.name.toLowerCase().includes(q));
    }

    renderSuggestion(item: ProjectCandidate, el: HTMLElement) {
        el.createEl("div", { text: item.folder.name });
        el.createEl("small", { text: item.folder.path, cls: "suggestion-note" });
    }

    onChooseSuggestion(item: ProjectCandidate) {
        this.submitted = true;
        this.onChoose({ status: "submit", item });
    }

    onClose() {
        if (!this.submitted) this.onChoose({ status: "cancel" });
    }
}

const TIPO_OPTIONS = [
    "🎯 Exposição progressiva (comportamental)",
    "🗺️ Marcos adaptativos (resultado)"
];

/** O molde da árvore: o cabeçalho, a explicação do tipo, um nível por número e a dica de como preencher (à mão, ou pedindo ao agente, pelo nome que as definições dão a ele). */
function buildSkeleton(projectBasename: string, tipo: "exposicao" | "marcos", numNiveis: number, agente: string): string {
    const today = (window as any).moment().format("YYYY-MM-DD");
    const tipoLabel = tipo === "exposicao" ? "Exposição Progressiva" : "Marcos Adaptativos";
    const introComment = tipo === "exposicao"
        ? `> **Como funciona:** cada nível é um patamar de exposição comportamental. O critério de desbloqueio é OBJETIVO (contadores/tarefas) — cumpriu, o próximo nível abre e suas tarefas nascem no TaskNotes automaticamente. Regras: não pular níveis (coragem emprestada de nível alto não consolida), repetir no nível até ficar entediante (tédio = consolidado), e recuar um nível em semana ruim é uso correto da árvore, não fracasso.`
        : `> **Como funciona:** os NÍVEIS (marcos) são fixos — a estrada não muda; as TAREFAS de cada nível são adaptativas — reescreva-as livremente ao revisar, conforme os dados. O desbloqueio depende só do critério do marco, nunca da lista de tarefas corrente.`;

    let body = `---\ntype: arvore_progressao\nproject: "[[${projectBasename}]]"\ncreated: ${today}\n---\n\n`;
    body += `# 🌳 Árvore de Progressão — ${tipoLabel}\n\n${introComment}\n\n`;

    for (let n = 0; n < numNiveis; n++) {
        const emoji = n === 0 ? "🟡" : "🔒";
        body += `## ${emoji} Nível ${n} — (definir nome)\n> objetivo: (definir objetivo)\ncriterio: manual\ntarefas:\n- (definir tarefa)\n\n`;
    }

    body += `> [!tip] Como preencher\n> Preencha à mão ou peça para ${agente}: "preencha a árvore de progressão deste projeto".\n`;

    return body;
}

/** Embute o node do canvas — Árvore (ainda vazio, será gerado no próximo Reavaliar) no canvas
 *  estratégico do projeto, se ele já existir — espelha o embed manual feito nos 2 projetos atuais.
 *  O caminho do canvas vem do resolvedor único (projeto que é repositório git próprio tem o canvas
 *  na área); canvas aberto numa aba não é regravado por arquivo (a vista desfaria a edição). */
export async function embedArvoreNodeInProjectCanvas(app: App, plugin: DFMPlugin, projectFolder: TFolder, arvoreCanvasPath: string) {
    // No celular os canvas geridos só são lidos: regravar o do projeto abria conflito
    // de sincronização com o computador (todo outro caminho que grava canvas confere).
    if (!canvasWritesAllowed()) {
        new Notice(`No celular o canvas do projeto não é gravado. Arraste "${arvoreCanvasPath.split('/').pop()}" para ele depois, no computador.`);
        return;
    }
    const projectCanvasPath = (plugin as any).board?.projectCanvas?.canvasPathOfFolder?.(projectFolder.path)
        ?? conventionalCanvasPath({ name: projectFolder.name, path: projectFolder.path });
    const projectCanvasFile = app.vault.getAbstractFileByPath(projectCanvasPath);
    if (!(projectCanvasFile instanceof TFile)) return;
    if (app.workspace.getLeavesOfType('canvas').some(l => (l.view as any)?.file?.path === projectCanvasPath)) {
        new Notice(`O canvas do projeto está aberto, então a Árvore não foi embutida nele. Arraste "${arvoreCanvasPath.split('/').pop()}" para o canvas depois do próximo Reavaliar.`);
        return;
    }

    try {
        const raw = await app.vault.read(projectCanvasFile);
        const data = JSON.parse(raw);
        data.nodes = data.nodes || [];
        data.edges = data.edges || [];

        if (data.nodes.some((n: any) => n.file === arvoreCanvasPath)) return; // já embutido

        let maxX = 0;
        for (const n of data.nodes) {
            if (typeof n.x === "number" && typeof n.width === "number") {
                maxX = Math.max(maxX, n.x + n.width);
            }
        }

        data.nodes.push({
            id: "arvore_embed",
            type: "file",
            file: arvoreCanvasPath,
            x: maxX + 100,
            y: 0,
            width: 520,
            height: 640
        });

        await app.vault.modify(projectCanvasFile, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("DFM System: falha ao embutir node da Árvore no canvas do projeto", e);
    }
}

/** Wizard "Nova Árvore" (3 passos): Projeto → Tipo → Nº de níveis. Gera o esqueleto do doc
 *  `NN - Árvore de Progressão.md` na pasta do projeto e abre o arquivo. */
export class NovaArvoreModal {
    private app: App;
    private plugin: DFMPlugin;
    private onDone: () => void;

    constructor(app: App, plugin: DFMPlugin, onDone: () => void = () => {}) {
        this.app = app;
        this.plugin = plugin;
        this.onDone = onDone;
    }

    open() {
        this.stepProjeto();
    }

    private stepProjeto() {
        new ProjectFolderSuggestModal(this.app, (result) => {
            if (result.status !== "submit" || !result.item) return;
            this.stepTipo(result.item);
        }).open();
    }

    private stepTipo(project: ProjectCandidate) {
        new DFM_Suggester(this.app, TIPO_OPTIONS, (result) => {
            if (result.status === "back") { this.stepProjeto(); return; }
            if (result.status !== "submit" || !result.value) return;
            const tipo: "exposicao" | "marcos" = result.value.startsWith("🎯") ? "exposicao" : "marcos";
            this.stepNiveis(project, tipo);
        }, true).open();
    }

    private stepNiveis(project: ProjectCandidate, tipo: "exposicao" | "marcos") {
        new InputModal(this.app, "🌳 Número de níveis da árvore:", "6", async (result) => {
            if (result.status === "back") { this.stepTipo(project); return; }
            if (result.status !== "submit") return;
            const parsed = parseInt((result.value || "").trim(), 10);
            const numNiveis = Number.isFinite(parsed) && parsed > 0 ? parsed : 6;
            await this.createTree(project, tipo, numNiveis);
        }, true).open();
    }

    private async createTree(project: ProjectCandidate, tipo: "exposicao" | "marcos", numNiveis: number) {
        const skeleton = buildSkeleton(project.folder.name, tipo, numNiveis, rotuloDoAgente(definicoesDe(this.plugin)));

        // Próximo número livre no prefixo "NN - " da pasta do projeto
        const existingNums = project.folder.children
            .map(c => c.name.match(/^(\d+)\s*-/))
            .filter((m): m is RegExpMatchArray => !!m)
            .map(m => parseInt(m[1], 10));
        const nextNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1;
        const fileName = `${String(nextNum).padStart(2, "0")} - Árvore de Progressão.md`;
        const path = `${project.folder.path}/${fileName}`;

        if (this.app.vault.getAbstractFileByPath(path)) {
            new Notice(`⚠️ Já existe uma árvore em "${path}".`);
            return;
        }

        const file = await this.app.vault.create(path, skeleton);
        this.plugin.progressionEngine.invalidateDiscoveryCache();

        const arvoreCanvasPath = `${project.folder.path}/${project.folder.name} — Árvore.canvas`;
        await embedArvoreNodeInProjectCanvas(this.app, this.plugin, project.folder, arvoreCanvasPath);

        new Notice(`🌳 Árvore de Progressão criada para "${project.folder.name}"! Preencha o doc e rode "Reavaliar".`);
        this.app.workspace.getLeaf(false).openFile(file);
        this.onDone();
    }
}
