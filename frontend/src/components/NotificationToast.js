import React, { useState, useEffect } from 'react';
import { X, MessageCircle } from 'lucide-react';

export const NotificationToast = ({ notifications, onDismiss, onClickNotification }) => {
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-full max-w-sm px-4" data-testid="notification-container">
      {notifications.map((notif) => (
        <div
          key={notif.id}
          className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 p-4 flex items-start gap-3 cursor-pointer animate-slide-down hover:bg-slate-50 dark:hover:bg-slate-700/80 transition-colors"
          onClick={() => onClickNotification(notif)}
          data-testid="notification-toast"
        >
          <div className="w-10 h-10 bg-emerald-600 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-white font-medium text-sm">{notif.senderInitial}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-slate-900 dark:text-slate-100 text-sm">{notif.senderName}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">{notif.message}</p>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onDismiss(notif.id); }}
            className="p-1 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-md transition-colors flex-shrink-0"
            data-testid="dismiss-notification"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      ))}
    </div>
  );
};
