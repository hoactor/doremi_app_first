import { describe, expect, test } from 'vitest';
import { ProjectSaveCoordinator } from './appProjectActions';

describe('ProjectSaveCoordinator', () => {
    test('overlapping saves for one project finish in request order', async () => {
        const coordinator = new ProjectSaveCoordinator();
        const events: string[] = [];
        let releaseFirst!: () => void;
        const gate = new Promise<void>(resolve => { releaseFirst = resolve; });
        let markStarted!: () => void;
        const started = new Promise<void>(resolve => { markStarted = resolve; });

        const first = coordinator.enqueue('proj_a', async () => {
            events.push('first-start');
            markStarted();
            await gate;
            events.push('first-end');
        });
        const second = coordinator.enqueue('proj_a', async () => {
            events.push('second-start');
            events.push('second-end');
        });

        await started;
        expect(events).toEqual(['first-start']);
        releaseFirst();
        await Promise.all([first, second]);
        expect(events).toEqual(['first-start', 'first-end', 'second-start', 'second-end']);
    });

    test('blockAndDrain waits for the active save and rejects queued or future saves', async () => {
        const coordinator = new ProjectSaveCoordinator();
        let releaseActive!: () => void;
        const gate = new Promise<void>(resolve => { releaseActive = resolve; });
        let markStarted!: () => void;
        const started = new Promise<void>(resolve => { markStarted = resolve; });
        const active = coordinator.enqueue('proj_delete', async () => {
            markStarted();
            await gate;
        });
        const queued = coordinator.enqueue('proj_delete', async () => undefined);
        const queuedRejection = expect(queued).rejects.toThrow('삭제 중인 프로젝트 저장을 취소');
        await started;

        const drained = coordinator.blockAndDrain('proj_delete');
        await expect(coordinator.enqueue('proj_delete', async () => undefined))
            .rejects.toThrow('삭제 중이거나 삭제된');
        releaseActive();
        await active;
        await queuedRejection;
        await drained;
        expect(coordinator.isBlocked('proj_delete')).toBe(true);
    });
});
