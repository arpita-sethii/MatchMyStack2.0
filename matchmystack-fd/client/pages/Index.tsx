import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Wand2, Users, Workflow } from "lucide-react";

export default function Index() {
  return (
    <div className="space-y-24">
      <section className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/10 via-primary/5 to-accent/40 p-8 md:p-12">
        <div className="mx-auto grid max-w-6xl items-center gap-10 md:grid-cols-2">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" /> Hackathon × Project 
            </div>

            <h1 className="mt-4 text-4xl font-extrabold tracking-tight md:text-5xl">
              Find your perfect project and hackathon team
            </h1>

            <p className="mt-4 text-base text-muted-foreground md:text-lg">
              Match My Stack connects builders by skills, availability, and vibes.
              Swipe to match with teammates and projects, then form teams and ship.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button size="lg" asChild>
                <a href="/auth">Create your profile</a>
              </Button>
              {/* <Button variant="secondary" size="lg" asChild>
                <a href="#demo">Try the swipe demo</a>
              </Button> */}
            </div>

            {/* Replace these badges with whatever short features you prefer */}
            <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary" className="inline-flex items-center gap-2">
                <Wand2 className="h-3 w-3" /> Realtime Chat
              </Badge>
              <Badge variant="secondary" className="inline-flex items-center gap-2">
                <Users className="h-3 w-3" /> AI-powered Matches
              </Badge>
              <Badge variant="secondary" className="inline-flex items-center gap-2">
                <Workflow className="h-3 w-3" /> File & Resume Sharing
              </Badge>
            </div>
          </div>

           <div className="flex items-center justify-center">
            <img
              src="/pics/hero.png"
              alt="Team collaboration illustration"
              className="max-h-64 md:max-h-80 lg:max-h-[360px] object-cover rounded-2xl shadow-lg"
              loading="lazy"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
