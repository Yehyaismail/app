import React, { useState } from 'react';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Input } from './ui/input';
import { LogOut, Search, MessageCircle, Shield, Moon, Sun, Palette } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useCustomize } from '../contexts/CustomizeContext';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { CustomizePanel } from './CustomizePanel';

export const Sidebar = ({ conversations, allUsers, selectedUserId, onSelectUser, currentUser }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showCustomize, setShowCustomize] = useState(false);
  const { logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { settings } = useCustomize();
  const navigate = useNavigate();

  const handleLogout = async () => { await logout(); navigate('/'); };

  const getInitials = (name) => name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    try { return formatDistanceToNow(new Date(timestamp), { addSuffix: true, locale: ar }); } catch { return ''; }
  };

  const filteredUsers = allUsers.filter((user) => {
    const q = searchQuery.toLowerCase();
    return (user.display_name || user.name).toLowerCase().includes(q) || user.name.toLowerCase().includes(q);
  });

  const filteredConversations = conversations.filter((conv) => {
    const q = searchQuery.toLowerCase();
    return (conv.other_user.display_name || conv.other_user.name).toLowerCase().includes(q) || conv.other_user.name.toLowerCase().includes(q);
  });

  return (
    <div className="h-screen flex flex-col bg-white dark:bg-slate-800">
      <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 sticky top-0 z-20 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Avatar className="w-10 h-10" style={{ backgroundColor: settings.avatarColor }}>
              <AvatarFallback className="text-white font-medium" style={{ backgroundColor: settings.avatarColor }}>{currentUser?.name ? getInitials(currentUser.name) : 'U'}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium text-slate-900 dark:text-slate-100">{currentUser?.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">متصل</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setShowCustomize(true)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors duration-200" data-testid="customize-btn">
              <Palette className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            </button>
            <button onClick={toggleTheme} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors duration-200" data-testid="theme-toggle-btn">
              {isDark ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5 text-slate-600" />}
            </button>
            <button onClick={handleLogout} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors duration-200" data-testid="logout-btn">
              <LogOut className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            </button>
          </div>
        </div>

        {currentUser?.role === 'admin' && (
          <button onClick={() => navigate('/admin')} className="w-full mb-3 flex items-center justify-center gap-2 py-2 px-3 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors duration-200 text-sm font-medium" data-testid="admin-panel-btn">
            <Shield className="w-4 h-4" />لوحة التحكم
          </button>
        )}

        <div className="relative">
          <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input type="text" placeholder="ابحث عن محادثة..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pr-10 focus:ring-2 focus:ring-emerald-500 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100 dark:placeholder-slate-400" data-testid="search-input" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" data-testid="sidebar-chat-list">
        {searchQuery ? (
          filteredUsers.length === 0 && filteredConversations.length === 0 ? (
            <div className="p-6 text-center text-slate-500 dark:text-slate-400">
              <MessageCircle className="w-12 h-12 mx-auto mb-2 text-slate-300 dark:text-slate-600" /><p>لا توجد نتائج</p>
            </div>
          ) : (
            <>
              {filteredConversations.map((conv) => (
                <div key={conv.id} onClick={() => onSelectUser(conv.other_user.id)} className={`p-4 border-b border-slate-100 dark:border-slate-700 cursor-pointer transition-colors duration-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 ${selectedUserId === conv.other_user.id ? 'bg-slate-100 dark:bg-slate-700' : ''}`} data-testid="chat-list-item">
                  <div className="flex items-start gap-3">
                    <div className="relative">
                      <Avatar className="w-12 h-12 bg-emerald-600"><AvatarFallback className="text-white font-medium">{getInitials(conv.other_user.display_name || conv.other_user.name)}</AvatarFallback></Avatar>
                      {conv.other_user.online && <div className="absolute bottom-0 left-0 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-slate-800 rounded-full"></div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{conv.other_user.display_name || conv.other_user.name}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{conv.last_message}</p>
                    </div>
                  </div>
                </div>
              ))}
              {filteredUsers.filter((u) => !filteredConversations.some((c) => c.other_user.id === u.id)).map((user) => (
                <div key={user.id} onClick={() => onSelectUser(user.id)} className={`p-4 border-b border-slate-100 dark:border-slate-700 cursor-pointer transition-colors duration-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 ${selectedUserId === user.id ? 'bg-slate-100 dark:bg-slate-700' : ''}`} data-testid="chat-list-item">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-12 h-12 bg-emerald-600"><AvatarFallback className="text-white font-medium">{getInitials(user.display_name || user.name)}</AvatarFallback></Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{user.display_name || user.name}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{user.online ? 'متصل' : 'غير متصل'}</p>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )
        ) : conversations.length === 0 ? (
          <div className="p-6 text-center text-slate-500 dark:text-slate-400">
            <MessageCircle className="w-12 h-12 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
            <p className="mb-2">لا توجد محادثات بعد</p>
            <p className="text-sm">ابحث عن مستخدم لبدء محادثة</p>
          </div>
        ) : (
          conversations.map((conv) => (
            <div key={conv.id} onClick={() => onSelectUser(conv.other_user.id)} className={`p-4 border-b border-slate-100 dark:border-slate-700 cursor-pointer transition-colors duration-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 ${selectedUserId === conv.other_user.id ? 'bg-slate-100 dark:bg-slate-700' : ''}`} data-testid="chat-list-item">
              <div className="flex items-start gap-3">
                <div className="relative">
                  <Avatar className="w-12 h-12 bg-emerald-600"><AvatarFallback className="text-white font-medium">{getInitials(conv.other_user.name)}</AvatarFallback></Avatar>
                  {conv.other_user.online && <div className="absolute bottom-0 left-0 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-slate-800 rounded-full"></div>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{conv.other_user.display_name || conv.other_user.name}</p>
                    <span className="text-xs text-slate-400 dark:text-slate-500">{formatTime(conv.last_message_time)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-500 dark:text-slate-400 truncate flex-1">{conv.last_message}</p>
                    {conv.unread_count > 0 && (
                      <span className="bg-emerald-600 text-white text-xs rounded-full px-2 py-0.5 min-w-[20px] text-center">{conv.unread_count}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      <CustomizePanel isOpen={showCustomize} onClose={() => setShowCustomize(false)} />
    </div>
  );
};
