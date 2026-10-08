import { describe, expect, it } from "vitest";
import {
  bearing,
  buildImageUrl,
  clampView,
  parseStreetViewUrl,
  retargetImageUrl,
} from "./gsvUrl";

// TODO: replace/extend with real URLs collected from Street View (desktop
// long form, mobile share short-form expansion, Maps URLs API form) -- the
// URLs below were written from known shapes, not captured.
describe("parseStreetViewUrl", () => {
  it("parses the Maps URLs API form", () => {
    expect(
      parseStreetViewUrl(
        "https://www.google.com/maps/@?api=1&map_action=pano&pano=ABC123&heading=90&pitch=-5&fov=60",
      ),
    ).toEqual({ panoId: "ABC123", heading: 90, pitch: -5, fov: 60 });
  });

  it("parses the browser long form", () => {
    const url =
      "https://www.google.com/maps/@39.6618,-75.5666,3a,75y,270.5h,90t/data=!3m6!1e1!3m4!1sPANOID_x-y!2e0!7i16384!8i8192";
    expect(parseStreetViewUrl(url)).toEqual({
      lat: 39.6618,
      lng: -75.5666,
      fov: 75,
      heading: 270.5,
      pitch: 0,
      panoId: "PANOID_x-y",
    });
  });

  it("parses a captured browser URL (t below 90 gives negative pitch)", () => {
    const url =
      "https://www.google.com/maps/@41.2070714,-73.735948,103a,75y,163.58h,68.27t/data=!3m8!1e1!3m6!1sw_rwFzYKk7AND6yaP75qWA!2e0!5s20140701T000000!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D21.729422022760318%26panoid%3Dw_rwFzYKk7AND6yaP75qWA%26yaw%3D163.575496692227!7i13312!8i6656?entry=ttu&g_ep=EgoyMDI2MTAwNC4wIKXMDSoASAFQAw%3D%3D";
    const r = parseStreetViewUrl(url);
    expect(r.panoId).toBe("w_rwFzYKk7AND6yaP75qWA");
    expect(r.heading).toBe(163.58);
    expect(r.fov).toBe(75);
    expect(r.pitch).toBeCloseTo(-21.73, 2);
  });

  it("accepts a location with no pano", () => {
    expect(
      parseStreetViewUrl("https://www.google.com/maps/@39.66,-75.56,15z"),
    ).toMatchObject({ lat: 39.66, lng: -75.56 });
  });

  it("throws when there is neither pano nor location", () => {
    expect(() => parseStreetViewUrl("https://www.google.com/maps")).toThrow();
  });
});

describe("bearing", () => {
  it("points north, east, south, west", () => {
    expect(bearing(0, 0, 1, 0)).toBeCloseTo(0);
    expect(bearing(0, 0, 0, 1)).toBeCloseTo(90);
    expect(bearing(0, 0, -1, 0)).toBeCloseTo(180);
    expect(bearing(0, 0, 0, -1)).toBeCloseTo(270);
  });
});

describe("view helpers", () => {
  it("clamps out-of-range values", () => {
    expect(clampView({ heading: 400, pitch: -120, fov: 5 })).toEqual({
      heading: 360,
      pitch: -90,
      fov: 10,
    });
  });

  it("retargets an image URL without losing the other params", () => {
    const base = buildImageUrl("K", { panoId: "P", heading: 1, pitch: 2, fov: 75 });
    const next = new URL(retargetImageUrl(base, { heading: 10, pitch: 0, fov: 50 }));
    expect(next.searchParams.get("pano")).toBe("P");
    expect(next.searchParams.get("key")).toBe("K");
    expect(next.searchParams.get("heading")).toBe("10");
    expect(next.searchParams.get("fov")).toBe("50");
  });
});
