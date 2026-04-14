import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '../components/ui/alert-dialog';
import { ArrowRight, Users, MessageSquare, FileIcon, Wifi, Trash2, Search, Shield } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export const AdminPanel = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [usersRes, statsRes] = await Promise.all([
        axios.get(`${API_URL}/api/admin/users`, { withCredentials: true }),
        axios.get(`${API_URL}/api/admin/stats`, { withCredentials: true })
      ]);
      setUsers(usersRes.data);
      setStats(statsRes.data);
    } catch (error) {
      console.error('Error loading admin data:', error);
      if (error.response?.status === 403) {
        navigate('/chat');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId) => {
    setDeleting(userId);
    try {
      await axios.delete(`${API_URL}/api/admin/users/${userId}`, { withCredentials: true });
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      if (stats) {
        setStats({ ...stats, total_users: stats.total_users - 1 });
      }
    } catch (error) {
      console.error('Error deleting user:', error);
    } finally {
      setDeleting(null);
    }
  };

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleDateString('ar-SA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return '-';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900" data-testid="admin-panel">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">لوحة التحكم</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">إدارة المستخدمين والموقع</p>
            </div>
          </div>
          <Button onClick={() => navigate('/chat')} variant="outline" className="flex items-center gap-2 border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 dark:text-slate-200" data-testid="admin-back-to-chat">
            <span>العودة للمحادثات</span><ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8" data-testid="admin-stats">
            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/30 rounded-lg flex items-center justify-center"><Users className="w-5 h-5 text-blue-600" /></div>
                <span className="text-sm text-slate-500 dark:text-slate-400">المستخدمين</span>
              </div>
              <p className="text-3xl font-semibold text-slate-900 dark:text-slate-100" data-testid="stat-total-users">{stats.total_users}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center"><Wifi className="w-5 h-5 text-emerald-600" /></div>
                <span className="text-sm text-slate-500 dark:text-slate-400">متصلين الآن</span>
              </div>
              <p className="text-3xl font-semibold text-slate-900 dark:text-slate-100" data-testid="stat-online-users">{stats.online_users}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-purple-50 dark:bg-purple-900/30 rounded-lg flex items-center justify-center"><MessageSquare className="w-5 h-5 text-purple-600" /></div>
                <span className="text-sm text-slate-500 dark:text-slate-400">الرسائل</span>
              </div>
              <p className="text-3xl font-semibold text-slate-900 dark:text-slate-100" data-testid="stat-total-messages">{stats.total_messages}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-amber-50 dark:bg-amber-900/30 rounded-lg flex items-center justify-center"><FileIcon className="w-5 h-5 text-amber-600" /></div>
                <span className="text-sm text-slate-500 dark:text-slate-400">الملفات</span>
              </div>
              <p className="text-3xl font-semibold text-slate-900 dark:text-slate-100" data-testid="stat-total-files">{stats.total_files}</p>
            </div>
          </div>
        )}

        {/* Users Table */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">المستخدمين ({filteredUsers.length})</h2>
            <div className="relative w-64">
              <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                type="text"
                placeholder="بحث بالاسم أو البريد..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pr-10 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100 dark:placeholder-slate-400"
                data-testid="admin-search-users"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/50 text-right">
                  <th className="px-5 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">المستخدم</th>
                  <th className="px-5 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">البريد</th>
                  <th className="px-5 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">الحالة</th>
                  <th className="px-5 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">الرسائل</th>
                  <th className="px-5 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">تاريخ التسجيل</th>
                  <th className="px-5 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors" data-testid="admin-user-row">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-emerald-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900 dark:text-slate-100 text-sm">{u.name}</p>
                          {u.role === 'admin' && (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/40 px-2 py-0.5 rounded-full">
                              <Shield className="w-3 h-3" />
                              مدير
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600 dark:text-slate-300 ltr" dir="ltr">{u.email}</td>
                    <td className="px-5 py-4">
                      {u.online ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/40 px-2.5 py-1 rounded-full">
                          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                          متصل
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-2.5 py-1 rounded-full">
                          <span className="w-1.5 h-1.5 bg-slate-400 rounded-full"></span>
                          غير متصل
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600 dark:text-slate-300">{u.message_count}</td>
                    <td className="px-5 py-4 text-sm text-slate-600 dark:text-slate-300">{formatDate(u.created_at)}</td>
                    <td className="px-5 py-4">
                      {u.role !== 'admin' ? (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30"
                              disabled={deleting === u.id}
                              data-testid={`delete-user-btn-${u.id}`}
                            >
                              {deleting === u.id ? (
                                <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin"></div>
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="dark:bg-slate-800 dark:border-slate-700">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="dark:text-slate-100">حذف المستخدم</AlertDialogTitle>
                              <AlertDialogDescription className="dark:text-slate-400">
                                هل أنت متأكد من حذف المستخدم <strong className="dark:text-slate-200">{u.name}</strong>؟ سيتم حذف جميع رسائله ومحادثاته. لا يمكن التراجع عن هذا الإجراء.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter className="flex gap-2">
                              <AlertDialogCancel className="dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600 dark:hover:bg-slate-600" data-testid="cancel-delete-btn">إلغاء</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteUser(u.id)}
                                className="bg-red-600 hover:bg-red-700 text-white"
                                data-testid="confirm-delete-btn"
                              >
                                حذف
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      ) : (
                        <span className="text-xs text-slate-400 dark:text-slate-500">-</span>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-slate-400 dark:text-slate-500">
                      لا يوجد مستخدمين
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
