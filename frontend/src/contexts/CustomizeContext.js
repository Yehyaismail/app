import React, { createContext, useContext, useState, useEffect } from 'react';

const DEFAULT_SETTINGS = {
  avatarColor: '#059669',
  chatBg: '',
  chatBgColor: '',
  chatBgImage: '',
  sentBubbleColor: '',
  receivedBubbleColor: '',
  fontFamily: '',
  fontSize: 'base',
};

const CustomizeContext = createContext(null);

export const useCustomize = () => {
  const ctx = useContext(CustomizeContext);
  if (!ctx) throw new Error('useCustomize must be used within CustomizeProvider');
  return ctx;
};

export const CustomizeProvider = ({ children }) => {
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('chat-customize');
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch { return DEFAULT_SETTINGS; }
  });

  useEffect(() => {
    localStorage.setItem('chat-customize', JSON.stringify(settings));
  }, [settings]);

  const updateSetting = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const resetSettings = () => setSettings(DEFAULT_SETTINGS);

  return (
    <CustomizeContext.Provider value={{ settings, updateSetting, resetSettings }}>
      {children}
    </CustomizeContext.Provider>
  );
};
