import { TFile } from 'obsidian';
import type DFMPlugin from '../main';
import { DIA, diaNoTexto } from './dia';

/**
 * O registro dos hábitos marcados pelo próprio DFM: o protocolo concluído (`isHabit`,
 * `habitGroup`, `habitAlso`), o Pomodoro, o Comando do Dia, o bloco do agora e o 📖 Pelo
 * diário. Cada marca é uma data em `entries` da nota do hábito, uma por dia.
 *
 * Por quê aqui: o registro morava dentro do `GamificationManager`, mas não é pontuação.
 * Quando a gamificação foi arquivada (29/10/2026), ele saiu de lá sem
 * mudar o que faz (`ARQUIVO_GAMIFICACAO.md`). Prova: `tests/engine/habitLog.test.ts`.
 */

/**
 * Dia em que a marca do hábito entra: a data pedida (a de contexto do protocolo) ou
 * hoje. Dia futuro não é aceito — "só o dia futuro fica fechado" — e cai em hoje.
 */
export function habitDay(date?: string): string {
    const today = (window as any).moment().format("YYYY-MM-DD");
    if (typeof date !== "string" || !DIA.test(date)) return today;
    return date > today ? today : date;
}

export class HabitLog {
    plugin: DFMPlugin;

    constructor(plugin: DFMPlugin) {
        this.plugin = plugin;
    }

    getHabitTrackingConfig(protocolId: string, variables: any = {}) {
        const protocolObj = this.plugin.manager?.get(protocolId);
        const protocolName = protocolObj ? protocolObj.name : protocolId;
        const habitGroups: Record<string, { path: string; title: string }> = {
            act_daily: {
                path: "200 - FUNCTIONS/Habits/Tracker/07 - Prática ACT diária.md",
                title: "🎈 Praticar ACT — ao menos um protocolo"
            }
        };
        const group = habitGroups[protocolObj?.def?.habitGroup];
        const configuredHabitPath = typeof protocolObj?.def?.habitTrackerPath === 'string'
            ? protocolObj.def.habitTrackerPath.trim()
            : (group?.path ?? null);
        const configuredHabitTitle = typeof protocolObj?.def?.habitTrackerTitle === 'string'
            ? protocolObj.def.habitTrackerTitle.trim()
            : (group?.title ?? null);
        const selectedHabitPath = typeof variables.habito_path === 'string' && variables.habito_path.trim()
            ? variables.habito_path.trim()
            : configuredHabitPath;
        const selectedHabitName = typeof variables.habito_display === 'string' && variables.habito_display.trim()
            ? variables.habito_display.trim()
            : (typeof variables.habito === 'string' && variables.habito.trim()
                ? variables.habito.trim()
                : (configuredHabitTitle || protocolName));
        const trackerFolder = selectedHabitPath?.includes('/')
            ? selectedHabitPath.split('/').slice(0, -1).join('/')
            : "200 - FUNCTIONS/Habits/Tracker";
        const safeFileName = selectedHabitName.replace(/[\\/:*?"<>|]/g, "").trim();

        return {
            protocolName,
            selectedHabitPath,
            label: selectedHabitName,
            ledgerKey: selectedHabitPath ? `habit:${selectedHabitPath}` : `protocol:${protocolId}`,
            trackerFolder,
            filePath: selectedHabitPath || `${trackerFolder}/${safeFileName}.md`
        };
    }

    async upsertSectionEntry(filePath: string, header: string, entry: string, dedupeFragment: string | null = null) {
        const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
        if (!file || !(file instanceof TFile)) return;

        const current = await this.plugin.app.vault.read(file);
        const normalized = current.replace(/\r\n/g, "\n");
        const lines = normalized.split("\n");
        const targetHeader = header.trim();
        let headerIndex = lines.findIndex(line => line.trim() === targetHeader);

        if (headerIndex === -1) {
            const nextContent = `${normalized.trimEnd()}\n\n${targetHeader}\n${entry}\n`;
            await this.plugin.app.vault.modify(file, nextContent);
            return;
        }

        let nextHeaderIndex = lines.length;
        for (let i = headerIndex + 1; i < lines.length; i++) {
            if (/^#{1,6}\s/.test(lines[i])) {
                nextHeaderIndex = i;
                break;
            }
        }

        const sectionText = lines.slice(headerIndex, nextHeaderIndex).join("\n");
        if (dedupeFragment && sectionText.includes(dedupeFragment)) {
            return;
        }

        let insertIndex = headerIndex + 1;
        while (insertIndex < nextHeaderIndex && lines[insertIndex] === "") {
            insertIndex += 1;
        }

        lines.splice(insertIndex, 0, entry);
        await this.plugin.app.vault.modify(file, lines.join("\n"));
    }

    async syncHabitCentralNote(habitPath: string, createdFile: TFile, variables: any) {
        if (!habitPath || !createdFile) return;

        const timestamp = (window as any).moment().format("YYYY-MM-DD HH:mm");
        const link = `[[${createdFile.basename}]]`;
        const parts = [timestamp, link];

        if (variables.impacto) parts.push(variables.impacto);
        if (variables.reflexao) parts.push(variables.reflexao);

        parts.push("Execução registrada");

        await this.upsertSectionEntry(
            habitPath,
            "## 📈 Registro de Execuções",
            `- ${parts.join(" — ")}`,
            createdFile.basename
        );
    }

    /**
     * `date` (AAAA-MM-DD, opcional) é o dia a que a execução pertence — a data de
     * contexto do protocolo. O 🌙 às 00:30 com a Day de ontem aberta fecha ONTEM; pelo
     * relógio, o hábito caía no dia seguinte (e, num domingo, na semana seguinte).
     */
    async logHabit(protocolId: string, variables: any = {}, createdFile: TFile | null = null, date?: string) {
        const tracking = this.getHabitTrackingConfig(protocolId, variables);
        const trackerFolder = tracking.trackerFolder;
        const filePath = tracking.filePath;
        const today = habitDay(date);

        try {
            if (!this.plugin.app.vault.getAbstractFileByPath(trackerFolder)) {
                await this.plugin.app.vault.createFolder(trackerFolder);
            }

            const file = this.plugin.app.vault.getAbstractFileByPath(filePath);

            if (file && file instanceof TFile) {
                const recorded = await this.recordDailyHabitEntry(filePath, today);
                if (!recorded) return;
            } else {
                const fileContent = `---
title: "${tracking.label}"
source_protocol: "${protocolId}"
${tracking.selectedHabitPath ? `habit_note: "${tracking.selectedHabitPath}"\n` : ""}entries:
  - ${today}
type: habit
status: em_treino
tracking: protocol
protocol_id: "${protocolId}"
---

> 🤖 *Este arquivo mestre de tracking é sincronizado automaticamente pelo DFM Engine.*
`;
                await this.plugin.app.vault.create(filePath, fileContent);
            }

            if (createdFile) {
                await this.syncHabitCentralNote(tracking.selectedHabitPath, createdFile, variables);
            }

            await this.logExtraHabits(protocolId, variables, today);
        } catch (e) {
            console.error("DFM: Erro ao sincronizar Habit Tracker 21:", e);
        }
    }

    /**
     * Hábitos adicionais que a MESMA execução marca, sob condição.
     *
     * Caso que motivou: uma micro-prática 🧘 Apenas Sentado / Zazen é ao mesmo tempo a
     * prática ACT do dia (hábito 07, automático via `habitGroup`) e o treino formal de
     * meditação (hábito 10). O manual `008` já descrevia isso — "dois regimes do mesmo
     * gesto, não contagem dupla" — mas nada no código marcava o segundo.
     *
     * ACRESCENTA ao hábito principal, nunca substitui. `recordDailyHabitEntry` é
     * idempotente por dia, então repetir a prática não infla a contagem.
     *
     * Config (def.habitAlso, array):
     *   { "path": "…/10 - Meditacao.md", "condition": { "variable": "pratica", "value": "🧘 …" } }
     *   `value` aceita string ou array; sem `condition`, marca sempre.
     */
    async logExtraHabits(protocolId: string, variables: any = {}, date?: string) {
        const extras = this.plugin.manager?.get(protocolId)?.def?.habitAlso;
        if (!Array.isArray(extras)) return;

        for (const extra of extras) {
            if (!extra?.path) continue;
            const condition = extra.condition;
            if (condition?.variable) {
                const atual = variables[condition.variable];
                const esperado = condition.value;
                const bate = Array.isArray(esperado) ? esperado.includes(atual) : atual === esperado;
                if (!bate) continue;
            }
            await this.recordDailyHabitEntry(extra.path, date);
        }
    }

    /**
     * Registra uma única conclusão por dia em uma nota de hábito já existente.
     * Usado tanto por protocolos quanto por sinais verificáveis do TaskNotes.
     */
    async recordDailyHabitEntry(filePath: string, date?: string): Promise<boolean> {
        const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) {
            console.warn(`DFM: Nota de hábito não encontrada para tracking automático: ${filePath}`);
            return false;
        }

        const today = habitDay(date);
        let recorded = false;
        await this.plugin.app.fileManager.processFrontMatter(file, (fm: any) => {
            const entries = Array.isArray(fm.entries) ? fm.entries : (fm.entries ? [fm.entries] : []);
            const normalized = entries
                .map((entry: any) => diaNoTexto(String(entry ?? '')))
                .filter(Boolean);
            if (normalized.includes(today)) return;

            fm.entries = [...new Set([...normalized, today])].sort();
            recorded = true;
        });
        return recorded;
    }
}
