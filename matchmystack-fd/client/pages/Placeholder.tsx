import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function Placeholder({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      <p className="mt-3 text-muted-foreground">
        This page is a placeholder. Tell me what you want here and I’ll build it next. Meanwhile, explore the demo below.
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <Button asChild>
          <Link to="/">Back to Home</Link>
        </Button>
        <Button asChild variant="secondary">
          <a href="#demo">See demo</a>
        </Button>
      </div>
    </div>
  );
}
