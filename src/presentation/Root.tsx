import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_LOCALE, createTranslator, type Locale } from "@application/i18n";
import {
  pickLocale,
  readStoredLocale,
  writeStoredLocale,
} from "@application/localePreference";
import { parseRoute } from "@application/routing";
import { Landing } from "@presentation/Landing";
import { RoomScreen } from "@presentation/RoomScreen";
import { Shell } from "@presentation/Shell";

export function Root() {
  const [locale, setLocaleState] = useState<Locale>(() =>
    pickLocale(readStoredLocale(), globalThis.navigator?.language, DEFAULT_LOCALE),
  );
  const [pathname, setPathname] = useState(() => globalThis.location?.pathname ?? "/");
  const [sessionName, setSessionName] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const translate = useMemo(() => createTranslator(locale), [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    writeStoredLocale(next);
  }, []);

  const handleNavigate = useCallback((path: string) => {
    globalThis.history?.pushState(null, "", path);
    setPathname(path);
  }, []);

  const handleSessionName = useCallback((name: string | null) => {
    setSessionName(name);
  }, []);

  /**
   * The room is gone for everyone at once, so nobody is left sitting on a screen that
   * can no longer do anything. The reason travels along with the redirect, because
   * being bounced to the landing page without being told why reads as a bug.
   */
  const handleRoomDeleted = useCallback(
    (errorCode: string) => {
      globalThis.history?.pushState(null, "", "/");
      setPathname("/");
      setSessionName(null);
      setNotice(errorCode);
    },
    [],
  );

  useEffect(() => {
    const onPopState = () => setPathname(globalThis.location?.pathname ?? "/");
    globalThis.addEventListener("popstate", onPopState);
    return () => globalThis.removeEventListener("popstate", onPopState);
  }, []);

  /**
   * index.html ships lang="en" because it has to render before React runs, but
   * leaving it there means a Portuguese screen reader is handed an English
   * document and picks English phonetics for every word. The active locale is
   * already known here, so the document is told which language it is speaking.
   */
  useEffect(() => {
    globalThis.document?.documentElement.setAttribute("lang", locale);
  }, [locale]);

  const route = parseRoute(pathname);

  return (
    <Shell
      errorCode={null}
      locale={locale}
      onLocaleChange={setLocale}
      hasFloatingDock={route.kind === "room"}
      sessionName={route.kind === "room" ? sessionName : null}
      translate={translate}
    >
      {route.kind === "home" ? (
        <Landing notice={notice} onNavigate={handleNavigate} translate={translate} />
      ) : (
        <RoomScreen
          onRoomDeleted={handleRoomDeleted}
          onSessionNameChange={handleSessionName}
          roomId={route.roomId}
          translate={translate}
        />
      )}
    </Shell>
  );
}
