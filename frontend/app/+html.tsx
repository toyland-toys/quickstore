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

        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              /* Fixed to the layout viewport's edges, sized by 100dvh (falling back to
                 100vh) rather than a plain percentage, which resolves against the
                 *layout* viewport -- some mobile browsers keep that taller than what's
                 actually visible around a collapsible address/toolbar, pinning this
                 fixed-position root div's bottom edge (and the tab bar inside it)
                 behind that chrome. A JS-measured VisualViewport-driven height was
                 tried here too, but removed: Chrome DevTools' device-toolbar emulation
                 doesn't always report visualViewport.height as the full emulated
                 screen height, so it could make the root shorter than the real
                 viewport there and leave a visible gap at the bottom -- worse than the
                 dvh-unsupported case it was meant to cover, given how widely supported
                 dvh already is. */
              body > div:first-child { position: fixed !important; top: 0; left: 0; right: 0; height: 100vh; height: 100dvh; }
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
