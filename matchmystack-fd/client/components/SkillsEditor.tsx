// client/components/SkillsEditor.tsx
import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/utils/api";  // ✅ Changed from apiUpload

type MatchItem = any;

type Props = {
  onMatches: (m: MatchItem[]) => void;
  initialSkills?: string[];
  onChange?: (skills: string[]) => void;
  topK?: number;
};

export default function SkillsEditor({ 
  onMatches, 
  initialSkills = [], 
  onChange, 
  topK = 10 
}: Props) {
  const [skills, setSkills] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (initialSkills.length > 0 && skills.length === 0) {
      setSkills(initialSkills.slice());
    }
  }, [initialSkills]);

  useEffect(() => {
    if (onChange) {
      onChange(skills.slice());
    }
  }, [skills, onChange]);

  const addSkill = () => {
    const s = input.trim();
    if (!s) return;
    if (!skills.some((x) => x.toLowerCase() === s.toLowerCase())) {
      setSkills((p) => [s, ...p]);
    }
    setInput("");
  };

  const remove = (s: string) => setSkills((p) => p.filter((x) => x !== s));

  const handleSaveAndMatch = async () => {
    if (skills.length === 0) {
      setErr("Add at least one skill");
      return;
    }
    setLoading(true);
    setErr(null);

    try {
      // ✅ FIX: Use match_from_profile endpoint with JSON payload
      const payload = {
        name: "Profile User",
        skills: skills,
        roles: ["developer"],
        experience_years: 0,
      };

      const res = await apiFetch(`/match/match_from_profile?top_k=${topK}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      // Extract matches from response
      onMatches(res.matches || []);
      
    } catch (e: any) {
      console.error("Match error:", e);
      setErr(e?.message ?? "Failed to get matches");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col justify-between h-full">
      <div>
        <h4 className="font-semibold">Or add skills manually</h4>
        <p className="mt-2 text-sm text-muted-foreground">
          Type your top skills and click Save & Match.
        </p>

        <div className="mt-3 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSkill();
              }
            }}
            className="w-full rounded-md border px-3 py-2"
            placeholder="Add a skill and press Enter"
          />
          <Button onClick={addSkill}>Add</Button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {skills.length === 0 && (
            <span className="text-sm text-muted-foreground">
              No skills yet.
            </span>
          )}
          {skills.map((s) => (
            <div
              key={s}
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm"
            >
              <span>{s}</span>
              <button
                onClick={() => remove(s)}
                className="text-xs text-muted-foreground hover:text-red-500"
                aria-label={`Remove ${s}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {err && <div className="mt-3 text-sm text-red-600">{err}</div>}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <Button
          onClick={handleSaveAndMatch}
          disabled={loading || skills.length === 0}
        >
          {loading ? "Saving..." : "Save & Match"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setSkills([]);
            setInput("");
            setErr(null);
          }}
        >
          Clear
        </Button>
      </div>
    </div>
  );
}