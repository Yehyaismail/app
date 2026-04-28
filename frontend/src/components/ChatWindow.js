import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Button } from './ui/button';
import { Send, Paperclip, Image, FileText, Download, Check, CheckCheck, Mic, Square, ArrowRight, Reply, Pencil, Trash2, X, CornerDownLeft, Smile, Eraser, FileDown, UserPen, Video, Play } from 'lucide-react';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { VoicePlayer } from './VoicePlayer';
import EmojiPicker from 'emoji-picker-react';
import { useCustomize } from '../contexts/CustomizeContext';
import { MediaViewer } from './MediaViewer';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const ReadReceipt = ({ status, isOwn }) => {
  if (!isOwn) return null;
  if (status === 'read') return <CheckCheck className="w-4 h-4 text-blue-500 inline-block" />;
  if (status === 'delivered') return <CheckCheck className="w-4 h-4 text-slate-400 dark:text-slate-500 inline-block" />;
  return <Check className="w-4 h-4 text-slate-400 dark:text-slate-500 inline-block" />;
};

const FilePreview = ({ msg, onOpenMedia }) => {
  const [blobUrl, setBlobUrl] = useState(null);
  const [loadingFile, setLoadingFile] = useState(false);

  useEffect(() => {
    if ((msg.message_type === 'image' || msg.message_type === 'video') && msg.file_url) loadMedia();
    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [msg.file_url]);

  const loadMedia = async () => {
    try {
      setLoadingFile(true);
      const res = await axios.get(`${API_URL}/api/files/${msg.file_url}`, { withCredentials: true, responseType: 'blob' });
      setBlobUrl(URL.createObjectURL(res.data));
    } catch (e) {} finally { setLoadingFile(false); }
  };

  const handleDownload = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/files/${msg.file_url}`, { withCredentials: true, responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a'); a.href = url; a.download = msg.file_name || 'download';
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch (e) {}
  };

  if (msg.message_type === 'image') {
    return (
      <div className="mb-2">
        {loadingFile ? (
          <div className="w-48 h-48 bg-slate-200 dark:bg-slate-700 animate-pulse rounded-lg flex items-center justify-center"><Image className="w-8 h-8 text-slate-400" /></div>
        ) : blobUrl ? (
          <img src={blobUrl} alt="" className="max-w-[250px] max-h-[250px] rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity" onClick={() => onOpenMedia(blobUrl, 'image', msg.file_name)} data-testid="chat-image-preview" />
        ) : (
          <div className="w-48 h-48 bg-slate-200 dark:bg-slate-700 rounded-lg flex items-center justify-center"><Image className="w-8 h-8 text-slate-400" /></div>
        )}
      </div>
    );
  }

  if (msg.message_type === 'video') {
    return (
      <div className="mb-2">
        {loadingFile ? (
          <div className="w-56 h-40 bg-slate-200 dark:bg-slate-700 animate-pulse rounded-lg flex items-center justify-center"><Video className="w-8 h-8 text-slate-400" /></div>
        ) : blobUrl ? (
          <div className="relative cursor-pointer group" onClick={() => onOpenMedia(blobUrl, 'video', msg.file_name)}>
            <video src={blobUrl} className="max-w-[280px] max-h-[200px] rounded-lg object-cover" data-testid="chat-video-preview" />
            <div className="absolute inset-0 bg-black/30 rounded-lg flex items-center justify-center group-hover:bg-black/40 transition-colors">
              <div className="w-12 h-12 bg-white/90 rounded-full flex items-center justify-center"><Play className="w-6 h-6 text-slate-900 ml-1" /></div>
            </div>
          </div>
        ) : (
          <div className="w-56 h-40 bg-slate-200 dark:bg-slate-700 rounded-lg flex items-center justify-center"><Video className="w-8 h-8 text-slate-400" /></div>
        )}
      </div>
    );
  }

  if (msg.message_type === 'voice') {
    return (
      <div className="mb-1 flex items-center gap-2">
        <div className="flex-1"><VoicePlayer fileUrl={msg.file_url} duration={msg.voice_duration} /></div>
        <button onClick={handleDownload} className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors flex-shrink-0" title="حفظ" data-testid="voice-download-btn">
          <Download className="w-4 h-4 text-slate-400" />
        </button>
      </div>
    );
  }

  if (msg.message_type === 'file') {
    return (
      <div className="mb-2 flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors" onClick={handleDownload} data-testid="chat-file-preview">
        <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/40 rounded-lg flex items-center justify-center"><FileText className="w-5 h-5 text-emerald-600" /></div>
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
  const { settings } = useCustomize();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [replyTo, setReplyTo] = useState(null);
  const [editingMsg, setEditingMsg] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [reactionPicker, setReactionPicker] = useState(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const prevMessagesRef = useRef([]);
  const typingTimeoutRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const inputRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const isUserScrolledUpRef = useRef(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [deleteMenuMsg, setDeleteMenuMsg] = useState(null);
  const [showNicknameDialog, setShowNicknameDialog] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [mediaView, setMediaView] = useState(null);

  const isFirstLoadRef = useRef(true);

  useEffect(() => {
    if (selectedUser) {
      isFirstLoadRef.current = true;
      isUserScrolledUpRef.current = false;
      prevMessagesRef.current = [];
      setMessages([]);
      loadMessages();
      checkTypingStatus();
      const i1 = setInterval(pollNewMessages, 4000);
      const i2 = setInterval(checkTypingStatus, 3000);
      return () => { clearInterval(i1); clearInterval(i2); sendTypingStatus(false); };
    }
  }, [selectedUser]);

  // Scroll logic: instant on first load, smooth on new messages, skip when reading old
  useEffect(() => {
    if (messages.length === 0) return;
    if (isFirstLoadRef.current) {
      // First load: jump to bottom instantly after render
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
      });
      isUserScrolledUpRef.current = false;
      isFirstLoadRef.current = false;
    } else if (!isUserScrolledUpRef.current) {
      // New messages while at bottom: smooth scroll
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    // If user scrolled up: do nothing, let them read
  }, [messages]);

  const handleScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isUserScrolledUpRef.current = distFromBottom > 150;
  };

  // Close context menu, emoji picker, reaction picker on click outside
  useEffect(() => {
    const handler = (e) => {
      setContextMenu(null);
      if (!e.target.closest('[data-testid="reaction-picker"]') && !e.target.closest('[data-testid="react-msg-btn"]')) {
        setReactionPicker(null);
      }
      if (showEmojiPicker && !e.target.closest('[data-testid="emoji-picker"]') && !e.target.closest('[data-testid="emoji-btn"]')) {
        setShowEmojiPicker(false);
      }
    };
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [showEmojiPicker]);

  const loadMessages = async () => {
    if (!selectedUser) return;
    try {
      const { data } = await axios.get(`${API_URL}/api/messages/${selectedUser.id}`, { withCredentials: true });
      prevMessagesRef.current = data;
      setMessages(data);
    } catch (e) {}
  };

  const pollNewMessages = async () => {
    if (!selectedUser) return;
    try {
      // Full reload every poll to get updated statuses (read/delivered)
      const { data } = await axios.get(`${API_URL}/api/messages/${selectedUser.id}`, { withCredentials: true });
      const prev = prevMessagesRef.current;
      
      // Check for new incoming messages
      if (prev.length > 0 && data.length > prev.length) {
        const hasIncoming = data.slice(prev.length).some((m) => m.sender_id !== currentUser?.id);
        if (hasIncoming) {
          playNotificationSound();
          isUserScrolledUpRef.current = false;
        }
      }
      
      prevMessagesRef.current = data;
      setMessages(data);
    } catch (e) {}
  };

  const playNotificationSound = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination); o.frequency.value = 800; o.type = 'sine';
      g.gain.setValueAtTime(0.3, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.3);
    } catch (e) {}
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    isUserScrolledUpRef.current = false;
  };
  const sendTypingStatus = async (t) => { if (!selectedUser) return; try { await axios.post(`${API_URL}/api/typing`, { receiver_id: selectedUser.id, is_typing: t }, { withCredentials: true }); } catch (e) {} };
  const checkTypingStatus = async () => { if (!selectedUser) return; try { const { data } = await axios.get(`${API_URL}/api/typing/${selectedUser.id}`, { withCredentials: true }); setIsOtherTyping(data.is_typing); } catch (e) {} };

  const handleInputChange = (e) => {
    setNewMessage(e.target.value);
    // Auto-resize textarea
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
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

      if (editingMsg) {
        await axios.put(`${API_URL}/api/messages/${editingMsg.id}`, { text: newMessage }, { withCredentials: true });
        setEditingMsg(null);
        // Refresh to get updated message
        await loadMessages();
      } else {
        const { data: sentMsg } = await axios.post(`${API_URL}/api/messages`, {
          receiver_id: selectedUser.id, text: newMessage, message_type: 'text',
          reply_to: replyTo?.id || null
        }, { withCredentials: true });
        setReplyTo(null);
        // Optimistic: add message locally immediately
        const updated = [...prevMessagesRef.current, sentMsg];
        prevMessagesRef.current = updated;
        setMessages(updated);
        isUserScrolledUpRef.current = false;
      }
      setNewMessage('');
      setShowEmojiPicker(false);
      // Reset textarea height
      if (inputRef.current) inputRef.current.style.height = 'auto';
      onNewMessage();
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedUser) return;
    setUploading(true); setShowAttachMenu(false);
    try {
      const fd = new FormData(); fd.append('file', file);
      const up = await axios.post(`${API_URL}/api/upload`, fd, { withCredentials: true, headers: { 'Content-Type': 'multipart/form-data' } });
      const mt = up.data.category === 'image' ? 'image' : up.data.category === 'video' ? 'video' : 'file';
      await axios.post(`${API_URL}/api/messages`, {
        receiver_id: selectedUser.id, text: mt === 'image' ? 'صورة' : mt === 'video' ? 'فيديو' : file.name, message_type: mt,
        file_url: up.data.storage_path, file_name: up.data.original_filename, file_type: up.data.content_type,
        reply_to: replyTo?.id || null
      }, { withCredentials: true });
      setReplyTo(null);
      await loadMessages(); onNewMessage();
    } catch (e) {}
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; if (imageInputRef.current) imageInputRef.current.value = ''; if (videoInputRef.current) videoInputRef.current.value = ''; }
  };

  const handleDeleteMessage = async (msgId, mode = 'for_all') => {
    try {
      await axios.post(`${API_URL}/api/messages/${msgId}/delete`, { mode }, { withCredentials: true });
      await loadMessages(); onNewMessage();
    } catch (e) { console.error(e); }
    setContextMenu(null);
    setDeleteMenuMsg(null);
  };

  const handleExportChat = () => {
    if (!selectedUser) return;
    window.open(`${API_URL}/api/messages/${selectedUser.id}/export`, '_blank');
  };

  const handleSetNickname = async () => {
    if (!selectedUser) return;
    try {
      if (nicknameInput.trim()) {
        await axios.put(`${API_URL}/api/nicknames/${selectedUser.id}`, { nickname: nicknameInput.trim() }, { withCredentials: true });
      } else {
        await axios.delete(`${API_URL}/api/nicknames/${selectedUser.id}`, { withCredentials: true });
      }
      onNewMessage(); // Refresh to get updated nicknames
    } catch (e) { console.error(e); }
    setShowNicknameDialog(false);
  };

  const handleEditMessage = (msg) => {
    setEditingMsg(msg);
    setNewMessage(msg.text);
    setReplyTo(null);
    setContextMenu(null);
    inputRef.current?.focus();
  };

  const handleReplyMessage = (msg) => {
    setReplyTo(msg);
    setEditingMsg(null);
    setContextMenu(null);
    inputRef.current?.focus();
  };

  const cancelAction = () => {
    setReplyTo(null);
    setEditingMsg(null);
    setNewMessage('');
  };

  const handleClearChat = async () => {
    if (!selectedUser) return;
    try {
      await axios.delete(`${API_URL}/api/messages/conversation/${selectedUser.id}`, { withCredentials: true });
      setMessages([]);
      prevMessagesRef.current = [];
      onNewMessage();
    } catch (e) { console.error(e); }
    setShowClearConfirm(false);
  };

  const QUICK_REACTIONS = ['❤️', '😂', '👍', '😮', '😢', '🙏'];

  const handleReaction = async (msgId, emoji) => {
    try {
      await axios.post(`${API_URL}/api/messages/${msgId}/react`, { emoji }, { withCredentials: true });
      await loadMessages();
    } catch (e) { console.error(e); }
    setReactionPicker(null);
    setContextMenu(null);
  };

  const onEmojiClick = (emojiData) => {
    setNewMessage((prev) => prev + emojiData.emoji);
    inputRef.current?.focus();
  };

  const openContextMenu = (e, msg) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, msg });
  };

  // Voice recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4' });
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = () => { stream.getTracks().forEach((t) => t.stop()); };
      mr.start(); mediaRecorderRef.current = mr;
      setIsRecording(true); setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => setRecordingDuration((d) => d + 1), 1000);
    } catch (e) {}
  };

  const stopRecordingAndSend = async () => {
    if (!mediaRecorderRef.current || !selectedUser) return;
    clearInterval(recordingTimerRef.current); setIsRecording(false); setRecordingDuration(0);
    return new Promise((resolve) => {
      mediaRecorderRef.current.onstop = async () => {
        mediaRecorderRef.current.stream?.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: audioChunksRef.current[0]?.type || 'audio/webm' });
        if (blob.size < 500) { resolve(); return; }
        setUploading(true);
        try {
          const ext = blob.type.includes('webm') ? 'webm' : 'mp4';
          const file = new File([blob], `voice_${Date.now()}.${ext}`, { type: blob.type });
          const fd = new FormData(); fd.append('file', file);
          const up = await axios.post(`${API_URL}/api/upload`, fd, { withCredentials: true, headers: { 'Content-Type': 'multipart/form-data' } });
          await axios.post(`${API_URL}/api/messages`, {
            receiver_id: selectedUser.id, text: 'رسالة صوتية', message_type: 'voice',
            file_url: up.data.storage_path, file_name: up.data.original_filename, file_type: up.data.content_type
          }, { withCredentials: true });
          await loadMessages(); onNewMessage();
        } catch (e) {} finally { setUploading(false); }
        resolve();
      };
      mediaRecorderRef.current.stop();
    });
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current) { mediaRecorderRef.current.stream?.getTracks().forEach((t) => t.stop()); mediaRecorderRef.current.stop(); }
    clearInterval(recordingTimerRef.current); setIsRecording(false); setRecordingDuration(0); audioChunksRef.current = [];
  };

  const formatRec = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  const getInitials = (n) => n.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  const formatTime = (ts) => { try { return format(new Date(ts), 'hh:mm a', { locale: ar }); } catch { return ''; } };

  const getReplyMessage = (replyId) => messages.find((m) => m.id === replyId);

  const fontSizeClass = { sm: 'text-sm', base: 'text-base', lg: 'text-lg', xl: 'text-xl' }[settings.fontSize] || 'text-base';
  const chatStyle = { fontFamily: settings.fontFamily || undefined };
  const chatBgStyle = settings.chatBgImage
    ? { backgroundImage: `url(${settings.chatBgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : settings.chatBgColor ? { backgroundColor: settings.chatBgColor } : {};

  const openMedia = (src, type, fileName) => setMediaView({ src, type, fileName });

  if (!selectedUser) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900">
        <img src="https://images.unsplash.com/photo-1755908471117-9adbf5671b1d?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMzV8MHwxfHNlYXJjaHwxfHxwZW9wbGUlMjBjaGF0dGluZyUyMHNpbGhvdWV0dGV8ZW58MHx8fHwxNzc2MTkwNzMyfDA&ixlib=rb-4.1.0&q=85" alt="" className="w-64 h-64 object-cover rounded-2xl opacity-40 dark:opacity-20 mb-6" />
        <p className="text-2xl text-slate-400 dark:text-slate-500 font-light">اختر محادثة للبدء</p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50 dark:bg-slate-900" style={chatStyle}>
      {/* Header */}
      <div className="p-4 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors" data-testid="chat-back-btn">
            <ArrowRight className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          </button>
          <div className="relative">
            <Avatar className="w-10 h-10 bg-emerald-600"><AvatarFallback className="text-white font-medium">{getInitials(selectedUser.display_name || selectedUser.name)}</AvatarFallback></Avatar>
            {selectedUser.online && <div className="absolute bottom-0 left-0 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-slate-800 rounded-full"></div>}
          </div>
          <div className="flex-1">
            <p className="font-medium text-slate-900 dark:text-slate-100">{selectedUser.display_name || selectedUser.name}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isOtherTyping ? <span className="text-emerald-600 dark:text-emerald-400 font-medium" data-testid="typing-indicator">يكتب الآن...</span> : (selectedUser.online ? 'متصل' : 'غير متصل')}
            </p>
          </div>
          <button onClick={() => setShowClearConfirm(true)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors" title="مسح المحادثة" data-testid="clear-chat-btn">
            <Eraser className="w-5 h-5 text-slate-500 dark:text-slate-400" />
          </button>
          <button onClick={handleExportChat} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors" title="تصدير المحادثة" data-testid="export-chat-btn">
            <FileDown className="w-5 h-5 text-slate-500 dark:text-slate-400" />
          </button>
          <button onClick={() => { setNicknameInput(''); setShowNicknameDialog(true); }} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors" title="تغيير الاسم" data-testid="nickname-btn">
            <UserPen className="w-5 h-5 text-slate-500 dark:text-slate-400" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={messagesContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 space-y-3" style={chatBgStyle} data-testid="chat-message-list">
        {messages.map((msg) => {
          const isOwn = msg.sender_id === currentUser?.id;
          const repliedMsg = msg.reply_to ? getReplyMessage(msg.reply_to) : null;
          return (
            <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'} group`} data-testid="chat-message-bubble">
              <div
                className={`max-w-[70%] relative ${
                  isOwn
                    ? 'text-slate-900 dark:text-slate-100 rounded-lg rounded-tr-none'
                    : 'text-slate-900 dark:text-slate-100 rounded-lg rounded-tl-none border border-slate-100 dark:border-slate-700'
                } p-3 shadow-sm ${!settings.sentBubbleColor && isOwn ? 'bg-emerald-100 dark:bg-emerald-900/40' : ''} ${!settings.receivedBubbleColor && !isOwn ? 'bg-white dark:bg-slate-800' : ''}`}
                style={{
                  backgroundColor: isOwn
                    ? (settings.sentBubbleColor || undefined)
                    : (settings.receivedBubbleColor || undefined),
                }}
                onContextMenu={(e) => !msg.deleted && openContextMenu(e, msg)}
              >
                {/* Reply preview */}
                {repliedMsg && (
                  <div className="mb-2 p-2 rounded-lg bg-slate-200/60 dark:bg-slate-700/60 border-r-2 border-emerald-500" data-testid="reply-preview">
                    <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium mb-0.5">
                      {repliedMsg.sender_id === currentUser?.id ? 'أنت' : selectedUser.name}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-400 truncate">
                      {repliedMsg.deleted ? 'تم حذف هذه الرسالة' : (repliedMsg.message_type === 'voice' ? 'رسالة صوتية' : repliedMsg.message_type === 'image' ? 'صورة' : repliedMsg.text)}
                    </p>
                  </div>
                )}

                {msg.deleted ? (
                  <p className="text-sm italic text-slate-400 dark:text-slate-500">تم حذف هذه الرسالة</p>
                ) : (
                  <>
                    <FilePreview msg={msg} onOpenMedia={openMedia} />
                    {msg.message_type === 'text' && <p className={`${fontSizeClass} leading-relaxed whitespace-pre-wrap`}>{msg.text}</p>}
                  </>
                )}
                <div className="flex items-center justify-between gap-2 mt-1">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {formatTime(msg.timestamp)}
                    {msg.edited && !msg.deleted && <span className="mr-1 text-slate-400 dark:text-slate-500">(معدّل)</span>}
                  </span>
                  <ReadReceipt status={msg.status} isOwn={isOwn} />
                </div>

                {/* Reactions display */}
                {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5" data-testid="message-reactions">
                    {Object.entries(
                      Object.values(msg.reactions).reduce((acc, emoji) => {
                        acc[emoji] = (acc[emoji] || 0) + 1;
                        return acc;
                      }, {})
                    ).map(([emoji, count]) => (
                      <button
                        key={emoji}
                        onClick={() => handleReaction(msg.id, emoji)}
                        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs border transition-colors ${
                          msg.reactions[currentUser?.id] === emoji
                            ? 'bg-emerald-100 dark:bg-emerald-900/40 border-emerald-300 dark:border-emerald-700'
                            : 'bg-slate-100 dark:bg-slate-700 border-slate-200 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-600'
                        }`}
                        data-testid="reaction-badge"
                      >
                        <span>{emoji}</span>
                        {count > 1 && <span className="text-slate-600 dark:text-slate-300">{count}</span>}
                      </button>
                    ))}
                  </div>
                )}

                {/* Hover action buttons */}
                {!msg.deleted && (
                  <div className={`absolute top-1 ${isOwn ? 'left-1' : 'right-1'} opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5`}>
                    <div className="relative">
                      <button onClick={(e) => { e.stopPropagation(); setReactionPicker(reactionPicker === msg.id ? null : msg.id); }} className="p-1.5 bg-white dark:bg-slate-700 rounded-md shadow-sm hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors" data-testid="react-msg-btn">
                        <Smile className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                      </button>
                      {reactionPicker === msg.id && (
                        <div className={`absolute bottom-8 ${isOwn ? 'left-0' : 'right-0'} bg-white dark:bg-slate-800 rounded-full shadow-lg border border-slate-200 dark:border-slate-700 px-2 py-1 flex gap-1 z-30`} data-testid="reaction-picker" onClick={(e) => e.stopPropagation()}>
                          {QUICK_REACTIONS.map((emoji) => (
                            <button key={emoji} onClick={() => handleReaction(msg.id, emoji)} className="text-xl hover:scale-125 transition-transform p-0.5" data-testid={`reaction-${emoji}`}>
                              {emoji}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button onClick={() => handleReplyMessage(msg)} className="p-1.5 bg-white dark:bg-slate-700 rounded-md shadow-sm hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors" data-testid="reply-msg-btn">
                      <Reply className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                    </button>
                    {isOwn && msg.message_type === 'text' && (
                      <button onClick={() => handleEditMessage(msg)} className="p-1.5 bg-white dark:bg-slate-700 rounded-md shadow-sm hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors" data-testid="edit-msg-btn">
                        <Pencil className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                      </button>
                    )}
                    {isOwn && (
                      <button onClick={() => setDeleteMenuMsg(deleteMenuMsg === msg.id ? null : msg.id)} className="p-1.5 bg-white dark:bg-slate-700 rounded-md shadow-sm hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors relative" data-testid="delete-msg-btn">
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        {deleteMenuMsg === msg.id && (
                          <div className="absolute top-8 left-0 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-1 z-30 w-36" onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => handleDeleteMessage(msg.id, 'for_me')} className="w-full px-3 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 text-right" data-testid="delete-for-me-btn">حذف لدي فقط</button>
                            <button onClick={() => handleDeleteMessage(msg.id, 'for_all')} className="w-full px-3 py-2 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 text-right" data-testid="delete-for-all-btn">حذف للجميع</button>
                          </div>
                        )}
                      </button>
                    )}
                    {!isOwn && (
                      <button onClick={() => handleDeleteMessage(msg.id, 'for_me')} className="p-1.5 bg-white dark:bg-slate-700 rounded-md shadow-sm hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors" data-testid="delete-for-me-other-btn">
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Clear Chat Confirmation */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setShowClearConfirm(false)} data-testid="clear-chat-overlay">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 p-6 max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">مسح المحادثة</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">هل تريد حذف جميع رسائل هذه المحادثة نهائياً؟ لا يمكن التراجع عن هذا الإجراء.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowClearConfirm(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors" data-testid="cancel-clear-btn">إلغاء</button>
              <button onClick={handleClearChat} className="px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors" data-testid="confirm-clear-btn">مسح الكل</button>
            </div>
          </div>
        </div>
      )}

      {/* Nickname Dialog */}
      {showNicknameDialog && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setShowNicknameDialog(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 p-6 max-w-sm mx-4 w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">تغيير اسم العرض</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">هذا الاسم يظهر لك فقط ولا يراه الطرف الآخر</p>
            <input
              type="text"
              value={nicknameInput}
              onChange={(e) => setNicknameInput(e.target.value)}
              placeholder={selectedUser?.name || 'الاسم الجديد...'}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 mb-4"
              data-testid="nickname-input"
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowNicknameDialog(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">إلغاء</button>
              <button onClick={handleSetNickname} className="px-4 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors" data-testid="save-nickname-btn">حفظ</button>
            </div>
          </div>
        </div>
      )}

      {/* Media Viewer */}
      {mediaView && (
        <MediaViewer src={mediaView.src} type={mediaView.type} fileName={mediaView.fileName} onClose={() => setMediaView(null)} />
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 py-1 z-50 min-w-[160px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
          data-testid="message-context-menu"
        >
          <div className="flex gap-1 px-3 py-2 border-b border-slate-100 dark:border-slate-700">
            {QUICK_REACTIONS.map((emoji) => (
              <button key={emoji} onClick={() => handleReaction(contextMenu.msg.id, emoji)} className="text-lg hover:scale-125 transition-transform p-0.5" data-testid={`ctx-reaction-${emoji}`}>
                {emoji}
              </button>
            ))}
          </div>
          <button onClick={() => handleReplyMessage(contextMenu.msg)} className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700 text-sm text-slate-700 dark:text-slate-200 text-right" data-testid="ctx-reply-btn">
            <Reply className="w-4 h-4" /><span>رد</span>
          </button>
          {contextMenu.msg.sender_id === currentUser?.id && contextMenu.msg.message_type === 'text' && (
            <button onClick={() => handleEditMessage(contextMenu.msg)} className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700 text-sm text-slate-700 dark:text-slate-200 text-right" data-testid="ctx-edit-btn">
              <Pencil className="w-4 h-4" /><span>تعديل</span>
            </button>
          )}
          {contextMenu.msg.sender_id === currentUser?.id && (
            <button onClick={() => handleDeleteMessage(contextMenu.msg.id, 'for_all')} className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-red-50 dark:hover:bg-red-900/30 text-sm text-red-600 text-right" data-testid="ctx-delete-btn">
              <Trash2 className="w-4 h-4" /><span>حذف للجميع</span>
            </button>
          )}
          <button onClick={() => handleDeleteMessage(contextMenu.msg.id, 'for_me')} className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700 text-sm text-slate-700 dark:text-slate-200 text-right" data-testid="ctx-delete-for-me-btn">
            <Trash2 className="w-4 h-4" /><span>حذف لدي</span>
          </button>
        </div>
      )}

      {uploading && (
        <div className="px-4 py-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-sm flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>جاري الرفع...
        </div>
      )}

      {/* Reply/Edit Bar */}
      {(replyTo || editingMsg) && (
        <div className="px-4 py-3 bg-slate-100 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex items-center gap-3" data-testid="reply-edit-bar">
          <div className="flex-1 border-r-2 border-emerald-500 pr-3">
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 mb-0.5">
              {editingMsg ? 'تعديل الرسالة' : `الرد على ${replyTo.sender_id === currentUser?.id ? 'نفسك' : selectedUser.name}`}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400 truncate">
              {editingMsg ? editingMsg.text : (replyTo.message_type === 'voice' ? 'رسالة صوتية' : replyTo.message_type === 'image' ? 'صورة' : replyTo.text)}
            </p>
          </div>
          <button onClick={cancelAction} className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors" data-testid="cancel-reply-edit-btn">
            <X className="w-5 h-5 text-slate-500" />
          </button>
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
              <span className="text-red-500 dark:text-red-400 font-mono text-sm mr-auto" data-testid="recording-duration">{formatRec(recordingDuration)}</span>
            </div>
            <Button onClick={stopRecordingAndSend} className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-6 rounded-xl" data-testid="send-voice-btn"><Send className="w-5 h-5" /></Button>
          </div>
        ) : (
          <form onSubmit={handleSend} className="flex items-center gap-3">
            <div className="relative">
              <button type="button" onClick={() => setShowAttachMenu(!showAttachMenu)} className="p-3 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors" data-testid="attach-btn">
                <Paperclip className="w-5 h-5 text-slate-500 dark:text-slate-400" />
              </button>
              {showAttachMenu && (
                <div className="absolute bottom-14 right-0 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 p-2 w-40 z-20" data-testid="attach-menu">
                  <button type="button" onClick={() => imageInputRef.current?.click()} className="flex items-center gap-3 w-full p-3 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors text-right" data-testid="attach-image-btn">
                    <Image className="w-5 h-5 text-emerald-600" /><span className="text-sm text-slate-700 dark:text-slate-200">صورة</span>
                  </button>
                  <button type="button" onClick={() => videoInputRef.current?.click()} className="flex items-center gap-3 w-full p-3 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors text-right" data-testid="attach-video-btn">
                    <Video className="w-5 h-5 text-purple-600" /><span className="text-sm text-slate-700 dark:text-slate-200">فيديو</span>
                  </button>
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center gap-3 w-full p-3 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors text-right" data-testid="attach-file-btn">
                    <FileText className="w-5 h-5 text-blue-600" /><span className="text-sm text-slate-700 dark:text-slate-200">ملف</span>
                  </button>
                </div>
              )}
            </div>
            <input type="file" ref={imageInputRef} accept="image/*" className="hidden" onChange={handleFileUpload} />
            <input type="file" ref={videoInputRef} accept="video/*" className="hidden" onChange={handleFileUpload} />
            <input type="file" ref={fileInputRef} accept=".pdf,.doc,.docx,.txt,.xls,.xlsx,.zip,.rar,.mp3,.wav,.ogg,.aac" className="hidden" onChange={handleFileUpload} />
            <div className="relative">
              <button type="button" onClick={() => setShowEmojiPicker(!showEmojiPicker)} className="p-3 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors" data-testid="emoji-btn">
                <Smile className="w-5 h-5 text-slate-500 dark:text-slate-400" />
              </button>
              {showEmojiPicker && (
                <div className="absolute bottom-14 right-0 z-30" data-testid="emoji-picker">
                  <EmojiPicker
                    onEmojiClick={onEmojiClick}
                    width={320}
                    height={400}
                    searchPlaceholder="ابحث عن إيموجي..."
                    skinTonesDisabled
                    previewConfig={{ showPreview: false }}
                    lazyLoadEmojis
                  />
                </div>
              )}
            </div>
            <textarea ref={inputRef} value={newMessage} onChange={handleInputChange} placeholder={editingMsg ? 'عدّل الرسالة...' : 'اكتب رسالتك...'} className="flex-1 resize-none min-h-[44px] max-h-[120px] py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-base leading-relaxed" disabled={loading || uploading} rows={1} data-testid="chat-message-input" />
            {newMessage.trim() ? (
              <Button type="submit" disabled={loading || uploading} className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-6 rounded-xl transition-colors" data-testid="chat-send-btn"><Send className="w-5 h-5" /></Button>
            ) : !editingMsg ? (
              <button type="button" onMouseDown={startRecording} onTouchStart={startRecording} className="bg-emerald-600 hover:bg-emerald-700 text-white p-3 rounded-xl transition-colors" data-testid="mic-btn"><Mic className="w-5 h-5" /></button>
            ) : (
              <button type="button" onClick={cancelAction} className="p-3 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors" data-testid="cancel-edit-btn"><X className="w-5 h-5 text-slate-500" /></button>
            )}
          </form>
        )}
      </div>
    </div>
  );
};
