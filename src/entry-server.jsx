import { use, createElement } from 'react'
import { renderToPipeableStream } from 'react-dom/server'
import { createFromNodeStream } from 'react-server-dom-webpack/client.node'
import { matchRoutes } from 'react-router-dom'
import { StaticRouter } from 'react-router-dom/server'
import { App } from './App.jsx'
import { routes } from './entry-routes.js'

export function renderRouter(url, context, rscPayload) {
  const promise = createFromNodeStream(rscPayload, {
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
  return pipe
}

export function renderRoute(routes, url) {
  const match = matchRoutes(routes, url)
  return createElement(match[0].route.element)
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
