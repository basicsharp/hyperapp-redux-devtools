var { createStore } = require('redux')
var { composeWithDevTools } = require('redux-devtools-extension')
var hPersist = require('hyperapp-persist')

STORAGE_NAME = 'hyperapp-hmr-state'

function reduxReducer (state = {}, action) {
  return Object.assign({}, state, action.payload)
}

function reducAction (name, data) {
  return {
    type: name,
    payload: data
  }
}

function copy (target, source) {
  var obj = {}
  for (var i in target) { obj[i] = target[i] }
  for (var i in source) { obj[i] = source[i] }
  return obj
}

function set (path, value, source, target) {
  if (path.length) {
    target[path[0]] = path.length > 1
      ? set(path.slice(1), value, source[path[0]], {})
      : value
    return copy(source, target)
  }
  return value
}

function get (path, source) {
  for (var i = 0; i < path.length; i++) {
    source = source[path[i]]
  }
  return source
}

function configureStore(state) {
  // https://github.com/parcel-bundler/parcel/issues/314
  if (window.store == null) {
    var composeEnhancers = composeWithDevTools({ action: reducAction })
    window.store = createStore(reduxReducer, state, composeEnhancers())
    return window.store
  }
  if (process.env.NODE_ENV === 'development') {
    window.store.replaceReducer(reduxReducer)
  }
  return window.store;
}

module.exports = {}

module.exports.STORAGE_NAME = STORAGE_NAME

module.exports.computeState = function (initState) {
  var previousStateString = localStorage.getItem(STORAGE_NAME) || null
  var state = Object.assign(initState, JSON.parse(previousStateString))
  return state
}

module.exports.devtools = function (app, options) {
  var store

  options = options || {}
  var persist = options.persist || false

  return function (state, actions, view, container) {
    var appActions

    function wire (path, actions) {
      for (var key in actions) {
        if (typeof actions[key] === 'function') {
          ;(function (key, action) {
            actions[key] = function () {
              var reducer = action.apply(this, arguments)
              return function (slice) {
                var data = typeof reducer === 'function'
                  ? reducer(slice, get(path, appActions))
                  : reducer
                if (data && !data.then) {
                  state = set(path, copy(slice, data), state, {})
                  store.dispatch(reducAction(key, state))
                }
                return data
              }
            }
          })(key, actions[key])
        } else {
          wire(path.concat(key), (actions[key] = copy(actions[key])))
        }
      }
    }
    wire([], (actions = copy(actions)))

    actions.replaceState = function (actualState) {
      return function (state) {
        return actualState
      }
    }
    store = configureStore(state)
    store.subscribe(function () {
      appActions.replaceState(store.getState())
      if (persist) {
        appActions.__save(store.getState())
      }
    })

    var enhancedApp = persist
    ? hPersist(app, {
      storage: STORAGE_NAME
    })
    : app

    if (persist) {
      window.addEventListener('unload', function () {
        actions.__clear()
      })
    }

    appActions = enhancedApp(state, actions, view, container)

    return appActions
  }
}
