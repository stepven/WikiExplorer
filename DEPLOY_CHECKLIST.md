# Vercel deployment checklist

## Before first deploy

- [ ] All environment variables added to Vercel dashboard (Settings → Environment Variables)
- [ ] `.env`, `.env.local` confirmed in `.gitignore`
- [ ] `package-lock.json` committed
- [ ] Build runs locally with no errors (`npm ci && npm run build`)
- [ ] All `localhost` API URLs replaced with environment variables
- [ ] Custom domain added in Vercel dashboard (if applicable)

## Vercel project settings (confirm in dashboard)

- [ ] Framework preset matches your framework (**Vite**)
- [ ] Build command matches `package.json` `"build"` script (`tsc && vite build`)
- [ ] Output directory matches framework output folder (**`dist`**)
- [ ] Node.js version set to 20.x (or version in `engines` field)
- [ ] Root directory set correctly (important for monorepos)

## Post-deploy

- [ ] Visit deployed URL and verify the app loads
- [ ] Test all API routes on the live URL — **N/A** (no backend API; Wikipedia is called from the browser)
- [ ] Open `/sphere` or `/sphere.html` and verify the sphere viewer
- [ ] Check Vercel deployment logs for runtime errors
- [ ] Confirm environment variables are resolving (no `undefined` in UI)
- [ ] Test on mobile viewport
- [ ] Check browser console for any 404s on assets or API calls

## Build verification (run locally before deploy)

```bash
npm ci
npm run build
```

Optional local preview of the production build:

```bash
npm run preview
# or
npm start
```

Optional CLI parity with Vercel:

```bash
npx vercel dev
```

**Known build warnings:** Vite may report chunks larger than 500 kB after minification (GSAP/Three bundles). Safe to ship; tune `build.chunkSizeWarningLimit` or code-split later if desired.

## Project-specific notes

- **No catch-all SPA rewrite** in `vercel.json`: this is a **multi-page** Vite app (`index.html` + `sphere.html`). A single `/(.*) → /index.html` rule would break the sphere page.
- **Rewrite added:** `/sphere` → `/sphere.html` for clean URLs.
- **No serverless `/api` routes** — no `functions` block in `vercel.json`.
- **CORS:** Wikipedia’s API is called from the browser with `origin=*`; no proxy required for deployment.
