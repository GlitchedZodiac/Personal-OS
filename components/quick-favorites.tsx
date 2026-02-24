"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Star, Plus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Favorite {
  id: string;
  foodDescription: string;
  mealType: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  usageCount: number;
}

interface QuickFavoritesProps {
  onFoodLogged?: () => void;
}

export function QuickFavorites({ onFoodLogged }: QuickFavoritesProps) {
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);
  const [loggingId, setLoggingId] = useState<string | null>(null);

  const fetchFavorites = async () => {
    try {
      const res = await fetch("/api/health/favorites");
      if (res.ok) {
        const data = await res.json();
        setFavorites(data);
      }
    } catch (error) {
      console.error("Failed to fetch favorites:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFavorites();
  }, []);

  const logFavorite = async (fav: Favorite) => {
    setLoggingId(fav.id);
    try {
      const res = await fetch("/api/health/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loggedAt: new Date().toISOString(),
          foodDescription: fav.foodDescription,
          mealType: fav.mealType,
          calories: fav.calories,
          proteinG: fav.proteinG,
          carbsG: fav.carbsG,
          fatG: fav.fatG,
          logNow: true,
        }),
      });
      if (res.ok) {
        toast.success(`Logged ${fav.foodDescription}!`);
        onFoodLogged?.();
        fetchFavorites(); // Refresh to update usage counts
      }
    } catch {
      toast.error("Failed to log food");
    } finally {
      setLoggingId(null);
    }
  };

  const removeFavorite = async (id: string) => {
    try {
      const res = await fetch(`/api/health/favorites?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setFavorites(favorites.filter((f) => f.id !== id));
      }
    } catch {
      toast.error("Failed to remove favorite");
    }
  };

  if (loading || favorites.length === 0) return null;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Star className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-medium">Quick Add</span>
          <span className="text-[10px] text-muted-foreground">
            (tap to log)
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {favorites.slice(0, 8).map((fav) => (
            <button
              key={fav.id}
              onClick={() => logFavorite(fav)}
              disabled={loggingId === fav.id}
              className={cn(
                "group relative flex items-center gap-1.5 px-3 py-1.5 rounded-full",
                "bg-secondary/50 hover:bg-secondary/80 border border-border/30",
                "text-xs font-medium transition-all duration-200",
                "hover:scale-[1.02] active:scale-95",
                loggingId === fav.id && "opacity-60"
              )}
            >
              {loggingId === fav.id ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Plus className="h-3 w-3 text-muted-foreground" />
              )}
              <span className="truncate max-w-[120px]">
                {fav.foodDescription}
              </span>
              <span className="text-muted-foreground">
                {Math.round(fav.calories)}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeFavorite(fav.id);
                }}
                className="hidden group-hover:block absolute -top-1 -right-1 p-0.5 rounded-full bg-background border"
              >
                <X className="h-2 w-2" />
              </button>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
