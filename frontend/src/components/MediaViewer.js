import React from 'react';
import { X, Download } from 'lucide-react';

export const MediaViewer = ({ src, type, fileName, onClose }) => {
  if (!src) return null;

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = src;
    a.download = fileName || (type === 'video' ? 'video.mp4' : 'image.jpg');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 bg-black/90 z-[60] flex flex-col items-center justify-center" onClick={onClose} data-testid="media-viewer">
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between z-10" onClick={(e) => e.stopPropagation()}>
        <button onClick={handleDownload} className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-xl text-white text-sm transition-colors" data-testid="media-download-btn">
          <Download className="w-5 h-5" />
          <span>حفظ</span>
        </button>
        <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-full text-white transition-colors" data-testid="media-close-btn">
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Media content */}
      <div className="max-w-[90vw] max-h-[85vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        {type === 'video' ? (
          <video
            src={src}
            controls
            autoPlay
            className="max-w-full max-h-[85vh] rounded-lg"
            data-testid="media-video"
          />
        ) : (
          <img
            src={src}
            alt={fileName || ''}
            className="max-w-full max-h-[85vh] object-contain rounded-lg"
            data-testid="media-image"
          />
        )}
      </div>

      {/* File name */}
      {fileName && (
        <p className="absolute bottom-4 text-white/60 text-sm">{fileName}</p>
      )}
    </div>
  );
};
