
import React, { useState, useEffect, useCallback } from 'react';
import { XIcon, TrashIcon, FolderOpenIcon, SpinnerIcon } from './icons';
import { IS_TAURI, resolveImageUrl } from '../services/tauriAdapter';
import type { ProjectListEntry } from '../services/tauriAdapter';

const STYLE_NAMES: Record<string, string> = {
    'dalle-chibi': '프리미엄',
    'dalle-chibi': 'DALL-E 치비',
    'ghibli-anime': '지브리 애니메',
    'webtoon-line': '웹툰 라인',
    'custom': '커스텀',
};

interface ProjectListModalProps {
    isOpen: boolean;
    onClose: () => void;
    onOpenProject: (projectId: string) => Promise<void>;
    onDeleteProject: (projectId: string) => Promise<void>;
    onListProjects: () => Promise<ProjectListEntry[]>;
    currentProjectId: string | null;
}

export const ProjectListModal: React.FC<ProjectListModalProps> = ({
    isOpen,
    onClose,
    onOpenProject,
    onDeleteProject,
    onListProjects,
    currentProjectId,
}) => {
    const [projects, setProjects] = useState<ProjectListEntry[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [thumbnails, setThumbnails] = useState<Record<string, string>>({});

    const loadProjects = useCallback(async () => {
        setIsLoading(true);
        try {
            const list = await onListProjects();
            setProjects(list);
        } catch (err) {
            console.error('프로젝트 목록 로드 실패:', err);
        } finally {
            setIsLoading(false);
        }
    }, [onListProjects]);

    // 썸네일 lazy load — 목록 표시 후 백그라운드에서 점진적 로드
    useEffect(() => {
        if (projects.length === 0) return;
        let cancelled = false;
        const loadThumbs = async () => {
            const batch: Record<string, string> = {};
            for (const p of projects) {
                if (cancelled) break;
                if (p.thumbnailPath && !thumbnails[p.id]) {
                    try {
                        batch[p.id] = await resolveImageUrl(p.thumbnailPath);
                        // 5개마다 한번씩 state 업데이트 (렌더 최소화)
                        if (Object.keys(batch).length % 5 === 0) {
                            setThumbnails(prev => ({ ...prev, ...batch }));
                        }
                    } catch { /* skip */ }
                }
            }
            if (!cancelled && Object.keys(batch).length > 0) {
                setThumbnails(prev => ({ ...prev, ...batch }));
            }
        };
        loadThumbs();
        return () => { cancelled = true; };
    }, [projects]);

    useEffect(() => {
        if (isOpen) { setThumbnails({}); loadProjects(); }
    }, [isOpen, loadProjects]);

    const handleDelete = useCallback(async (e: React.MouseEvent, project: ProjectListEntry) => {
        e.stopPropagation();
        if (!window.confirm(`"${project.title}" 프로젝트를 삭제하시겠습니까?\n이미지와 데이터가 모두 삭제됩니다.`)) return;
        try {
            await onDeleteProject(project.id);
            setProjects(prev => prev.filter(p => p.id !== project.id));
        } catch (err) {
            console.error('삭제 실패:', err);
        }
    }, [onDeleteProject]);

    const handleOpen = useCallback(async (project: ProjectListEntry) => {
        await onOpenProject(project.id);
        onClose();
    }, [onOpenProject, onClose]);

    const formatDate = (dateStr: string) => {
        try {
            const d = new Date(dateStr);
            const now = new Date();
            const diff = now.getTime() - d.getTime();
            const mins = Math.floor(diff / 60000);
            if (mins < 1) return '방금 전';
            if (mins < 60) return `${mins}분 전`;
            const hours = Math.floor(mins / 60);
            if (hours < 24) return `${hours}시간 전`;
            const days = Math.floor(hours / 24);
            if (days < 7) return `${days}일 전`;
            return `${d.getMonth() + 1}/${d.getDate()}`;
        } catch { return ''; }
    };

    /** 남은 일수 계산 (30일 기준) */
    const getDaysLeft = (dateStr: string): number => {
        try {
            const d = new Date(dateStr);
            const now = new Date();
            const elapsed = Math.floor((now.getTime() - d.getTime()) / 86400000);
            return Math.max(0, 30 - elapsed);
        } catch { return 30; }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4 animate-fade-in">
            <div className="bg-zinc-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
                <div className="flex justify-between items-center p-4 border-b border-zinc-700">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <FolderOpenIcon className="w-5 h-5 text-zinc-400" />
                        Projects
                        <span className="text-xs text-zinc-500 font-normal ml-1">{projects.length}개</span>
                    </h2>
                    <button onClick={onClose} className="p-2 rounded-full text-zinc-400 hover:bg-zinc-700">
                        <XIcon className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <SpinnerIcon className="w-6 h-6 text-orange-400" />
                        </div>
                    ) : projects.length === 0 ? (
                        <div className="text-center py-12 text-zinc-500">
                            <FolderOpenIcon className="w-10 h-10 mx-auto mb-3 opacity-30" />
                            <p className="text-sm">저장된 프로젝트가 없습니다.</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {projects.filter(p => p.id !== currentProjectId).map((project) => {
                                const daysLeft = getDaysLeft(project.updatedAt);
                                const isUrgent = daysLeft <= 7;
                                const isWarning = daysLeft <= 14 && daysLeft > 7;
                                return (
                                    <div
                                        key={project.id}
                                        onClick={() => handleOpen(project)}
                                        className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                                            isUrgent
                                                ? 'bg-red-950/20 border-red-900/40 hover:border-red-700/60 hover:bg-red-950/30'
                                                : 'bg-zinc-900/50 border-zinc-700 hover:border-zinc-500/50 hover:bg-zinc-800/80'
                                        }`}
                                    >
                                        {/* 썸네일 */}
                                        <div className="w-14 h-14 rounded-lg bg-zinc-800 flex-shrink-0 overflow-hidden border border-zinc-700">
                                            {thumbnails[project.id] ? (
                                                <img src={thumbnails[project.id]} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs">No img</div>
                                            )}
                                        </div>

                                        {/* 정보 */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="font-semibold text-sm text-zinc-100 truncate">{project.title || '제목 없음'}</p>
                                                {isUrgent && (
                                                    <span className="px-1.5 py-0.5 text-[9px] rounded-full bg-red-900/60 text-red-300 font-bold flex-shrink-0">
                                                        D-{daysLeft}
                                                    </span>
                                                )}
                                                {isWarning && (
                                                    <span className="px-1.5 py-0.5 text-[9px] rounded-full bg-amber-900/50 text-amber-300 font-bold flex-shrink-0">
                                                        D-{daysLeft}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 mt-1 text-[11px] text-zinc-500">
                                                <span>{project.cutCount || 0}컷</span>
                                                <span>·</span>
                                                {project.artStyle && (
                                                    <>
                                                        <span className="px-1.5 py-0.5 text-[9px] rounded-full bg-orange-900/50 text-orange-300">{STYLE_NAMES[project.artStyle] || project.artStyle}</span>
                                                        <span>·</span>
                                                    </>
                                                )}
                                                <span>{formatDate(project.updatedAt)}</span>
                                            </div>
                                        </div>

                                        {/* 삭제 버튼 */}
                                        <button
                                            onClick={(e) => handleDelete(e, project)}
                                            className="p-2 text-zinc-600 hover:text-red-400 hover:bg-zinc-800 rounded-lg transition-colors flex-shrink-0"
                                            title="프로젝트 삭제"
                                        >
                                            <TrashIcon className="w-4 h-4" />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* 주의사항 */}
                {projects.length > 0 && (
                    <div className="px-4 pb-4 pt-2 border-t border-zinc-700/50">
                        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-zinc-900/60 border border-zinc-700/40">
                            <span className="text-[11px] mt-px flex-shrink-0">⚠️</span>
                            <p className="text-[10px] text-zinc-500 leading-relaxed">
                                마지막 수정 후 <span className="text-zinc-400 font-semibold">30일</span>이 지난 프로젝트는 앱 시작 시 자동 삭제됩니다.
                                보관이 필요한 프로젝트는 <span className="text-orange-400/70">Export</span>로 백업하세요.
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
