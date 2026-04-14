import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Send } from 'lucide-react';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export const ChatWindow = ({ selectedUser, currentUser, onNewMessage }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

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
      setMessages(data);
    } catch (error) {
      console.error('Error loading messages:', error);
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
        {
          receiver_id: selectedUser.id,
          text: newMessage
        },
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

  const getInitials = (name) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
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

      <div
        className="flex-1 overflow-y-auto p-4 space-y-4"
        data-testid="chat-message-list"
      >
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
                <p className="text-base leading-relaxed">{msg.text}</p>
                <p className="text-xs text-slate-500 mt-1 text-left">
                  {formatTime(msg.timestamp)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-white border-t border-slate-200 sticky bottom-0">
        <form onSubmit={handleSend} className="flex items-center gap-3">
          <Input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="اكتب رسالتك..."
            className="flex-1 focus:ring-2 focus:ring-emerald-500"
            disabled={loading}
            data-testid="chat-message-input"
          />
          <Button
            type="submit"
            disabled={loading || !newMessage.trim()}
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
