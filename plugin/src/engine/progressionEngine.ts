import { TFile, TFolder, Notice } from "obsidian";
import type DFMPlugin from "../main";
import { contarRegistros, parseRecordCriterion } from "./records";
import { notasDoVault } from "./recordsVault";

/**
 * Motor da Árvore de Progressão — porta de `200 - FUNCTIONS/Scripts/progression_tree.py`.
 * O script python continua sendo a especificação de comportamento (e o fallback de agente);
 * este engine reproduz parseTree/evaluate/syncDoc/unlockTasks com resultado idêntico.
 * D1: o doc `type: arvore_progressao` é a ÚNICA fonte da verdade — este engine só lê/escreve nele.
 */

export interface ProgressionTier {
    emoji: string;
    num: number;
    /** A letra do nível na trilha ("I" em `Nível I1`); sem letra, `""`. */
    prefixo?: string;
    /** A chave da trilha (`## Trilha — 🧱 Base` → "base"); doc sem trilhas, `""`. */
    trilha?: string;
    /** O nome da trilha como está no cabeçalho ("🧱 Base"). */
    trilhaNome?: string;
    nome: string;
    objetivo: string;
    criterio: string[];
    tarefas: string[];
    headerLine: string;
    status: "done" | "ativo" | "locked";
}

export interface ProgressionTree {
    caos?: string; // tag CAOS (um dos eixos de valor) p/ gamificação das tarefas
    file: TFile;
    projectLink: string;
    tiers: ProgressionTier[];
}

export const PROGRESSION_ICONS: Record<ProgressionTier["status"], string> = {
    done: "✅",
    ativo: "🟡",
    locked: "🔒"
};

export const PROGRESSION_COLORS: Record<ProgressionTier["status"], string | undefined> = {
    done: "4",
    ativo: "3",
    locked: undefined
};

/** Linha de nível: `## <status> Nível <letra opcional><n> — Nome` (gêmea de `LEVEL_RE`, python). */
export const LEVEL_HEADER_RE = /^## (✅|🟡|🔒)?\s*Nível ([A-Z]?)(\d+)\s*—\s*(.+)$/;
/** Abre uma trilha: `## Trilha — Nome` (gêmea de `TRAIL_RE`). */
export const TRAIL_HEADER_RE = /^## Trilha\s*—\s*(.+)$/;
/** Canvas com trilhas: uma coluna por trilha (gêmeas das constantes do python). */
export const TRAIL_COLUMN_WIDTH = 1100;
export const TRAIL_HEADER_HEIGHT = 80;
export const TRAIL_FIRST_TIER_Y = 140;

/**
 * O que faz: a chave de uma trilha a partir do nome ("🧱 Base" → "base").
 * Por quê: identifica a trilha nos ids do canvas e no `arvore_trilha` das tarefas;
 * gêmea de `trail_slug` (`progression_tree.py`).
 */
export function trailSlug(name: string): string {
    return String(name ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/** O que faz: o rótulo do nível, a letra da trilha e o número ("I1"; sem letra, "1"). */
export function tierLabel(tier: Pick<ProgressionTier, 'num' | 'prefixo'>): string {
    return `${tier.prefixo ?? ''}${tier.num}`;
}

/**
 * O que faz: os níveis agrupados por trilha, na ordem em que vieram. Doc sem trilhas = um grupo.
 * Por quê: cada trilha tem o seu nível ativo e as suas tarefas (plano de 22/10, seção 2).
 */
export function tierGroups(tiers: ProgressionTier[]): ProgressionTier[][] {
    const groups = new Map<string, ProgressionTier[]>();
    for (const tier of tiers) {
        const key = tier.trilha ?? '';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(tier);
    }
    return [...groups.values()];
}

/**
 * O que faz: o canvas da árvore (`<Projeto> — Árvore.canvas`) a partir dos níveis avaliados.
 * Por quê: uma função pura, gêmea de `canvas_payload` (`progression_tree.py`), que o juiz
 * confere contra o arquivo: os dois motores precisam gravar o mesmo canvas.
 * Entra → sai: os níveis e, para o nível ativo, o caminho da tarefa já criada em
 * `TaskNotes/Tasks` (ou `null`) → `{ nodes, edges }`. Sem trilhas, a coluna única de sempre;
 * com trilhas, uma coluna por trilha, lado a lado, com o título no topo.
 * Prova: tests/engine/progressionEngine.test.ts ("trilhas") e test_progression_trails (python).
 */
export function arvoreCanvasPayload(tiers: ProgressionTier[], activeTaskPath: (raw: string) => string | null): { nodes: any[]; edges: any[] } {
    if (!tiers.some(t => t.trilha)) return columnPayload(tiers, 0, 0, '', activeTaskPath);
    const nodes: any[] = [];
    const edges: any[] = [];
    tierGroups(tiers).forEach((group, index) => {
        const x0 = index * TRAIL_COLUMN_WIDTH;
        const slug = group[0].trilha ?? '';
        const headerId = slug ? `trilha-${slug}` : '';
        if (slug) {
            nodes.push({ id: headerId, type: 'text', x: x0, y: 0, width: 460, height: TRAIL_HEADER_HEIGHT, text: `# ${group[0].trilhaNome ?? ''}` });
        }
        const column = columnPayload(group, x0, TRAIL_FIRST_TIER_Y, slug ? `${slug}-` : '', activeTaskPath);
        nodes.push(...column.nodes);
        edges.push(...column.edges);
        if (slug && column.nodes.length) {
            const first = column.nodes[0].id;
            edges.push({ id: `e-${headerId}-${first}`, fromNode: headerId, fromSide: 'bottom', toNode: first, toSide: 'top' });
        }
    });
    return { nodes, edges };
}

/** Uma escada em coluna, a partir de (x0, y0); `idPrefix` separa os ids das trilhas. */
function columnPayload(tiers: ProgressionTier[], x0: number, y0: number, idPrefix: string, activeTaskPath: (raw: string) => string | null): { nodes: any[]; edges: any[] } {
    const nodes: any[] = [];
    const edges: any[] = [];
    let y = y0;
    let prevId: string | null = null;
    for (const t of tiers) {
        const tierId = `${idPrefix}tier${tierLabel(t)}`;
        const color = PROGRESSION_COLORS[t.status];
        const icon = PROGRESSION_ICONS[t.status];
        if (t.status === 'ativo') {
            const taskFiles: string[] = [];
            const textLines: string[] = [];
            for (const raw of t.tarefas) {
                if (raw.startsWith('(')) { textLines.push(raw); continue; }
                const taskPath = activeTaskPath(raw);
                if (taskPath) taskFiles.push(taskPath);
                else textLines.push(raw); // ainda não criada — mostra como texto no nó do nível
            }
            const headerHeight = 140 + 26 * textLines.length;
            nodes.push({
                id: tierId, type: 'text', x: x0, y, width: 460, height: headerHeight,
                text: `# ${icon} Nível ${tierLabel(t)} — ${t.nome}\n*${t.objetivo}*\n\n` + textLines.map(x => `- ${x}`).join('\n'),
                ...(color ? { color } : {})
            });
            let taskY = y;
            taskFiles.forEach((path, idx) => {
                const taskNodeId = `${tierId}-task${idx}`;
                nodes.push({ id: taskNodeId, type: 'file', file: path, x: x0 + 560, y: taskY, width: 400, height: 150 });
                edges.push({ id: `e-${tierId}-task${idx}`, fromNode: tierId, fromSide: 'right', toNode: taskNodeId, toSide: 'left' });
                taskY += 180;
            });
            y += Math.max(headerHeight, taskFiles.length * 180) + 60;
        } else {
            const height = 140 + 26 * t.tarefas.length;
            nodes.push({
                id: tierId, type: 'text', x: x0, y, width: 460, height,
                text: `# ${icon} Nível ${tierLabel(t)} — ${t.nome}\n*${t.objetivo}*\n\n` + t.tarefas.map(x => `- ${x}`).join('\n'),
                ...(color ? { color } : {})
            });
            y += height + 60;
        }
        if (prevId) edges.push({ id: `e-${prevId}-${tierId}`, fromNode: prevId, fromSide: 'bottom', toNode: tierId, toSide: 'top' });
        prevId = tierId;
    }
    return { nodes, edges };
}

/** Remove caracteres ilegais de nome de arquivo e colapsa espaços — espelha o python. Usado
 *  tanto na criação da tarefa (unlockTasks) quanto no render do canvas, para achar o mesmo arquivo.
 *  O default acompanha os call sites (80): com 60, um call site que omitisse o limite
 *  truncava o nome e o matcher procurava no canvas um basename que não existe. */
export function sanitizeArvoreName(desc: string, maxLen = 80): string {
    const noIllegal = desc.replace(/[\\/:*?"<>|]/g, " ");
    const collapsed = noIllegal.replace(/\s+/g, " ");
    return collapsed.slice(0, maxLen).trim();
}

/**
 * O que faz: uma linha de tarefa do nível ("Descrição | id: slug | due: +7d | prio: high | week: atual |
 * tempo: 60") lida: o nome do arquivo, os metadados, o prazo e a semana resolvidos em hoje.
 * Erro e ataque: o placeholder adaptativo ("(…)") e a linha sem nome dão `null`; prioridade fora da
 * lista vira `normal`. Uma regra só para o desbloqueio e a proposta.
 */
export function linhaDaArvore(raw: string, hoje: any): { name: string; meta: Record<string, string>; due: string; week: string; prio: string; tempo: string } | null {
    if (raw.startsWith("(")) return null; // placeholders adaptativos
    const parts = raw.split("|").map(p => p.trim());
    const meta: Record<string, string> = {};
    for (const p of parts.slice(1)) {
        const idx = p.indexOf(":");
        if (idx > -1) meta[p.slice(0, idx).trim().toLowerCase()] = p.slice(idx + 1).trim();
    }
    let due = meta["due"] || "";
    const relMatch = due.match(/^\+(\d+)d$/);
    if (relMatch) due = hoje.clone().add(parseInt(relMatch[1], 10), "days").format("YYYY-MM-DD");
    let week = meta["week"] || "";
    if (week === "atual") week = hoje.format("GGGG-[W]WW");
    let prio = meta["prio"] || "normal";
    if (!["high", "normal", "low", "none"].includes(prio)) prio = "normal";
    const name = sanitizeArvoreName(parts[0], 80);
    return name ? { name, meta, due, week, prio, tempo: meta["tempo"] || "" } : null;
}

export class ProgressionEngine {
    private plugin: DFMPlugin;
    private discoveryCache: TFile[] | null = null;

    constructor(plugin: DFMPlugin) {
        this.plugin = plugin;
    }

    private get app() {
        return this.plugin.app;
    }

    invalidateDiscoveryCache() {
        this.discoveryCache = null;
    }

    /** Varre 100 - AREAS/**\/*.md por frontmatter type: arvore_progressao (cache até invalidação). */
    discoverTrees(): TFile[] {
        if (this.discoveryCache) return this.discoveryCache;
        const found = this.app.vault.getMarkdownFiles().filter(f => {
            if (!f.path.startsWith("100 - AREAS")) return false;
            const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
            return fm?.type === "arvore_progressao";
        });
        this.discoveryCache = found;
        return found;
    }

    parseTree(file: TFile, text: string): ProgressionTree {
        const projMatch = text.match(/project:\s*"?\[\[(.+?)\]\]"?/);
        const projectLink = projMatch ? projMatch[1] : "?";
        const caosMatch = text.match(/^caos:\s*(\w+)/m);
        const caos = caosMatch ? caosMatch[1] : "";

        const tiers: ProgressionTier[] = [];
        let cur: ProgressionTier | null = null;
        let trilha = "";
        let trilhaNome = "";
        const ordem = new Map<string, number>();

        for (const line of text.split("\n")) {
            const h = line.match(LEVEL_HEADER_RE);
            // guarda anti-agente-fraco: header que PARECE nível mas não parseia = erro alto,
            // senão o nível some da árvore em silêncio (travessão — obrigatório, não - ou –)
            if (!h && /^##.*N[íi]vel/.test(line)) {
                new Notice(
                    `⚠️ Árvore "${file.basename}" — HEADER MALFORMADO (nível ignorado!): ${line.trim()}\nFormato exato: ## 🔒 Nível N — Nome (emoji + travessão —)`,
                    12000
                );
            }
            if (!h && line.startsWith("## ")) {
                cur = null; // seção que não é nível (ex.: Changelog) encerra o nível anterior
                // `## Trilha — Nome` abre uma trilha; qualquer outra seção a encerra.
                const trail = line.match(TRAIL_HEADER_RE);
                if (trail) {
                    trilhaNome = trail[1].trim();
                    trilha = trailSlug(trilhaNome);
                    if (!ordem.has(trilha)) ordem.set(trilha, ordem.size);
                } else {
                    trilha = "";
                    trilhaNome = "";
                }
                continue;
            }
            if (h) {
                cur = {
                    emoji: h[1] || "🔒",
                    prefixo: h[2] || "",
                    num: parseInt(h[3], 10),
                    nome: h[4].trim(),
                    objetivo: "",
                    criterio: ["manual"],
                    tarefas: [],
                    headerLine: line,
                    status: "locked",
                    trilha,
                    trilhaNome
                };
                tiers.push(cur);
                continue;
            }
            if (!cur) continue;
            if (line.startsWith("> objetivo:")) {
                cur.objetivo = line.slice(line.indexOf(":") + 1).trim();
            } else if (line.startsWith("criterio:")) {
                cur.criterio = line.slice(line.indexOf(":") + 1).split("|").map(p => p.trim());
            } else if (/^- /.test(line)) {
                cur.tarefas.push(line.slice(2).trim());
            }
        }

        // Sem trilhas, a ordem é a do número (como sempre); com trilhas, a da trilha e depois o número.
        const rank = (t: ProgressionTier) => ordem.get(t.trilha ?? "") ?? -1;
        tiers.sort((a, b) => rank(a) - rank(b) || a.num - b.num);
        return { file, projectLink, tiers, caos };
    }

    /** Arquivos correspondentes: prefere arvore_id; só sem match usa basename legado. */
    private taskFilesInTaskNotes(desc: string): TFile[] {
        const idMatch = desc.match(/\|\s*id:\s*([^|]+)/i);
        const arvoreId = idMatch?.[1]?.trim();
        const base = sanitizeArvoreName(desc.split('|')[0], 80).toLowerCase();
        if (!base) return [];
        const files = (this.app.vault.getMarkdownFiles?.() || [])
            .filter((f: TFile) => f.path.startsWith("TaskNotes/"));
        const idMatches = files.filter((f: TFile) => {
            const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
            const fileId = String(fm?.arvore_id || '').trim();
            return Boolean(arvoreId && fileId === arvoreId);
        });
        if (idMatches.length) return idMatches;
        return files.filter((f: TFile) => {
            const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
            return !fm?.arvore_id && f.basename.toLowerCase() === base;
        });
    }

    /** Primeiro arquivo do TaskNotes com este basename, mesmo que já tenha `arvore_id` de
     *  OUTRO valor — espelha o `by_name` do python (`index_existing_tasks`), que indexa todo
     *  o TaskNotes sem filtrar id. É o que impede uma tarefa arquivada/renomeada de virar
     *  duplicata só porque a linha da árvore ganhou um id novo. */
    private taskFileByBasenameInTaskNotes(desc: string): TFile | null {
        const base = sanitizeArvoreName(desc.split('|')[0], 80).toLowerCase();
        if (!base) return null;
        const files = (this.app.vault.getMarkdownFiles?.() || [])
            .filter((f: TFile) => f.path.startsWith("TaskNotes/"));
        return files.find((f: TFile) => f.basename.toLowerCase() === base) || null;
    }

    /** Tarefa ativa para o Canvas; Archive continua evidência, não nó operacional. */
    activeTaskFileInTaskNotes(desc: string): TFile | null {
        return this.taskFilesInTaskNotes(desc)
            .find(file => file.path.startsWith("TaskNotes/Tasks/")) || null;
    }

    /** done/cancelled em qualquer subpasta de TaskNotes é resolução terminal. */
    private taskDoneInTaskNotes(desc: string): boolean {
        return this.taskFilesInTaskNotes(desc).some(file => {
            const status = this.app.metadataCache.getFileCache(file)?.frontmatter?.status;
            return status === "done" || status === "cancelled";
        });
    }

    private criterioOk(tier: ProgressionTier): boolean {
        const kind = tier.criterio[0];
        if (kind === "manual") {
            return tier.emoji === "✅";
        }
        if (kind === "contador" && tier.criterio.length === 3) {
            const pasta = tier.criterio[1];
            const n = parseInt(tier.criterio[2], 10);
            const folder = this.app.vault.getAbstractFileByPath(pasta);
            if (!(folder instanceof TFolder)) return false;
            const count = folder.children.filter(c => c instanceof TFile && c.extension === "md").length;
            return count >= n;
        }
        // `registros | <tipo>[; campo=valor] | <n>` (núcleo, 21/10): n registros do tipo no
        // vault inteiro, cumulativo; a gêmea em Python é `contar_registros`.
        if (kind === "registros" && tier.criterio.length === 3) {
            const consulta = parseRecordCriterion(tier.criterio[1]);
            const n = parseInt(tier.criterio[2], 10);
            if (!consulta || !Number.isFinite(n)) return false;
            return contarRegistros(consulta, notasDoVault(this.app)) >= n;
        }
        if (kind === "tarefas") {
            if (tier.tarefas.length === 0) return false;
            return tier.tarefas.every(t => this.taskDoneInTaskNotes(t));
        }
        return false;
    }

    /** done = critério cumprido OU header ✅; primeiro não-done de cada trilha = ativo; resto locked.
     *  Devolve o primeiro nível recém-ativado (🔒 → 🟡), ou null. Doc sem trilhas = uma trilha só. */
    evaluate(tree: ProgressionTree): ProgressionTier | null {
        for (const group of tierGroups(tree.tiers)) {
            let ativoAtribuido = false;
            for (const t of group) {
                const done = this.criterioOk(t) || t.emoji === "✅";
                if (done) {
                    t.status = "done";
                } else if (!ativoAtribuido) {
                    t.status = "ativo";
                    ativoAtribuido = true;
                } else {
                    t.status = "locked";
                }
            }
        }
        return tree.tiers.find(t => t.status === "ativo" && t.emoji === "🔒") ?? null;
    }

    /** Atualiza os emojis de status nos headers do doc (fonte da verdade), via vault.process. */
    async syncDoc(tree: ProgressionTree): Promise<void> {
        await this.app.vault.process(tree.file, (data) => {
            let text = data;
            for (const t of tree.tiers) {
                const icon = PROGRESSION_ICONS[t.status];
                if (icon !== t.emoji) {
                    text = text.replace(t.headerLine, `## ${icon} Nível ${tierLabel(t)} — ${t.nome}`);
                }
            }
            return text;
        });
    }

    /** Carimba `arvore_id` numa tarefa que casou pelo nome e ainda não tem identidade — espelha
     *  `stamp_arvore_id` do python. Migração de uma vez: só frontmatter (processFrontMatter),
     *  nenhuma outra chave é tocada, nenhuma tarefa é criada e nada é escrito se já houver id. */
    private async stampArvoreId(files: TFile[], treeId?: string): Promise<void> {
        const id = String(treeId || "").trim();
        if (!id) return;
        const fileManager: any = (this.app as any).fileManager;
        if (!fileManager?.processFrontMatter) return; // harness/versão sem a API: não escreve nada
        // Um arquivo só, como o `by_name.setdefault` do python: o mesmo basename existe em
        // Tasks/ e Archive/ (tarefa arquivada), e carimbar os dois duplicaria a identidade.
        const file = files.find(f => f.path.startsWith("TaskNotes/Tasks/")) || files[0];
        if (!file) return;
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
        if (String(fm?.arvore_id || "").trim()) return; // já tem identidade — idempotente
        try {
            await fileManager.processFrontMatter(file, (front: Record<string, unknown>) => {
                if (String(front?.arvore_id || "").trim()) return; // recheca no frontmatter real
                front.arvore_id = id;
            });
        } catch (e) {
            // processFrontMatter pode rejeitar (ex.: YAMLParseError). O carimbo é migração
            // acessória: falhar aqui não pode abortar a criação das demais tarefas do nível.
            console.error(`DFM stampArvoreId: ${file.path}: ${e?.message || e}`);
        }
    }

    /**
     * O que faz: as tarefas do nível que ainda não existem no TaskNotes (nem em Tasks, nem em Archive),
     * como propostas na triagem da Missão: o título, o projeto da árvore, a semana da linha (ou a de
     * hoje) e os campos da árvore (`arvore_id`, `arvore_nivel`, `arvore_trilha`, prazo, prioridade,
     * estimativa). Quem cria é o aceite dele (Y), pelo Novo, com o Desfazer.
     * Por quê: a fila do §6 (item 2, 02/11/2026): sem a criação automática, o nível desbloqueado não
     * fazia nada; a proposta é o mesmo caminho das do agente (um jeito por função).
     * Erro e ataque: a tarefa que já existe (pelo id ou pelo nome) só ganha o carimbo do id, como no
     * desbloqueio; sem a Missão carregada, nada se propõe (a próxima reavaliação propõe); a fila
     * cheia ou o projeto que não está ativo descartam a proposta, sem quebrar a reavaliação.
     * Prova: tests/engine/progressionPropostas.test.ts.
     */
    async proporTarefas(tree: ProgressionTree, tier: ProgressionTier): Promise<number> {
        const fila = (this.plugin as any).board?.propostas;
        if (!fila?.proporDaArvore) return 0;
        const hoje = (window as any).moment();
        let propostas = 0;
        for (const raw of tier.tarefas) {
            const l = linhaDaArvore(raw, hoje);
            if (!l) continue;
            const existentes = this.taskFilesInTaskNotes(raw);
            if (existentes.length) { await this.stampArvoreId(existentes, l.meta.id); continue; }
            const porNome = this.taskFileByBasenameInTaskNotes(raw);
            if (porNome) { await this.stampArvoreId([porNome], l.meta.id); continue; }
            if (this.app.vault.getAbstractFileByPath(`TaskNotes/Tasks/${l.name}.md`)) continue;
            const campos: Record<string, string | number | string[]> = {
                tags: ["task", "arvore", ...(tree.caos ? [tree.caos] : [])],
                priority: l.prio,
                arvore_nivel: tierLabel(tier),
            };
            if (l.due) campos.due = l.due;
            if (l.tempo && Number.isFinite(Number(l.tempo))) campos.timeEstimate = Number(l.tempo);
            if (l.meta.id) campos.arvore_id = l.meta.id;
            if (tier.trilha) campos.arvore_trilha = tier.trilha;
            try {
                const ok = await fila.proporDaArvore({
                    titulo: l.name,
                    projeto: tree.projectLink,
                    semana: l.week || undefined,
                    campos,
                    porque: `🌳 Nível ${tierLabel(tier)} (${tier.nome}) da Árvore de ${tree.projectLink}`,
                });
                if (ok) propostas++;
            } catch (e) {
                console.error(`DFM proporTarefas: ${l.name}: ${(e as Error)?.message || e}`);
            }
        }
        return propostas;
    }

    /** Cria as tarefas do nível no TaskNotes — mesmo shape de frontmatter do createTask existente. */
    async unlockTasks(tree: ProgressionTree, tier: ProgressionTier): Promise<number> {
        let created = 0;
        const hoje = (window as any).moment();

        for (const raw of tier.tarefas) {
            const l = linhaDaArvore(raw, hoje);
            if (!l) continue;
            const { meta, due, week, prio, tempo, name } = l;
            const existentes = this.taskFilesInTaskNotes(raw);
            if (existentes.length) {
                // `id` novo numa linha cuja tarefa já existe pelo nome: carimba em vez de duplicar.
                await this.stampArvoreId(existentes, meta.id);
                continue; // inclui Archive e identidade estável
            }
            // Nome em TODO o TaskNotes antes de concluir que a tarefa não existe: o matcher
            // ignora arquivo com `arvore_id` de outro valor, e sem esta busca uma tarefa
            // arquivada/renomeada seria recriada como duplicata (python: `by_name`).
            const porNome = this.taskFileByBasenameInTaskNotes(raw);
            if (porNome) {
                await this.stampArvoreId([porNome], meta.id);
                continue;
            }
            const path = `TaskNotes/Tasks/${name}.md`;
            if (this.app.vault.getAbstractFileByPath(path)) continue; // nunca duplicar

            let extras = "";
            if (due) extras += `due: ${due}\n`;
            if (week) extras += `week: "${week}"\n`;
            if (tempo) extras += `timeEstimate: ${tempo}\n`;
            if (meta.id) extras += `arvore_id: ${JSON.stringify(meta.id)}\n`;

            const hojeStr = hoje.format("YYYY-MM-DD");
            const caosTag = tree.caos ? `, ${tree.caos}` : "";
            const trilhaLine = tier.trilha ? `arvore_trilha: ${tier.trilha}\n` : "";
            const content = `---\ntags: [task, arvore${caosTag}]\ntype: task\nstatus: next-action\npriority: ${prio}\nscheduled: ${hojeStr}\n${extras}projects: ['[[${tree.projectLink}]]']\narvore_nivel: ${tierLabel(tier)}\n${trilhaLine}archived: false\n---\n\n# ${name}\n\n> 🌳 Desbloqueada pelo Nível ${tierLabel(tier)} (${tier.nome}) — prazos resolvidos na data do desbloqueio (${hojeStr}).\n`;

            await this.app.vault.create(path, content);
            created++;
        }

        return created;
    }

    /** Pipeline completo para uma árvore: parse → evaluate → syncDoc → render canvas → unlockTasks. */
    async reevaluate(file: TFile, opts: { autoCriarTarefas: boolean; notificarDesbloqueio: boolean }): Promise<{ tree: ProgressionTree; novoAtivo: ProgressionTier | null; tasksCreated: number }> {
        const text = await this.app.vault.read(file);
        const tree = this.parseTree(file, text);
        const novoAtivo = this.evaluate(tree);
        await this.syncDoc(tree);
        await this.plugin.canvasEngine.syncManager.generateArvoreCanvas(tree);

        let tasksCreated = 0;
        // Cada trilha tem o seu nível ativo (doc sem trilhas = uma trilha só, como sempre).
        // O ativo de sempre é reprocessado de propósito: a tarefa nova escrita na lista
        // adaptativa (P7) nasce sem esperar desbloqueio; a busca no TaskNotes evita duplicar.
        // Sem a criação automática (o padrão desde 30/10/2026), as tarefas do nível viram
        // propostas na triagem da Missão (02/11): a automação sugere a rota, e quem usa muda a rota.
        for (const group of tierGroups(tree.tiers)) {
            const ativo = group.find(t => t.status === "ativo");
            if (!ativo) continue;
            if (ativo.emoji === "🔒" && opts.notificarDesbloqueio) {
                const como = opts.autoCriarTarefas ? "" : " · as tarefas dele estão nas propostas da triagem";
                new Notice(`🔓 Nível ${tierLabel(ativo)} desbloqueado em ${tree.projectLink}${como}`, 8000);
            }
            if (opts.autoCriarTarefas) tasksCreated += await this.unlockTasks(tree, ativo);
            else await this.proporTarefas(tree, ativo);
        }

        return { tree, novoAtivo, tasksCreated };
    }

    async reevaluateAll(opts: { autoCriarTarefas: boolean; notificarDesbloqueio: boolean }): Promise<void> {
        for (const file of this.discoverTrees()) {
            await this.reevaluate(file, opts);
        }
    }

    /** Reavalia só a árvore do projeto dado (usada pelo gatilho de evento task-changed). */
    async reevaluateForProject(projectBasename: string, opts: { autoCriarTarefas: boolean; notificarDesbloqueio: boolean }): Promise<void> {
        for (const file of this.discoverTrees()) {
            const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
            const projRaw = fm?.project;
            const projName = typeof projRaw === "string" ? projRaw.replace(/^\[\[/, "").replace(/\]\]$/, "") : "";
            if (projName === projectBasename) {
                await this.reevaluate(file, opts);
            }
        }
    }
}
