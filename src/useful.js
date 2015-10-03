import {fromJS, Iterable} from 'immutable'
import {assert} from 'chai'

export function jsify(obj) {
  if (obj == null) {
    return null
  } else if (typeof obj === 'object') {
    return fromJS(obj).toJS()
  } else {
    return obj
  }
}

export function isEmpty(obj) {
  return Object.keys(obj).length > 0
}

export function forEachKV(obj, fn) {
  Object.keys(obj).forEach((key) => fn(key, obj[key]))
}

export function toArr(obj) {
  let result = []
  forEachKV(obj, (key, val) => result.push([key, val]))
  return result
}

export function sum(arr) {
  return arr.reduce((x, y) => x + y, 0)
}

export function isNumeric(n) {
  return !isNaN(parseFloat(n)) && isFinite(n)
}

export function all(iterable, fn) {
  for (let elem of iterable) {
    if (!fn(elem)) {
      return false
    }
  }
  return true
}

export function any(iterable, fn) {
  for (let elem of iterable) {
    if (fn(elem)) {
      return true
    }
  }
  return false
}

export function stringContains(where, what) {
  return where.indexOf(what) > -1
}

export function isIterable(obj) {
  // checks for null and undefined
  if (obj == null) {
    return false
  }
  return obj[Symbol.iterator] !== undefined
}

export function extend(array, elems) {
  return Array.prototype.push.apply(array, Array.from(elems))
}

export function flattenShallow(iterable) {
  return flatmap(iterable, (_) => _)
}

export function flatmap(iterable, fn) {
  let res = []
  for (let elem of iterable) {
    let toAppend = fn(elem)
    if (isIterable(toAppend)) {
      extend(res, toAppend)
    } else {
      throw new Error(`flatmap values must be iterables, got ${toAppend}`)
    }
  }
  return res
}

export function repeat(num, fn) {
  for (let i = 0; i < num; i++) {
    fn(i)
  }
}

export function randomChoice(list) {
  if (Iterable.isIterable(list)) return list.get(Math.floor(Math.random() * list.count()))
  else return list[Math.floor(Math.random() * list.length)]
}

export function getRandomValue() {
  return Math.random().toString(36).substring(7)
}

export function repeatAsync(n, f) {
  let res = Promise.resolve()
  repeat(n, (i) => {
    res = res.then((_) => f(i))
  })
  return res
}

(() => {
  assert.equal(isIterable([1, 2, 3]), true)
  assert.equal(isIterable(fromJS([1, 2, 3])), true)
  assert.equal(isIterable(fromJS({a: 'b'})), true)
  assert.equal(isIterable('ahoj'), true)
  assert.equal(isIterable(true), false)
  assert.equal(isIterable({a: 'b'}), false)
  assert.equal(isIterable(null), false)
  assert.equal(isIterable(undefined), false)
})();

(() => {
  let arr = [1, 2]
  extend(arr, [3, 4])
  assert.deepEqual(arr, [1, 2, 3, 4])
  arr = [1, 2]
  // does it work with iterable other than Array?
  extend(arr, fromJS([3, 4]))
  assert.deepEqual(arr, [1, 2, 3, 4])
})()
