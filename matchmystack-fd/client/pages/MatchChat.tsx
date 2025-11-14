import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useChat } from "@/contexts/ChatContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Paperclip, Send, Loader2 } from "lucide-react";
import { apiFetch } from "@/utils/api";

export default function MatchChat() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    currentRoom,
    messages,
    isConnected,
    typingUsers,
    loadMessages,
    sendMessage,
    markAsRead,
    setCurrentRoom,
    connectToRoom,
    disconnectFromRoom,
    sendTyping,
    rooms,
  } = useChat();

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [icebreakers, setIcebreakers] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastMessageCountRef = useRef(0);
  const userScrolledUpRef = useRef(false);

  const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

  useEffect(() => {
    if (!roomId) return;
    const room = rooms.find((r) => r.id === parseInt(roomId));
    if (room) {
      setCurrentRoom(room);
      loadMessages(parseInt(roomId));
      connectToRoom(parseInt(roomId));
      markAsRead(parseInt(roomId));
    }
    return () => {
      disconnectFromRoom();
    };
  }, [roomId]);

  useEffect(() => {
    const loadIcebreakers = async () => {
      try {
        const data = await apiFetch("/chat/icebreakers");
        setIcebreakers(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Error loading icebreakers:", error);
      }
    };
    loadIcebreakers();
  }, []);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
      userScrolledUpRef.current = !isAtBottom;
    };
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (messages.length > lastMessageCountRef.current) {
      const lastMessage = messages[messages.length - 1];
      const isOwnMessage = user && lastMessage?.sender_id === user.id;
      if (!userScrolledUpRef.current || isOwnMessage) {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
      lastMessageCountRef.current = messages.length;
    }
  }, [messages, user]);

  const handleInputChange = (value: string) => {
    setInput(value);
    if (value.trim()) {
      sendTyping(true);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        sendTyping(false);
      }, 3000);
    } else {
      sendTyping(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !roomId || sending) return;
    try {
      setSending(true);
      await sendMessage(parseInt(roomId), input.trim());
      setInput("");
      sendTyping(false);
      userScrolledUpRef.current = false;
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } catch (error) {
      console.error("Error sending message:", error);
      alert("Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !roomId) return;
    if (file.size > 10 * 1024 * 1024) {
      alert("File too large. Maximum size is 10MB");
      return;
    }
    try {
      setUploading(true);
      const token = localStorage.getItem("mms_token");
      if (!token) throw new Error("Not authenticated");
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`${API_BASE}/chat/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!response.ok) throw new Error("Upload failed");
      const data = await response.json();
      await sendMessage(parseInt(roomId), file.name, data.file_url, data.file_name, data.file_size);
      userScrolledUpRef.current = false;
    } catch (error) {
      console.error("Error uploading file:", error);
      alert("Failed to upload file");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const useIcebreaker = (text: string) => {
    setInput(text);
  };

  const formatTime = (dateString: string | null | undefined) => {
    if (!dateString) return "";
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "";
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  if (!currentRoom) {
    return (
      <div className="mx-auto max-w-4xl">
        <Card>
          <CardContent className="py-12 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
            <p className="mt-4 text-sm text-muted-foreground">Loading chat...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <Card>
        <CardContent className="p-0">
          <div className="border-b p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={() => navigate("/chat")}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                  <h3 className="font-semibold">{currentRoom.other_user_name}</h3>
                  <p className="text-sm text-muted-foreground">{currentRoom.project_title}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${isConnected ? "bg-green-500" : "bg-muted-foreground/30"}`} />
                <span className="text-xs text-muted-foreground">{isConnected ? "Connected" : "Connecting..."}</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 p-4">
            <div className="lg:col-span-2 flex flex-col gap-4">
              <div ref={messagesContainerRef} className="flex-1 space-y-3 max-h-[60vh] min-h-[400px] p-4 rounded-lg border bg-muted/20" style={{ overflowY: "scroll", scrollBehavior: "smooth" }}>
                {messages.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <p className="text-sm text-muted-foreground">No messages yet. Start the conversation!</p>
                  </div>
                ) : (
                  <>
                    {messages.map((msg) => {
                        console.log("Debug:", { 
                            userId: user?.id, 
                            userIdType: typeof user?.id,
                            senderId: msg.sender_id, 
                            senderIdType: typeof msg.sender_id,
                            isOwn: user && msg.sender_id === user.id
                    });
                    const isOwn = user && msg.sender_id === user.id;
                      return (
                        <div key={msg.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[70%] rounded-lg px-4 py-2 ${isOwn ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                            {!isOwn && <div className="text-xs font-medium mb-1 opacity-70">{msg.sender_name}</div>}
                            {msg.message_type === "file" && msg.file_url ? (
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <Paperclip className="h-4 w-4" />
                                  <a href={`${API_BASE}${msg.file_url}`} target="_blank" rel="noopener noreferrer" className="text-sm underline hover:no-underline">
                                    {msg.file_name || "Download file"}
                                  </a>
                                </div>
                                {msg.content && <p className="text-sm">{msg.content}</p>}
                              </div>
                            ) : (
                              <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                            )}
                            <div className={`mt-1 text-xs ${isOwn ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                              {formatTime(msg.created_at)}
                              {isOwn && msg.is_read && " · Read"}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {typingUsers.length > 0 && (
                      <div className="flex justify-start">
                        <div className="rounded-lg bg-muted px-4 py-2">
                          <p className="text-sm text-muted-foreground italic">{currentRoom.other_user_name} is typing...</p>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>
              <div className="flex items-end gap-2">
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*,.pdf,.doc,.docx,.txt" />
                <Button variant="outline" size="icon" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                </Button>
                <input value={input} onChange={(e) => handleInputChange(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }} className="flex-1 rounded-md border px-4 py-2" placeholder="Write a message..." disabled={sending || uploading} />
                <Button onClick={handleSend} disabled={!input.trim() || sending}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <aside className="space-y-4">
              {icebreakers.length > 0 && (
                <div className="rounded-lg border p-4">
                  <h4 className="font-semibold mb-3">Conversation starters</h4>
                  <p className="text-xs text-muted-foreground mb-3">Click to use a suggested message</p>
                  <div className="space-y-2">
                    {icebreakers.slice(0, 5).map((text, index) => (
                      <button key={index} onClick={() => useIcebreaker(text)} className="w-full rounded-md border px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted/50 hover:border-primary transition-colors">
                        {text}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="rounded-lg border p-4">
                <h4 className="font-semibold mb-2">Match info</h4>
                <p className="text-sm text-muted-foreground">
                  Matched with {currentRoom.other_user_name}
                  {currentRoom.created_at && (() => {
                    try {
                      const date = new Date(currentRoom.created_at);
                      if (!isNaN(date.getTime())) {
                        return <> on {date.toLocaleDateString()}</>;
                      }
                    } catch {
                      return null;
                    }
                    return null;
                  })()}
                </p>
              </div>
            </aside>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}