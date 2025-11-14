import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function FiltersPanel() {
  const [roles, setRoles] = useState<string[]>(["Frontend", "Backend", "Design"]);
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (r: string) => setSelected((s) => (s.includes(r) ? s.filter((x) => x !== r) : [...s, r]));

  return (
    <div className="rounded-xl border p-4">
      <h4 className="font-semibold">Filters</h4>
      <div className="mt-3">
        <div className="text-xs text-muted-foreground">Roles</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {roles.map((r) => (
            <button key={r} onClick={() => toggle(r)} className={`rounded-md border px-3 py-1 text-sm ${selected.includes(r) ? 'bg-primary text-primary-foreground' : ''}`}>
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <div className="text-xs text-muted-foreground">Experience</div>
        <select className="mt-2 w-full rounded-md border px-3 py-2">
          <option>Any</option>
          <option>Junior</option>
          <option>Mid</option>
          <option>Senior</option>
        </select>
      </div>

      <div className="mt-4">
        <div className="text-xs text-muted-foreground">Timezone</div>
        <select className="mt-2 w-full rounded-md border px-3 py-2">
          <option>Any</option>
          <option>UTC -8 to -5 (Americas)</option>
          <option>UTC -1 to +3 (Europe/Africa)</option>
          <option>UTC +5 to +10 (Asia/Oceania)</option>
        </select>
      </div>

      <div className="mt-4 flex justify-end">
        <Button variant="ghost">Reset</Button>
        <Button>Apply</Button>
      </div>
    </div>
  );
}
