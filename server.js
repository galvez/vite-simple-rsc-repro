import fs from 'node:fs'
import { Readable } from 'node:stream'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { PassThrough } from 'node:stream';

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const isTest = process.env.NODE_ENV === 'test' || !!process.env.VITE_TEST_BUILD

const bundlerConfig = createBundlerConfig()
export async function createServer(
  root = process.cwd(),
  isProd = process.env.NODE_ENV === 'production',
  hmrPort
) {
  const resolve = (p) => path.resolve(__dirname, p)

  const indexProd = isProd
    ? fs.readFileSync(resolve('dist/client/index.html'), 'utf-8')
    : ''

  const app = express()

  /**
   * @type {import('vite').ViteDevServer}
   */
  let vite
  let createServerModuleRunner
  if (!isProd) {
    ;({
      createServerModuleRunner
    } = await import('vite'))
    vite = await (
      await import('vite')
    ).createServer({
      root,
      logLevel: isTest ? 'error' : 'info',
      server: {
        middlewareMode: true,
        watch: {
          // During tests we edit the files too fast and sometimes chokidar
          // misses change events, so enforce polling for consistency
          usePolling: true,
          interval: 100
        },
        hmr: {
          port: hmrPort
        }
      },
      appType: 'custom'
    })
    // use vite's connect instance as middleware
    app.use(vite.middlewares)
  } else {
    app.use((await import('compression')).default())
    app.use(
      (await import('serve-static')).default(resolve('dist/client'), {
        index: false
      })
    )
  }

  let entry
  let renderRoute
  let renderRouter
  let routes
  let renderToPipeableStream
  if (!isProd) {
    const ssrRunner = createServerModuleRunner(vite.environments.ssr)
    entry = (await ssrRunner.import('/src/entry-server.jsx'))
    ;({ renderRoute, renderRouter } = entry)
    //
    const reactServerRunner = createServerModuleRunner(vite.environments.rsc)
    ;({ routes, renderToPipeableStream } = await reactServerRunner.import('/src/react-server.js'))
  } else {
    entry = (await import('./dist/server/entry-server.js'))
    ;({ renderRoute, renderRouter } = entry)
    //
    ;({ routes, renderToPipeableStream } = await import('./dist/rsc/index.js'))    
  }

  app.use('*', async (req, res) => {
    try {
      const url = req.originalUrl

      let template
      if (!isProd) {
        // always read fresh template in dev
        template = fs.readFileSync(resolve('index.html'), 'utf-8')
        template = await vite.transformIndexHtml(url, template)
      } else {
        template = indexProd
      }

      // SSR the actual page route as a **server component**
      const context = {}
      const { pipe } = renderToPipeableStream(renderRoute(routes, url), bundlerConfig)
      const routeStream = pipe(new PassThrough()) 

      // SSR the router shell route as a **client component**
      const appStream = renderRouter(url, context, routeStream)(new PassThrough())

      res
        .status(200)
        .set({ 'Content-Type': 'text/html' })

      const [before, after] = template.split(`<!--app-html-->`)      
      Readable.from(generateStream(before, appStream, after))
        .pipe(res)

      // if (context.url) {
      //   // Somewhere a `<Redirect>` was rendered
      //   return res.redirect(301, context.url)
      // }


    } catch (e) {
      !isProd && vite.ssrFixStacktrace(e)
      console.log(e.stack)
      res.status(500).end(e.stack)
    }
  })

  return { app, vite }
}

async function * generateStream(before, stream, after) {
  yield before
  for await (const chunk of stream) {
    yield chunk
  }
  yield after
}


if (!isTest) {
  createServer().then(({ app }) =>
    app.listen(3000, () => {
      console.log('http://localhost:3000')
    })
  )
}

function createBundlerConfig() {
  return new Proxy(
    {},
    {
      get(_target, $$id, _receiver) {
        let [id, name] = $$id.split("#");
        return { id, name, chunks: [] };
      },
    },
  );
}
