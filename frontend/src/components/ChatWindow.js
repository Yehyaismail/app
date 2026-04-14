import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Send, Paperclip, Image, FileText, Download, X, Check, CheckCheck } from 'lucide-react';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const ReadReceipt = ({ status, isOwn }) => {
  if (!isOwn) return null;
  if (status === 'read') {
    return <CheckCheck className="w-4 h-4 text-blue-500 inline-block" />;
  }
  if (status === 'delivered') {
    return <CheckCheck className="w-4 h-4 text-slate-400 inline-block" />;
  }
  return <Check className="w-4 h-4 text-slate-400 inline-block" />;
};

const FilePreview = ({ msg }) => {
  const [blobUrl, setBlobUrl] = useState(null);
  const [loadingFile, setLoadingFile] = useState(false);

  useEffect(() => {
    if (msg.message_type === 'image' && msg.file_url) {
      loadImage();
    }
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [msg.file_url]);

  const loadImage = async () => {
    try {
      setLoadingFile(true);
      const response = await axios.get(`${API_URL}/api/files/${msg.file_url}`, {
        withCredentials: true,
        responseType: 'blob'
      });
      const url = URL.createObjectURL(response.data);
      setBlobUrl(url);
    } catch (err) {
      console.error('Error loading image:', err);
    } finally {
      setLoadingFile(false);
    }
  };

  const handleDownload = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/files/${msg.file_url}`, {
        withCredentials: true,
        responseType: 'blob'
      });
      const url = URL.createObjectURL(response.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = msg.file_name || 'download';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading file:', err);
    }
  };

  if (msg.message_type === 'image') {
    return (
      <div className="mb-2">
        {loadingFile ? (
          <div className="w-48 h-48 bg-slate-200 animate-pulse rounded-lg flex items-center justify-center">
            <Image className="w-8 h-8 text-slate-400" />
          </div>
        ) : blobUrl ? (
          <img
            src={blobUrl}
            alt={msg.file_name || 'Image'}
            className="max-w-[250px] max-h-[250px] rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => window.open(blobUrl, '_blank')}
            data-testid="chat-image-preview"
          />
        ) : (
          <div className="w-48 h-48 bg-slate-200 rounded-lg flex items-center justify-center">
            <Image className="w-8 h-8 text-slate-400" />
          </div>
        )}
      </div>
    );
  }

  if (msg.message_type === 'file') {
    return (
      <div
        className="mb-2 flex items-center gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors"
        onClick={handleDownload}
        data-testid="chat-file-preview"
      >
        <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
          <FileText className="w-5 h-5 text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-900 truncate">{msg.file_name || 'ملف'}</p>
          <p className="text-xs text-slate-500">{msg.file_type || ''}</p>
        </div>
        <Download className="w-5 h-5 text-slate-400" />
      </div>
    );
  }

  return null;
};

export const ChatWindow = ({ selectedUser, currentUser, onNewMessage }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const prevMessagesRef = useRef([]);

  useEffect(() => {
    if (selectedUser) {
      loadMessages();
      const interval = setInterval(loadMessages, 2000);
      return () => clearInterval(interval);
    }
  }, [selectedUser]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadMessages = async () => {
    if (!selectedUser) return;
    try {
      const { data } = await axios.get(
        `${API_URL}/api/messages/${selectedUser.id}`,
        { withCredentials: true }
      );
      
      // Check for new messages from the other user (for notifications)
      const prevMsgs = prevMessagesRef.current;
      if (prevMsgs.length > 0 && data.length > prevMsgs.length) {
        const newMsgs = data.slice(prevMsgs.length);
        newMsgs.forEach((msg) => {
          if (msg.sender_id !== currentUser?.id) {
            playNotificationSound();
          }
        });
      }
      prevMessagesRef.current = data;
      setMessages(data);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  const playNotificationSound = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.3);
    } catch (e) {
      // Audio not supported
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedUser) return;

    setLoading(true);
    try {
      await axios.post(
        `${API_URL}/api/messages`,
        { receiver_id: selectedUser.id, text: newMessage, message_type: 'text' },
        { withCredentials: true }
      );
      setNewMessage('');
      await loadMessages();
      onNewMessage();
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e, type) => {
    const file = e.target.files?.[0];
    if (!file || !selectedUser) return;
    
    setUploading(true);
    setShowAttachMenu(false);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const uploadRes = await axios.post(`${API_URL}/api/upload`, formData, {
        withCredentials: true,
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      const msgType = uploadRes.data.category === 'image' ? 'image' : 'file';
      
      await axios.post(
        `${API_URL}/api/messages`,
        {
          receiver_id: selectedUser.id,
          text: msgType === 'image' ? 'صورة' : file.name,
          message_type: msgType,
          file_url: uploadRes.data.storage_path,
          file_name: uploadRes.data.original_filename,
          file_type: uploadRes.data.content_type
        },
        { withCredentials: true }
      );
      
      await loadMessages();
      onNewMessage();
    } catch (error) {
      console.error('Error uploading file:', error);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  const getInitials = (name) => {
    return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const formatTime = (timestamp) => {
    try {
      return format(new Date(timestamp), 'p', { locale: ar });
    } catch {
      return '';
    }
  };

  if (!selectedUser) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-slate-50">
        <img
          src="https://images.unsplash.com/photo-1755908471117-9adbf5671b1d?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMzV8MHwxfHNlYXJjaHwxfHxwZW9wbGUlMjBjaGF0dGluZyUyMHNpbGhvdWV0dGV8ZW58MHx8fHwxNzc2MTkwNzMyfDA&ixlib=rb-4.1.0&q=85"
          alt="Empty"
          className="w-64 h-64 object-cover rounded-2xl opacity-40 mb-6"
        />
        <p className="text-2xl text-slate-400 font-light">اختر محادثة للبدء</p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <div className="p-4 bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Avatar className="w-10 h-10 bg-emerald-600">
              <AvatarFallback className="text-white font-medium">
                {getInitials(selectedUser.name)}
              </AvatarFallback>
            </Avatar>
            {selectedUser.online && (
              <div className="absolute bottom-0 left-0 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full"></div>
            )}
          </div>
          <div>
            <p className="font-medium text-slate-900">{selectedUser.name}</p>
            <p className="text-xs text-slate-500">
              {selectedUser.online ? 'متصل' : 'غير متصل'}
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4" data-testid="chat-message-list">
        {messages.map((msg) => {
          const isOwn = msg.sender_id === currentUser?.id;
          return (
            <div
              key={msg.id}
              className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
              data-testid="chat-message-bubble"
            >
              <div
                className={`max-w-[70%] ${
                  isOwn
                    ? 'bg-emerald-100 text-slate-900 rounded-lg rounded-tr-none'
                    : 'bg-white text-slate-900 rounded-lg rounded-tl-none border border-slate-100'
                } p-3 shadow-sm`}
              >
                <FilePreview msg={msg} />
                {msg.message_type === 'text' && (
                  <p className="text-base leading-relaxed">{msg.text}</p>
                )}
                <div className="flex items-center justify-between gap-2 mt-1">
                  <span className="text-xs text-slate-500">{formatTime(msg.timestamp)}</span>
                  <ReadReceipt status={msg.status} isOwn={isOwn} />
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Upload indicator */}
      {uploading && (
        <div className="px-4 py-2 bg-emerald-50 text-emerald-700 text-sm flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
          جاري رفع الملف...
        </div>
      )}

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-slate-200 sticky bottom-0">
        <form onSubmit={handleSend} className="flex items-center gap-3">
          {/* Attach button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowAttachMenu(!showAttachMenu)}
              className="p-3 hover:bg-slate-100 rounded-xl transition-colors duration-200"
              data-testid="attach-btn"
            >
              <Paperclip className="w-5 h-5 text-slate-500" />
            </button>
            
            {showAttachMenu && (
              <div className="absolute bottom-14 right-0 bg-white rounded-xl shadow-lg border border-slate-200 p-2 w-40 z-20" data-testid="attach-menu">
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="flex items-center gap-3 w-full p-3 hover:bg-slate-50 rounded-lg transition-colors text-right"
                  data-testid="attach-image-btn"
                >
                  <Image className="w-5 h-5 text-emerald-600" />
                  <span className="text-sm text-slate-700">صورة</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-3 w-full p-3 hover:bg-slate-50 rounded-lg transition-colors text-right"
                  data-testid="attach-file-btn"
                >
                  <FileText className="w-5 h-5 text-blue-600" />
                  <span className="text-sm text-slate-700">ملف</span>
                </button>
              </div>
            )}
          </div>

          <input
            type="file"
            ref={imageInputRef}
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFileUpload(e, 'image')}
          />
          <input
            type="file"
            ref={fileInputRef}
            accept=".pdf,.doc,.docx,.txt,.xls,.xlsx,.zip,.rar"
            className="hidden"
            onChange={(e) => handleFileUpload(e, 'file')}
          />

          <Input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="اكتب رسالتك..."
            className="flex-1 focus:ring-2 focus:ring-emerald-500"
            disabled={loading || uploading}
            data-testid="chat-message-input"
          />
          <Button
            type="submit"
            disabled={loading || uploading || !newMessage.trim()}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-6 rounded-xl transition-colors duration-200"
            data-testid="chat-send-btn"
          >
            <Send className="w-5 h-5" />
          </Button>
        </form>
      </div>
    </div>
  );
};
