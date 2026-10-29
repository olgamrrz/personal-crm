"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center gap-4 rounded-card bg-card px-6 py-16 text-center sm:rounded-card-lg">
      <h1 className="font-serif text-heading font-medium sm:text-heading-lg">Что-то пошло не так</h1>
      <p className="max-w-md text-muted-foreground">
        Не получилось загрузить данные. Проверьте, что база данных запущена (docker compose up -d), и
        попробуйте ещё раз.
      </p>
      <Button variant="outline" size="lg" onClick={() => retry()}>
        Попробовать ещё раз
      </Button>
    </div>
  );
}
