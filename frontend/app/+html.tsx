// @ts-nocheck
import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en" style={{ height: "100%" }}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        {/*
          Disable body scrolling on web to make ScrollView components work correctly.
          If you want to enable scrolling, remove `ScrollViewStyleReset` and
          set `overflow: auto` on the body style below.
        */}
        {/*
          Runtime configuration, loaded before the app bundle so one built bundle
          can be deployed to any host. Served from public/config.js; see that file.
          `defer` is deliberately omitted — this must run before the app reads it.
        */}
        <script src="/config.js" />

        {/*
          Some mobile browsers' in-page chrome (address bar, bottom toolbar) doesn't
          resize the CSS layout viewport, so 100vh/100dvh alone can still measure
          taller than what's actually visible, pinning our fixed-position root div's
          bottom edge behind that chrome. Track the real visible height via the
          VisualViewport API (falls back to window.innerHeight where it's unsupported)
          and drive the div's height from that CSS variable instead.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                function setAppVh() {
                  var vv = window.visualViewport;
                  var h = vv ? vv.height : window.innerHeight;
                  document.documentElement.style.setProperty('--app-vh', h + 'px');
                }
                setAppVh();
                window.addEventListener('resize', setAppVh);
                window.addEventListener('orientationchange', setAppVh);
                if (window.visualViewport) {
                  window.visualViewport.addEventListener('resize', setAppVh);
                  window.visualViewport.addEventListener('scroll', setAppVh);
                }
              })();
            `,
          }}
        />

        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              /* Fixed to the layout viewport's edges, sized by the tallest height unit
                 the browser gets right: --app-vh (measured live from VisualViewport) if
                 the script above ran, else 100dvh, else 100vh. Without this, "bottom: 0"
                 pins content below where a shown toolbar can cover it. */
              body > div:first-child { position: fixed !important; top: 0; left: 0; right: 0; height: 100vh; height: 100dvh; height: var(--app-vh, 100dvh); }
              [role="tablist"] [role="tab"] * { overflow: visible !important; }
              [role="heading"], [role="heading"] * { overflow: visible !important; }
            `,
          }}
        />
      </head>
      <body
        style={{
          margin: 0,
          height: "100%",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </body>
    </html>
  );
}
