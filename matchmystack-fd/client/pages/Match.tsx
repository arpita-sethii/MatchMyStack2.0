// client/pages/Match.tsx
import { useEffect, useState } from "react";
import SwipeDeck, { ProfileCard } from "@/components/SwipeDeck";
import ResumeUploader from "@/components/ResumeUploader";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/utils/api";
import { useAuth } from "@/contexts/AuthContext";

export default function Match() {
  const [matches, setMatches] = useState<ProfileCard[] | null>(() => {
    // ✅ Load matches from localStorage on mount
    try {
      const saved = localStorage.getItem('matches');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [promptVisible, setPromptVisible] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [parsedSkills, setParsedSkills] = useState<string[]>([]);
  const [swipedProjects, setSwipedProjects] = useState<Set<string>>(() => {
    // ✅ Load swiped project IDs from localStorage
    try {
      const saved = localStorage.getItem('swipedProjects');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [lastRawResponse, setLastRawResponse] = useState<any>(null);
  const [toast, setToast] = useState<{ text: string; type?: "ok" | "err" } | null>(null);
  const { refreshUser } = useAuth();

  useEffect(() => {
    const handleLogout = () => {
      console.log("User logged out — resetting Match page");
      setParsedSkills([]);
      setMatches(null);
      setPromptVisible(true);
      setSwipedProjects(new Set());
      // ✅ Clear localStorage on logout
      localStorage.removeItem('matches');
      localStorage.removeItem('swipedProjects');
    };

    window.addEventListener("user-logout", handleLogout);
    return () => window.removeEventListener("user-logout", handleLogout);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const normalizeSkills = (arr: any[]): string[] => {
    const map = new Map<string, string>();
    for (const v of arr) {
      if (!v) continue;
      const s = String(v).trim();
      if (!s) continue;
      const key = s.toLowerCase();
      if (!map.has(key)) map.set(key, s);
    }
    return Array.from(map.values());
  };

  // Initial load
  useEffect(() => {
    (async () => {
      // ✅ If we already have matches in state, don't refetch
      if (matches && matches.length > 0) {
        console.log('✅ Using cached matches from localStorage');
        setPromptVisible(false);
        return;
      }
      
      try {
        const me = await apiFetch("/users/me");
        if (me?.skills && Array.isArray(me.skills) && me.skills.length > 0) {
          const normalized = normalizeSkills(me.skills);
          setParsedSkills(normalized);

          try {
            const resp = await apiFetch("/match/match_from_profile", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ skills: normalized, roles: [], experience_years: 0 }),
            });
            if (resp) {
              handleMatches(resp);
              setToast({ text: "Matches loaded from saved skills", type: "ok" });
              setPromptVisible(false);
            }
          } catch (e) {
            console.warn("match_from_profile failed on initial load", e);
          }
        }
      } catch (e) {
        console.warn("No saved profile or unauthenticated", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function extractSkillsFromResponse(res: any): string[] {
    if (!res) return [];
    const out: string[] = [];

    const pushIf = (v: any) => {
      if (!v) return;
      if (Array.isArray(v)) out.push(...v);
      else if (typeof v === "string") out.push(...v.split(/,|\n/).map((s) => s.trim()).filter(Boolean));
      else if (typeof v === "object") {
        Object.values(v).forEach((val) => {
          if (!val) return;
          if (Array.isArray(val)) out.push(...val);
          else if (typeof val === "string") out.push(...val.split(/,|\n/).map((s) => s.trim()).filter(Boolean));
        });
      }
    };

    pushIf(res.skills);
    pushIf(res.parsed_resume?.skills);
    pushIf(res.parsed?.skills);
    pushIf(res.parsed_resume?.parsed?.skills);
    pushIf(res.parsed_resume?.entities?.skills);
    pushIf(res.parsed?.entities?.skills);
    pushIf(res.result?.skills);
    pushIf(res.data?.skills);
    pushIf(res.parsed_resume?.skills_by_category);
    pushIf(res.skills_by_category);
    pushIf(res.parsed_resume?.all_skills);
    pushIf(res.all_skills);

    const normalized = Array.from(
      new Map(
        out
          .map(String)
          .map((s) => s.trim())
          .filter(Boolean)
          .map((s) => [s.toLowerCase(), s])
      ).values()
    );
    return normalized;
  }

  const handleMatches = async (res: any) => {
    console.log("🔍 handleMatches raw response:", res);
    if (!res) return;

    setLastRawResponse(res);

    const skills = extractSkillsFromResponse(res);
    if (skills.length) {
      setParsedSkills(skills);
      try {
        await apiFetch("/users/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skills }),
        });
        
        try { 
          await refreshUser(); 
        } catch {}
        
        setToast({ text: "Skills updated from resume", type: "ok" });
      } catch (e) {
        console.warn("persist skills after parse failed", e);
      }
    }

    let m: any[] | undefined;
    if (Array.isArray(res)) m = res;
    else if (Array.isArray(res.matches)) m = res.matches;
    else if (Array.isArray(res.items)) m = res.items;
    else if (Array.isArray(res.projects)) m = res.projects;
    else if (Array.isArray(res.results)) m = res.results;
    else if (Array.isArray(res.data?.matches)) m = res.data.matches;
    else if (Array.isArray(res.result?.matches)) m = res.result.matches;
    else if (Array.isArray(res.match)) m = res.match;
    else if (res.m && Array.isArray(res.m)) m = res.m;

    console.log("📦 Found matches array:", m ? `${m.length} items` : "NO MATCHES FOUND");
    if (m && m.length) {
      const normalized: ProfileCard[] = m.map((it: any, idx: number) => {
        const titleCandidates = [
          it.title, it.project_title, it.project?.title, it.name, it.display_name, it.full_name, it.user?.name, it.user?.display_name
        ];
        const title = titleCandidates.find((c) => typeof c === "string" && c.trim()) ?? (it.title ?? it.name ?? "Candidate");
        const id = it.project_id ?? it.user_id ?? it.id ?? it.key ?? `m-${idx}`;

        let itemSkills: string[] = [];
        if (Array.isArray(it.required_skills)) itemSkills.push(...it.required_skills);
        if (Array.isArray(it.skills)) itemSkills.push(...it.skills);
        if (Array.isArray(it.tags)) itemSkills.push(...it.tags);
        if (Array.isArray(it.technologies)) itemSkills.push(...it.technologies);
        if (typeof it.required_skills === "string") itemSkills.push(...it.required_skills.split(/,|\n/).map((s: string) => s.trim()).filter(Boolean));
        itemSkills = Array.from(new Set(itemSkills.map(String).map((s) => s.trim()).filter(Boolean)));

        let itemRoles: string[] = [];
        if (Array.isArray(it.required_roles)) itemRoles.push(...it.required_roles);
        if (Array.isArray(it.roles)) itemRoles.push(...it.roles);
        if (typeof it.required_roles === "string") itemRoles.push(...it.required_roles.split(/,|\n/).map((s: string) => s.trim()).filter(Boolean));
        if (typeof it.role === "string") itemRoles.push(it.role);
        itemRoles = Array.from(new Set(itemRoles.map(String).map((s) => s.trim()).filter(Boolean)));

        return {
          id: String(id),
          name: String(title),
          role: itemRoles.length > 0 ? itemRoles.join(", ") : (it.position ?? "Project"),
          bio: it.bio ?? it.description ?? it.project_description ?? it.reason ?? "",
          skills: itemSkills,
        } as ProfileCard;
      });

      console.log("✅ Transformed to ProfileCards:", normalized);
      
      // ✅ Filter out swiped projects
      const filtered = normalized.filter(card => !swipedProjects.has(card.id));
      console.log(`🔍 Filtered ${normalized.length - filtered.length} already-swiped projects`);
      
      setMatches(filtered);
      
      // ✅ Save to localStorage
      try {
        localStorage.setItem('matches', JSON.stringify(filtered));
      } catch (e) {
        console.warn('Failed to save matches to localStorage', e);
      }
    } else {
      console.warn("⚠️ No matches array found in response");
      setMatches(null);
      localStorage.removeItem('matches');
    }

    try { 
      await refreshUser(); 
    } catch (e) { 
      /* ignore */ 
    }

    setToast({ text: "Matches updated", type: "ok" });
    setPromptVisible(false);
    setError(null);
  };

  const saveSkillsToServer = async (skillsToSave?: string[]) => {
    const skills = Array.from(new Set((skillsToSave ?? parsedSkills).map((s) => String(s).trim()).filter(Boolean)));
    setParsedSkills(skills);

    try {
      await apiFetch("/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skills }),
      });

      try { 
        await refreshUser(); 
      } catch (e) { 
        console.warn("refreshUser failed", e); 
      }

      setToast({ text: "Skills saved! Finding better matches...", type: "ok" });

      const matchResp = await apiFetch("/match/match_from_profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skills, roles: [], experience_years: 0 }),
      });

      await handleMatches(matchResp);
      setToast({ text: "Matches refreshed from saved skills", type: "ok" });
    } catch (e: any) {
      console.error("saveSkillsToServer failed", e);
      
      if (e.status === 401) {
        setToast({ text: "Please log in again", type: "err" });
      } else {
        setToast({ text: `Save/match failed: ${e?.message ?? e}`, type: "err" });
      }
    }
  };

  const addSkillAndPersist = async (newSkillRaw: string) => {
    const newSkill = String(newSkillRaw).trim();
    if (!newSkill) return;

    const lower = newSkill.toLowerCase();
    if (parsedSkills.some((s) => s.toLowerCase() === lower)) {
      setToast({ text: "Skill already present", type: "err" });
      return;
    }

    const updated = [...parsedSkills, newSkill];
    await saveSkillsToServer(updated);
  };

  const removeSkillAndPersist = async (skillToRemove: string) => {
    const updated = parsedSkills.filter((s) => s !== skillToRemove);
    await saveSkillsToServer(updated);
  };

  const handleAction = async (projectId: string, action: "match" | "pass") => {
    console.log(`User ${action}ed project ${projectId}`);

    // ✅ Mark project as swiped immediately
    const newSwipedProjects = new Set(swipedProjects);
    newSwipedProjects.add(projectId);
    setSwipedProjects(newSwipedProjects);
    
    // ✅ Save to localStorage
    try {
      localStorage.setItem('swipedProjects', JSON.stringify([...newSwipedProjects]));
    } catch (e) {
      console.warn('Failed to save swiped projects', e);
    }

    try {
      const response = await apiFetch(`/projects/${projectId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      console.log(`✓ Action recorded:`, response);

      if (action === "match") {
        try {
          const chatResponse = await apiFetch(`/chat/rooms/${projectId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          });

          console.log("✓ Chat room created");
          setToast({ text: "✨ Matched! Go to Chat to connect", type: "ok" });
        } catch (error) {
          console.error("Failed to create chat room:", error);
          setToast({ text: "✨ Matched! Check Chat page", type: "ok" });
        }
      } else {
        setToast({ text: "Passed", type: "ok" });
      }
    } catch (error: any) {
      console.error(`Failed to record ${action} action:`, error);
      
      if (error.status === 401) {
        setToast({ text: "Please log in to continue", type: "err" });
      } else {
        setToast({ text: `Failed to record ${action}`, type: "err" });
      }
    }
  };

  const displayMatches = matches || [];

  return (
    <div className="mx-auto max-w-6xl">
      {toast && (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: 9999 }}>
          <div className={`rounded-md border px-4 py-2 shadow ${toast.type === "err" ? "bg-red-50 text-red-800" : "bg-white"}`}>
            <div className="text-sm">{toast.text}</div>
          </div>
        </div>
      )}

      <div className="flex items-start gap-8">
        <div className="w-full md:w-2/3 space-y-6">
          {/* 1) Get better matches */}
          <div className="rounded-xl border p-6">
            <h3 className="text-lg font-semibold">Get better matches</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Upload your most recent resume — we'll parse your profile and return top matches to swipe.
            </p>

            <div className="mt-6">
              <div className="rounded-xl border p-5 bg-white">
                <ResumeUploader onMatches={handleMatches} />
              </div>
            </div>
          </div>

          {/* 2) Detected skills (editable) */}
          <div className="rounded-xl border p-4">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold">Detected skills</h4>
              <div className="text-xs text-muted-foreground">Edit, add or remove skills</div>
            </div>

            <div className="mt-3">
              <div className="flex flex-wrap gap-2">
                {parsedSkills.length === 0 && (
                  <div className="text-sm text-muted-foreground">No skills detected yet.</div>
                )}
                {parsedSkills.map((s) => (
                  <div
                    key={s}
                    className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm"
                  >
                    <span>{s}</span>
                    <button
                      onClick={() => removeSkillAndPersist(s)}
                      className="text-xs text-muted-foreground hover:text-red-600"
                      aria-label={`Remove ${s}`}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex items-center gap-3">
                <input
                  placeholder="Add a new skill"
                  className="rounded-md border px-3 py-2 flex-1"
                  onKeyDown={async (e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const input = e.target as HTMLInputElement;
                      const newSkill = input.value.trim();
                      if (newSkill) {
                        await addSkillAndPersist(newSkill);
                        input.value = "";
                      }
                    }
                  }}
                />
                <Button
                  onClick={async () => {
                    const input = document.querySelector<HTMLInputElement>('input[placeholder="Add a new skill"]');
                    if (!input) return;
                    const newSkill = input.value.trim();
                    if (newSkill) {
                      await addSkillAndPersist(newSkill);
                      input.value = "";
                    }
                  }}
                >
                  Add skill
                </Button>

                <Button onClick={() => saveSkillsToServer(parsedSkills)} disabled={parsedSkills.length === 0}>
                  Save skills
                </Button>
              </div>
            </div>
          </div>

          {/* 3) Swipe deck */}
          <div className="rounded-xl border p-6">
            <div className="mb-6">
              <h2 className="text-2xl font-bold">Discover teammates</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Swipe right to match, left to pass
              </p>
            </div>

            <div className="flex justify-center">
              <SwipeDeck matches={displayMatches} onAction={handleAction} />
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <aside className="hidden w-1/3 md:block">
          <div className="sticky top-24 space-y-4">
            <div className="rounded-xl border p-4">
              <h4 className="font-semibold">Tips</h4>
              <p className="mt-2 text-sm text-muted-foreground">
                Match with projects that align with your skills for the best collaborations.
              </p>
            </div>

            <div className="rounded-xl border p-4">
              <h4 className="font-semibold">Match stats</h4>
              <p className="mt-2 text-sm text-muted-foreground">
                Your compatibility score is computed from skills, timezone and availability.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}