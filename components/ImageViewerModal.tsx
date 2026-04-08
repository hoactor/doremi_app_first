
import React, { useState, useEffect, useCallback } from 'react';
import { XIcon } from './icons';

interface ImageViewerModalProps {
    isOpen: boolean;
    onClose: () => void;
    imageUrl: string | null;
    altText?: string;
    prompt?: string;
}

export const ImageViewerModal: React.FC<ImageViewerModalProps> = ({ isOpen, onClose, imageUrl, altText, prompt }) => {
    const [isClosing, setIsClosing] = useState(false);

    const handleClose = useCallback(() => {
        setIsClosing(true);
        setTimeout(() => {
            onClose();
            setIsClosing(false);
        }, 300); // Animation duration
    }, [onClose]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                handleClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, handleClose]);

    if (!isOpen && !isClosing) return null;

    return (
        <div 
            className={`fixed inset-0 bg-black/95 z-[150] overflow-y-auto transition-opacity duration-300 ${isClosing ? 'animate-fade-out' : 'animate-fade-in'}`} 
            onClick={handleClose}
            aria-modal="true" 
            role="dialog"
        >
            <div className="min-h-screen flex items-center justify-center p-4 sm:p-8">
                {/* Content Wrapper */}
                <div 
                    className="relative flex flex-col gap-6 w-full max-w-7xl mx-auto my-8"
                    onClick={(e) => e.stopPropagation()} 
                >
                    {/* Fixed Close Button for easy access */}
                    <button 
                        onClick={handleClose} 
                        className="fixed top-6 right-6 z-[160] p-3 rounded-full text-white bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-600 shadow-2xl transition-all hover:scale-110 hover:rotate-90 backdrop-blur-md group"
                        aria-label="Close"
                        title="닫기 (ESC)"
                    >
                        <XIcon className="h-8 w-8 group-hover:text-red-400 transition-colors" />
                    </button>

                    {/* Image Container */}
                    <div className="overflow-hidden rounded-2xl shadow-2xl border border-zinc-800/50 bg-black">
                        <img 
                            src={imageUrl!} 
                            alt={altText || 'Enlarged view'} 
                            className="w-full h-auto object-contain block"
                        />
                    </div>
                    
                    {/* Prompt Container */}
                    {prompt && (
                        <div className="p-8 bg-zinc-900/90 rounded-2xl border border-zinc-700/50 backdrop-blur-xl shadow-2xl">
                            <h4 className="text-sm font-black text-orange-400 mb-4 uppercase tracking-[0.2em] flex items-center gap-4">
                                <span>Generation Prompt</span>
                                <div className="h-px flex-grow bg-gradient-to-r from-orange-500/50 to-transparent"></div>
                            </h4>
                            <div className="bg-black/30 p-6 rounded-xl border border-zinc-800/50">
                                <p className="text-base text-zinc-300 font-medium whitespace-pre-wrap break-words leading-loose font-mono selection:bg-orange-500/30 selection:text-white">
                                    {prompt}
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
