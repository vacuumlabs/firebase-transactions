import * as i from 'immutable'

//TODO:
// * urobit class
// * canRead should allow for my own writes, ..
// * multiple reads/writes on one path
// * tests

let state = i.Map({
  lastId: 0,
  inProgress: i.Set(),
  scheduled: i.Set(),
  readsByTrx: i.Map(), // {id: [path1, path2, ..]}
  writesByTrx: i.Map(), // {id: [(path, value), (path2, value2),..}
  readsByPath: i.Map(),
  writesByPath: i.Map(),
})

export function open(id=null) {
  id = id == null ? ++state.lastId : id
  let {inProgress, scheduled} = state
  state = {
    ...state,
    inProgress: inProgress.add(id),
    scheduled: scheduled.delete(id)}
  return id
}

export function isInProgress(id) {
  return state.get('inProgress').has(id)
}

export function isScheduled(id) {
  return state.get('scheduled').has(id)
}

export function canRead(id, path) {
  // TODO fix
  return state.writesByPath.getIn(path, null) == null
}

export function canWrite(id, path) {
  // TODO fix
  return state.readsByPath.getIn(path, null) == null
}

function deletePath(map, path) {
  for (let i = path.size; i >= 0; i--) {
    if (map.getIn(path.slice(i)).size > 1) break
  }
  return map.deleteIn(path.slice(i + 1))
}

function deletePaths(map, paths) {
  return paths.reduce((m, p) => deletePath(m, p), map)
}

export function cleanup(id) {
  let {readsByTrx, writesByTrx, inProgress, readsByPath, writesByPath} = state

  return {
    ...state,
    readsByTrx: readsByTrx.delete(id),
    writesByTrx: writesByTrx.delete(id),
    inProgress: inProgress.delete(id),
    readsByPath: deletePaths(readsByPath, readsByTrx.get(id)),
    writesByPath: deletePaths(writesByPath, writesByTrx.get(id))
  }
}

function addId(id, path, map) {
  // TODO add to set if more
  return map.setIn(path, i.Set(map.getIn(path, i.List()).add(id)))
}

export function addRead(state, id, path) {
  let {readsByPath, readsByTrx} = state
  return {
    ...state,
    readsByPath: addId(id, path, readsByPath),
    readsByTrx: {...readsByTrx, id: readsByTrx.get(id, i.List()).add(path)}
  }
}

export function addWrite(id, path, value) {
  let {writesByPath, writesByTrx} = state
  return {
    ...state,
    writesByPath: addId(id, path, writesByPath),
    writesByTrx: {...writesByTrx, id: writesByTrx.get(id, i.List()).add({path, value})}
  }
}

export function writes(id) {
  return state.writesByTrx(id)
}

/////////////////////////////////
//
function prefix(list1, list2) {
  let i = 0
  while (list1.get(i) === list2.get(i) && i < list1.size && i < list2.size) i++
  return {size: i, list: list1.slice(0, i + 1)}
}

export function readAsIfTrx(id, path, firebaseValue) {
  function apply(currVal, data) {
    let {_path, _value} = data
    let {list, size} = prefix(_path, path)
    if (list.equals(_path)) {
      return currVal.setIn(path.slice(size))
    }
    if (list.equals(path)) {
      return _value.setIn(_path.slice(size))
    }
    return currVal
  }
  return writes(id).reduce(apply, firebaseValue)
}
