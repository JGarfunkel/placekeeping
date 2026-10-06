# Slideshow manual test checklist

Run each against `/slideshow/us/ny/<county-or-town>` and `/slideshow/spot/<id>`.

- [ ] iPhone Safari: swipe, tap to hide/show controls, no Full screen button, captions clear the control bar
- [ ] Android Chrome: swipe, Full screen button, PWA install
- [ ] Desktop Chrome: Space, arrows, F, C, Esc
- [ ] Reduced motion on (OS setting): plain cut between photos, captions fade without travel
- [ ] Scope with zero photos: plain message + "Back to the map"
- [ ] Scope with one photo: no auto-advance, no errors
- [ ] Scope with several hundred photos: next page loads before the end, memory stays flat
- [ ] "more" and Settings pause advancing; closing resumes
- [ ] Broken image URL: retried once, then skipped
- [ ] A shared link with `?dur=4&order=random&captions=off` reproduces the setup
- [ ] A photo with a rejected moderation status never appears
