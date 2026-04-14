import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Play, Pause } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export const VoicePlayer = ({ fileUrl, duration }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration || 0);
  const [blobUrl, setBlobUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef(null);
  const animRef = useRef(null);

  useEffect(() => {
    if (fileUrl) loadAudio();
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [fileUrl]);

  const loadAudio = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/api/files/${fileUrl}`, {
        withCredentials: true,
        responseType: 'blob'
      });
      const url = URL.createObjectURL(response.data);
      setBlobUrl(url);
      const audio = new Audio(url);
      audio.addEventListener('loadedmetadata', () => {
        if (audio.duration && isFinite(audio.duration)) {
          setTotalDuration(audio.duration);
        }
      });
      audio.addEventListener('ended', () => {
        setIsPlaying(false);
        setProgress(0);
        setCurrentTime(0);
      });
      audioRef.current = audio;
    } catch (err) {
      console.error('Error loading audio:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateProgress = () => {
    if (audioRef.current) {
      const current = audioRef.current.currentTime;
      const dur = audioRef.current.duration;
      if (dur && isFinite(dur)) {
        setProgress((current / dur) * 100);
        setCurrentTime(current);
      }
    }
    if (isPlaying) {
      animRef.current = requestAnimationFrame(updateProgress);
    }
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      if (animRef.current) cancelAnimationFrame(animRef.current);
    } else {
      audioRef.current.play();
      animRef.current = requestAnimationFrame(updateProgress);
    }
    setIsPlaying(!isPlaying);
  };

  const handleProgressClick = (e) => {
    if (!audioRef.current || !audioRef.current.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    // RTL: calculate from right
    const clickX = rect.right - e.clientX;
    const pct = Math.max(0, Math.min(1, clickX / rect.width));
    audioRef.current.currentTime = pct * audioRef.current.duration;
    setProgress(pct * 100);
    setCurrentTime(audioRef.current.currentTime);
  };

  const formatDur = (secs) => {
    if (!secs || !isFinite(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 min-w-[200px]">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 min-w-[200px]" data-testid="voice-player">
      <button
        onClick={togglePlay}
        className="w-9 h-9 rounded-full bg-emerald-600 hover:bg-emerald-700 flex items-center justify-center text-white flex-shrink-0 transition-colors"
        data-testid="voice-play-btn"
      >
        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>
      <div className="flex-1">
        <div
          className="h-2 bg-slate-200 dark:bg-slate-600 rounded-full cursor-pointer relative overflow-hidden"
          onClick={handleProgressClick}
          data-testid="voice-progress-bar"
        >
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-100"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-slate-400">{formatDur(currentTime)}</span>
          <span className="text-[10px] text-slate-400">{formatDur(totalDuration)}</span>
        </div>
      </div>
    </div>
  );
};
