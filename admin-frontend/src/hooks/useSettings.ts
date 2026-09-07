import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

export function useSettings(token?: string) {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      const res = await apiFetch("/api/users/settings", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load settings");
      const data = await res.json();
      setSettings(data);
      setError(null);
    } catch (e: any) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { settings, loading, error, refresh };
}
