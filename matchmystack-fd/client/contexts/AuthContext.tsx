// client/contexts/AuthContext.tsx
import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { API_BASE } from "@/utils/api";

interface User {
  id: string | number;
  email: string;
  name?: string | null;
  skills?: string[]; // optional
  [k: string]: any;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  isLoading: boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load token and fetch user on mount
  useEffect(() => {
    const storedToken = localStorage.getItem("mms_token");
    if (storedToken) {
      setToken(storedToken);
      fetchCurrentUser(storedToken);
    } else {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchCurrentUser = async (authToken?: string) => {
    try {
      setIsLoading(true);
      const tokenToUse = authToken ?? localStorage.getItem("mms_token");
      if (!tokenToUse) {
        setUser(null);
        setIsLoading(false);
        return;
      }
      const resp = await fetch(`${API_BASE}/users/me`, {
        headers: { Authorization: `Bearer ${tokenToUse}` },
      });
      if (!resp.ok) {
        // token invalid or no session
        setUser(null);
        localStorage.removeItem("mms_token");
        setToken(null);
        setIsLoading(false);
        return;
      }
      const data = await resp.json();
      setUser(data);
    } catch (err) {
      console.error("fetchCurrentUser error", err);
      setUser(null);
      localStorage.removeItem("mms_token");
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  };

  // expose a named refresh function
  const refreshUser = async () => {
    await fetchCurrentUser();
  };

  const login = (newToken: string, userData: User) => {
    localStorage.setItem("mms_token", newToken);
    setToken(newToken);
    setUser(userData);
  };

 const logout = () => {
  localStorage.removeItem("mms_token");
  setToken(null);
  setUser(null);
  window.dispatchEvent(new Event("user-logout"));
};


  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
