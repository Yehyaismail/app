import React, { useState, useEffect } from 'react';
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

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 3000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const [convRes, usersRes] = await Promise.all([
        axios.get(`${API_URL}/api/conversations`, { withCredentials: true }),
        axios.get(`${API_URL}/api/users`, { withCredentials: true })
      ]);
      setConversations(convRes.data);
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
    <div className="h-screen bg-slate-50 grid grid-cols-12">
      <div className="col-span-12 md:col-span-4 lg:col-span-3 border-r border-slate-200 bg-white">
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
