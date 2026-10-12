import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_LOCALE, createTranslator, type Translator, type Locale } from "@application/i18n";
import {
  pickLocale,
  readStoredLocale,
  writeStoredLocale,
} from "@application/localePreference";
import { parseRoute, type AppRoute } from "@application/routing";
import { Landing } from "@presentation/Landing";
import { RoomScreen } from "@presentation/RoomScreen";
import { Shell } from "@presentation/Shell";
import { MissingRoom } from "@presentation/MissingRoom";

/**
 * The three routes are three different screens rather than three states of one, so they
 * are chosen by name here instead of by a chain of conditionals in the markup. Narrowing
 * on the route is what lets each screen receive only the props it declares.
 */
function routeScreen({
  notice,
  onNavigate,
  onRoomDeleted,
  onSessionNameChange,
  route,
  translate,
}: {
  notice: string | null;
  onNavigate: (path: string) => void;
  onRoomDeleted: (errorCode: string) => void;
  onSessionNameChange: (name: string | null) => void;
  route: AppRoute;
  translate: Translator;
}): ReactNode {
  if (route.kind === "room") {
    return (
      <RoomScreen
        onRoomDeleted={onRoomDeleted}
        onSessionNameChange={onSessionNameChange}
        roomId={route.roomId}
        translate={translate}
      />
    );
  }

  if (route.kind === "missing-room") {
    return <MissingRoom onNavigate={onNavigate} translate={translate} />;
  }

  return <Landing notice={notice} onNavigate={onNavigate} translate={translate} />;
}

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
      onLeaveRoom={route.kind === "room" ? () => handleNavigate("/") : null}
      onLocaleChange={setLocale}
      onNavigateHome={() => handleNavigate("/")}
      hasFloatingDock={route.kind === "room"}
      sessionName={route.kind === "room" ? sessionName : null}
      translate={translate}
    >
      {routeScreen({ notice, onNavigate: handleNavigate, onRoomDeleted: handleRoomDeleted, onSessionNameChange: handleSessionName, route, translate })}
    </Shell>
  );
}
