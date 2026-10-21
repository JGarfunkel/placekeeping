"use client";

import type { Slide, SlideshowPage, SlideSpecies } from "@placekeeping/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { computeCaptionTimeline, EXIT_FADE_MS, ENTER_MS, STAGGER_MS } from "@/lib/slideshow/captionTimeline";
import {
  CAPTION_DELAYS,
  DURATIONS,
  ENTRANCES,
  EXITS,
  FITS,
  ORDERS,
  POSITIONS,
  SEQUENCES,
  SPECIES_DELAYS,
  SPECIES_END_WAITS,
  SPECIES_HOLDS,
  serializeSlideshowOptions,
  type SlideshowOptions,
} from "@/lib/slideshow/options";
import { makeShuffleSeed } from "@/lib/slideshow/seed";

const CROSSFADE_MS = 600;
const CONTROLS_HIDE_MS = 3500;
const PREFETCH_MARGIN = 20;
const SWIPE_PX = 50;
const LONG_DESCRIPTION_CHARS = 140;
// Fade-in of one species' rectangle, and fade-out of all of them at the end.
// The waits around them are options (sdelay, shold, send).
const SPECIES_FADE_MS = 300;

type CaptionPhase = "pre" | "in" | "out";

function formatDate(isoDate: string): string {
  // observedAt is a date with no time of day; format in UTC so the calendar
  // day never shifts with the viewer's zone.
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(REDUCED_MOTION_QUERY);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
}

// iOS Safari (iPhone) has no element Fullscreen API; the button is simply
// hidden there. The slideshow already fills the viewport, and an installed
// PWA runs without browser chrome.
function useCanFullscreen(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => Boolean(document.fullscreenEnabled),
    () => false,
  );
}

const HIDDEN_TRANSFORM: Record<SlideshowOptions["enter"], string> = {
  "slide-up": "translateY(24px)",
  "slide-left": "translateX(24px)",
  "slide-right": "translateX(-24px)",
  fade: "none",
};

export function ObservationSlideshow({
  scopeKey,
  title,
  backHref,
  initialOptions,
  initialPage,
  seed: initialSeed,
}: {
  scopeKey: string;
  title: string;
  backHref: string;
  initialOptions: SlideshowOptions;
  initialPage: SlideshowPage;
  seed: string;
}) {
  const router = useRouter();
  const [options, setOptions] = useState(initialOptions);
  const [seed, setSeed] = useState(initialSeed);
  const [slides, setSlides] = useState<Slide[]>(initialPage.slides);
  const [total, setTotal] = useState(initialPage.total);
  const [nextOffset, setNextOffset] = useState(initialPage.nextOffset);
  const [index, setIndex] = useState(0);
  const [prevIndex, setPrevIndex] = useState<number | null>(null);
  const [playing, setPlaying] = useState(true);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [phase, setPhase] = useState<CaptionPhase>("pre");
  const [fullscreen, setFullscreen] = useState(false);
  const [retries, setRetries] = useState(0);
  // Index of the species currently being identified; === count means all done.
  const [speciesStep, setSpeciesStep] = useState(0);
  // The slide's time is up: rectangles fade, then the next slide follows.
  const [speciesExiting, setSpeciesExiting] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const canFullscreen = useCanFullscreen();

  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const elapsedRef = useRef(0);
  const fetchingRef = useRef(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const swipedRef = useRef(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Held only for the next two slides: with the current <img> and (briefly)
  // the fading-out one, that keeps at most ~3-4 decoded images alive.
  const preloadRef = useRef<Map<string, HTMLImageElement>>(new Map());

  const slide: Slide | undefined = slides[index];
  const timeline = useMemo(() => computeCaptionTimeline(options), [options]);
  const overlayOpen = settingsOpen || moreOpen;
  // Paused or an overlay open: controls stay up regardless of the auto-hide.
  const controlsShown = controlsVisible || !playing || overlayOpen;
  const durMs = options.dur * 1000;
  const atEnd = index >= slides.length - 1 && nextOffset === null;
  const canAdvance = slides.length > 1 && (!atEnd || options.loop);

  useEffect(() => {
    console.info(`starting slideshow with ${initialPage.total} photos`);
    // The slideshow covers the site header; stop the page behind it scrolling.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // globals.css hides the root layout's header while this is set.
    document.documentElement.dataset.slideshow = "on";
    return () => {
      document.body.style.overflow = previousOverflow;
      delete document.documentElement.dataset.slideshow;
    };
    // Once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Paging --------------------------------------------------------------

  const fetchPage = useCallback(
    async (offset: number, order: SlideshowOptions["order"], shuffleSeed: string) => {
      const params = new URLSearchParams({ scope: scopeKey, order, seed: shuffleSeed, offset: String(offset) });
      const res = await fetch(`/api/slideshow?${params}`);
      if (!res.ok) throw new Error(`slideshow fetch failed: ${res.status}`);
      return (await res.json()) as SlideshowPage;
    },
    [scopeKey],
  );

  useEffect(() => {
    if (nextOffset === null || fetchingRef.current) return;
    if (index < slides.length - PREFETCH_MARGIN) return;
    fetchingRef.current = true;
    fetchPage(nextOffset, options.order, seed)
      .then((page) => {
        setSlides((current) => [...current, ...page.slides]);
        setTotal(page.total);
        setNextOffset(page.nextOffset);
      })
      .catch((error) => console.warn("[slideshow]", error))
      .finally(() => {
        fetchingRef.current = false;
      });
  }, [index, slides.length, nextOffset, options.order, seed, fetchPage]);

  // ---- Navigation ----------------------------------------------------------

  const goTo = useCallback(
    (target: number) => {
      if (slides.length === 0 || target === index) return;
      elapsedRef.current = 0;
      setPrevIndex(index);
      setIndex(target);
      setLoaded(false);
      setRetries(0);
      setSpeciesStep(0);
      setSpeciesExiting(false);
      live.current.exiting = false;
      setPhase("pre");
      setMoreOpen(false);
    },
    [index, slides.length],
  );

  const next = useCallback(() => {
    if (index + 1 < slides.length) goTo(index + 1);
    else if (nextOffset === null && options.loop) goTo(0);
  }, [goTo, index, slides.length, nextOffset, options.loop]);

  const previous = useCallback(() => {
    if (index > 0) goTo(index - 1);
    else if (nextOffset === null && options.loop) goTo(slides.length - 1);
  }, [goTo, index, slides.length, nextOffset, options.loop]);

  useEffect(() => {
    if (prevIndex === null) return;
    const timer = setTimeout(() => setPrevIndex(null), reducedMotion ? 0 : CROSSFADE_MS);
    return () => clearTimeout(timer);
  }, [prevIndex, reducedMotion]);

  // ---- Timer loop ----------------------------------------------------------

  // The slide's countdown only starts once every species has been identified.
  const highlightedSpecies = options.highlight && slide ? slide.species : [];
  const hasSpecies = highlightedSpecies.length > 0;
  const speciesDone = speciesStep >= highlightedSpecies.length;
  // Captions go first: the species start once the captions are up (the clock
  // runs through the caption delay), and the clock holds while they play.
  const speciesStarted = !options.captions || phase !== "pre";
  const speciesActive = hasSpecies && speciesStarted && !speciesDone;
  const running = playing && !overlayOpen && loaded && slides.length > 0 && !speciesActive;

  useEffect(() => {
    if (!loaded || !playing || overlayOpen || !speciesActive) return;
    const timer = setTimeout(() => setSpeciesStep((s) => s + 1), (options.sdelay + options.shold) * 1000);
    return () => clearTimeout(timer);
  }, [loaded, playing, overlayOpen, speciesActive, speciesStep, options.sdelay, options.shold]);

  const live = useRef({
    running,
    canAdvance,
    next,
    durMs,
    timeline,
    captions: options.captions,
    phase,
    hasSpecies,
    exiting: speciesExiting,
  });
  useEffect(() => {
    // Keeps the rAF loop's view current without re-subscribing it.
    live.current = {
      running,
      canAdvance,
      next,
      durMs,
      timeline,
      captions: options.captions,
      phase,
      hasSpecies,
      exiting: live.current.exiting || speciesExiting,
    };
  });

  // Time is up on a slide with species: its rectangles fade, then, after the
  // end wait, the next slide follows.
  useEffect(() => {
    if (!speciesExiting || !playing || overlayOpen) return;
    const timer = setTimeout(() => live.current.next(), SPECIES_FADE_MS + options.send * 1000);
    return () => clearTimeout(timer);
  }, [speciesExiting, playing, overlayOpen, options.send]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(now - last, 250);
      last = now;
      const state = live.current;
      if (state.running && !document.hidden) {
        elapsedRef.current += dt;
        if (elapsedRef.current >= state.durMs) {
          elapsedRef.current = state.durMs;
          if (state.canAdvance) {
            if (!state.hasSpecies) state.next();
            else if (!state.exiting) {
              live.current.exiting = true;
              setSpeciesExiting(true);
            }
          }
        }
        if (state.captions) {
          const e = elapsedRef.current;
          const wanted: CaptionPhase =
            e >= state.timeline.exitStartMs ? "out" : e >= state.timeline.delayMs ? "in" : "pre";
          if (wanted !== state.phase) {
            live.current.phase = wanted;
            setPhase(wanted);
          }
        }
      }
      if (progressRef.current) {
        progressRef.current.style.transform = `scaleX(${Math.min(elapsedRef.current / state.durMs, 1)})`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ---- Preloading ----------------------------------------------------------

  useEffect(() => {
    const wanted = new Set<string>();
    for (const offset of [1, 2]) {
      const upcoming = slides[(index + offset) % slides.length];
      if (!upcoming || (index + offset >= slides.length && !options.loop)) continue;
      wanted.add(upcoming.photoUrl);
      if (!preloadRef.current.has(upcoming.photoUrl)) {
        const img = new Image();
        img.src = upcoming.photoUrl;
        preloadRef.current.set(upcoming.photoUrl, img);
      }
    }
    for (const url of [...preloadRef.current.keys()]) {
      if (!wanted.has(url)) preloadRef.current.delete(url);
    }
  }, [index, slides, options.loop]);

  // ---- Image failure: one retry, then skip -----------------------------------

  const onImageError = useCallback(() => {
    if (retries < 1) {
      setTimeout(() => setRetries((r) => r + 1), 500);
    } else if (slides.length > 1) {
      next();
    }
  }, [retries, slides.length, next]);

  // The server-rendered <img> can finish (or fail) loading before React
  // hydrates, in which case onLoad/onError never fire. Check its state once
  // it's mounted so the slide doesn't stay invisible and the timer stuck.
  const currentKey = slide ? `${slide.photoId}-${retries}` : "";
  useEffect(() => {
    const img = imgRef.current;
    if (!img || !img.complete) return;
    if (img.naturalWidth > 0) setLoaded(true);
    else onImageError();
    // Only when the displayed image changes, not whenever onImageError does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey]);

  // ---- Controls visibility -----------------------------------------------------

  const poke = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_MS);
  }, []);

  useEffect(() => {
    // Auto-hide only while playing with nothing open; pausing or opening an
    // overlay keeps the controls up (see controlsShown).
    if (!playing || overlayOpen) return;
    const timer = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_MS);
    return () => clearTimeout(timer);
  }, [playing, overlayOpen]);

  // ---- Fullscreen --------------------------------------------------------------

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenEnabled) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void containerRef.current?.requestFullscreen();
  }, []);

  // ---- Options ---------------------------------------------------------------------

  const updateOptions = useCallback(
    (patch: Partial<SlideshowOptions>) => {
      const updated = { ...options, ...patch };
      setOptions(updated);
      const query = serializeSlideshowOptions(updated).toString();
      window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);

      if (patch.order && patch.order !== options.order) {
        const newSeed = makeShuffleSeed();
        setSeed(newSeed);
        fetchingRef.current = true;
        fetchPage(0, patch.order, newSeed)
          .then((page) => {
            elapsedRef.current = 0;
            setSlides(page.slides);
            setTotal(page.total);
            setNextOffset(page.nextOffset);
            setIndex(0);
            setPrevIndex(null);
            setLoaded(false);
            setSpeciesStep(0);
            setSpeciesExiting(false);
            live.current.exiting = false;
            setPhase("pre");
          })
          .catch((error) => console.warn("[slideshow]", error))
          .finally(() => {
            fetchingRef.current = false;
          });
      }
    },
    [options, fetchPage],
  );

  // ---- Keyboard ---------------------------------------------------------------------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
      poke();
      switch (e.key) {
        case " ":
          // Let a focused button keep its own Space activation.
          if (target?.tagName === "BUTTON") return;
          e.preventDefault();
          setPlaying((p) => !p);
          break;
        case "ArrowRight":
          next();
          break;
        case "ArrowLeft":
          previous();
          break;
        case "f":
        case "F":
          toggleFullscreen();
          break;
        case "c":
        case "C":
          updateOptions({ captions: !options.captions });
          break;
        case "Escape":
          if (settingsOpen) setSettingsOpen(false);
          else if (moreOpen) setMoreOpen(false);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, previous, poke, toggleFullscreen, updateOptions, options.captions, settingsOpen, moreOpen]);

  // ---- Touch -------------------------------------------------------------------------

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
    swipedRef.current = false;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
      swipedRef.current = true;
      if (dx < 0) next();
      else previous();
    }
  };
  const onStageClick = () => {
    if (swipedRef.current) {
      swipedRef.current = false;
      return;
    }
    // Single click pauses (never toggles, so the first click of a double-click
    // can't un-pause); double click opens the spot page.
    setPlaying(false);
    poke();
  };
  const onStageDoubleClick = () => {
    router.push(slide.spotPath);
  };

  // ---- Render ------------------------------------------------------------------------

  if (slides.length === 0 || !slide) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-neutral-950 p-6 text-center text-white">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p>There are no photos here yet.</p>
        <Link href={backHref} className="underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
          Back to the map
        </Link>
      </div>
    );
  }

  const imgTransition = reducedMotion ? "none" : `opacity ${CROSSFADE_MS}ms ease-in-out`;
  const fitClass = options.fit === "cover" ? "object-cover" : "object-contain";
  const prevSlide = prevIndex !== null ? slides[prevIndex] : undefined;
  const dateLabel = formatDate(slide.observedAt);
  const captionsShown = options.captions;
  const hidden = HIDDEN_TRANSFORM[options.enter];
  const travel = reducedMotion ? "none" : hidden;

  const items: Array<{ key: string; node: React.ReactNode }> = [
    {
      key: "location",
      node: (
        <Link
          href={slide.spotPath}
          className="text-lg font-semibold underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
          {slide.locationLabel}
        </Link>
      ),
    },
    ...(slide.description
      ? [
          {
            key: "description",
            node: (
              <div>
                <p className={moreOpen ? "" : "line-clamp-3"}>{slide.description}</p>
                {slide.description.length > LONG_DESCRIPTION_CHARS && (
                  <button
                    type="button"
                    onClick={() => setMoreOpen((open) => !open)}
                    aria-expanded={moreOpen}
                    className="mt-1 text-sm underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                  >
                    {moreOpen ? "less" : "more"}
                  </button>
                )}
              </div>
            ),
          },
        ]
      : []),
    { key: "date", node: <p className="text-sm text-neutral-200">{dateLabel}</p> },
    ...(slide.stewardName
      ? [{ key: "steward", node: <p className="text-sm text-neutral-200">Tended by {slide.stewardName}</p> }]
      : []),
  ];

  const positionClass =
    options.pos === "bottom"
      ? "inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/70 to-transparent px-4 pb-24 pt-10 sm:px-8"
      : `bottom-24 w-[min(26rem,88%)] rounded-lg bg-black/75 p-4 ${options.pos === "left" ? "left-3" : "right-3"}`;

  const itemStyle = (position: number): React.CSSProperties => {
    const shown = phase === "in";
    const leaving = phase === "out";
    const staggerDelay = options.seq === "staggered" && shown && !reducedMotion ? position * STAGGER_MS : 0;
    return {
      opacity: shown ? 1 : 0,
      transform: shown || leaving ? "none" : travel,
      transition: reducedMotion
        ? `opacity ${ENTER_MS}ms linear`
        : leaving
          ? `opacity ${EXIT_FADE_MS}ms ease-in`
          : `opacity ${ENTER_MS}ms ease-out ${staggerDelay}ms, transform ${ENTER_MS}ms ease-out ${staggerDelay}ms`,
    };
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[2000] select-none overflow-hidden bg-neutral-950 text-white"
      onPointerMove={poke}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Photo stage */}
      <div className="absolute inset-0" onClick={onStageClick} onDoubleClick={onStageDoubleClick}>
        {prevSlide && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`prev-${prevSlide.photoId}`}
            src={prevSlide.photoUrl}
            alt=""
            className={`absolute inset-0 h-full w-full ${fitClass}`}
            style={{ opacity: 0, transition: imgTransition }}
            draggable={false}
          />
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          key={`${slide.photoId}-${retries}`}
          src={slide.photoUrl}
          alt={`${slide.spotName}, ${dateLabel}`}
          className={`absolute inset-0 h-full w-full ${fitClass}`}
          style={{ opacity: loaded ? 1 : 0, transition: imgTransition }}
          onLoad={() => setLoaded(true)}
          onError={onImageError}
          draggable={false}
        />
        {loaded && hasSpecies && imgRef.current && (
          <SpeciesHighlight
            key={slide.photoId}
            species={speciesStarted ? highlightedSpecies.slice(0, speciesStep + 1) : []}
            delayMs={options.sdelay * 1000}
            exiting={speciesExiting}
            fit={options.fit}
            naturalWidth={imgRef.current.naturalWidth}
            naturalHeight={imgRef.current.naturalHeight}
            reducedMotion={reducedMotion}
          />
        )}
      </div>

      {/* Captions: announced once per slide, since the region is keyed by slide. */}
      {captionsShown && (
        <div
          key={slide.photoId}
          role="region"
          aria-label="Photo details"
          aria-live="polite"
          aria-atomic="true"
          className={`pointer-events-none absolute ${positionClass}`}
        >
          <div className="pointer-events-auto flex flex-col gap-1.5">
            {items.map((item, i) => (
              <div key={item.key} style={itemStyle(i)}>
                {item.node}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Config toolbar: slides down from the top; X exits the slideshow. */}
      <div
        className={`absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-black/80 to-black/40 p-3 ${
          reducedMotion ? "" : "transition-transform duration-300 ease-out"
        } ${controlsShown ? "translate-y-0" : "pointer-events-none -translate-y-full"}`}
      >
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
        <button type="button" className={buttonClass} aria-pressed={options.captions} onClick={() => updateOptions({ captions: !options.captions })}>
          Captions
        </button>
        <button type="button" className={buttonClass} aria-pressed={options.highlight} onClick={() => updateOptions({ highlight: !options.highlight })}>
          Species
        </button>
        {canFullscreen && (
          <button type="button" className={buttonClass} onClick={toggleFullscreen}>
            {fullscreen ? "Exit full screen" : "Full screen"}
          </button>
        )}
        <button type="button" className={buttonClass} aria-expanded={settingsOpen} onClick={() => setSettingsOpen((o) => !o)}>
          Settings
        </button>
        <Link href={backHref} className={`${buttonClass} px-3 text-lg leading-none`} aria-label="Exit slideshow">
          ✕
        </Link>
      </div>

      {/* Bottom bar */}
      <div
        className={`absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 bg-gradient-to-t from-black/70 to-transparent px-3 pb-4 pt-6 transition-opacity duration-300 ${
          controlsShown ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <button type="button" className={buttonClass} onClick={previous} aria-label="Previous photo">
          ‹ Prev
        </button>
        <button type="button" className={buttonClass} onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"}>
          {playing ? "Pause" : "Play"}
        </button>
        <button type="button" className={buttonClass} onClick={next} aria-label="Next photo">
          Next ›
        </button>
        <span className="ml-2 text-sm tabular-nums" aria-label="Position">
          {index + 1} of {total}
        </span>
      </div>

      {/* Brand mark: always visible. The monogram is dark ink, so it sits on a light, mostly transparent chip. */}
      <div className="pointer-events-none absolute bottom-3 right-3 rounded-md bg-white/50 px-2 py-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/monogram.svg" alt="Placekeeping" className="h-6 w-auto" draggable={false} />
      </div>

      {/* Progress */}
      <div className="absolute inset-x-0 bottom-0 h-0.5 bg-white/5" aria-hidden="true">
        <div ref={progressRef} className="h-full origin-left bg-white/40"style={{ transform: "scaleX(0)" }} />
      </div>

      {settingsOpen && (
        <SettingsPanel options={options} onChange={updateOptions} onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}

const buttonClass =
  "rounded-md bg-black/60 px-3 py-1.5 text-sm text-white hover:bg-black/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

// Outlines the species identified so far and names them; each mark appears
// `delayMs` after it is added and they all stay up until `exiting` fades them
// together. Rectangles are fractions of the photo, so the displayed image box
// is derived from the stage size, the image's natural size and the fit mode.
// A whole-photo identification has no rectangle: its label sits at the top of
// the displayed image.
function SpeciesHighlight({
  species,
  delayMs,
  exiting,
  fit,
  naturalWidth,
  naturalHeight,
  reducedMotion,
}: {
  species: SlideSpecies[];
  delayMs: number;
  exiting: boolean;
  fit: SlideshowOptions["fit"];
  naturalWidth: number;
  naturalHeight: number;
  reducedMotion: boolean;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  let marks: React.ReactNode = null;
  if (stage && naturalWidth > 0 && naturalHeight > 0) {
    const scale = (fit === "cover" ? Math.max : Math.min)(stage.w / naturalWidth, stage.h / naturalHeight);
    const imgW = naturalWidth * scale;
    const imgH = naturalHeight * scale;
    const imgX = (stage.w - imgW) / 2;
    const imgY = (stage.h - imgH) / 2;
    marks = species.map((s, i) => (
      <SpeciesMark
        key={i}
        species={s}
        delayMs={delayMs}
        reducedMotion={reducedMotion}
        stageWidth={stage.w}
        box={{
          left: s.crop ? imgX + s.crop.x * imgW : imgX,
          top: s.crop ? imgY + s.crop.y * imgH : imgY,
          width: s.crop ? s.crop.w * imgW : imgW,
          height: s.crop ? s.crop.h * imgH : imgH,
        }}
      />
    ));
  }

  return (
    <div
      ref={stageRef}
      aria-live="polite"
      className="pointer-events-none absolute inset-0"
      style={{
        opacity: exiting ? 0 : 1,
        transition: reducedMotion ? "none" : `opacity ${SPECIES_FADE_MS}ms ease-in-out`,
      }}
    >
      {marks}
    </div>
  );
}

function SpeciesMark({
  species,
  delayMs,
  reducedMotion,
  stageWidth,
  box,
}: {
  species: SlideSpecies;
  delayMs: number;
  reducedMotion: boolean;
  stageWidth: number;
  box: { left: number; top: number; width: number; height: number };
}) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(timer);
    // The delay is read once, when the mark is added.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Above the rectangle when there is room, else just inside its top edge.
  const labelAbove = box.top >= 44;
  return (
    <div
      className="absolute inset-0"
      style={{ opacity: shown ? 1 : 0, transition: reducedMotion ? "none" : "opacity 300ms ease-out" }}
    >
      {species.crop && (
        <div
          className="absolute rounded-sm border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
          style={box}
        />
      )}
      <div
        className="absolute max-w-[90%] rounded-md bg-black/80 px-3 py-1.5 text-sm"
        style={{
          left: Math.min(Math.max(box.left, 8), Math.max(stageWidth - 8, 8)),
          top: labelAbove ? box.top - 6 : box.top + 6,
          transform: labelAbove ? "translateY(-100%)" : "none",
        }}
      >
        <p className="font-semibold">{species.commonName ?? species.scientificName}</p>
        {species.commonName && <p className="text-xs italic text-neutral-300">{species.scientificName}</p>}
      </div>
    </div>
  );
}

function SelectRow<T extends string | number>({
  label,
  value,
  values,
  format,
  onChange,
}: {
  label: string;
  value: T;
  values: readonly T[];
  format?: (v: T) => string;
  onChange: (v: T) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <select
        value={String(value)}
        onChange={(e) => onChange(values.find((v) => String(v) === e.target.value) ?? value)}
        className="rounded border border-neutral-500 bg-neutral-800 px-2 py-1 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      >
        {values.map((v) => (
          <option key={String(v)} value={String(v)}>
            {format ? format(v) : String(v)}
          </option>
        ))}
      </select>
    </label>
  );
}

function SettingsPanel({
  options,
  onChange,
  onClose,
}: {
  options: SlideshowOptions;
  onChange: (patch: Partial<SlideshowOptions>) => void;
  onClose: () => void;
}) {
  const seconds = (v: number) => `${v} s`;
  return (
    <div
      role="dialog"
      aria-label="Slideshow settings"
      className="absolute inset-x-3 top-14 z-10 mx-auto flex max-h-[75vh] max-w-sm flex-col gap-3 overflow-y-auto rounded-lg bg-neutral-900/95 p-4 shadow-xl"
    >
      <SelectRow label="Slide duration" value={options.dur} values={DURATIONS} format={seconds} onChange={(dur) => onChange({ dur })} />
      <SelectRow label="Order" value={options.order} values={ORDERS} onChange={(order) => onChange({ order })} />
      <SelectRow label="Photo fit" value={options.fit} values={FITS} onChange={(fit) => onChange({ fit })} />
      <SelectRow label="Captions" value={options.captions ? "on" : "off"} values={["on", "off"] as const} onChange={(v) => onChange({ captions: v === "on" })} />
      <SelectRow label="Highlight species" value={options.highlight ? "on" : "off"} values={["on", "off"] as const} onChange={(v) => onChange({ highlight: v === "on" })} />
      <SelectRow label="Species delay" value={options.sdelay} values={SPECIES_DELAYS} format={seconds} onChange={(sdelay) => onChange({ sdelay })} />
      <SelectRow label="Species hold" value={options.shold} values={SPECIES_HOLDS} format={seconds} onChange={(shold) => onChange({ shold })} />
      <SelectRow label="Wait after species" value={options.send} values={SPECIES_END_WAITS} format={seconds} onChange={(send) => onChange({ send })} />
      <SelectRow label="Caption delay" value={options.delay} values={CAPTION_DELAYS} format={seconds} onChange={(delay) => onChange({ delay })} />
      <SelectRow label="Caption entrance" value={options.enter} values={ENTRANCES} onChange={(enter) => onChange({ enter })} />
      <SelectRow label="Caption sequence" value={options.seq} values={SEQUENCES} onChange={(seq) => onChange({ seq })} />
      <SelectRow label="Caption position" value={options.pos} values={POSITIONS} onChange={(pos) => onChange({ pos })} />
      <SelectRow label="Caption exit" value={options.exit} values={EXITS} onChange={(exit) => onChange({ exit })} />
      <SelectRow label="At the end" value={options.loop ? "loop" : "stop"} values={["loop", "stop"] as const} onChange={(v) => onChange({ loop: v === "loop" })} />
      <button type="button" className={`${buttonClass} self-end`} onClick={onClose}>
        Done
      </button>
    </div>
  );
}
