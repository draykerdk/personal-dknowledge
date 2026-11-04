/**
 * O hospedeiro das visões antigas que ficam no painel (board/hostedPanels.ts), depois da remoção do
 * código aposentado (03/11/2026): as visões que a Missão absorveu não desenham mais, as que ficam
 * desenham, e cada uma que fica tem o nome no catálogo do painel (`LEGACY_PANELS`).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', () => {
    class Base { constructor(..._a: any[]) {} open() {} close() {} }
    return {
        App: class {}, Modal: Base, Notice: class { constructor(public message?: string) {} }, Setting: Base,
        SuggestModal: Base, FuzzySuggestModal: Base, TFile: class {}, TFolder: class {}, Menu: Base,
        Platform: { isMobile: false, isDesktopApp: true }, setIcon: () => undefined, moment: () => ({ format: () => '' }),
        normalizePath: (p: string) => p, ItemView: Base, MarkdownRenderChild: Base, Component: Base,
    };
});

import { HostedMissionPanels } from '../../src/board/hostedPanels';
import { LEGACY_PANELS } from '../../src/board/panelLayout';

const FICAM = ['matrix', 'habits', 'funnel', 'waiting', 'protocols', 'portfolioBoard', 'kanban', 'portfolioActions', 'projects',
    'trees', 'portfolioCompliance', 'areas', 'canvasTools', 'canvases', 'operatorCard', 'bench', 'integrity'];
const SAIRAM = ['capture', 'noteFactory', 'intent', 'drift', 'day', 'week', 'quarter', 'planPressure', 'plan', 'timeline', 'radar',
    'pressure', 'inbox', 'triage', 'mapModes', 'map', 'missionGraph'];

describe('as visões hospedadas no painel', () => {
    const hosted = new HostedMissionPanels({ app: {} } as any, () => undefined, async () => undefined);

    it('as que ficam desenham, e cada uma tem o nome no catálogo', () => {
        for (const id of FICAM) {
            expect(hosted.has(id), id).toBe(true);
            expect(LEGACY_PANELS[id], id).toBeDefined();
        }
    });

    it('as que a Missão absorveu (aposentadas em 02/11, removidas em 03/11) não desenham', () => {
        for (const id of SAIRAM) expect(hosted.has(id), id).toBe(false);
        // Uma visão que não existe responde `false`, e o painel diz que ela não existe mais.
        expect(hosted.renderPanel('map', {} as any, {} as any)).toBe(false);
    });
});
