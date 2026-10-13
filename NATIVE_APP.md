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

iOS needs `NSCameraUsageDescription` in `Info.plist` for barcode scanning — it is
already there, and its wording is what appears under the "VegSeal Would Like to
Use the Camera" heading.

## Note on a fully offline bundle

This project builds to a server (SSR) output, not a static folder, so a
100% local bundle isn't produced by the build. A native client that ships
its own UI can still work by calling the endpoints above directly.

## iOS/Android packaging (current setup)

`capacitor.config.ts` uses `webDir: "native"` (contains a small offline fallback
`index.html`) and `server.url: "https://vegseal.com"`, so the native shell loads
the live hosted app. There is no `dist/` folder to build — the app is
server-rendered.

```bash
npx cap sync ios
npx cap open ios
```

## Apple In-App Purchase (subscription)

The app code is ready; the remaining steps happen in your local checkout and Apple's tools.

1. App Store Connect → create an auto-renewing subscription, product id
   `com.vegseal.app.pro.monthly`, price $2.99/month (optionally a 7-day intro free trial).
2. RevenueCat → create a project, add the iOS app, attach the product to an
   offering, and create an entitlement with id `pro`. Copy the iOS public SDK key.
3. Locally: `npm i @revenuecat/purchases-capacitor && npx cap sync ios`.
4. Set `VITE_REVENUECAT_IOS_KEY=<public sdk key>` for the build.
5. Test with a sandbox Apple ID in TestFlight.

Purchases write `profiles.is_subscribed` so the paywall unlocks after payment.
"Restore purchase" re-checks the Apple ID's entitlements.

## Camera prompt wording (branded, not the domain)

The shell loads the live site, so a web-view camera request would normally be
attributed to the address on screen: "vegseal.com would like to use the camera".
`ios/App/App/VegSealBridgeViewController.swift` intercepts that request and asks
for camera access natively first, so the prompt reads "VegSeal Would Like to Use
the Camera" with the `NSCameraUsageDescription` sentence underneath.
`SceneDelegate.swift` instantiates `VegSealBridgeViewController` instead of
`CAPBridgeViewController`; every other web-view UI question (alerts, confirm
boxes, new windows) is forwarded to Capacitor's own handler unchanged.

If the sentence itself should change, edit `NSCameraUsageDescription` in
`ios/App/App/Info.plist`. A user who already chose "Don't Allow" is not asked
again — iOS only re-prompts from the Settings app.
