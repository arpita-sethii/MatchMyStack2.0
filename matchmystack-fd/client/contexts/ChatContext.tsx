// client/contexts/ChatContext.tsx - FIXED VERSION
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "./AuthContext";

interface Message {
  id: number;
  room_id: number;
  sender_id: number;
  sender_name: string;
  content: string;
  message_type: string;
  file_url?: string;
  file_name?: string;
  file_size?: number;
  is_read: boolean;
  created_at: string;
}

interface ChatRoom {
  id: number;
  project_id: number;
  project_title: string;
  other_user_id: number;
  other_user_name: string;
  last_message_preview?: string;
  last_message_at?: string;
  unread_count: number;
  created_at: string;
}

interface ChatContextType {
  rooms: ChatRoom[];
  currentRoom: ChatRoom | null;
  messages: Message[];
  unreadCount: number;
  isConnected: boolean;
  typingUsers: number[];
  
  loadRooms: () => Promise<void>;
  loadMessages: (roomId: number) => Promise<void>;
  sendMessage: (roomId: number, content: string, fileUrl?: string, fileName?: string, fileSize?: number) => Promise<void>;
  markAsRead: (roomId: number) => Promise<void>;
  setCurrentRoom: (room: ChatRoom | null) => void;
  connectToRoom: (roomId: number) => void;
  disconnectFromRoom: () => void;
  sendTyping: (isTyping: boolean) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [currentRoom, setCurrentRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [typingUsers, setTypingUsers] = useState<number[]>([]);
  
  const wsRef = useRef<WebSocket | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentRoomIdRef = useRef<number | null>(null);
  const loadingMessagesRef = useRef(false);

  const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";
  const WS_BASE = API_BASE.replace("http", "ws");

  const loadRooms = useCallback(async () => {
    if (!token) return;

    try {
      const response = await fetch(`${API_BASE}/chat/rooms`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error("Failed to load rooms");

      const data = await response.json();
      setRooms(data);

      const total = data.reduce((sum: number, room: ChatRoom) => sum + room.unread_count, 0);
      setUnreadCount(total);
    } catch (error) {
      console.error("Error loading rooms:", error);
    }
  }, [token, API_BASE]);

  const loadMessages = useCallback(async (roomId: number) => {
    if (!token) return;
    
    if (loadingMessagesRef.current && currentRoomIdRef.current === roomId) {
      console.log("Already loading messages for room", roomId);
      return;
    }

    try {
      loadingMessagesRef.current = true;
      
      const response = await fetch(`${API_BASE}/chat/rooms/${roomId}/messages?limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error("Failed to load messages");

      const data = await response.json();
      setMessages(data);
    } catch (error) {
      console.error("Error loading messages:", error);
    } finally {
      loadingMessagesRef.current = false;
    }
  }, [token, API_BASE]);

  const sendMessage = useCallback(async (
    roomId: number,
    content: string,
    fileUrl?: string,
    fileName?: string,
    fileSize?: number
  ) => {
    if (!token) return;

    try {
      const response = await fetch(`${API_BASE}/chat/rooms/${roomId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          content,
          message_type: fileUrl ? "file" : "text",
          file_url: fileUrl,
          file_name: fileName,
          file_size: fileSize,
        }),
      });

      if (!response.ok) throw new Error("Failed to send message");

      const newMessage = await response.json();

      setMessages((prev) => [...prev, newMessage]);

      // Broadcast via WebSocket if connected
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: "message",
          data: newMessage,
        }));
      }

      // Reload rooms to update last message
      await loadRooms();
    } catch (error) {
      console.error("Error sending message:", error);
      throw error;
    }
  }, [token, API_BASE, loadRooms]);

  const markAsRead = useCallback(async (roomId: number) => {
    if (!token) return;

    try {
      await fetch(`${API_BASE}/chat/rooms/${roomId}/read`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      setRooms((prev) =>
        prev.map((room) =>
          room.id === roomId ? { ...room, unread_count: 0 } : room
        )
      );

      const total = rooms.reduce((sum, room) => 
        room.id === roomId ? sum : sum + room.unread_count, 0
      );
      setUnreadCount(total);

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: "read",
          message_ids: messages.map(m => m.id),
        }));
      }
    } catch (error) {
      console.error("Error marking as read:", error);
    }
  }, [token, API_BASE, rooms, messages]);

  const connectToRoom = useCallback((roomId: number) => {
    if (!token) return;

    if (currentRoomIdRef.current === roomId && wsRef.current?.readyState === WebSocket.OPEN) {
      console.log("Already connected to room", roomId);
      return;
    }

    if (wsRef.current) {
      wsRef.current.close();
    }

    currentRoomIdRef.current = roomId;

    try {
      const ws = new WebSocket(`${WS_BASE}/ws/chat/${roomId}?token=${token}`);

      ws.onopen = () => {
        console.log(`✓ Connected to room ${roomId}`);
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === "message") {
            setMessages((prev) => {
              if (prev.some(m => m.id === data.data.id)) return prev;
              return [...prev, data.data];
            });

            loadRooms();
          } else if (data.type === "typing") {
            if (data.is_typing) {
              setTypingUsers((prev) => 
                prev.includes(data.user_id) ? prev : [...prev, data.user_id]
              );
            } else {
              setTypingUsers((prev) => prev.filter(id => id !== data.user_id));
            }
          } else if (data.type === "read") {
            setMessages((prev) =>
              prev.map((msg) =>
                data.message_ids?.includes(msg.id)
                  ? { ...msg, is_read: true }
                  : msg
              )
            );
          }
        } catch (error) {
          console.error("Error processing WebSocket message:", error);
        }
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        setIsConnected(false);
      };

      ws.onclose = () => {
        console.log(`✗ Disconnected from room ${roomId}`);
        setIsConnected(false);
        currentRoomIdRef.current = null;
      };

      wsRef.current = ws;
    } catch (error) {
      console.error("Error connecting to WebSocket:", error);
    }
  }, [token, WS_BASE, loadRooms]);

  const disconnectFromRoom = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
      setIsConnected(false);
      setTypingUsers([]);
      currentRoomIdRef.current = null;
    }
  }, []);

  const sendTyping = useCallback((isTyping: boolean) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(JSON.stringify({
      type: "typing",
      is_typing: isTyping,
    }));

    if (isTyping) {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        sendTyping(false);
      }, 3000);
    }
  }, []);

  useEffect(() => {
    if (token) {
      loadRooms();
    }
  }, [token, loadRooms]);

  useEffect(() => {
    return () => {
      disconnectFromRoom();
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [disconnectFromRoom]);

  useEffect(() => {
    const handleLogout = () => {
      console.log("Logout detected - cleaning up chat");
      disconnectFromRoom();
      setRooms([]);
      setMessages([]);
      setCurrentRoom(null);
      setUnreadCount(0);
      setTypingUsers([]);
    };

    window.addEventListener('user-logout', handleLogout);
    
    return () => {
      window.removeEventListener('user-logout', handleLogout);
    };
  }, [disconnectFromRoom]);

  const value: ChatContextType = {
    rooms,
    currentRoom,
    messages,
    unreadCount,
    isConnected,
    typingUsers,
    loadRooms,
    loadMessages,
    sendMessage,
    markAsRead,
    setCurrentRoom,
    connectToRoom,
    disconnectFromRoom,
    sendTyping,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within ChatProvider");
  }
  return context;
}