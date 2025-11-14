// client/pages/Profile.tsx
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";

export default function Profile() {
  const { user, refreshUser } = useAuth();

  // local editable state — initialize from context user (if present)
  const [name, setName] = useState(user?.name ?? "");
  const [role, setRole] = useState(user?.role ?? "Frontend Engineer");
  const [bio, setBio] = useState(user?.bio ?? "I build delightful, performant user interfaces.");
  const [skills, setSkills] = useState<string[]>(user?.skills ?? []);
  const [skillInput, setSkillInput] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeURL, setResumeURL] = useState<string | null>(null);
  const resumeRef = useRef<HTMLInputElement | null>(null);
  const avatarRef = useRef<HTMLInputElement | null>(null);
  const [joinedTeams, setJoinedTeams] = useState<string[]>([]);

  // when context user updates (e.g. after refreshUser), sync into local state
  useEffect(() => {
    setName(user?.name ?? "");
    setRole(user?.role ?? "Frontend Engineer");
    setBio(user?.bio ?? "I build delightful, performant user interfaces.");
    setSkills(user?.skills ?? []);
  }, [user]);

  const addSkill = () => {
    const s = skillInput.trim();
    if (s && !skills.includes(s)) {
      setSkills((k) => [s, ...k]);
    }
    setSkillInput("");
  };

  const handleAvatar = (file?: File) => {
    if (!file) return;
    setAvatar(URL.createObjectURL(file));
  };

  const handleResume = (file?: File) => {
    if (!file) return;
    setResumeFile(file);
    setResumeURL(URL.createObjectURL(file));
  };

  // optional: call refreshUser to get latest server-side saved skills
  const refresh = async () => {
    try {
      await refreshUser();
    } catch (e) {
      console.warn("refreshUser failed", e);
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <div className="grid gap-6 md:grid-cols-3">
        <aside className="col-span-1">
          <Card>
            <CardContent>
              <div className="flex flex-col items-center gap-4">
                <div className="flex flex-col items-center">
                  <div className="h-28 w-28 rounded-full bg-muted/40 overflow-hidden">
                    {avatar ? (
                      <img src={avatar} alt="avatar" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">No photo</div>
                    )}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleAvatar(e.target.files?.[0] ?? undefined)} />
                    <Button onClick={() => avatarRef.current?.click()}>Change photo</Button>
                    {avatar && (
                      <Button variant="ghost" onClick={() => setAvatar(null)}>Remove</Button>
                    )}
                  </div>
                </div>

                <h3 className="text-xl font-semibold">{name || user?.email}</h3>
                <p className="text-sm text-muted-foreground">{role}</p>
                <div className="mt-3 flex w-full flex-wrap gap-2">
                  {skills.map((s) => (
                    <Badge key={s} variant="secondary">{s}</Badge>
                  ))}
                </div>

                <div className="mt-4 w-full">
                  <label className="text-sm">Resume</label>
                  <div className="mt-2 flex items-center gap-3">
                    <input ref={resumeRef} type="file" accept="application/pdf,application/msword" className="hidden" onChange={(e) => handleResume(e.target.files?.[0] ?? undefined)} />
                    <Button onClick={() => resumeRef.current?.click()}>Upload resume</Button>
                    {resumeFile && (
                      <div className="flex items-center gap-2 text-sm">
                        <a href={resumeURL ?? "#"} download className="text-primary underline">{resumeFile.name}</a>
                        <button onClick={() => { setResumeFile(null); setResumeURL(null); }} className="text-muted-foreground">Remove</button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 w-full">
                  <Button className="w-full" onClick={refresh}>Refresh from server</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </aside>

        <section className="col-span-2 space-y-4">
          <Card>
            <CardContent>
              <h3 className="text-lg font-semibold">Edit profile</h3>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div>
                  <label className="text-sm">Full name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2" />
                </div>
                <div>
                  <label className="text-sm">Role</label>
                  <input value={role} onChange={(e) => setRole(e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2" />
                </div>
                <div className="md:col-span-2">
                  <label className="text-sm">Bio</label>
                  <textarea value={bio} onChange={(e) => setBio(e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2" rows={4} />
                </div>

                <div className="md:col-span-2">
                  <label className="text-sm">Top skills</label>
                  <div className="mt-2 flex gap-2">
                    <input value={skillInput} onChange={(e) => setSkillInput(e.target.value)} className="w-full rounded-md border px-3 py-2" placeholder="Add a skill and press Enter" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill(); } }} />
                    <Button onClick={addSkill}>Add</Button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {skills.map((s) => (
                      <Badge key={s} variant="outline">{s}</Badge>
                    ))}
                  </div>
                </div>

                <div className="md:col-span-2 flex items-center justify-end gap-3">
                  <Button variant="ghost">Cancel</Button>
                  <Button>Save profile</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <h3 className="text-lg font-semibold">Connected accounts</h3>
              <p className="mt-2 text-sm text-muted-foreground">Connect GitHub and Google for easier onboarding.</p>
              <div className="mt-4 flex gap-3">
                <Button variant="outline">Connect GitHub</Button>
                <Button variant="outline">Connect Google</Button>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
