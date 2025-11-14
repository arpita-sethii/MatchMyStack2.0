// client/pages/ChatList.tsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useChat } from "@/contexts/ChatContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageCircle, ArrowLeft } from "lucide-react";

export default function ChatList() {
  const navigate = useNavigate();
  const { rooms, loadRooms, unreadCount } = useChat();

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  const formatTime = (dateString?: string) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/discover")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Messages</h1>
            <p className="text-sm text-muted-foreground">
              {rooms.length} conversation{rooms.length !== 1 ? "s" : ""}
              {unreadCount > 0 && ` · ${unreadCount} unread`}
            </p>
          </div>
        </div>
      </div>

      {rooms.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageCircle className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-semibold">No conversations yet</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Match with projects on the Discover page to start chatting!
            </p>
            <Button className="mt-6" onClick={() => navigate("/discover")}>
              Go to Discover
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rooms.map((room) => (
            <Card
              key={room.id}
              className="cursor-pointer transition-colors hover:bg-muted/50"
              onClick={() => navigate(`/chat/${room.id}`)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold truncate">
                        {room.other_user_name}
                      </h3>
                      {room.unread_count > 0 && (
                        <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
                          {room.unread_count}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate mt-0.5">
                      {room.project_title}
                    </p>
                    {room.last_message_preview && (
                      <p className="text-sm text-muted-foreground truncate mt-1">
                        {room.last_message_preview}
                      </p>
                    )}
                  </div>
                  <div className="ml-4 text-xs text-muted-foreground whitespace-nowrap">
                    {formatTime(room.last_message_at || room.created_at)}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}