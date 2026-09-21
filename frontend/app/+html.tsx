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
              /* Fixed to the layout viewport's edges, sized by the dynamic viewport height
                 unit so the app's bottom edge tracks the space actually visible around a
                 mobile browser's collapsible address/toolbar (falls back to 100vh, which is
                 the pre-dvh viewport height, on browsers that don't support dvh). Without
                 this, "bottom: 0" pins content below where a shown toolbar can cover it. */
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
