# VegSeal native app (Capacitor) — API layer

Everything the app needs is now reachable over plain HTTP, so a packaged
iOS/Android bundle can talk to the hosted VegSeal backend without the
TanStack RPC protocol.

Base URL: `https://vegseal.com/api/public/v1`
(preview: `https://project--5b2feb78-445e-4db0-baed-4a02ff5048aa-dev.lovable.app/api/public/v1`)

All responses are JSON, CORS is open, and no auth is required.

| Method | Path | Body / query | Returns |
| --- | --- | --- | --- |
| GET | `/health` | — | `{ ok: true }` |
| POST | `/identify-barcode` | `{ barcode }` | fast product identity (name, brand, image) or cached result |
| POST | `/lookup-barcode` | `{ barcode }` | full analyzed product (404 if unfindable) |
| POST | `/analyze` | `{ text, name? }` | analyzed product from an ingredient list |
| POST | `/ocr` | `{ imageBase64, mime }` | photo analysis (label OCR or product identification) |
| POST | `/search` | `{ query }` | `{ local, remote }` product candidates |
| GET | `/product` | `?id=<uuid>` | cached analyzed product |
| GET | `/ingredient` | `?slug=<slug>` | single verified ingredient |
| GET | `/ingredients` | — | full verified ingredient list |

The analysis logic is shared: the web app's server functions and these
endpoints call the exact same core functions, so verdicts are identical.

## Capacitor setup

The backend must stay hosted (secrets, AI research, database), so the native
shell loads the live site and uses the endpoints above.

```ts
// capacitor.config.ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.vegseal.app',
  appName: 'VegSeal',
  webDir: 'public',
  server: { url: 'https://vegseal.com', cleartext: false },
};
export default config;
```

```bash
npm i @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npx cap add ios && npx cap add android
npx cap sync
npx cap open ios   # or: npx cap open android
```

iOS needs `NSCameraUsageDescription` in `Info.plist` for barcode scanning.

## Note on a fully offline bundle

This project builds to a server (SSR) output, not a static folder, so a
100% local bundle isn't produced by the build. A native client that ships
its own UI can still work by calling the endpoints above directly.
