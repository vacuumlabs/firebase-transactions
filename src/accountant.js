import * as i from 'immutable'

//TODO: tests

export class Accountant {
  construct() {
    this.lastId = 0
    this.inProgress = i.Set()
    this.scheduled = i.Set()
    this.readsByTrx = i.Map({}) // {id: [path1, path2, ..]}
    this.writesByTrx = i.Map() // {id: [(path, value), (path2, value2),..}
    this.readsByPath = i.Map({ids: i.Set(), keys: i.Map()}) // {key1: {readBy: set(id1, id2,..), keys: {key2: {readBy...}}}}
    this.writesByPath = i.Map({ids: i.Set(), keys: i.Map()})
  }

  open(id=null) {
    id = id == null ? ++this.lastId : id
    this.inProgress = this.inProgress.add(id)
    this.scheduled = this.scheduled.delete(id)
    return id
  }

  isInProgress(id) {
    return this.inProgress.has(id)
  }

  isScheduled(id) {
    return this.scheduled.has(id)
  }

  _path(path) {
    if (typeof path === 'object') {
      return [].concat.apply([], path.map((p) => ['keys', p]))
    }
    return ['keys', path]
  }

  _getIn(map, path) {
    return map.getIn(this._path(path), i.Map())
  }

  _get(map, key) {
    return this._getIn(map, [key])
  }

  _getIds(map, path) {
    return map.getIn(this._path(path).push('ids'), i.Set())
  }

  _addId(id, map, path) {
    return map.setIn(
        this._path(path).push('ids'),
        this._getIds(map, path).add(id))
  }

  _deleteId(id, map, path) {
    return map.setIn(
        this._path(path).push('ids'),
        this._getIds(map, path).delete(id))
  }

  _prune(map, path) {
    if (path.size() === 0) return map
    let {keys, ids} = this._getIn(map, path)
    let p = this._path(path)
    if ((keys == null || keys.size() === 0) &&
        (ids == null || ids.size() === 0)) {
      return this._prune(map.deleteIn(p), p.slice(0, p.size() - 1))
    }
  }

  _allIds(map) {
    return i.union(
        this._getIds(map, []),
        i.union(this._getIn(map, []).values().map((v) => this._allIds(v))))
  }

  _idsAlongPath(map, path) {
    if (map == null) return i.Set()
    if (path.size() === 0) return this._allIds(map)
    return i.union(
        this._getIds(map, []),
        this._idsAlongPath(this._get(map, path[0]), path.slice(1)))
  }

  canRead(id, path) {
    return !this._idsAlongPath(this.writesByPath, path).subtract(id).isEmpty()
  }

  canWrite(id, path) {
    return !this._idsAlongPath(this.readsByPath, path).subtract(id).isEmpty()
  }

  _deletePath(id, map, path) {
    return this._prune(this._deleteId(id, map, path))
  }

  deletePaths(map, paths) {
    return paths.reduce((m, p) => this._deletePath(m, p), map)
  }

  cleanup(id) {
    this.readsByPath = this.deletePaths(
        this.readsByPath, this.readsByTrx.get(id))
    this.writesByPath = this.deletePaths(
        this.writesByPath, this.writesByTrx.get(id))
    this.readsByTrx = this.readsByTrx.delete(id)
    this.writesByTrx = this.writesByTrx.delete(id)
    this.inProgress = this.inProgress.delete(id)
  }

  addRead(id, path) {
    this.readsByTrx = this.readsByTrx.set(
        id,
        this.readsByTrx.get(id, i.List()).push(path))

    this.readsByPath = this._addId(id, this.readsByPath, path)
  }

  addWrite(id, path, value) {
    this.writesByTrx = this.writesByTrx.set(
        id,
        this.writesByTrx.get(id, i.List()).push({path, value}))

    this.writesByPath = this._addId(id, this.writesByPath, path)
  }

  writes(id) {
    return this.writesByTrx.get(id, i.List())
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
