
import { AppAction } from './types';
import { UIState, initialUIState } from './appTypes';
import { sanitizeState } from './appUtils';

// --- Helper types ---

export interface ProjectActionHelpers {
    dispatch: React.Dispatch<AppAction>;
    stateRef: { current: any };
    addNotification: (message: string, type: 'success' | 'error' | 'info') => void;
    updateUIState: (update: Partial<UIState>) => void;
    setUIState: React.Dispatch<React.SetStateAction<UIState>>;
}

export function createProjectActions(h: ProjectActionHelpers) {

    const handleResetState = () => {
        h.dispatch({ type: 'RESET_STATE' });
        h.setUIState(initialUIState);
    };

    const handleExportProject = () => {
        const sanitizedState = sanitizeState(h.stateRef.current);
        const data = JSON.stringify(sanitizedState);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${h.stateRef.current.storyTitle || 'wvs_project'}.wvs_project`;
        a.click();
    };

    const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const parsed = JSON.parse(ev.target?.result as string);
                h.dispatch({ type: 'RESTORE_STATE', payload: parsed });
                h.setUIState(initialUIState);
            } catch (err) {
                h.addNotification('불러오기 실패', 'error');
            } finally {
                e.target.value = '';
            }
        };
        reader.readAsText(file);
    };

    const handleUploadProjectFile = async (file: File) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const parsed = JSON.parse(ev.target?.result as string);
                h.dispatch({ type: 'RESTORE_STATE', payload: parsed });
            } catch (e) {
                h.addNotification('실패', 'error');
            }
        };
        reader.readAsText(file);
    };

    return {
        handleExportProject,
        handleImportFile,
        handleUploadProjectFile,
        handleResetState,
    };
}
