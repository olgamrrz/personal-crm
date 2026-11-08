import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Ссылка устарела",
};

// Where Better Auth sends a person whose sign-in link is old, already used or damaged
export default function ExpiredLinkPage() {
  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader>
          <CardTitle className="text-title sm:text-title-lg">Ссылка устарела, запросите новую</CardTitle>
          <CardDescription className="mt-1.5 text-base">
            Ссылка из письма работает 15 минут и только один раз. Новая ссылка отключает прежние.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/login" className={cn(buttonVariants({ size: "lg" }), "h-12 w-full text-base")}>
            Получить новую ссылку
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
