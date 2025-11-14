import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Eye, EyeOff } from "lucide-react";
import { apiFetch, API_BASE } from "@/utils/api";
import { useAuth } from "@/contexts/AuthContext";
import GoogleLoginButton from "@/lib/GoogleLoginButton";

/** Simple email validator (practical, not overly strict) */
function isValidEmail(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

/** Basic password scoring (0..4) */
function getPasswordScore(pwd: string) {
  let score = 0;
  if (pwd.length >= 8) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  return score;
}
function strengthLabel(score: number) {
  if (score <= 1) return { label: "Very weak", color: "bg-red-500" };
  if (score === 2) return { label: "Weak", color: "bg-orange-400" };
  if (score === 3) return { label: "Good", color: "bg-yellow-400" };
  return { label: "Strong", color: "bg-green-500" };
}

export default function Auth() {
  const { login } = useAuth();
  const [isSignup, setIsSignup] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);

  // Password setup modal states
  const [showPasswordSetup, setShowPasswordSetup] = useState(false);
  const [setupPassword, setSetupPassword] = useState("");
  const [setupPasswordConfirm, setSetupPasswordConfirm] = useState("");
  const [setupLoading, setSetupLoading] = useState(false);

  const emailValid = isValidEmail(email);
  const pwdScore = getPasswordScore(password);
  const pwdStrength = strengthLabel(pwdScore);

  // Password setup strength
  const setupPwdScore = getPasswordScore(setupPassword);
  const setupPwdStrength = strengthLabel(setupPwdScore);

  const handleForgotPassword = async () => {
    setMsg(null);
    if (!emailValid) {
      setMsg("Please enter a valid email address.");
      return;
    }

    try {
      setLoading(true);
      const response = await apiFetch("/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      setMsg(response.message || "Password reset link sent! Check your email.");
    } catch (err: any) {
      console.error("forgot password error", err);
      const body = err?.body ?? err?.message ?? String(err);
      setMsg(`Error: ${JSON.stringify(body)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);

    if (!isSignup && pwdScore < 1) {
      setMsg("Please enter your password.");
      return;
    }

    setLoading(true);
    try{
      const body = `username=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`;
      const resp = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });

      const text = await resp.text();
      let data: any;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }

      if (!resp.ok) {
        const errBody = data || text || resp.statusText;
        throw new Error(JSON.stringify(errBody));
      }

      if (data?.access_token) {
        const token = data.access_token;

        const meResp = await fetch(`${API_BASE}/users/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!meResp.ok) {
          const errText = await meResp.text();
          throw new Error(`Failed fetching user: ${errText || meResp.statusText}`);
        }

        const me = await meResp.json();
        login(token, me);

        // Dispatch site-wide event so other parts (AppShell) can react
        window.dispatchEvent(new CustomEvent("user-login", { detail: me }));

        // clear inline message
        setMsg(null);

      } else {
        setMsg("Logged in (no token returned).");
      }
    } catch (err: any) {
      console.error("auth error", err);
      const body = err?.body ?? err?.message ?? String(err);
      
      // Better error message for Google users
      if (body.includes("Invalid credentials") || body.includes("Incorrect password")) {
        setMsg("Login failed. If you signed up with Google, please use 'Sign in with Google' button above.");
      } else {
        setMsg(`Error: ${JSON.stringify(body)}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl">
      <Card className="p-6">
        <CardContent>
          <h2 className="text-2xl font-bold">
            {showForgotPassword ? "Reset Password" : isSignup ? "Create account" : "Welcome back"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {showForgotPassword 
              ? "Enter your email to receive a password reset link"
              : "Sign in to find teammates, join projects, and match with AI."}
          </p>

          {/* Forgot Password Form */}
          {showForgotPassword && (
            <div className="mt-6 grid gap-3">
              <label className="text-sm">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`w-full rounded-md border px-3 py-2 ${
                  email.length === 0 ? "" : emailValid ? "border-green-300/80" : "border-red-300"
                }`}
                placeholder="you@company.com"
                required
              />

              <div className="mt-4 flex gap-3">
                <Button onClick={handleForgotPassword} disabled={loading || !emailValid}>
                  {loading ? "Sending..." : "Send Reset Link"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowForgotPassword(false);
                    setMsg(null);
                  }}
                >
                  Back to Login
                </Button>
              </div>

              {msg && <div className="mt-3 text-sm text-muted-foreground">{msg}</div>}
            </div>
          )}

          {/* Login Form */}
          {!isSignup && !showForgotPassword && (
            <form onSubmit={handleLoginSubmit} className="mt-6 grid gap-3">
              
              {/* Google Login Button */}
              <GoogleLoginButton 
                onError={(err) => setMsg(err)}
                onSuccess={(needsPassword) => {
                  setMsg(null);
                  if (needsPassword) {
                    setShowPasswordSetup(true);
                  }
                }}
                buttonText="signin_with"
              />

              {/* Divider */}
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">
                    Or continue with email
                  </span>
                </div>
              </div>

              <label className="text-sm">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`w-full rounded-md border px-3 py-2 ${
                  email.length === 0 ? "" : emailValid ? "border-green-300/80" : "border-red-300"
                }`}
                placeholder="you@company.com"
                required
              />
              <label className="text-sm">Password</label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 pr-10"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded"
                  aria-label={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {/* Forgot Password Link */}
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => {
                    setShowForgotPassword(true);
                    setMsg(null);
                  }}
                  className="text-sm text-blue-600 hover:underline"
                >
                  Forgot password?
                </button>
              </div>

              <div className="mt-4 flex gap-3">
                <Button type="submit" size="lg" disabled={loading}>
                  {loading ? "Signing in..." : "Sign in"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsSignup(true);
                    setMsg(null);
                  }}
                >
                  New? Create account
                </Button>
              </div>

              {msg && <div className="mt-3 text-sm text-muted-foreground">{msg}</div>}
            </form>
          )}

          {/* Signup flow WITHOUT OTP */}
          {isSignup && !showForgotPassword && (
            <div className="mt-6 grid gap-3">
              {/* Google Signup Button */}
              <GoogleLoginButton 
                onError={(err) => setMsg(err)}
                onSuccess={(needsPassword) => {
                  setMsg(null);
                  if (needsPassword) {
                    setShowPasswordSetup(true);
                  }
                }}
                buttonText="signup_with"
              />

              {/* Divider */}
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">
                    Or sign up with email
                  </span>
                </div>
              </div>

              <label className="text-sm">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border px-3 py-2"
                placeholder="Your name (optional)"
              />

              <label className="text-sm">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`w-full rounded-md border px-3 py-2 ${
                  email.length === 0 ? "" : emailValid ? "border-green-300/80" : "border-red-300"
                }`}
                placeholder="you@company.com"
                required
              />

              <label className="text-sm">Password</label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 pr-10"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded"
                  aria-label={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              <div className="mt-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                  <div>
                    Password strength: <span className="font-medium">{pwdStrength.label}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{password.length} chars</div>
                </div>
                <div className="w-full h-2 rounded bg-muted/30 overflow-hidden">
                  <div
                    className={`${pwdStrength.color} h-2 transition-all`}
                    style={{ width: `${(pwdScore / 4) * 100}%` }}
                  />
                </div>
              </div>

              <div className="mt-4 flex gap-3">
                <Button 
                  onClick={async () => {
                    setMsg(null);
                    
                    if (!emailValid) {
                      setMsg("Please enter a valid email address");
                      return;
                    }
                    
                    if (pwdScore < 2) {
                      setMsg("Please choose a stronger password");
                      return;
                    }
                    
                    setLoading(true);
                    
                    try {
                      await apiFetch("/auth/signup", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ email, password, name }),
                      });
                      
                      setMsg("✅ Account created! Please sign in.");
                      setIsSignup(false);
                      setPassword("");
                      
                    } catch (err: any) {
                      console.error("signup error", err);
                      const body = err?.body ?? err?.message ?? String(err);
                      setMsg(`Error: ${JSON.stringify(body)}`);
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={loading || !emailValid}
                >
                  {loading ? "Creating account..." : "Create Account"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsSignup(false);
                    setMsg(null);
                  }}
                >
                  Cancel
                </Button>
              </div>

              {msg && <div className="mt-3 text-sm text-muted-foreground">{msg}</div>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Password Setup Modal */}
      {showPasswordSetup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardContent className="p-6">
              <h3 className="text-xl font-bold">Welcome! Set Up Your Password</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Set a password to enable email/password login in addition to Google.
              </p>

              <div className="mt-6 space-y-4">
                {/* Password Input */}
                <div>
                  <label className="text-sm font-medium">Password</label>
                  <div className="relative mt-1">
                    <input
                      type={showPw ? "text" : "password"}
                      value={setupPassword}
                      onChange={(e) => setSetupPassword(e.target.value)}
                      className="w-full rounded-md border px-3 py-2 pr-10"
                      placeholder="Enter password (min 8 characters)"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((s) => !s)}
                      className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded"
                    >
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>

                  {/* Password Strength */}
                  {setupPassword && (
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                        <span>Strength: <strong>{setupPwdStrength.label}</strong></span>
                        <span>{setupPassword.length} chars</span>
                      </div>
                      <div className="w-full h-2 rounded bg-muted/30 overflow-hidden">
                        <div
                          className={`${setupPwdStrength.color} h-2 transition-all`}
                          style={{ width: `${(setupPwdScore / 4) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="text-sm font-medium">Confirm Password</label>
                  <input
                    type={showPw ? "text" : "password"}
                    value={setupPasswordConfirm}
                    onChange={(e) => setSetupPasswordConfirm(e.target.value)}
                    className="mt-1 w-full rounded-md border px-3 py-2"
                    placeholder="Confirm password"
                  />
                </div>

                {/* Error/Success Message */}
                {msg && (
                  <div className={`text-sm p-3 rounded-md ${
                    msg.includes('✅') 
                      ? 'bg-green-50 text-green-800 border border-green-200' 
                      : 'bg-red-50 text-red-800 border border-red-200'
                  }`}>
                    {msg}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3 mt-6">
                  <Button
                    onClick={async () => {
                      setMsg(null);

                      // Validation
                      if (setupPassword.length < 8) {
                        setMsg("Password must be at least 8 characters");
                        return;
                      }

                      if (setupPassword !== setupPasswordConfirm) {
                        setMsg("Passwords do not match");
                        return;
                      }

                      if (setupPwdScore < 2) {
                        setMsg("Please choose a stronger password");
                        return;
                      }

                      setSetupLoading(true);

                      try {
                        await apiFetch("/auth/set-password", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ password: setupPassword }),
                        });

                        setMsg("✅ Password set successfully!");
                        
                        // Wait a moment then redirect
                        setTimeout(() => {
                          setShowPasswordSetup(false);
                          window.location.href = "/discover";
                        }, 1500);

                      } catch (error: any) {
                        console.error("Set password failed:", error);
                        setMsg(error?.body?.detail || "Failed to set password");
                      } finally {
                        setSetupLoading(false);
                      }
                    }}
                    disabled={setupLoading}
                    className="flex-1"
                  >
                    {setupLoading ? "Setting..." : "Set Password"}
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowPasswordSetup(false);
                      window.location.href = "/discover";
                    }}
                    disabled={setupLoading}
                  >
                    Skip for Now
                  </Button>
                </div>

                <p className="text-xs text-center text-muted-foreground mt-2">
                  You can set a password later from your profile settings
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}