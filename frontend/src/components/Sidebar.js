import React, { useState } from 'react';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Input } from './ui/input';
import { LogOut, Search, MessageCircle, Shield } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';

export const Sidebar = ({
  conversations,
  allUsers,
  selectedUserId,
  onSelectUser,
  currentUser
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/');
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
    if (!timestamp) return '';
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true, locale: ar });
    } catch {
      return '';
    }
  };

  const filteredUsers = allUsers.filter((user) =>
    user.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredConversations = conversations.filter((conv) =>
    conv.other_user.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const displayList = searchQuery ? filteredUsers : conversations;

  return (
    <div className="h-screen flex flex-col">
      <div className="p-4 border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Avatar className="w-10 h-10 bg-emerald-600">
              <AvatarFallback className="text-white font-medium">
                {currentUser?.name ? getInitials(currentUser.name) : 'U'}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium text-slate-900">{currentUser?.name}</p>
              <p className="text-xs text-slate-500">متصل</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors duration-200"
            data-testid="logout-btn"
          >
            <LogOut className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        {currentUser?.role === 'admin' && (
          <button
            onClick={() => navigate('/admin')}
            className="w-full mb-3 flex items-center justify-center gap-2 py-2 px-3 bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors duration-200 text-sm font-medium"
            data-testid="admin-panel-btn"
          >
            <Shield className="w-4 h-4" />
            لوحة التحكم
          </button>
        )}

        <div className="relative">
          <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            type="text"
            placeholder="ابحث عن محادثة..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pr-10 focus:ring-2 focus:ring-emerald-500"
            data-testid="search-input"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" data-testid="sidebar-chat-list">
        {searchQuery ? (
          filteredUsers.length === 0 ? (
            <div className="p-6 text-center text-slate-500">
              <MessageCircle className="w-12 h-12 mx-auto mb-2 text-slate-300" />
              <p>لا توجد نتائج</p>
            </div>
          ) : (
            filteredUsers.map((user) => (
              <div
                key={user.id}
                onClick={() => onSelectUser(user.id)}
                className={`p-4 border-b border-slate-100 cursor-pointer transition-colors duration-200 hover:bg-slate-50 ${
                  selectedUserId === user.id ? 'bg-slate-100' : ''
                }`}
                data-testid="chat-list-item"
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Avatar className="w-12 h-12 bg-emerald-600">
                      <AvatarFallback className="text-white font-medium">
                        {getInitials(user.name)}
                      </AvatarFallback>
                    </Avatar>
                    {user.online && (
                      <div className="absolute bottom-0 left-0 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full"></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 truncate">{user.name}</p>
                    <p className="text-sm text-slate-500 truncate">
                      {user.online ? 'متصل' : 'غير متصل'}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )
        ) : conversations.length === 0 ? (
          <div className="p-6 text-center text-slate-500">
            <MessageCircle className="w-12 h-12 mx-auto mb-2 text-slate-300" />
            <p className="mb-2">لا توجد محادثات بعد</p>
            <p className="text-sm">ابحث عن مستخدم لبدء محادثة</p>
          </div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => onSelectUser(conv.other_user.id)}
              className={`p-4 border-b border-slate-100 cursor-pointer transition-colors duration-200 hover:bg-slate-50 ${
                selectedUserId === conv.other_user.id ? 'bg-slate-100' : ''
              }`}
              data-testid="chat-list-item"
            >
              <div className="flex items-start gap-3">
                <div className="relative">
                  <Avatar className="w-12 h-12 bg-emerald-600">
                    <AvatarFallback className="text-white font-medium">
                      {getInitials(conv.other_user.name)}
                    </AvatarFallback>
                  </Avatar>
                  {conv.other_user.online && (
                    <div className="absolute bottom-0 left-0 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full"></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-medium text-slate-900 truncate">
                      {conv.other_user.name}
                    </p>
                    <span className="text-xs text-slate-400">
                      {formatTime(conv.last_message_time)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-500 truncate flex-1">
                      {conv.last_message}
                    </p>
                    {conv.unread_count > 0 && (
                      <span className="bg-emerald-600 text-white text-xs rounded-full px-2 py-0.5 min-w-[20px] text-center">
                        {conv.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
