import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Sidebar } from '../components/Sidebar';
import { ChatWindow } from '../components/ChatWindow';
import { NotificationToast } from '../components/NotificationToast';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export const Chat = () => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [nicknames, setNicknames] = useState({});
  const prevConversationsRef = useRef([]);
  const notifIdRef = useRef(0);

  // Request browser notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  // Update page title with unread count
  useEffect(() => {
    const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);
    document.title = totalUnread > 0 ? `(${totalUnread}) محادثات` : 'محادثات';
  }, [conversations]);

  const playNotificationSound = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const now = ctx.currentTime;

      // WhatsApp-like double tone
      const playTone = (freq, start, dur) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.01, start + dur);
        osc.start(start);
        osc.stop(start + dur);
      };

      playTone(880, now, 0.15);
      playTone(1100, now + 0.18, 0.15);
    } catch (e) {}
  }, []);

  const sendBrowserNotification = useCallback((senderName, message) => {
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      try {
        const n = new Notification(senderName, {
          body: message,
          icon: '/favicon.ico',
          tag: `chat-${Date.now()}`,
          silent: true
        });
        n.onclick = () => { window.focus(); n.close(); };
        setTimeout(() => n.close(), 5000);
      } catch (e) {}
    }
  }, []);

  const addInAppNotification = useCallback((senderName, senderId, message) => {
    const id = ++notifIdRef.current;
    const initial = senderName.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
    setNotifications((prev) => [...prev.slice(-4), { id, senderName, senderId, message, senderInitial: initial }]);
    // Auto dismiss after 4 seconds
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 4000);
  }, []);

  const dismissNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const handleNotificationClick = useCallback((notif) => {
    setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
    handleUserSelect(notif.senderId);
  }, [conversations, allUsers]);

  const loadData = async () => {
    try {
      const [convRes, usersRes, nickRes] = await Promise.all([
        axios.get(`${API_URL}/api/conversations`, { withCredentials: true }),
        axios.get(`${API_URL}/api/users`, { withCredentials: true }),
        axios.get(`${API_URL}/api/nicknames`, { withCredentials: true })
      ]);

      const nicks = nickRes.data || {};
      setNicknames(nicks);

      const newConvs = convRes.data;
      const prevConvs = prevConversationsRef.current;

      if (prevConvs.length > 0) {
        newConvs.forEach((nc) => {
          const pc = prevConvs.find((p) => p.id === nc.id);
          if ((!pc && nc.unread_count > 0) || (pc && nc.unread_count > pc.unread_count)) {
            const displayName = nicks[nc.other_user.id] || nc.other_user.name;
            playNotificationSound();
            sendBrowserNotification(displayName, nc.last_message || 'رسالة جديدة');
            addInAppNotification(displayName, nc.other_user.id, nc.last_message || 'رسالة جديدة');
          }
        });
      }

      // Apply nicknames to conversations and users
      const convWithNicks = newConvs.map((c) => ({
        ...c,
        other_user: { ...c.other_user, display_name: nicks[c.other_user.id] || c.other_user.name }
      }));
      const usersWithNicks = usersRes.data.map((u) => ({
        ...u,
        display_name: nicks[u.id] || u.name
      }));

      prevConversationsRef.current = newConvs;
      setConversations(convWithNicks);
      setAllUsers(usersWithNicks);
    } catch (error) {
      // Silent fail
    } finally {
      setLoading(false);
    }
  };

  const handleUserSelect = (userId) => {
    const fromConv = conversations.find((c) => c.other_user.id === userId);
    const fromAll = allUsers.find((u) => u.id === userId);
    const selected = fromConv ? fromConv.other_user : fromAll;
    if (selected) {
      setSelectedUser({ ...selected, display_name: selected.display_name || selected.name });
    }
  };

  const handleBack = () => setSelectedUser(null);
  const handleNewMessage = () => loadData();

  return (
    <div className="h-screen bg-slate-50 dark:bg-slate-900 grid grid-cols-12 relative" data-testid="chat-page">
      <NotificationToast
        notifications={notifications}
        onDismiss={dismissNotification}
        onClickNotification={handleNotificationClick}
      />
      <div className={`col-span-12 md:col-span-4 lg:col-span-3 border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 ${selectedUser ? 'hidden md:block' : ''}`}>
        <Sidebar
          conversations={conversations}
          allUsers={allUsers}
          selectedUserId={selectedUser?.id}
          onSelectUser={handleUserSelect}
          currentUser={user}
        />
      </div>
      <div className={`col-span-12 md:col-span-8 lg:col-span-9 ${!selectedUser ? 'hidden md:block' : ''}`}>
        <ChatWindow
          selectedUser={selectedUser}
          currentUser={user}
          onNewMessage={handleNewMessage}
          onBack={handleBack}
        />
      </div>
    </div>
  );
};
