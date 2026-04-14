import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { ArrowRight } from 'lucide-react';

const formatApiErrorDetail = (detail) => {
  if (detail == null) return 'حدث خطأ. يرجى المحاولة مرة أخرى.';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === 'string' ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(' ');
  if (detail && typeof detail.msg === 'string') return detail.msg;
  return String(detail);
};

export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      if (isLogin) {
        await login(email, password);
      } else {
        if (!name.trim()) {
          setError('الرجاء إدخال الاسم');
          return;
        }
        await register(name, email, password);
      }
      navigate('/chat');
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-cover bg-center"
      style={{
        backgroundImage:
          'url(https://images.unsplash.com/photo-1660164963725-2ff555ea1aa1?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMzJ8MHwxfHNlYXJjaHwxfHxtaW5pbWFsaXN0JTIwbGlnaHQlMjBuYXR1cmUlMjBiYWNrZ3JvdW5kfGVufDB8fHx8MTc3NjE5MDczMnww&ixlib=rb-4.1.0&q=85)'
      }}
    >
      <div
        className="w-full max-w-md p-8 backdrop-blur-xl bg-white/70 border-white/40 shadow-[0_8px_32px_rgba(0,0,0,0.12)] rounded-2xl"
        data-testid="login-form"
      >
        <div className="text-center mb-8">
          <h1 className="text-4xl font-light tracking-tight text-slate-900 mb-2">
            {isLogin ? 'تسجيل الدخول' : 'إنشاء حساب'}
          </h1>
          <p className="text-slate-500 text-sm">
            {isLogin ? 'مرحباً بك مجدداً' : 'انضم إلينا الآن'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {!isLogin && (
            <div>
              <label className="block text-sm text-slate-700 mb-2">الاسم</label>
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="أدخل اسمك"
                className="w-full focus:ring-2 focus:ring-emerald-500"
                data-testid="register-name-input"
              />
            </div>
          )}

          <div>
            <label className="block text-sm text-slate-700 mb-2">
              البريد الإلكتروني
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@email.com"
              required
              className="w-full focus:ring-2 focus:ring-emerald-500"
              data-testid="login-email-input"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-700 mb-2">كلمة المرور</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full focus:ring-2 focus:ring-emerald-500"
              data-testid="login-password-input"
            />
          </div>

          {error && (
            <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg" data-testid="login-error">
              {error}
            </div>
          )}

          <Button
            type="submit"
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-6 rounded-xl text-base font-medium transition-colors duration-200 flex items-center justify-center gap-2"
            data-testid="login-submit-btn"
          >
            {isLogin ? 'دخول' : 'إنشاء حساب'}
            <ArrowRight className="w-5 h-5" />
          </Button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
            }}
            className="text-sm text-emerald-700 hover:text-emerald-800 transition-colors duration-200"
            data-testid="toggle-auth-mode"
          >
            {isLogin ? 'ليس لديك حساب؟ إنشاء حساب جديد' : 'لديك حساب؟ تسجيل الدخول'}
          </button>
        </div>
      </div>
    </div>
  );
};
