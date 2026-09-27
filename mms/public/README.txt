MMS FAVICON PACKAGE
====================

Drop every file in this zip into the root of your site (e.g. /public in
Vite/CRA/Next — they get served from the domain root as /favicon.ico,
/site.webmanifest, etc.).

Then paste this into your <head>, above any other stylesheet/script tags:

<link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="icon" type="image/png" sizes="192x192" href="/android-chrome-192x192.png">
<link rel="icon" type="image/png" sizes="512x512" href="/android-chrome-512x512.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#0a4e9e">
<meta name="msapplication-TileColor" content="#0a4e9e">
<meta name="msapplication-config" content="/browserconfig.xml">

WHAT'S IN THE BOX
------------------
favicon.ico                     — multi-res (16/32/48) — legacy browsers, bookmarks bar
favicon-16x16.png               — browser tab, small
favicon-32x32.png               — browser tab, standard / taskbar
favicon-48x48.png               — Windows shortcuts, high-density tab
apple-touch-icon.png (180x180)  — iOS home screen, Safari (solid bg — iOS masks it)
android-chrome-192x192.png      — Android home screen / manifest
android-chrome-512x512.png      — Android splash screen / manifest
maskable-icon-512x512.png       — Android adaptive icon (safe-zoned so it
                                   survives being cropped into a circle,
                                   squircle, rounded square, etc. by the OS)
mstile-150x150.png              — Windows Start tile (solid bg)
site.webmanifest                — PWA manifest, references the icons above
browserconfig.xml               — Windows tile config

Why some are on a solid background and some are transparent:
iOS and Windows apply their own shape mask over your icon and don't respect
transparency well, so those get a solid fill. Chrome/Android favicons and
manifest icons render fine with the transparent, tightly-cropped version, so
those keep the natural rounded-rect edge from your artwork.
