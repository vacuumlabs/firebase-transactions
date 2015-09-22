import {List, Map, Set, union} from 'immutable'

//TODO:
//  tests
//  registry

export class Registry {

  constructor() {
    this.lastId = 0
    // tracks transaction being run (not yet aborted or commited)
    this.inProgress = Set()
    this.readsByTrx = Map() // {id: [path1, path2, ..]}
    this.writesByTrx = Map() // {id: [(path, value), (path2, value2),..}
    this.readsByPath = Map({ids: Set(), keys: Map()}) // {key1: {readBy: set(id1, id2,..), keys: {key2: {readBy...}}}}
    this.writesByPath = Map({ids: Set(), keys: Map()})
  }

  open(id = null) {
    id = id == null ? ++this.lastId : id
    this.inProgress = this.inProgress.add(id)
    return id
  }

  isInProgress(id) {
    return this.inProgress.has(id)
  }

  _path(path) {
    if (typeof path === 'object') {
      return [].concat.apply([], path.map((p) => ['keys', p]))
    }
    return ['keys', path]
  }

  _getIn(map, path) {
    return map.getIn(this._path(path), Map())
  }

  _get(map, key) {
    return this._getIn(map, [key])
  }

  _getIds(map, path = []) {
    return map.getIn(this._path(path).push('ids'), Set())
  }

  _getKeys(map, path = []) {
    return map.getIn(this._path(path).push('keys'), Map())
  }

  //_updateIn(map, path,

  _addId(id, map, path) {
    return map.setIn(
      this._path(path).push('ids'),
      this._getIds(map, path).add(id))
  }

  _deleteId(id, map, path) {
    return this._prune(
      map.setIn(
        this._path(path).push('ids'),
        this._getIds(map, path).delete(id)),
      path)
  }

  _prune(map, path) {
    if (path.size() === 0) return map
    let {keys, ids} = this._getIn(map, path)
    if ((keys == null || keys.size() === 0) &&
        (ids == null || ids.size() === 0)) {
      return this._prune(
        map.deleteIn(this._path(path)),
        path.slice(0, path.size() - 1))
    }
  }

  _allIds(map) {
    return union(
      this._getIds(map),
      union(this._getKeys(map).values().map((v) => this._allIds(v))))
  }

  _idsAlongPath(map, path) {
    if (map == null) return Set()
    if (path.size() === 0) return this._allIds(map)
    return union(
      this._getIds(map),
      this._idsAlongPath(this._get(map, path[0]), path.slice(1)))
  }

  conflictingWithRead(id, path) {
    return !this._idsAlongPath(this.writesByPath, path).subtract(id)
  }

  conflictingWithWrite(id, path) {
    return !this._idsAlongPath(this.readsByPath, path).subtract(id)
  }

  deletePaths(id, map, paths) {
    return paths.reduce((m, p) => this._deleteId(id, m, p), map)
  }

  cleanup(id) {
    this.readsByPath = this.deletePaths(
        id, this.readsByPath, this.readsByTrx.get(id))
    this.writesByPath = this.deletePaths(
        id,
        this.writesByPath,
        this.writesByTrx.get(id).map((x) => x.get('path')))
    this.readsByTrx = this.readsByTrx.delete(id)
    this.writesByTrx = this.writesByTrx.delete(id)
    this.inProgress = this.inProgress.delete(id)
  }

  addRead(id, path) {
    this.readsByTrx = this.readsByTrx.set(
        id,
        this.readsByTrx.get(id, List()).push(path))

    this.readsByPath = this._addId(id, this.readsByPath, path)
  }

  addWrite(id, path, value) {
    this.writesByTrx = this.writesByTrx.set(
        id,
        this.writesByTrx.get(id, List()).push(Map({path, value})))

    this.writesByPath = this._addId(id, this.writesByPath, path)
  }

  writes(id) {
    return this.writesByTrx.get(id, List())
  }

  _prefix(list1, list2) {
    let i = 0
    while (list1.get(i) === list2.get(i) &&
        i < Math.max(list1.size(), list2.size())) i++
    return {size: i, list: list1.slice(0, i + 1)}
  }

  readAsIfTrx(id, path, firebaseValue) {
    let requestedPath = path

    function apply(currVal, data) {
      let {path, value} = data
      let {list, size} = this._prefix(path, requestedPath)
      if (list.equals(path)) {
        return value.getIn(requestedPath.slice(size))
      }
      if (list.equals(requestedPath)) {
        return currVal.setIn(path.slice(size), value)
      }
      return currVal
    }

    return this.writes(id).reduce(apply, firebaseValue)
  }
}
