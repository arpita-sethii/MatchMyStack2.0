// client/components/SwipeDeck.tsx
import { useEffect, useState } from "react";
import { motion, useAnimation } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type ProfileCard = {
  id: string;
  name: string;
  role?: string;
  bio?: string;
  skills?: string[];
};

export default function SwipeDeck({
  matches,
  onAction,
}: {
  matches?: ProfileCard[];
  onAction?: (id: string, action: "match" | "pass") => void;
}) {
  const [deck, setDeck] = useState<ProfileCard[]>(matches || []);
  const controls = useAnimation();

  useEffect(() => {
    if (matches && matches.length > 0) {
      setDeck(matches);
    }
  }, [matches]);

  const top = deck[0];

  const onSwipe = (dir: "left" | "right") => {
    if (!top) return;
    const action = dir === "right" ? "match" : "pass";
    controls
      .start({
        x: dir === "left" ? -700 : 700,
        rotate: dir === "left" ? -12 : 12,
        opacity: 0,
        transition: { duration: 0.28 },
      })
      .then(() => {
        setDeck((d) => d.slice(1));
        onAction?.(top.id, action);
        controls.set({ x: 0, rotate: 0, opacity: 1 });
      });
  };

  return (
    <div
      className="relative mx-auto h-[560px] w-full max-w-lg"
      style={{ zIndex: 10, position: "relative" }}
    >
      {deck.length === 0 && (
        <div className="rounded-xl border p-6 text-center text-sm text-muted-foreground">
          No projects to show. Upload your resume to see matching projects.
        </div>
      )}

      {deck.slice(0, 4).map((card, idx) => {
        const isTop = idx === 0;
        const translateY = idx * 14;
        const scale = 1 - idx * 0.018;
        const z = 50 - idx;
        const transform = `translate(-50%, ${translateY}px) scale(${scale})`;

        return (
          <motion.div
            key={`${card.id ?? "card"}-${idx}`}
            className={cn("origin-bottom rounded-2xl")}
            style={{
              position: "absolute",
              left: "50%",
              top: 20,
              width: "90%",
              maxWidth: 720,
              zIndex: z,
              transformOrigin: "bottom center",
              transform,
              pointerEvents: isTop ? "auto" : "none",
            }}
            animate={isTop ? controls : undefined}
            drag={isTop ? "x" : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.18}
            onDragEnd={(_, info) => {
              if (isTop) {
                if (info.offset.x > 120) onSwipe("right");
                else if (info.offset.x < -120) onSwipe("left");
              }
            }}
          >
            <Card className="h-full overflow-hidden border-muted bg-gradient-to-br from-card to-muted/40 shadow-2xl">
              <CardContent className="h-full p-8">
                <div className="flex h-full flex-col">
                  <div className="flex-1">
                    <div className="mb-2 text-sm uppercase tracking-wider text-muted-foreground">{card.role ?? "Project"}</div>
                    <h3 className="text-3xl font-bold leading-tight">{card.name ?? "Candidate"}</h3>
                    <p className="mt-3 text-base text-muted-foreground">{card.bio ?? ""}</p>

                    <div className="mt-5 flex flex-wrap gap-3">
                      {(card.skills ?? []).map((s) => (
                        <Badge key={s} variant="secondary">{s}</Badge>
                      ))}
                    </div>
                  </div>

                  <div className="mt-8 grid grid-cols-2 gap-4">
                    <button
                      onClick={() => onSwipe("left")}
                      className="h-14 rounded-md border bg-background/70 text-base font-medium text-muted-foreground backdrop-blur transition hover:bg-accent hover:text-foreground"
                    >
                      Pass
                    </button>
                    <button
                      onClick={() => onSwipe("right")}
                      className="h-14 rounded-md bg-primary text-primary-foreground text-base font-medium shadow hover:bg-primary/90"
                    >
                      Match
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}