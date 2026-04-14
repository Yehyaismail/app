import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Sidebar } from '../components/Sidebar';
import { ChatWindow } from '../components/ChatWindow';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export const Chat = () => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notificationPermission, setNotificationPermission] = useState('default');
  const prevConversationsRef = useRef([]);

  useEffect(() => {
    // Request notification permission
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
      if (Notification.permission === 'default') {
        Notification.requestPermission().then((perm) => {
          setNotificationPermission(perm);
        });
      }
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 3000);
    return () => clearInterval(interval);
  }, []);

  const playNotificationSound = useCallback(() => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.frequency.value = 600;
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.4);
    } catch (e) {
      // Audio not supported
    }
  }, []);

  const sendBrowserNotification = useCallback((senderName, message) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const notification = new Notification(senderName, {
          body: message,
          icon: '/favicon.ico',
          tag: 'chat-notification',
          silent: true
        });
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
        setTimeout(() => notification.close(), 5000);
      } catch (e) {
        // Notification not supported
      }
    }
  }, []);

  const loadData = async () => {
    try {
      const [convRes, usersRes] = await Promise.all([
        axios.get(`${API_URL}/api/conversations`, { withCredentials: true }),
        axios.get(`${API_URL}/api/users`, { withCredentials: true })
      ]);

      const newConversations = convRes.data;
      const prevConvs = prevConversationsRef.current;

      // Check for new unread messages (compare unread counts)
      if (prevConvs.length > 0) {
        newConversations.forEach((newConv) => {
          const prevConv = prevConvs.find((p) => p.id === newConv.id);
          if (prevConv && newConv.unread_count > prevConv.unread_count) {
            // New message received
            playNotificationSound();
            sendBrowserNotification(
              newConv.other_user.name,
              newConv.last_message || 'رسالة جديدة'
            );
          } else if (!prevConv && newConv.unread_count > 0) {
            // New conversation with unread messages
            playNotificationSound();
            sendBrowserNotification(
              newConv.other_user.name,
              newConv.last_message || 'رسالة جديدة'
            );
          }
        });
      }

      prevConversationsRef.current = newConversations;
      setConversations(newConversations);
      setAllUsers(usersRes.data);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUserSelect = (userId) => {
    const userFromConv = conversations.find((c) => c.other_user.id === userId);
    const userFromAll = allUsers.find((u) => u.id === userId);
    setSelectedUser(userFromConv ? userFromConv.other_user : userFromAll);
  };

  const handleNewMessage = () => {
    loadData();
  };

  return (
    <div className="h-screen bg-slate-50 dark:bg-slate-900 grid grid-cols-12" data-testid="chat-page">
      <div className="col-span-12 md:col-span-4 lg:col-span-3 border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <Sidebar
          conversations={conversations}
          allUsers={allUsers}
          selectedUserId={selectedUser?.id}
          onSelectUser={handleUserSelect}
          currentUser={user}
        />
      </div>
      <div className="col-span-12 md:col-span-8 lg:col-span-9">
        <ChatWindow
          selectedUser={selectedUser}
          currentUser={user}
          onNewMessage={handleNewMessage}
        />
      </div>
    </div>
  );
};
