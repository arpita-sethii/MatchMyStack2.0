// App.tsx
import "./global.css";

import { Toaster } from "@/components/ui/toaster";
import { createRoot } from "react-dom/client";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { GoogleOAuthProvider } from '@react-oauth/google'; // ✅ ADD THIS

import { AuthProvider } from "@/contexts/AuthContext";
import { ChatProvider } from "@/contexts/ChatContext";

import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import AppShell from "@/components/layout/AppShell";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Profile from "./pages/Profile";
import Match from "./pages/Match";
import MatchChat from "./pages/MatchChat";
import ChatList from "./pages/ChatList";
import Projects from "./pages/Projects";
import AddProject from "./pages/AddProject";

const queryClient = new QueryClient();

// ✅ ADD THIS
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

if (!GOOGLE_CLIENT_ID) {
  console.warn('⚠️ VITE_GOOGLE_CLIENT_ID not set in .env file');
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}> {/* ✅ ADD THIS */}
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AuthProvider>
          <ChatProvider>
            <BrowserRouter>
              <Routes>
                <Route element={<AppShell />}>
                  <Route path="/" element={<Index />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  
                  <Route path="/match" element={<Match />} />
                  <Route path="/discover" element={<Match />} />
                  
                  <Route path="/chat" element={<ChatList />} />
                  <Route path="/chat/:roomId" element={<MatchChat />} />
                  
                  <Route path="/add-project" element={<AddProject />} />
                  <Route path="/projects" element={<Projects />} />
                  <Route path="/projects/:id/edit" element={<AddProject />} />
                  
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/privacy" element={<NotFound />} />
                  <Route path="/terms" element={<NotFound />} />
                  <Route path="/contact" element={<NotFound />} />
                  
                  <Route path="*" element={<NotFound />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </ChatProvider>
        </AuthProvider>
      </TooltipProvider>
    </GoogleOAuthProvider> {/* ✅ ADD THIS */}
  </QueryClientProvider>
);

createRoot(document.getElementById("root")!).render(<App />);