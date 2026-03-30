import React, { useRef, useEffect, useImperativeHandle, forwardRef, useState } from 'react';

interface MaskingCanvasProps {
  imageUrl: string;
  brushSize: number;
  mode: 'brush' | 'eraser';
}

export interface MaskingCanvasRef {
  getMaskAsBase64: () => string;
  clearMask: () => void;
  drawMaskFromUrl: (url: string) => void;
  invertMask: () => void;
}

export const MaskingCanvas = forwardRef<MaskingCanvasRef, MaskingCanvasProps>(({ imageUrl, brushSize, mode }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const isDrawingRef = useRef(false);
    
    const resizeCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas || !canvas.parentElement) return;
        const { width, height } = canvas.parentElement.getBoundingClientRect();
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
    };

    useEffect(() => {
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        return () => window.removeEventListener('resize', resizeCanvas);
    }, []);

    const getCanvasContext = () => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        return canvas.getContext('2d', { willReadFrequently: true });
    };

    const getPoint = (e: MouseEvent | TouchEvent): { x: number, y: number } | null => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        
        const clientX = 'touches' in e ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
        const clientY = 'touches' in e ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY;
        
        return { x: clientX - rect.left, y: clientY - rect.top };
    };
    
    const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault();
        const ctx = getCanvasContext();
        if (!ctx) return;
        isDrawingRef.current = true;
        
        const point = getPoint(e.nativeEvent);
        if (point) {
            ctx.beginPath();
            ctx.moveTo(point.x, point.y);
            ctx.lineWidth = brushSize;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            
            if (mode === 'brush') {
                ctx.globalCompositeOperation = 'source-over';
                ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)'; // Improved visibility red
            } else {
                ctx.globalCompositeOperation = 'destination-out';
            }
            ctx.stroke();
        }
    };

    const finishDrawing = (e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault();
        isDrawingRef.current = false;
        const ctx = getCanvasContext();
        if(ctx) ctx.closePath();
    };

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawingRef.current) return;
        e.preventDefault();
        const ctx = getCanvasContext();
        if (!ctx) return;

        const currentPoint = getPoint(e.nativeEvent);
        if (currentPoint) {
            ctx.lineTo(currentPoint.x, currentPoint.y);
            ctx.stroke();
        }
    };
    
    const clear = () => {
        const ctx = getCanvasContext();
        if (ctx) {
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        }
    };
    
    useImperativeHandle(ref, () => ({
        getMaskAsBase64: () => {
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext('2d');
            if (!canvas || !ctx) return '';

            const { width, height } = canvas;
            
            const maskCanvas = document.createElement('canvas');
            maskCanvas.width = width;
            maskCanvas.height = height;
            const maskCtx = maskCanvas.getContext('2d');
            if (!maskCtx) return '';

            maskCtx.fillStyle = 'black';
            maskCtx.fillRect(0, 0, width, height);
            
            // Draw visual mask as white
            maskCtx.globalCompositeOperation = 'source-over';
            maskCtx.drawImage(canvas, 0, 0);

            const maskImageData = maskCtx.getImageData(0,0,width,height);
            const data = maskImageData.data;
            for (let i = 0; i < data.length; i += 4) {
                if (data[i + 3] > 0) { // If pixel has alpha (drawn), make it white
                    data[i] = 255;
                    data[i+1] = 255;
                    data[i+2] = 255;
                    data[i+3] = 255;
                }
            }
            maskCtx.putImageData(maskImageData, 0, 0);

            return maskCanvas.toDataURL('image/png').split(',')[1];
        },
        clearMask: clear,
        drawMaskFromUrl: (url: string) => {
            const ctx = getCanvasContext();
            if (!ctx) return;
            const img = new Image();
            img.crossOrigin = 'anonymous';
            // CORS FIX: Cache buster
            const isLocal = url.startsWith('data:') || url.startsWith('blob:');
            const safeUrl = isLocal ? url : `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
            img.src = safeUrl;

            img.onload = () => {
                clear();

                const offscreenCanvas = document.createElement('canvas');
                offscreenCanvas.width = ctx.canvas.width;
                offscreenCanvas.height = ctx.canvas.height;
                const offscreenCtx = offscreenCanvas.getContext('2d');
                if (!offscreenCtx) return;

                offscreenCtx.drawImage(img, 0, 0, offscreenCanvas.width, offscreenCanvas.height);
                
                const imageData = offscreenCtx.getImageData(0, 0, offscreenCanvas.width, offscreenCanvas.height);
                const data = imageData.data;

                for (let i = 0; i < data.length; i += 4) {
                    if (data[i] > 200) { // is white
                        data[i] = 239;     // R
                        data[i + 1] = 68;  // G
                        data[i + 2] = 68;  // B
                        data[i + 3] = 153; // Alpha (0.6)
                    } else { // is black
                        data[i + 3] = 0; // Make transparent
                    }
                }
                
                offscreenCtx.putImageData(imageData, 0, 0);
                
                ctx.globalCompositeOperation = 'source-over';
                ctx.drawImage(offscreenCanvas, 0, 0);
            };
        },
        invertMask: () => {
            const ctx = getCanvasContext();
            const canvas = canvasRef.current;
            if (!ctx || !canvas) return;
            
            // Advanced inversion: Toggle between painted and unpainted areas
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = canvas.width;
            tempCanvas.height = canvas.height;
            const tempCtx = tempCanvas.getContext('2d');
            if (!tempCtx) return;

            tempCtx.fillStyle = 'rgba(239, 68, 68, 0.6)';
            tempCtx.fillRect(0, 0, canvas.width, canvas.height);
            tempCtx.globalCompositeOperation = 'destination-out';
            tempCtx.drawImage(canvas, 0, 0);

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.globalCompositeOperation = 'source-over';
            ctx.drawImage(tempCanvas, 0, 0);
        }
    }));

    return (
        <canvas
            ref={canvasRef}
            className="absolute inset-0 z-10 w-full h-full cursor-crosshair"
            onMouseDown={startDrawing}
            onMouseUp={finishDrawing}
            onMouseMove={draw}
            onMouseLeave={finishDrawing}
            onTouchStart={startDrawing}
            onTouchEnd={finishDrawing}
            onTouchMove={draw}
        />
    );
});