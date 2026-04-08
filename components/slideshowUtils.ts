// components/slideshowUtils.ts — 슬라이드쇼 유틸/캔버스 (SlideshowModal에서 분리)

import { GeneratedImage, Notification } from '../types';

// ── Types ──
export interface SlideshowItem {
    image: GeneratedImage | null;
    narration: string;
    audioDataUrls?: string[];
    cutNumber: string;
}

export interface VideoSegment {
    image: HTMLImageElement | null;
    narrationToDraw: string;
    narrationForLayout: string;
    audioSlice: AudioBuffer;
    duration: number;
    zoomTimeOffset: number;
    cutIndex: number;
}

// ── Constants ──
export const ZOOM_RATE_PER_SECOND = 0.03;

export const LOGO_DATA_URL = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAoDSURBVHhe7Vvrb9vGFh+9/xV0gE1i5wE5cBMfJgESpGmaBsmQdE2SDEmXNE2CBEiCBMjADbxy3LhO8hY+4sZx3fG4yW9/Xf+kF25s0+I4juM4jq939/vD1KmfOnWqfHrvu5v/4vj3l/j+w/l+GPL63D1sP9s/V8f66eR6hA9hYhA2BmFjEDYGYWMQNgbhI00Mgn09/VnC4c5+Qvj45/8D4fMfhY+xMQgbg7AxCBtBfAzCxhgEYWPi/25i4uO68f7VvV/vP52E5+vV3+fnF72IjcH2Eja/j+FfW8QgbAzCxiBsDMLGEDaGsDEIG4OwMQgbQ9gYhA2BmFjEDYGYWMQNgbhYxE2BmAhEDYGYSN8TML69u/fH+r0w03e9u3b19q+/0j6u71sP9s/V8f66eR6hA9hYhA2BmFjEDYGYWMQNgbhI9MbhKeffvrrDz8chO+f9+Hh4ev9/f1t/6P4vM4D3M/6z28uB4eHh5vxeDzz27fM3//tXb1eP5vNdnV+fn6kEHYGYSNwA5+R/d/r8Xj27dvX/T8S+3NxcXHJkiULt2/fPnnyZOfOnf0dCAkbww3Anp6euru72+329fX1u3btWlZWVlNTk+Li4u3t7d7e3n5DCAkbw42D7e3t7e3t7e3tNzc3z549a+PGjUuXLp0xY8bExMTc3Nzc3Ny8vLxAQED4Y4SNYUYGdnZ2lpWVzZ8/f86cOfPlyxcWFhYuLi4nJ6eBgYHu7u7+/n4hEDaGWQg0m82lpSUbNmzYvXv3tKlTx48fP3z48IEDB0aPHj1w4MA9e/ZUVVUlJiYmJiZWVlZ6enpqamp6/mP8y8bGRmNjY/P5vF6vX6/Xh4eHu7q6urq6mpubW1paWltbKz7QEDYGYSNwhk5JSVleXh4bGzs7O/v4+KSkpFRUVGhoaJiZmYWFhYaGhgcPHgAAQNgYhI3AGeTzeU1NLS0tLS0tLXV1dX1/f8ePHa2pq/v3vf9+xY8e4cWN7e/tly5ZFRUU9ePCg1Wo9PT39/PxCQkL27ds3Njb6/P4hEDYGYWMQB2h9ff0JEyYUFBTs379/8uTJQ4cOHT9+fP58+XPnzh04cODcuXObN28+cuRIQUFBVFRUUlJSVlZWUFDwyJEjhw8fnpycvHjx4rKysoCAgNzc3KAg7AzCxiBsDMLGEIgFAqFQqFQKBQKhUKhUqlcLjcbDIbX6w0EAmFjEDYGYWMQNkZhpP5/ADG5u8qC8J9QAAAAAElFTSuQmCC`;

// ── Pure Functions ──
export const decode = (base64: string): Uint8Array => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
    return bytes;
};

export const decodePCMAudioData = async (
    data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number
): Promise<AudioBuffer> => {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
    for (let channel = 0; channel < numChannels; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i++) channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
    return buffer;
};

export const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        const isLocal = src.startsWith('data:') || src.startsWith('blob:');
        const safeSrc = isLocal ? src : `${src}${src.includes('?') ? '&' : '?'}t=${Date.now()}`;
        img.src = safeSrc;
        img.onload = () => resolve(img);
        img.onerror = (err: Event | string) => reject(new Error(typeof err === 'string' ? err : `Failed to load image at ${src}`));
    });
};

export const getSfxOffsetByName = (name: string): number => {
    if (!name) return 0;
    const lower = name.toLowerCase();
    const whooshKeywords = ['whoosh', 'swing', 'slide', '휘릭', '휙', '사락', 'page', '책', '넘기'];
    const popKeywords = ['pop', 'click', 'hit', '탁', '뽁', '찰칵', '뾱'];
    if (whooshKeywords.some(k => lower.includes(k))) return 0.1;
    if (popKeywords.some(k => lower.includes(k))) return 0.04;
    return 0;
};

export const getSupportedMimeType = () => {
    const types = ['video/webm; codecs=vp9', 'video/webm; codecs=vp8', 'video/webm', 'video/mp4'];
    for (const type of types) { if (MediaRecorder.isTypeSupported(type)) return type; }
    return '';
};

// ── Canvas Rendering (pure functions) ──
export const measureAndWrapText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, shouldDraw: boolean): number => {
    if (!text) return 0;
    const allLines = text.split('\n');
    let currentY = y;
    for (const singleLine of allLines) {
        if (singleLine.trim() === '') { currentY += lineHeight * 0.5; continue; }
        const words = singleLine.split(' ');
        let line = '';
        for (let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            const metrics = ctx.measureText(testLine);
            if (metrics.width > maxWidth && n > 0) {
                if (shouldDraw) ctx.fillText(line.trim(), x, currentY);
                line = words[n] + ' '; currentY += lineHeight;
            } else line = testLine;
        }
        if (shouldDraw) ctx.fillText(line.trim(), x, currentY);
        currentY += lineHeight;
    }
    return currentY - y;
};

export const drawFrame = (ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, logoImg: HTMLImageElement, narration: string, narrationForLayout: string, title: string, scale: number = 1) => {
    const canvas = ctx.canvas;
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    const headerHeight = 254; ctx.fillStyle = '#FDEFC8'; ctx.fillRect(0, 0, canvasWidth, headerHeight);
    ctx.fillStyle = 'black'; ctx.font = 'bold 58px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('썰 타는중~', canvasWidth / 2, headerHeight - 64);
    ctx.drawImage(logoImg, canvasWidth - 140, (headerHeight - 80) / 2, 80, 80);
    ctx.fillStyle = '#475569'; ctx.fillRect(0, headerHeight, canvasWidth, 1);
    
    const contentPadding = 48; let currentY = headerHeight + contentPadding;
    ctx.fillStyle = '#1F2937'; ctx.font = '900 53px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    const titleHeight = measureAndWrapText(ctx, title, contentPadding, currentY, canvasWidth - contentPadding * 2, 64, true);
    currentY += titleHeight + 16;
    ctx.fillStyle = '#A1A1AA'; ctx.font = '33px sans-serif';
    const stats = `${String.fromCharCode(94, 94)} | 13:35 | 조회 15,488,575`; ctx.fillText(stats, contentPadding, currentY);
    currentY += 33 + 16; ctx.fillStyle = '#475569'; ctx.fillRect(0, currentY, canvasWidth, 1);
    
    const contentStartTop = currentY + 80;
    const lineHeight = 80;

    ctx.font = `bold 56px sans-serif`;
    const textBlockHeight = measureAndWrapText(ctx, narrationForLayout, canvasWidth / 2, 0, canvasWidth - contentPadding * 2, lineHeight, false);
    const contentDrawY = contentStartTop;

    ctx.fillStyle = '#374151'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    measureAndWrapText(ctx, narration, canvasWidth / 2, contentDrawY, canvasWidth - contentPadding * 2, lineHeight, true);
    
    if (img) {
        const spacing = 60;
        const imagePadding = 94;
        const boxWidth = canvasWidth - imagePadding * 2;
        const boxHeight = boxWidth;
        const imageY = contentDrawY + textBlockHeight + spacing;
        const boxX = imagePadding; const boxY = imageY;
        const imgAspectRatio = img.naturalWidth / img.naturalHeight; const boxAspectRatio = boxWidth / boxHeight;
        let finalDrawWidth, finalDrawHeight;
        if (imgAspectRatio > boxAspectRatio) { finalDrawHeight = boxHeight; finalDrawWidth = boxHeight * imgAspectRatio; } else { finalDrawWidth = boxWidth; finalDrawHeight = boxWidth / imgAspectRatio; }
        const finalX = boxX + (boxWidth - finalDrawWidth) / 2; const finalY = boxY + (boxHeight - finalDrawHeight) / 2;
        const scaledWidth = finalDrawWidth * scale; const scaledHeight = finalDrawHeight * scale;
        const scaledX = finalX - (scaledWidth - finalDrawWidth) / 2; const scaledY = finalY - (scaledHeight - finalDrawHeight) / 2;
        
        ctx.save();
        ctx.beginPath();
        const radius = 24;
        ctx.moveTo(boxX + radius, boxY); ctx.lineTo(boxX + boxWidth - radius, boxY);
        ctx.quadraticCurveTo(boxX + boxWidth, boxY, boxX + boxWidth, boxY + radius);
        ctx.lineTo(boxX + boxWidth, boxY + boxHeight - radius);
        ctx.quadraticCurveTo(boxX + boxWidth, boxY + boxHeight, boxX + boxWidth - radius, boxY + boxHeight);
        ctx.lineTo(boxX + radius, boxY + boxHeight);
        ctx.quadraticCurveTo(boxX, boxY + boxHeight, boxX, boxY + boxHeight - radius);
        ctx.lineTo(boxX, boxY + radius);
        ctx.quadraticCurveTo(boxX, boxY, boxX + radius, boxY);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, scaledX, scaledY, scaledWidth, scaledHeight);
        ctx.restore();
    }
};
