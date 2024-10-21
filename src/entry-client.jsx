import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { routes } from './entry-routes.js'
import { Route, Routes } from 'react-router-dom'

ReactDOM.hydrateRoot(
  document.getElementById('app'),
  <BrowserRouter>
    <App routes={routes}>
      <Routes>
        {routes.map(({ path, component: RouteComp }) => {
          return <Route key={path} path={path} element={<RouteComp />}></Route>
        })}
      </Routes>
    </App>
  </BrowserRouter>
)
