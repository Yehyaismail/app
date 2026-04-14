import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Send, Paperclip, Image, FileText, Download, Check, CheckCheck, Mic, Square, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { VoicePlayer } from './VoicePlayer';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const ReadReceipt = ({ status, isOwn }) => {
  if (!isOwn) return null;
  if (status === 'read') return <CheckCheck className="w-4 h-4 text-blue-500 inline-block" />;
  if (status === 'delivered') return <CheckCheck className="w-4 h-4 text-slate-400 dark:text-slate-500 inline-block" />;
  return <Check className="w-4 h-4 text-slate-400 dark:text-slate-500 inline-block" />;
};

const FilePreview = ({ msg }) => {
  const [blobUrl, setBlobUrl] = useState(null);
  const [loadingFile, setLoadingFile] = useState(false);

  useEffect(() => {
    if (msg.message_type === 'image' && msg.file_url) loadImage();
    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [msg.file_url]);

  const loadImage = async () => {
    try {
      setLoadingFile(true);
      const response = await axios.get(`${API_URL}/api/files/${msg.file_url}`, { withCredentials: true, responseType: 'blob' });
      setBlobUrl(URL.createObjectURL(response.data));
    } catch (err) { console.error('Error loading image:', err); }
    finally { setLoadingFile(false); }
  };

  const handleDownload = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/files/${msg.file_url}`, { withCredentials: true, responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const a = document.createElement('a');
      a.href = url; a.download = msg.file_name || 'download';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) { console.error('Error downloading file:', err); }
  };

  if (msg.message_type === 'image') {
    return (
      <div className="mb-2">
        {loadingFile ? (
          <div className="w-48 h-48 bg-slate-200 dark:bg-slate-700 animate-pulse rounded-lg flex items-center justify-center">
            <Image className="w-8 h-8 text-slate-400" />
          </div>
        ) : blobUrl ? (
          <img src={blobUrl} alt={msg.file_name || 'Image'} className="max-w-[250px] max-h-[250px] rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity" onClick={() => window.open(blobUrl, '_blank')} data-testid="chat-image-preview" />
        ) : (
          <div className="w-48 h-48 bg-slate-200 dark:bg-slate-700 rounded-lg flex items-center justify-center"><Image className="w-8 h-8 text-slate-400" /></div>
        )}
      </div>
    );
  }

  if (msg.message_type === 'voice') {
    return <div className="mb-1"><VoicePlayer fileUrl={msg.file_url} duration={msg.voice_duration} /></div>;
  }

  if (msg.message_type === 'file') {
    return (
      <div className="mb-2 flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors" onClick={handleDownload} data-testid="chat-file-preview">
        <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/40 rounded-lg flex items-center justify-center">
          <FileText className="w-5 h-5 text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{msg.file_name || 'ملف'}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{msg.file_type || ''}</p>
        </div>
        <Download className="w-5 h-5 text-slate-400" />
      </div>
    );
  }
  return null;
};

export const ChatWindow = ({ selectedUser, currentUser, onNewMessage, onBack }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const prevMessagesRef = useRef([]);
  const typingTimeoutRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);

  useEffect(() => {
    if (selectedUser) {
      loadMessages();
      checkTypingStatus();
      const msgInterval = setInterval(loadMessages, 2000);
      const typingInterval = setInterval(checkTypingStatus, 1500);
      return () => { clearInterval(msgInterval); clearInterval(typingInterval); sendTypingStatus(false); };
    }
  }, [selectedUser]);

  useEffect(() => { scrollToBottom(); }, [messages]);

  const loadMessages = async () => {
    if (!selectedUser) return;
    try {
      const { data } = await axios.get(`${API_URL}/api/messages/${selectedUser.id}`, { withCredentials: true });
      const prevMsgs = prevMessagesRef.current;
      if (prevMsgs.length > 0 && data.length > prevMsgs.length) {
        data.slice(prevMsgs.length).forEach((msg) => {
          if (msg.sender_id !== currentUser?.id) playNotificationSound();
        });
      }
      prevMessagesRef.current = data;
      setMessages(data);
    } catch (error) { console.error('Error loading messages:', error); }
  };

  const playNotificationSound = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 800; osc.type = 'sine';
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
    } catch (e) {}
  };

  const scrollToBottom = () => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); };

  const sendTypingStatus = async (isTyping) => {
    if (!selectedUser) return;
    try { await axios.post(`${API_URL}/api/typing`, { receiver_id: selectedUser.id, is_typing: isTyping }, { withCredentials: true }); } catch (e) {}
  };

  const checkTypingStatus = async () => {
    if (!selectedUser) return;
    try {
      const { data } = await axios.get(`${API_URL}/api/typing/${selectedUser.id}`, { withCredentials: true });
      setIsOtherTyping(data.is_typing);
    } catch (e) {}
  };

  const handleInputChange = (e) => {
    setNewMessage(e.target.value);
    sendTypingStatus(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => sendTypingStatus(false), 3000);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedUser) return;
    setLoading(true);
    try {
      sendTypingStatus(false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      await axios.post(`${API_URL}/api/messages`, { receiver_id: selectedUser.id, text: newMessage, message_type: 'text' }, { withCredentials: true });
      setNewMessage('');
      await loadMessages();
      onNewMessage();
    } catch (error) { console.error('Error sending message:', error); }
    finally { setLoading(false); }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedUser) return;
    setUploading(true); setShowAttachMenu(false);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const uploadRes = await axios.post(`${API_URL}/api/upload`, formData, { withCredentials: true, headers: { 'Content-Type': 'multipart/form-data' } });
      const msgType = uploadRes.data.category === 'image' ? 'image' : 'file';
      await axios.post(`${API_URL}/api/messages`, {
        receiver_id: selectedUser.id, text: msgType === 'image' ? 'صورة' : file.name, message_type: msgType,
        file_url: uploadRes.data.storage_path, file_name: uploadRes.data.original_filename, file_type: uploadRes.data.content_type
      }, { withCredentials: true });
      await loadMessages(); onNewMessage();
    } catch (error) { console.error('Error uploading file:', error); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; if (imageInputRef.current) imageInputRef.current.value = ''; }
  };

  // ===== Voice Recording =====
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4' });
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorder.onstop = () => { stream.getTracks().forEach((t) => t.stop()); };
      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => setRecordingDuration((d) => d + 1), 1000);
    } catch (err) {
      console.error('Microphone access denied:', err);
    }
  };

  const stopRecordingAndSend = async () => {
    if (!mediaRecorderRef.current || !selectedUser) return;
    const duration = recordingDuration;
    clearInterval(recordingTimerRef.current);
    setIsRecording(false);
    setRecordingDuration(0);

    return new Promise((resolve) => {
      mediaRecorderRef.current.onstop = async () => {
        mediaRecorderRef.current.stream?.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: audioChunksRef.current[0]?.type || 'audio/webm' });
        if (blob.size < 500) { resolve(); return; } // too short, ignore
        setUploading(true);
        try {
          const ext = blob.type.includes('webm') ? 'webm' : 'mp4';
          const file = new File([blob], `voice_${Date.now()}.${ext}`, { type: blob.type });
          const formData = new FormData();
          formData.append('file', file);
          const uploadRes = await axios.post(`${API_URL}/api/upload`, formData, { withCredentials: true, headers: { 'Content-Type': 'multipart/form-data' } });
          await axios.post(`${API_URL}/api/messages`, {
            receiver_id: selectedUser.id, text: 'رسالة صوتية', message_type: 'voice',
            file_url: uploadRes.data.storage_path, file_name: uploadRes.data.original_filename, file_type: uploadRes.data.content_type
          }, { withCredentials: true });
          await loadMessages(); onNewMessage();
        } catch (err) { console.error('Error uploading voice:', err); }
        finally { setUploading(false); }
        resolve();
      };
      mediaRecorderRef.current.stop();
    });
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stream?.getTracks().forEach((t) => t.stop());
      mediaRecorderRef.current.stop();
    }
    clearInterval(recordingTimerRef.current);
    setIsRecording(false);
    setRecordingDuration(0);
    audioChunksRef.current = [];
  };

  const formatRecordingTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const getInitials = (name) => name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  const formatTime = (ts) => { try { return format(new Date(ts), 'p', { locale: ar }); } catch { return ''; } };

  if (!selectedUser) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900">
        <img src="https://images.unsplash.com/photo-1755908471117-9adbf5671b1d?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMzV8MHwxfHNlYXJjaHwxfHxwZW9wbGUlMjBjaGF0dGluZyUyMHNpbGhvdWV0dGV8ZW58MHx8fHwxNzc2MTkwNzMyfDA&ixlib=rb-4.1.0&q=85" alt="Empty" className="w-64 h-64 object-cover rounded-2xl opacity-40 dark:opacity-20 mb-6" />
        <p className="text-2xl text-slate-400 dark:text-slate-500 font-light">اختر محادثة للبدء</p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <div className="p-4 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors duration-200 md:hidden"
            data-testid="chat-back-btn"
          >
            <ArrowRight className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          </button>
          <button
            onClick={onBack}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors duration-200 hidden md:flex"
            data-testid="chat-back-btn-desktop"
          >
            <ArrowRight className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          </button>
          <div className="relative">
            <Avatar className="w-10 h-10 bg-emerald-600"><AvatarFallback className="text-white font-medium">{getInitials(selectedUser.name)}</AvatarFallback></Avatar>
            {selectedUser.online && <div className="absolute bottom-0 left-0 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-slate-800 rounded-full"></div>}
          </div>
          <div>
            <p className="font-medium text-slate-900 dark:text-slate-100">{selectedUser.name}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isOtherTyping ? <span className="text-emerald-600 dark:text-emerald-400 font-medium" data-testid="typing-indicator">يكتب الآن...</span> : (selectedUser.online ? 'متصل' : 'غير متصل')}
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4" data-testid="chat-message-list">
        {messages.map((msg) => {
          const isOwn = msg.sender_id === currentUser?.id;
          return (
            <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`} data-testid="chat-message-bubble">
              <div className={`max-w-[70%] ${isOwn ? 'bg-emerald-100 dark:bg-emerald-900/40 text-slate-900 dark:text-slate-100 rounded-lg rounded-tr-none' : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg rounded-tl-none border border-slate-100 dark:border-slate-700'} p-3 shadow-sm`}>
                <FilePreview msg={msg} />
                {msg.message_type === 'text' && <p className="text-base leading-relaxed">{msg.text}</p>}
                <div className="flex items-center justify-between gap-2 mt-1">
                  <span className="text-xs text-slate-500 dark:text-slate-400">{formatTime(msg.timestamp)}</span>
                  <ReadReceipt status={msg.status} isOwn={isOwn} />
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {uploading && (
        <div className="px-4 py-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-sm flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
          جاري الرفع...
        </div>
      )}

      {/* Input Area */}
      <div className="p-4 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 sticky bottom-0">
        {isRecording ? (
          <div className="flex items-center gap-3" data-testid="voice-recording-bar">
            <button onClick={cancelRecording} className="p-3 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-xl transition-colors" data-testid="cancel-recording-btn">
              <Square className="w-5 h-5 text-red-500" />
            </button>
            <div className="flex-1 flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-900/20 rounded-xl">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
              <span className="text-red-600 dark:text-red-400 font-medium text-sm">جاري التسجيل</span>
              <span className="text-red-500 dark:text-red-400 font-mono text-sm mr-auto" data-testid="recording-duration">{formatRecordingTime(recordingDuration)}</span>
            </div>
            <Button onClick={stopRecordingAndSend} className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-6 rounded-xl" data-testid="send-voice-btn">
              <Send className="w-5 h-5" />
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSend} className="flex items-center gap-3">
            <div className="relative">
              <button type="button" onClick={() => setShowAttachMenu(!showAttachMenu)} className="p-3 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors duration-200" data-testid="attach-btn">
                <Paperclip className="w-5 h-5 text-slate-500 dark:text-slate-400" />
              </button>
              {showAttachMenu && (
                <div className="absolute bottom-14 right-0 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 p-2 w-40 z-20" data-testid="attach-menu">
                  <button type="button" onClick={() => imageInputRef.current?.click()} className="flex items-center gap-3 w-full p-3 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors text-right" data-testid="attach-image-btn">
                    <Image className="w-5 h-5 text-emerald-600" /><span className="text-sm text-slate-700 dark:text-slate-200">صورة</span>
                  </button>
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center gap-3 w-full p-3 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors text-right" data-testid="attach-file-btn">
                    <FileText className="w-5 h-5 text-blue-600" /><span className="text-sm text-slate-700 dark:text-slate-200">ملف</span>
                  </button>
                </div>
              )}
            </div>
            <input type="file" ref={imageInputRef} accept="image/*" className="hidden" onChange={handleFileUpload} />
            <input type="file" ref={fileInputRef} accept=".pdf,.doc,.docx,.txt,.xls,.xlsx,.zip,.rar" className="hidden" onChange={handleFileUpload} />
            <Input type="text" value={newMessage} onChange={handleInputChange} placeholder="اكتب رسالتك..." className="flex-1 focus:ring-2 focus:ring-emerald-500 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100 dark:placeholder-slate-400" disabled={loading || uploading} data-testid="chat-message-input" />
            {newMessage.trim() ? (
              <Button type="submit" disabled={loading || uploading} className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-6 rounded-xl transition-colors duration-200" data-testid="chat-send-btn">
                <Send className="w-5 h-5" />
              </Button>
            ) : (
              <button type="button" onMouseDown={startRecording} onTouchStart={startRecording} className="bg-emerald-600 hover:bg-emerald-700 text-white p-3 rounded-xl transition-colors duration-200" data-testid="mic-btn">
                <Mic className="w-5 h-5" />
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
};
