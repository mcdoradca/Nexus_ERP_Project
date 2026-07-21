/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

export default function useNexusEngine(API_URL, token, currentUser, activeChat, fetchUnreadCount, fetchData, setChatMessages, setNotifications) {
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (!token) return;

    const newSocket = io(API_URL, { auth: { token } });
    setSocket(newSocket);
    fetchData(); // Inicjalne pobranie danych po autoryzacji
    
    newSocket.on('receive_global_message', (msg) => {
      if (activeChat === 'general') setChatMessages(prev => [...prev, msg]);
    });

    newSocket.on('receive_direct_message', (msg) => {
      if (activeChat === msg.senderId || msg.senderId === currentUser?.id) {
        setChatMessages(prev => [...prev, msg]);
      } else {
        fetchUnreadCount();
      }
    });

    newSocket.on('task_updated', fetchData);
    newSocket.on('new_notification', (notif) => {
      setNotifications(prev => [notif, ...prev]);
      new Audio('/notification.mp3').play().catch(() => {});
    });

    return () => newSocket.disconnect();
  }, [token, activeChat, currentUser?.id]);

  return socket;
}