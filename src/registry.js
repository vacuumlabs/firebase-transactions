import {List, Map, Set, fromJS, Iterable} from 'immutable'

export class Registry {

  constructor() {
    this.lastId = 0
    // tracks transaction being run (not yet aborted or commited)
    this.readsByTrx = Map() // {id: [path1, path2, ..]}
    this.writesByTrx = Map() // {id: [(path, value), (path2, value2),..}
    this.readsByPath = Map() // {key1: {readBy: set(id1, id2,..), keys: {key2: {readBy...}}}}
    this.writesByPath = Map()
  }

  _path(path) {
    if (Iterable.isIterable(path)) {
      return path.flatMap((p) => ['keys', p])
    } else if (typeof path === 'string') {
      return fromJS(['keys', path])
    } else {
      throw new Error(`path must be either string, or immutable iterable, got ${path} instead`)
    }
  }

  _getIn(map, path) {
    return map.getIn(this._path(path), Map())
  }

  _get(map, key) {
    return this._getIn(map, List([key]))
  }

  _getIds(map, path = List()) {
    return map.getIn(this._path(path).push('ids'), Set())
  }

  _getKeys(map, path = List()) {
    return map.getIn(this._path(path).push('keys'), Map())
  }

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
    let keysIds = this._getIn(map, path) // TODO make immutable destructuring work
    let keys = keysIds.get('keys')
    let ids = keysIds.get('ids')
    if ((keys == null || keys.size === 0) &&
        (ids == null || ids.size === 0)) {
      // if the whole map got deleted procede with Map(undefined) === empty Map
      let _pruned = Map(map.deleteIn(this._path(path)))
      if (path.size === 0) {
        return _pruned
      } else {
        return this._prune(
          _pruned,
          path.slice(0, path.size - 1))
      }
    } else {
      return map
    }
  }

  /* get all transaction ids for the given structure recursively traversing it
   * from the root to its leaves
   */
  _allIds(map) {
    return this._getIds(map).union(
      this._getKeys(map).valueSeq().flatMap((v) => this._allIds(v)))
  }

  /*
   * gather all the ids along given path plus all the ids in the
   * subtree rooted in path
   */
  _idsAlongPath(map, path) {
    if (map == null) return Set()
    if (path.size === 0) return this._allIds(map)
    return this._getIds(map).union(
      this._idsAlongPath(this._get(map, path.get(0)), path.slice(1)))
  }

  conflictingWithRead(path) {
    return this._idsAlongPath(this.writesByPath, fromJS(path))
  }

  conflictingWithWrite(path) {
    return this._idsAlongPath(this.readsByPath, fromJS(path))
      //.union(this.conflictingWithRead(path))

  }

  deletePaths(id, map, paths) {
    paths = fromJS(paths)
    return paths.reduce((m, p) => this._deleteId(id, m, p), map)
  }

  cleanup(id) {
    this.readsByPath = this.deletePaths(
        id,
        this.readsByPath,
        this.readsByTrx.get(id, []))
    this.writesByPath = this.deletePaths(
        id,
        this.writesByPath,
        this.writesByTrx.get(id, []).map((x) => x.get('path')))
    this.readsByTrx = this.readsByTrx.delete(id)
    this.writesByTrx = this.writesByTrx.delete(id)
  }

  addRead(id, path) {
    path = fromJS(path)
    this.readsByTrx = this.readsByTrx.set(
        id,
        this.readsByTrx.get(id, List()).push(path))

    this.readsByPath = this._addId(id, this.readsByPath, path)
  }

  addWrite(id, path, value) {
    path = fromJS(path)
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
        i < Math.min(list1.size, list2.size)) i++
    return list1.slice(0, i)
  }

  readAsIfTrx(id, path, firebaseValue) {
    path = fromJS(path)
    firebaseValue = fromJS(firebaseValue)
    let requestedPath = path

    const apply = (currVal, write) => {
      // TODO immutable desctructuring
      let path = write.get('path')
      let value = fromJS(write.get('value'))
      let list = this._prefix(path, requestedPath)
      if (list.equals(path)) {
        // TODO: does firebase allow to set just a plain value to the main ref? If so, value will be
        // a primitive value and list will have size 0, hower, value.getIn([]) won't return value in
        // that case
        return value.getIn(requestedPath.slice(list.size))
      }
      if (list.equals(requestedPath)) {
        return currVal.setIn(path.slice(list.size), value)
      }
      return currVal
    }

    let res = this.writes(id).reduce(apply, firebaseValue)
    if (typeof res === 'object') {
      res = res.toJS()
    }

    return res
  }
}
