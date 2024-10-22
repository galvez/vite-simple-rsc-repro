import { memoize } from '@hiogawa/utils'
import { ok } from 'node:assert'
export { renderToPipeableStream } from 'react-server-dom-webpack/server'
import { createElement, use } from 'react'
import ReactServer from 'react-server-dom-webpack/server.edge'

// https://github.com/facebook/react/blob/c8a035036d0f257c514b3628e927dd9dd26e5a09/packages/react-server-dom-webpack/src/ReactFlightWebpackReferences.js#L43

// $$id: /src/components/counter.tsx#Counter
//   ⇕
// id: /src/components/counter.tsx
// name: Counter

export function $$register(id, name) {
  // reuse everything but $$async: true for simplicity
  const reference = ReactServer.registerClientReference({}, id, name);
  return Object.defineProperties(
    {},
    {
      ...Object.getOwnPropertyDescriptors(reference),
      $$async: { value: true },
    },
  );
}

async function importClientRefrence(id) {
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

globalThis.__webpack_require__ = memoize(importClientRefrence)
 
export { routes } from './entry-routes.js'
