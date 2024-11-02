import { memoize } from '@hiogawa/utils'
import { PassThrough } from 'node:stream'
import { use, createElement } from 'react'
import { renderToPipeableStream } from 'react-dom/server'
import { createFromNodeStream } from 'react-server-dom-webpack/client.node'
import { StaticRouter } from 'react-router-dom/server'
import { App } from './App.jsx'
import { routes } from './entry-routes.js'
import { matchRoutes } from 'react-router-dom'

export async function renderRouter(url) {
  const reactServerRunner = await importReactServer()
  const context = {}
  const match = matchRoutes(reactServerRunner.routes, url)
  const routeStream = await reactServerRunner.renderRoute(match)
  const promise = createFromNodeStream(routeStream, {
    ssrManifest: {
      moduleMap: createModuleMap(),
      moduleLoading: null,
    },
  })
  const ServerRoute = () => use(promise)
  const { pipe } = renderToPipeableStream(
    <StaticRouter context={context} location={url}>
      <App routes={routes}>
        <ServerRoute />
      </App>
    </StaticRouter>
  );
  return pipe(new PassThrough())
}

export function createModuleMap() {
  return new Proxy(
    {},
    {
      get(_target, id, _receiver) {
        return new Proxy(
          {},
          {
            get(_target, name, _receiver) {
              return {
                id,
                name,
                chunks: [],
              };
            },
          },
        );
      },
    },
  );
}


async function importReactServer() {
  let mod
  if (import.meta.env.DEV) {
    mod = (await globalThis.reactServerRunner.import(
      '/src/react-server.js',
    ));
  } else {
    mod = import('/dist/react-server/index.js')
  }
  return mod;
}


async function importClientReference(id) {
  if (import.meta.env.DEV) {
    return import(/* @vite-ignore */ id)
  } else {
    const clientReferences = await import(
      'virtual:client-references'
    )
    const dynImport = clientReferences.default[id];
    ok(dynImport, `client reference not found '${id}'`)
    return dynImport()
  }
}

export function initClientReferences() {
  Object.assign(globalThis, {
    __webpack_require__: memoize(importClientReference)
  })
}

globalThis.__webpack_require__ = memoize(importClientReference)
